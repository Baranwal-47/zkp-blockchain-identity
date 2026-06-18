/**
 * bench.js — PERF-01/PERF-02 benchmark driver for all six measured E1+E2
 * crypto ops, plus QR payload size and other free side-effect numbers.
 *
 * Methodology (blueprint §10.3 / 05-CONTEXT.md D-16/D-17): each op is run
 * N=20 times, the first (warm-up) run is dropped, and mean + SAMPLE standard
 * deviation (divide by n-1 = 18) are computed over the remaining n=19 runs.
 * Output format per blueprint §10.3 example:
 *   proof_gen: mean 1.42 s ± 0.08 s (n=19)
 *
 * On-chain verify gets the SAME full N=20/n=19 live-Sepolia treatment as
 * every other op (D-17) — no reduced sample size. Per 05-CONTEXT.md
 * Claude's-Discretion notes, one funded proof is reused across all 20
 * on-chain calls (verify-onchain is a stateless 0-gas view call), and
 * nonce issue/check are measured via direct function calls (avoids HTTP
 * overhead skewing sub-ms ops) rather than through the live HTTP endpoints.
 *
 * Live fixture: rollNo 22BCSD01, re-issued on-chain this session — same
 * fixture as zkp-backend/test/verifyFlow.test.js.
 *
 * Threat T-05-03 mitigation: only timing numbers, byte sizes, and counts
 * are ever printed — never attribute values, salts, proofs, or nonces.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const snarkjs = require('snarkjs');
const { ethers } = require('ethers');

const { buildWitnessInput } = require('./lib/witnessBuilder');
const { issueNonce, validateAndConsume } = require('./lib/nonceStore');
const { timed } = require('./utils/timing');

// --- Artifact paths (mirrors server.js) ---
const wasmPath = process.env.WASM_PATH || path.join(__dirname, 'identity.wasm');
const zkeyPath = process.env.ZKEY_PATH || path.join(__dirname, 'identity_final.zkey');
const vKeyPath = process.env.VKEY_PATH || path.join(__dirname, 'verification_key.json');
const vKey = JSON.parse(fs.readFileSync(vKeyPath, 'utf8'));

const verifierAbiPath = process.env.VERIFIER_ABI_PATH || path.join(__dirname, '../zk-proofs/artifacts/contracts/IdentityVerifier.sol/Groth16Verifier.json');
const verifierAbi = require(verifierAbiPath).abi;

// Fail loud on missing config (mirrors server.js's requireEnv guard).
function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set in the environment (no fallback default — see CLAUDE.md ground rules)`);
  }
  return value;
}

const verifierAddress = requireEnv('VERIFIER_ADDRESS');
const rpcUrl = requireEnv('BLOCKCHAIN_RPC_URL');

const provider = new ethers.JsonRpcProvider(rpcUrl);
const verifierContract = new ethers.Contract(verifierAddress, verifierAbi, provider);

// --- Live fixture (registered on Sepolia under rollNo 22BCSD01) ---
// Same vector as zkp-backend/test/verifyFlow.test.js — verbatim.
const FIXED_SALTS = ['1', '2', '3', '4', '5', '6', '7'];
const STUDENT_ATTRS = {
  name: 'Utkarsh Baranwal',
  rollNo: '22BCSD01',
  dob: '20041014',
  programmeLevel: 'B.Tech',
  discipline: 'CSE',
  batch: '2022',
  email: '22bcsd01@iiitdmj.ac.in',
};
const CURRENT_DATE_INT = '20260617';

/**
 * runLoop(label, fn, N=20) — calls fn() N times, drops the first (warm-up)
 * sample, and computes mean + SAMPLE standard deviation (n-1 = 18) over the
 * remaining n=19 samples. Prints `<label>: mean <m> s ± <sd> s (n=19)`.
 *
 * Returns { mean, sd, n, samples } for downstream collection.
 */
async function runLoop(label, fn, N = 20) {
  const samples = [];
  for (let i = 0; i < N; i++) {
    const t0 = performance.now();
    await fn(i);
    const seconds = (performance.now() - t0) / 1000;
    samples.push(seconds);
  }

  // Drop the first (warm-up) run.
  const measured = samples.slice(1);
  const n = measured.length; // 19 when N=20

  const mean = measured.reduce((a, b) => a + b, 0) / n;
  // SAMPLE standard deviation: divide squared-deviation sum by (n-1), not n.
  const variance = measured.reduce((acc, s) => acc + (s - mean) ** 2, 0) / (n - 1);
  const sd = Math.sqrt(variance);

  console.log(`${label}: mean ${mean.toFixed(3)} s ± ${sd.toFixed(3)} s (n=${n})`);
  return { mean, sd, n, samples: measured };
}

