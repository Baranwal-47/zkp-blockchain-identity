const express = require('express');
const snarkjs = require('snarkjs');
const fs = require('fs');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const { ethers } = require('ethers');

const app = express();
app.use(cors());
app.use(express.json());

const wasmPath = process.env.WASM_PATH || path.join(__dirname, 'identity.wasm');
const zkeyPath = process.env.ZKEY_PATH || path.join(__dirname, 'identity_final.zkey');
const vKeyPath = process.env.VKEY_PATH || path.join(__dirname, 'verification_key.json');
const vKey = JSON.parse(fs.readFileSync(vKeyPath, 'utf8'));

const verifierAbiPath = process.env.VERIFIER_ABI_PATH || path.join(__dirname, '../zk-proofs/artifacts/contracts/IdentityVerifier.sol/Groth16Verifier.json');
const verifierAbi = require(verifierAbiPath).abi;

const verifierAddress = process.env.VERIFIER_ADDRESS || '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const rpcUrl = process.env.BLOCKCHAIN_RPC_URL || 'http://127.0.0.1:8545';
const port = Number(process.env.PORT || 3001);

const provider = new ethers.JsonRpcProvider(rpcUrl);

const verifierContract = new ethers.Contract(verifierAddress, verifierAbi, provider);

app.get('/', (req, res) => {
  res.send('ZKP backend running');
});

app.post('/generate-proof', async (req, res) => {
  console.log('Received input:', req.body);
  try {
    const { name, rollNo, dob, phoneNo, branch } = req.body;
    const input = { name, rollNo, dob, phoneNo, branch };

    // Generate proof and public signals using snarkjs
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      wasmPath,
      zkeyPath
    );

    res.json({ proof, publicSignals });
  } catch (err) {
    console.error('Proof generation error:', err);
    res.status(500).json({ error: 'Proof generation failed', details: err.message });
  }
});

app.post('/verify', async (req, res) => {
  const { proof, publicSignals } = req.body;
  try {
    const isValid = await snarkjs.groth16.verify(vKey, publicSignals, proof);
    res.json({ valid: isValid });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/verify-onchain', async (req, res) => {
  const { proof, publicSignals } = req.body;

  if (!proof || !publicSignals) {
    return res.status(400).json({ error: 'Missing proof or public signals' });
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
    const isValid = await verifierContract.verifyProof(pA, pB, pC, publicSignals);

    res.json({ valid: isValid });
  } catch (err) {
    console.error('On-chain proof verification failed:', err);
    res.status(500).json({ error: 'On-chain verification failed', details: err.message });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Verifier API listening on port ${port}`);
});
