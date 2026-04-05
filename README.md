# Digital Identity App with Zero-Knowledge Proofs

A React Native application that enables privacy-preserving student identity verification using zero-knowledge proofs and blockchain technology.

The current app opens on a landing screen, then moves into identity entry, proof generation, QR sharing, and off-chain/on-chain verification.

## 📁 Project Structure

```
digital_id_app/
├── digital-app/           # React Native frontend
├── zk-proofs/            # Zero-knowledge circuits and smart contracts
├── zkp-backend/          # Express.js backend server
└── README.md            # This file
```

## 🚀 Quick Setup Guide

### Prerequisites

1. **Node.js** (v16 or higher)
2. **npm** or **yarn**
3. **Expo CLI**: `npm install -g @expo/cli`
4. **Hardhat**: For blockchain development
5. **Circom**: For zero-knowledge circuit compilation

### Step 1: Install Dependencies

```bash
# Install frontend dependencies
cd digital-app
npm install

# Install backend dependencies
cd ../zkp-backend
npm install

# Install blockchain dependencies
cd ../zk-proofs
npm install
```

### Step 2: Configuration Files to Update

The project now uses environment files instead of scattering values through code.

**1. Frontend backend URL**
```javascript
// File: digital-app/environment.js
export const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://10.199.147.52:3001';
```
- For Expo Go on a phone, use the Windows LAN IP, not the WSL IP.
- Current fallback: `http://10.199.147.52:3001`
- You can override it in `digital-app/.env` with `EXPO_PUBLIC_BACKEND_URL=...`

**2. Backend blockchain RPC and verifier address**
```javascript
// File: zkp-backend/server.js
const provider = new ethers.JsonRpcProvider(process.env.BLOCKCHAIN_RPC_URL || 'http://127.0.0.1:8545');
const verifierAddress = process.env.VERIFIER_ADDRESS || '0x5FbDB2315678afecb367f032d93F642f64180aa3';
```
- For local development: keep the RPC pointed at `http://127.0.0.1:8545`
- If you redeploy the contract, update `VERIFIER_ADDRESS`
- You can store the values in `zkp-backend/.env`

**3. Hardhat network configuration**
```javascript
// File: zk-proofs/hardhat.config.js
networks: {
  hardhat: {},
  localhost: {
    url: 'http://127.0.0.1:8545'
  }
}
```
- The verifier contract is redeployed against the local Hardhat node.
- After redeploying, copy the new address from the terminal output.

**4. Android native project warning**
```javascript
// File: digital-app/android/local.properties
sdk.dir=/mnt/c/Users/DELL/AppData/Local/Android/Sdk
```
- This only matters if VS Code inspects the native Android project.
- If you are only using Expo Go and `expo start --tunnel`, you can ignore native Android build warnings.

## 🛠️ Step-by-Step Restart Process

### Step 3: Start Blockchain Network

```bash
cd zk-proofs
npx hardhat node
```
- This starts a local Ethereum network on `http://127.0.0.1:8545`
- Keep this terminal open
- Note: Network resets when you restart this command

### Step 4: Deploy Smart Contracts

```bash
# In a new terminal
cd zk-proofs
npx hardhat run scripts/deployVerifier.js --network localhost
```

**📝 Important**: Copy the deployed contract address from terminal output:
```
Groth16Verifier deployed to: 0xYOUR_NEW_CONTRACT_ADDRESS
```

### Step 5: Set Backend Environment Values

```bash
# zkp-backend/.env
PORT=3001
BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545
VERIFIER_ADDRESS=0xYOUR_NEW_CONTRACT_ADDRESS
```

### Step 6: Prepare ZK Circuit Files

Ensure these files exist in `zkp-backend/`:
- `identity.wasm`
- `identity_final.zkey` 
- `verification_key.json`

If missing, copy from `zk-proofs/` build outputs:
```bash
cd zkp-backend
cp ../zk-proofs/build/identity_js/identity.wasm ./
cp ../zk-proofs/identity_final.zkey ./
cp ../zk-proofs/verification_key.json ./
```

