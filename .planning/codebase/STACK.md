# Tech Stack

**Analysis Date:** 2026-06-16

## Runtime & Languages

**Primary Language:** JavaScript (ES2022+)
- Admin backend: ESM (`"type": "module"`) — Node.js
- ZKP backend: CommonJS (`require`) — Node.js
- Admin frontend: ESM via Vite
- Mobile app: React Native / Expo
- Smart contracts: Solidity ^0.8.20 / >=0.7.0 <0.9.0 (IdentityVerifier auto-generated)
- ZK circuits: Circom 2.1.6 (`pragma circom 2.1.6`)

**Secondary:**
- TypeScript — `zk-proofs` devDependency only (`typescript ^6.0.3`); not used in application code

**Node.js:**
- No `.nvmrc` or `.node-version` detected; inferred from package compatibility as Node 18+

**Package Manager:** npm (lockfiles not checked but standard for all services)

---

## Service: digital-app

**Framework:** Expo 53.0.20 / React Native 0.79.5 / React 19.0.0

**Key Production Dependencies:**

| Package | Version | Purpose |
|---------|---------|---------|
| `expo` | 53.0.20 | Managed React Native runtime |
| `react-native` | 0.79.5 | Mobile UI framework |
| `react` | 19.0.0 | UI library |
| `@react-navigation/native` | ^7.1.14 | Navigation container |
| `@react-navigation/stack` | ^7.4.2 | Stack navigator |
| `ethers` | ^6.14.4 | Ethereum interaction (client-side) |
| `snarkjs` | ^0.7.5 | ZK proof generation (bundled for RN) |
| `react-native-snarkjs` | ^0.0.4 | React Native snarkjs bridge |
| `circomlibjs` | ^0.1.7 | Poseidon hash (field-element encoding) |
| `axios` | ^1.10.0 | HTTP client |
| `js-sha256` | ^0.11.1 | SHA-256 utility |
| `expo-camera` | ^16.1.11 | Camera access |
| `expo-barcode-scanner` | ^13.0.1 | QR / barcode scanning |
| `react-native-qrcode-svg` | ^6.3.15 | QR code rendering |
| `expo-file-system` | ~18.1.11 | File access (wasm/zkey loading) |
| `expo-document-picker` | ~13.1.6 | File picker |
| `expo-clipboard` | ~7.1.5 | Clipboard access |
| `@react-native-async-storage/async-storage` | ^2.1.2 | Local persistence |
| `@react-native-clipboard/clipboard` | ^1.16.3 | Clipboard (secondary) |
| `@react-native-community/datetimepicker` | ^8.4.1 | Date picker UI |
| `react-native-safe-area-context` | 5.4.0 | Safe area insets |
| `react-native-screens` | ~4.11.1 | Native screen components |
| `expo-asset` | ~11.1.7 | Static asset management |
| `expo-status-bar` | ~2.2.3 | Status bar control |

**Dev Tools:**
- `@babel/core ^7.20.0` — Babel transpilation (Expo default)

**Build Tools:** Expo CLI (`expo start`, `expo run:android`, `expo run:ios`)

**Testing:** None configured

**Entry Point:** `digital-app/index.js` → `digital-app/App.js`

---

## Service: privdId_admin/frontend

**Framework:** React 19.2.5 + Vite 8.0.9

**Key Production Dependencies:**

| Package | Version | Purpose |
|---------|---------|---------|
| `react` | ^19.2.5 | UI library |
| `react-dom` | ^19.2.5 | DOM rendering |
| `react-router-dom` | ^7.5.1 | Client-side routing |
| `axios` | ^1.9.0 | HTTP client to admin backend |
| `react-hot-toast` | ^2.5.2 | Toast notifications |

**Dev Tools / Build:**

| Package | Version | Purpose |
|---------|---------|---------|
| `vite` | ^8.0.9 | Build tool and dev server |
| `@vitejs/plugin-react` | ^6.0.1 | React fast refresh |
| `tailwindcss` | ^3.4.17 | Utility-first CSS |
| `postcss` | ^8.5.3 | CSS processing |
| `autoprefixer` | ^10.4.21 | CSS vendor prefixes |
| `eslint` | ^9.39.4 | Linting |
| `@eslint/js` | ^9.39.4 | ESLint JS rules |
| `eslint-plugin-react-hooks` | ^7.1.1 | React hooks lint rules |
| `eslint-plugin-react-refresh` | ^0.5.2 | Vite HMR lint |
| `globals` | ^17.5.0 | ESLint global defs |
| `@types/react` | ^19.2.14 | TypeScript types (for IDE) |
| `@types/react-dom` | ^19.2.3 | TypeScript types (for IDE) |

**Scripts:** `dev` (Vite dev server), `build` (Vite production build), `lint` (ESLint), `preview`

**Testing:** None configured

---

## Service: privdId_admin/backend

**Runtime:** Node.js, ESM (`"type": "module"`)
**Framework:** Express 5.1.0

**Key Production Dependencies:**

