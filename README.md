# ZKP Blockchain Identity

A privacy-first student identity verification system using zero-knowledge proofs and blockchain technology for secure, selective data sharing via QR codes.

## 📁 Project Structure

```
zkp-blockchain-identity/
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

#### 🔧 **Critical Configuration Changes**

**1. Backend Server IP Address**
```javascript
// File: digital-app/environment.js
export const BACKEND_URL = 'http://YOUR_IP_ADDRESS:3001';
```
- Replace `YOUR_IP_ADDRESS` with your actual machine's IP address
- Current: `http://10.226.189.52:3001`
- To find your IP: `ipconfig` (Windows) or `ifconfig` (Mac/Linux)

**2. Blockchain Network Configuration**
```javascript
// File: zkp-backend/server.js (Line 25)
const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
```
- For local development: Keep as `http://127.0.0.1:8545`
- For remote blockchain: Replace with your RPC URL

**3. Smart Contract Address**
```javascript
// File: zkp-backend/server.js (Line 23)
const verifierAddress = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';
```
- **⚠️ MUST UPDATE**: This address changes every time you redeploy contracts
- Get new address after running deployment script

**4. Hardhat Network Configuration**
```javascript
// File: zk-proofs/hardhat.config.js
networks: {
  hardhat: {},
  localhost: {
    url: "http://127.0.0.1:8545"  // Update if using different port
  }
}
```

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

### Step 5: Update Contract Address

```javascript
// Update zkp-backend/server.js line 23
const verifierAddress = 'YOUR_NEW_CONTRACT_ADDRESS';
```

### Step 6: Prepare ZK Circuit Files

Ensure these files exist in `zkp-backend/`:
- `identity.wasm`
- `identity_final.zkey` 
- `verification_key.json`

If missing, copy from `zk-proofs/build/`:
```bash
cd zkp-backend
cp ../zk-proofs/build/identity_js/identity.wasm ./
cp ../zk-proofs/build/identity_final.zkey ./
cp ../zk-proofs/build/verification_key.json ./
```

### Step 7: Start Backend Server

```bash
cd zkp-backend
node server.js
```
- Server runs on port 3001
- Should display: "ZKP backend running"

### Step 8: Start Frontend App

```bash
cd digital-app
expo start
```
- Scan QR code with Expo Go app (mobile)
- Or press 'w' for web version

## 🔍 Troubleshooting

### Common Issues & Solutions

**❌ "Network Error" in app**
- Check `BACKEND_URL` in `environment.js`
- Ensure backend server is running
- Verify IP address is correct

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
# zkp-backend/.env
PORT=3001
BLOCKCHAIN_RPC=http://127.0.0.1:8545
VERIFIER_ADDRESS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
```

### Network Configuration for Different Environments

**Local Development:**
- Blockchain: `http://127.0.0.1:8545`
- Backend: `http://YOUR_IP:3001`

**Production/Remote:**
- Update RPC URLs accordingly
- Configure proper CORS settings
- Use environment variables

## 📱 App Features

- **Identity Form**: Input student details
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

**Last Updated**: July 31, 2025
**Version**: 1.0.0