async function main() {
  const results = {};

  // --- 1. MerkleRoot ---
  // Recompute the salted depth-3 root for the fixture using zkp-backend's
  // own building blocks. buildWitnessInput already produces the encoded
  // attr[] (hashToField'd strings + dob/code/batch ints); we mirror
  // identityCommitment.js's Poseidon(2) leaf/level/root math directly here
  // (no cross-import of privdId_admin), using the SAME circomlibjs Poseidon
  // instance pattern as lib/encoding.js.
  const { buildPoseidon } = require('circomlibjs');
  const poseidon = await buildPoseidon();

  function computeRootFromAttrs(attr, salt) {
    const leafValues = [];
    for (let i = 0; i < 7; i++) {
      const lv = poseidon([BigInt(attr[i]), BigInt(salt[i])]);
      leafValues.push(poseidon.F.toString(lv));
    }
    const zeroPadLeaf = poseidon([0n, 0n]);
    leafValues.push(poseidon.F.toString(zeroPadLeaf));

    const n01 = poseidon.F.toString(poseidon([BigInt(leafValues[0]), BigInt(leafValues[1])]));
    const n23 = poseidon.F.toString(poseidon([BigInt(leafValues[2]), BigInt(leafValues[3])]));
    const n45 = poseidon.F.toString(poseidon([BigInt(leafValues[4]), BigInt(leafValues[5])]));
    const n67 = poseidon.F.toString(poseidon([BigInt(leafValues[6]), BigInt(leafValues[7])]));

    const n0123 = poseidon.F.toString(poseidon([BigInt(n01), BigInt(n23)]));
    const n4567 = poseidon.F.toString(poseidon([BigInt(n45), BigInt(n67)]));

    return poseidon.F.toString(poseidon([BigInt(n0123), BigInt(n4567)]));
  }

  // Build the witness input once (attr/salt encoding does not depend on
  // nonce for the Merkle root math) so each loop iteration measures only
  // the root computation itself.
  const witnessForRoot = await buildWitnessInput({
    attrs: STUDENT_ATTRS,
    salts: FIXED_SALTS,
    reveal: {},
    nonce: '1',
    currentDateInt: CURRENT_DATE_INT,
  });

  results.MerkleRoot = await runLoop('MerkleRoot', async () => {
    computeRootFromAttrs(witnessForRoot.attr, witnessForRoot.salt);
  });

  // --- 2. ProofGeneration ---
  // Fresh issued nonce per iteration, mirrors server.js POST /generate-proof.
  let lastProof = null;
  let lastPublicSignals = null;
  results.ProofGeneration = await runLoop('ProofGeneration', async () => {
    const { nonce } = issueNonce();
    const input = await buildWitnessInput({
      attrs: STUDENT_ATTRS,
      salts: FIXED_SALTS,
      reveal: {},
      nonce,
      currentDateInt: CURRENT_DATE_INT,
    });
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);
    lastProof = proof;
    lastPublicSignals = publicSignals;
  });

  // --- 3. OffChainVerification ---
  results.OffChainVerification = await runLoop('OffChainVerification', async () => {
    await snarkjs.groth16.verify(vKey, lastPublicSignals, lastProof);
  });

  // --- 4. OnChainVerification ---
  // Full N=20/n=19 live-Sepolia treatment (D-17). Reuse one funded proof
  // across all 20 calls — verify-onchain is a stateless 0-gas view call.
  const pA = [lastProof.pi_a[0], lastProof.pi_a[1]];
  const pB = [
    [lastProof.pi_b[0][1], lastProof.pi_b[0][0]],
    [lastProof.pi_b[1][1], lastProof.pi_b[1][0]],
  ];
  const pC = [lastProof.pi_c[0], lastProof.pi_c[1]];

  results.OnChainVerification = await runLoop('OnChainVerification', async () => {
    await verifierContract.verifyProof(pA, pB, pC, lastPublicSignals);
  });

  // --- 5. NonceIssue ---
  // Direct call to issueNonce() — sub-ms op; direct-call avoids HTTP
  // overhead skewing the measurement (honest label: direct-function call).
  results.NonceIssue = await runLoop('NonceIssue', async () => {
    issueNonce();
  });

  // --- 6. NonceCheck ---
  // Fresh session issued per iteration so the one-time-use `used` flag does
  // not turn iterations 2..20 into nonce_already_used no-ops.
  results.NonceCheck = await runLoop('NonceCheck', async () => {
    const { nonce, sessionId } = issueNonce();
    validateAndConsume(sessionId, nonce);
  });

  // --- QR payload size + free side-effect numbers (D-19) ---
  // Generate ONE real proof against the 19-signal shape for the size
  // measurements (reuse the proof already captured above).
  const qrPayload = JSON.stringify({ proof: lastProof, publicSignals: lastPublicSignals });
  const qrPayloadBytes = Buffer.byteLength(qrPayload, 'utf8');
  const proofSizeBytes = Buffer.byteLength(JSON.stringify(lastProof), 'utf8');
  const publicSignalCount = lastPublicSignals.length;

  console.log(`qr_payload_bytes: ${qrPayloadBytes} bytes`);
  console.log(`proof_size_bytes: ${proofSizeBytes} bytes`);
  console.log(`public_signal_count: ${publicSignalCount}`);

  // --- End-to-end latency: one full issueNonce -> buildWitnessInput ->
  // fullProve -> groth16.verify chain ---
  const e2eStart = performance.now();
  {
    const { nonce } = issueNonce();
    const input = await buildWitnessInput({
      attrs: STUDENT_ATTRS,
      salts: FIXED_SALTS,
      reveal: {},
      nonce,
      currentDateInt: CURRENT_DATE_INT,
    });
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);
    await snarkjs.groth16.verify(vKey, publicSignals, proof);
  }
  const endToEndLatencySeconds = (performance.now() - e2eStart) / 1000;
  console.log(`end_to_end_latency: ${endToEndLatencySeconds.toFixed(3)} s`);

  // --- Final transcribable summary block ---
  console.log('\n=== BENCH SUMMARY ===');
  for (const [label, r] of Object.entries(results)) {
    console.log(`${label}: mean ${r.mean.toFixed(3)} s ± ${r.sd.toFixed(3)} s (n=${r.n})`);
  }
  console.log(`qr_payload_bytes: ${qrPayloadBytes} bytes`);
  console.log(`proof_size_bytes: ${proofSizeBytes} bytes`);
  console.log(`public_signal_count: ${publicSignalCount}`);
  console.log(`end_to_end_latency: ${endToEndLatencySeconds.toFixed(3)} s`);
  console.log('======================\n');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('bench.js failed:', err);
    process.exit(1);
  });
