// environment.js
export const BACKEND_URL = 'http://172.27.70.33:3001';

// Blockchain configuration for MetaMask integration
export const BLOCKCHAIN_CONFIG = {
  RPC_URL: 'http://172.27.70.33:8545', // Your computer's IP for Hardhat node
  VERIFIER_CONTRACT: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
  CHAIN_ID: 31337, // Hardhat's default chain ID
  NETWORK_NAME: 'Local Hardhat',
  CURRENCY_SYMBOL: 'ETH'
};