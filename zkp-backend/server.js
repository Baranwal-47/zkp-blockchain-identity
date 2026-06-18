const express = require('express');
const snarkjs = require('snarkjs');
const fs = require('fs');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const { ethers } = require('ethers');

const { buildWitnessInput } = require('./lib/witnessBuilder');
const { generateSalts } = require('./lib/encoding');
const { issueNonce, validateAndConsume } = require('./lib/nonceStore');
const { timed } = require('./utils/timing');

const app = express();
app.use(cors());
app.use(express.json());

// Logging middleware for response time
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration} ms`);
  });
  next();
});

const wasmPath = process.env.WASM_PATH || path.join(__dirname, 'identity.wasm');
const zkeyPath = process.env.ZKEY_PATH || path.join(__dirname, 'identity_final.zkey');
const vKeyPath = process.env.VKEY_PATH || path.join(__dirname, 'verification_key.json');
const vKey = JSON.parse(fs.readFileSync(vKeyPath, 'utf8'));

const verifierAbiPath = process.env.VERIFIER_ABI_PATH || path.join(__dirname, '../zk-proofs/artifacts/contracts/IdentityVerifier.sol/Groth16Verifier.json');
const verifierAbi = require(verifierAbiPath).abi;

const registryAbiPath = process.env.REGISTRY_ABI_PATH || path.join(__dirname, '../zk-proofs/artifacts/contracts/CredentialRegistry.sol/CredentialRegistry.json');
const registryAbi = require(registryAbiPath).abi;

// Fail loud on missing config (RESEARCH anti-pattern "hardcoded fallback
// addresses" / threat T-04-09): a missing env var must throw at startup,
// never silently resolve to a stale/dead contract address.
function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set in the environment (no fallback default — see CLAUDE.md ground rules)`);
  }
  return value;
}

const verifierAddress = requireEnv('VERIFIER_ADDRESS');
const registryAddress = requireEnv('REGISTRY_ADDRESS');
const rpcUrl = requireEnv('BLOCKCHAIN_RPC_URL');
const port = Number(process.env.PORT || 3001);

const provider = new ethers.JsonRpcProvider(rpcUrl);

const verifierContract = new ethers.Contract(verifierAddress, verifierAbi, provider);
const registryContract = new ethers.Contract(registryAddress, registryAbi, provider);

app.get('/', (req, res) => {
  res.send('ZKP backend running');
});

// POST /generate-proof — new 7-attribute witness shape (BACK-01).
// Request body: { attrs: {name, rollNo, dob, programmeLevel, discipline,
//   batch, email}, reveal: {...booleans}, nonce, currentDateInt,
//   salts?: string[7] (server-generates via generateSalts(7) if absent;
//   per RESEARCH Assumption A2, salts MUST match the values used at
//   issuance, or the resulting pubHash will not match the on-chain root) }.
// Response: { proof, publicSignals, salts } — publicSignals has length 19
// in the frozen circuit order (component main public declaration); never
// manually reordered (Pitfall 1) — snarkjs emits it directly.
app.post('/generate-proof', async (req, res) => {
  console.log('Received /generate-proof request', { hasAttrs: !!req.body?.attrs, hasSalts: Array.isArray(req.body?.salts) });

  const { attrs, reveal, nonce, currentDateInt } = req.body || {};
  let { salts } = req.body || {};

  // Validate request body shape before touching snarkjs, so malformed input
  // returns a clear 400 instead of an opaque snarkjs/wasm 500 (Pitfall 2).
  if (!attrs || typeof attrs !== 'object') {
    return res.status(400).json({ error: 'attrs (object) is required' });
  }
  const REQUIRED_ATTR_KEYS = ['name', 'rollNo', 'dob', 'programmeLevel', 'discipline', 'batch', 'email'];
  const missingAttrKeys = REQUIRED_ATTR_KEYS.filter((k) => attrs[k] === undefined || attrs[k] === null || attrs[k] === '');
  if (missingAttrKeys.length) {
    return res.status(400).json({ error: `attrs missing required field(s): ${missingAttrKeys.join(', ')}` });
  }
  if (nonce === undefined || nonce === null || nonce === '') {
    return res.status(400).json({ error: 'nonce is required' });
  }
  if (currentDateInt === undefined || currentDateInt === null || currentDateInt === '') {
    return res.status(400).json({ error: 'currentDateInt is required' });
  }
  if (salts !== undefined) {
    if (!Array.isArray(salts) || salts.length !== 7) {
      return res.status(400).json({ error: 'salts, if provided, must be an array of 7 decimal strings' });
    }
  } else {
    salts = generateSalts(7);
  }

  try {
    const input = await buildWitnessInput({ attrs, salts, reveal, nonce, currentDateInt });

    // Generate proof and public signals using snarkjs
    const { out: { proof, publicSignals } } = await timed('ProofGeneration', () =>
      snarkjs.groth16.fullProve(input, wasmPath, zkeyPath)
    );

    res.json({ proof, publicSignals, salts });
  } catch (err) {
    console.error('Proof generation error:', err);
    res.status(500).json({ error: 'Proof generation failed', details: err.message });
  }
});