### Step 7: Start Backend Server

```bash
cd zkp-backend
node server.js
```
- Server runs on port 3001
- Should display: `Verifier API listening on port 3001`
- `curl http://YOUR_IP:3001/` should return `ZKP backend running`

### Step 8: Start Frontend App

```bash
cd digital-app
expo start --tunnel
```
- Scan the QR code with Expo Go on your phone
- Use tunnel mode if the phone cannot reach the local network directly
- If you are debugging the UI only, you can still run the web version

## 🔁 Current Runtime Flow

1. Hardhat node starts first.
2. `deployVerifier.js` deploys the verifier contract to the local chain.
3. `zkp-backend/server.js` starts and reads the proving artifacts plus contract address.
4. Expo starts the mobile app.
5. The app opens on the landing screen in `digital-app/screens/HomeScreen.js`.
6. The user enters identity data in `IdentityForm.js`.
7. `LoadingScreen.js` sends the data to the backend to generate and verify the proof.
8. `ShowProof.js` packages the proof into QR-friendly JSON.
9. `VerifyProof.js`, `QRScannerScreen.js`, and `ManualQRInput.js` verify the shared payload.

## 🔍 Troubleshooting

### Common Issues & Solutions

**❌ "Network Error" in app**
- Check `BACKEND_URL` in `environment.js`
- Ensure backend server is running
- Verify the backend URL is reachable from the phone
- If you are using WSL, prefer the Windows LAN IP in `EXPO_PUBLIC_BACKEND_URL`

**❌ "Contract call failed"**
- Verify contract address in `server.js`
- Ensure Hardhat node is running
- Redeploy contracts if needed

**❌ "Missing circuit files"**
- Copy `.wasm`, `.zkey`, and `verification_key.json` to `zkp-backend/`
- Rebuild circuits if necessary

**❌ App won't load on device**
- Ensure device and computer are on same network
- Check firewall settings
- Try different IP address format

**❌ Android SDK location warning in VS Code**
- This warning only affects native Android tooling
- It does not block Expo Go with `expo start --tunnel`
- Reload VS Code if the diagnostic remains after `local.properties` is added

### Verification Commands

```bash
# Check if backend is running
curl http://YOUR_IP:3001

# Check blockchain connection
npx hardhat console --network localhost

# Test proof generation
# Use the app or send POST request to /generate-proof
```

## 🔧 Development Configuration

### Environment Variables (Optional)

Create `.env` files for easier configuration:

```bash
# digital-app/.env
EXPO_PUBLIC_BACKEND_URL=http://10.199.147.52:3001

# zkp-backend/.env
PORT=3001
BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545
VERIFIER_ADDRESS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512(for example, you will get the address when u deploy the contract)
```

Example files are available in:
- `digital-app/.env.example`
- `zkp-backend/.env.example`
- `zk-proofs/.env.example`

### Network Configuration for Different Environments

**Local Development:**
- Blockchain: `http://127.0.0.1:8545`
- Backend: `http://YOUR_IP:3001`
- Expo Go: `expo start --tunnel`

**Production/Remote:**
- Update RPC URLs accordingly
- Configure proper CORS settings
- Use environment variables

## 📱 App Features

- **Identity Form**: Input student details
- **Landing Screen**: New first screen with app overview and action buttons
- **Privacy Controls**: Choose which details to share
- **QR Code Generation**: Share proof via QR code
- **Dual Verification**: Off-chain + blockchain validation
- **Zero-Knowledge Privacy**: No personal data exposed

## 🔒 Security Notes

- Never commit private keys to version control
- ZK circuits provide mathematical proof without revealing data
- Smart contracts are immutable once deployed
- Always verify proof authenticity before trusting

## 🆘 Need Help?

1. Check console logs in all terminals
2. Verify all services are running
3. Ensure network connectivity
4. Review configuration files
5. Restart services in order: Blockchain → Contracts → Backend → Frontend

---

**Last Updated**: April 6, 2026
**Version**: 1.0.0
