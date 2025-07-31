// server.js

const express = require('express');
const snarkjs = require('snarkjs');
const fs = require('fs');
const cors = require('cors');
const circomlibjs = require('circomlibjs');
const { ethers } = require('ethers');

const app = express();
app.use(cors());
app.use(express.json());

// File paths - update if your files are in different location
const wasmPath = './identity.wasm';
const zkeyPath = './identity_final.zkey';
const vKey = JSON.parse(fs.readFileSync('./verification_key.json'));

// Load ABI of the deployed Solidity verifier contract
const verifierAbi = require('../zk-proofs/artifacts/contracts/IdentityVerifier.sol/Groth16Verifier.json').abi;

// Deployed verifier contract address on your local Hardhat network
const verifierAddress = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';

// Provider connects to your local Hardhat Ethereum node
const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');

// Contract instance for on-chain verification (read-only calls)
const verifierContract = new ethers.Contract(verifierAddress, verifierAbi, provider);

// Basic route to check server status
app.get('/', (req, res) => {
  res.send('ZKP backend running');
});

// Endpoint: Generate zk-SNARK proof off-chain
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

// Endpoint: Verify zk-SNARK proof off-chain using snarkjs
app.post('/verify', async (req, res) => {
  const { proof, publicSignals } = req.body;
  try {
    const isValid = await snarkjs.groth16.verify(vKey, publicSignals, proof);
    res.json({ valid: isValid });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// New Endpoint: Verify zk-SNARK proof ON-CHAIN via Solidity verifier
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

// Start the backend server
const PORT = 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Verifier API listening on port ${PORT}`);
});