// POST /session/nonce — issues a fresh verifier-session nonce (REPL-03
// issue side). expiresAt is epoch milliseconds (same unit as Date.now()
// internally — see lib/nonceStore.js Pitfall-4 note).
app.post('/session/nonce', async (req, res) => {
  const { out: { nonce, sessionId, expiresAt } } = await timed('NonceIssue', async () => issueNonce());
  res.json({ nonce, sessionId, expiresAt });
});

// POST /verify — off-chain groth16 verify + nonce enforcement (BACK-02,
// REPL-03 enforcement half). Accepts { proof, publicSignals, sessionId }.
// Nonce enforcement order (decision #2 / threat T-04-08): the cryptographic
// proof is checked FIRST; the nonce is only consumed via validateAndConsume
// when the proof is valid, so a bad/tampered proof never burns a nonce.
// All outcomes — bad proof, bad nonce, or success — return HTTP 200 with
// {valid, reason?}, never a 4xx, to keep the response shape uniform.
app.post('/verify', async (req, res) => {
  const { proof, publicSignals, sessionId } = req.body;
  try {
    const { out: isValid } = await timed('OffChainVerification', () =>
      snarkjs.groth16.verify(vKey, publicSignals, proof)
    );

    if (!isValid) {
      return res.json({ valid: false, reason: 'invalid_proof' });
    }

    const { out: nonceResult } = await timed('NonceCheck', async () =>
      validateAndConsume(sessionId, publicSignals[1])
    );
    if (!nonceResult.ok) {
      return res.json({ valid: false, reason: nonceResult.reason });
    }

    res.json({ valid: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /verify-onchain — on-chain groth16 verify (view call) + the same
// nonce-enforcement contract as /verify (BACK-02, REPL-03). Accepts
// { proof, publicSignals, sessionId }. pA/pB-swap/pC formatting is
// unchanged (RESEARCH Pattern 4 — already correct); only publicSignals
// length is confirmed (19 signals) before the on-chain call.
app.post('/verify-onchain', async (req, res) => {
  const { proof, publicSignals, sessionId } = req.body;

  if (!proof || !publicSignals) {
    return res.status(400).json({ error: 'Missing proof or public signals' });
  }
  if (!Array.isArray(publicSignals) || publicSignals.length !== 19) {
    return res.status(400).json({ error: 'publicSignals must be an array of length 19' });
  }

  try {
    // Format proof parameters as expected by Solidity verifier contract
    const pA = [proof.pi_a[0], proof.pi_a[1]];

    // Solidity verifier expects pi_b with swapped inner array order
    const pB = [
      [proof.pi_b[0][1], proof.pi_b[0][0]],
      [proof.pi_b[1][1], proof.pi_b[1][0]],
    ];

    const pC = [proof.pi_c[0], proof.pi_c[1]];

    // Call the Solidity verifier contract's verifyProof method (read-only)
    const { out: isValid } = await timed('OnChainVerification', () =>
      verifierContract.verifyProof(pA, pB, pC, publicSignals)
    );

    if (!isValid) {
      return res.json({ valid: false, reason: 'invalid_proof' });
    }

    const { out: nonceResult } = await timed('NonceCheck', async () =>
      validateAndConsume(sessionId, publicSignals[1])
    );
    if (!nonceResult.ok) {
      return res.json({ valid: false, reason: nonceResult.reason });
    }

    res.json({ valid: true });
  } catch (err) {
    console.error('On-chain proof verification failed:', err);
    res.status(500).json({ error: 'On-chain verification failed', details: err.message });
  }
});

app.post('/credential-info', async (req, res) => {
  const { pubHash } = req.body; // decimal string from publicSignals[0]

  if (!pubHash) {
    return res.status(400).json({ error: 'pubHash is required' });
  }

  try {
    const pubHashBytes32 = ethers.zeroPadValue(ethers.toBeHex(BigInt(pubHash)), 32);
    const [rollNo, ipfsCID, issuedAt, exists, revoked] = await registryContract.getCredentialByHash(pubHashBytes32);

    if (!exists || !ipfsCID) {
      return res.json({ found: false, message: 'Credential not found in registry' });
    }

    res.json({
      found: true,
      rollNo,
      ipfsCID,
      issuedAtMs: Number(issuedAt) * 1000,
      revoked,
      ipfsUrl: `https://gateway.pinata.cloud/ipfs/${ipfsCID}`,
      etherscanUrl: `https://sepolia.etherscan.io/address/${registryAddress}`,
    });
  } catch (err) {
    console.error('Credential info lookup failed:', err);
    res.status(500).json({ error: 'Registry lookup failed', details: err.message });
  }
});

// Only bind a real listener when run directly (`node server.js`), not when
// required by a test harness (supertest drives the app in-process — see
// test/generateProof.test.js).
if (require.main === module) {
  app.listen(port, '0.0.0.0', () => {
    console.log(`Verifier API listening on port ${port}`);
  });
}

module.exports = app;