| Package | Version | Purpose |
|---------|---------|---------|
| `express` | ^5.1.0 | HTTP server framework |
| `mongoose` | ^8.14.2 | MongoDB ODM |
| `ethers` | ^6.16.0 | Ethereum write ops (Sepolia) |
| `circomlibjs` | ^0.1.7 | Poseidon hash for issuance commitment |
| `axios` | ^1.17.0 | HTTP client (Pinata API) |
| `jsonwebtoken` | ^9.0.2 | JWT auth tokens |
| `joi` | ^17.13.3 | Request validation |
| `nodemailer` | ^6.10.1 | SMTP email (credential delivery) |
| `multer` | ^2.0.1 | Multipart file uploads (Excel) |
| `xlsx` | ^0.18.5 | Excel parsing (bulk student import) |
| `helmet` | ^8.1.0 | HTTP security headers |
| `cors` | ^2.8.5 | CORS middleware |
| `morgan` | ^1.10.0 | HTTP request logging |
| `dotenv` | ^17.2.1 | Environment variable loading |

**Dev Tools:**
- `nodemon ^3.1.10` — Dev server auto-restart

**Scripts:** `dev` (nodemon), `start` (node)

**Testing:** None configured

**Entry Point:** `privdId_admin/backend/server.js`

---

## Service: zkp-backend

**Runtime:** Node.js, CommonJS (`require`)
**Framework:** Express 5.1.0

**Key Production Dependencies:**

| Package | Version | Purpose |
|---------|---------|---------|
| `express` | ^5.1.0 | HTTP server framework |
| `snarkjs` | ^0.7.5 | Groth16 proof generation and off-chain verification |
| `ethers` | ^6.15.0 | On-chain proof verification (read-only, Sepolia) |
| `circomlibjs` | ^0.1.7 | Poseidon hash |
| `cors` | ^2.8.5 | CORS middleware |
| `dotenv` | ^17.4.1 | Environment variable loading |

**Scripts:** None defined (start directly with `node index.js` / `node server.js`)

**Testing:** None configured

**Entry Point:** `zkp-backend/server.js`

---

## Service: zk-proofs

**Purpose:** Circuit compilation, trusted setup, contract deployment

**Languages:**
- Circom 2.1.6 — ZK circuit definition (`zk-proofs/circuits/identity.circom`)
- Solidity ^0.8.20 — Smart contracts (`CredentialRegistry.sol`, `IdentityVerifier.sol`)
- JavaScript (CommonJS) — Hardhat config and scripts

**Circom Circuit:** `identity.circom` — Poseidon(5) hash of [name, rollNo, dob, phoneNo, branch] → pubHash

**Solidity Version:** `0.8.28` (Hardhat config), `^0.8.20` (CredentialRegistry), `>=0.7.0 <0.9.0` (IdentityVerifier, snarkjs-generated)

**Key Dev Dependencies:**

| Package | Version | Purpose |
|---------|---------|---------|
| `hardhat` | ^2.24.3 | EVM development framework |
| `hardhat-circom` | ^3.3.2 | Circom circuit compilation via Hardhat |
| `@solarity/hardhat-zkit` | ^0.5.17 | ZKit integration for Hardhat |
| `snarkjs` | ^0.7.5 | Trusted setup + proof artifacts |
| `@nomicfoundation/hardhat-toolbox` | ^5.0.0 | Hardhat plugins bundle (ethers, chai, gas reporter, coverage, verify) |
| `@nomicfoundation/hardhat-ethers` | ^3.1.3 | Ethers.js v6 Hardhat plugin |
| `@nomicfoundation/hardhat-ignition` | ^0.15.16 | Deployment management |
| `@nomicfoundation/hardhat-verify` | ^2.1.3 | Etherscan verification |
| `hardhat-gas-reporter` | ^1.0.10 | Gas usage reports |
| `solidity-coverage` | ^0.8.17 | Solidity coverage |
| `typescript` | ^6.0.3 | TypeScript (for typechain) |
| `typechain` | ^8.3.2 | Contract type generation |
| `@typechain/ethers-v6` | ^0.5.1 | ethers v6 typings |
| `ts-node` | ^10.9.2 | TypeScript execution |
| `dotenv` | ^17.4.2 | Environment variable loading |

**Runtime Dependencies:**
- `circomlibjs ^0.1.7` — Poseidon hash
- `ethers ^6.15.0` — Contract interaction in scripts

**Networks Configured:** `hardhat` (in-memory), `localhost` (http://127.0.0.1:8545), `sepolia`

**Trusted Setup:** `pot12_final.ptau` at `../build/pot12_final.ptau` (relative to `zk-proofs/`)

**Circomlib:** Vendored locally at `zk-proofs/circomlib/` (not installed via npm)

**Testing Framework:** Mocha + Chai (via `@nomicfoundation/hardhat-toolbox`) — no test files detected

---

## Shared / Root

**No root-level `package.json`** — each service is an independent npm project with its own `node_modules`.

**Common versions across services:**
- `ethers` v6 used in all three backend/blockchain-touching services
- `circomlibjs ^0.1.7` used in digital-app, admin-backend, and zkp-backend
- `snarkjs ^0.7.5` used in digital-app and zkp-backend
- `express ^5.1.0` used in admin-backend and zkp-backend

**No shared linting config detected at root.**

---

*Stack analysis: 2026-06-16*
