# System Architecture

<!-- refreshed: 2026-06-16 -->
**Analysis Date:** 2026-06-16

## Overview

PrivdID is a privacy-preserving student identity system for IIITDM Jabalpur. It uses Groth16 ZK-SNARKs (Circom 2.1.6 + snarkjs), IPFS (Pinata), and Ethereum (Sepolia testnet) to allow students to prove their identity without revealing raw personal data.

Five services work together:

```text
┌──────────────────────────────────────────────────────────────────────┐
│                     Client Layer                                      │
├───────────────────────────────┬──────────────────────────────────────┤
│   digital-app/ (Expo RN)      │   privdId_admin/frontend/ (React+Vite)│
│   Student mobile app          │   Admin web portal                   │
│   Port: N/A (device)          │   Port: 5173 (dev)                   │
└───────────┬───────────────────┴──────────────────┬───────────────────┘
            │ REST                                  │ REST
            ▼                                       ▼
┌───────────────────────────────┐   ┌──────────────────────────────────┐
│   zkp-backend/ (Express CJS)  │   │ privdId_admin/backend/ (Express  │
│   Proof gen + verify          │   │ ESM + MongoDB)                   │
│   Port: 3001                  │   │ Student CRUD, issuance           │
│   snarkjs · ethers v6 (read)  │   │ Port: 5000                       │
└───────────────────────────────┘   └──────────────────┬───────────────┘
            │ eth_call (read-only)                     │ eth_sendTransaction (write)
            ▼                                          ▼
┌──────────────────────────────────────────────────────────────────────┐
│                   Ethereum Sepolia Testnet                            │
│   IdentityVerifier (Groth16Verifier) · CredentialRegistry            │
└──────────────────────────────────────────────────────────────────────┘
                                        │
                                        │ IPFS CID stored on-chain
                                        ▼
                               ┌─────────────────┐
                               │   Pinata / IPFS  │
                               │  (credential JSON│
                               │   blobs)         │
                               └─────────────────┘
```

## Data Flow: Issuance

The issuance flow anchors a student's identity commitment on IPFS and Ethereum.

1. **Admin creates student** via `privdId_admin/frontend/` or `digital-app/screens/admin/` → POST `/api/students` on the admin backend (`privdId_admin/backend/server.js`, port 5000).
2. **Admin backend validates** input with Joi (`privdId_admin/backend/validators/studentValidator.js`).
3. **Poseidon hash computed** server-side via `circomlibjs` over 5 fields in this order:
   `[name, rollNo, dob, normalizePhone(contactNo), programme]`
   (`privdId_admin/backend/utils/poseidonHash.js` → `hashPoseidonFields()`).
   Each field is UTF-8 encoded to hex then converted to a BigInt before hashing.
4. **Student record saved** to MongoDB with `hashedData` (decimal string of Poseidon output) + plaintext `password` (`privdId_admin/backend/models/Student.js`).
5. **On-chain anchoring** (non-blocking) via `privdId_admin/backend/services/credentialService.js`:
   a. Build a JSON credential blob `{rollNo, programme, email, hashedData, issuedAt, issuer, type, version}`.
   b. PIN the blob to IPFS via Pinata API → returns `ipfsCID`.
   c. Call `CredentialRegistry.issueCredential(rollNo, cid, pubHashBytes32)` on Sepolia using an EOA wallet (`PRIVATE_KEY` env var).
   d. Store `ipfsCID`, `onChainTxHash`, `onChainBlock` on the MongoDB `Student` document.
6. **Email sent** (separately) via `POST /api/students/send-email` → Nodemailer delivers `{email, plaintext password}` to student.

## Data Flow: Verification

The verification flow proves student identity without transmitting raw data.

**Student side (generate):**
1. Student logs in on `digital-app/screens/LoginScreen.js` → POST `/api/students/login` → admin backend returns student record (no JWT; plain password comparison).
2. Student sees `StudentProfileScreen.js` — selects which fields to reveal in the QR. Enters DOB if not stored.
3. Student taps "Generate Zero-Knowledge Proof" → navigates to `LoadingScreen.js`.
4. `LoadingScreen.js` calls `POST ${BACKEND_URL}/generate-proof` on zkp-backend (port 3001), sending `{name, rollNo, dob, phoneNo, branch}` as strings.
5. zkp-backend (`zkp-backend/server.js`) converts each string to a BigInt via `stringToBigInt()` (identical encoding to the admin backend), then calls `snarkjs.groth16.fullProve(input, identity.wasm, identity_final.zkey)`.
6. `{proof, publicSignals}` returned. `publicSignals[0]` is the Poseidon hash (decimal string).
7. `LoadingScreen.js` immediately calls `POST /verify` (off-chain) then `POST /verify-onchain` (Solidity) before navigating to `ShowProof.js`.

**Verifier side (receive):**
1. Verifier scans QR code in `QRScannerScreen.js` or pastes JSON in `ManualQRInput.js`.
2. `VerifyProof.js` receives `{proof, publicSignals, revealedDetails, privacySettings}` parsed from QR payload.
3. Calls three endpoints in sequence:
   - `POST /verify` → snarkjs off-chain check.
   - `POST /verify-onchain` → calls `IdentityVerifier.verifyProof(pA, pB, pC, publicSignals)` on Sepolia (read-only).
   - `POST /credential-info` → looks up `CredentialRegistry.getCredentialByHash(pubHashBytes32)` to check issuance and revocation status.
4. Overall validity = `offchain.valid && onchain.valid && registry.found && !registry.revoked`.

## Smart Contracts

Two contracts deployed on Ethereum Sepolia:

### `IdentityVerifier` (`Groth16Verifier`)
- **File:** `zk-proofs/contracts/IdentityVerifier.sol`
- **Generated by:** snarkjs from the Groth16 trusted setup (`identity_final.zkey`).
- **Purpose:** Pure cryptographic proof verification. Hardcodes the verification key constants (alpha, beta, gamma, delta, IC0, IC1).
- **Key function:** `verifyProof(uint[2] pA, uint[2][2] pB, uint[2] pC, uint[1] pubSignals) returns (bool)` — stateless, read-only.
- **Address (Sepolia):** `0x2625C6fDBEDcCD572836FfbFA391D2C25de7ae26`
- **Note:** Has exactly 1 public input (`uint[1] pubSignals`) = the Poseidon hash.

### `CredentialRegistry`
- **File:** `zk-proofs/contracts/CredentialRegistry.sol`
- **Purpose:** Authoritative on-chain ledger mapping `rollNo → {ipfsCID, pubHash, issuedAt, revoked}`.
- **Key functions:**
  - `issueCredential(rollNo, ipfsCID, pubHash)` — admin-only (single EOA `admin` set at deploy time). Invalidates old hash on re-issue.
  - `revokeCredential(rollNo)` — admin-only. Sets `isValidHash[pubHash] = false` and `revoked = true`.
  - `getCredential(rollNo)` and `getCredentialByHash(pubHash)` — public read.
- **Mappings:** `credentialsByRollNo`, `rollNoByHash`, `isValidHash`.
- **Address (Sepolia):** `0xB7a915C78C546A1082CB66bA294fAFee52E4EB07`
- **Constraint:** `admin` is set to `msg.sender` at construction — a single EOA. No multisig at present.

### Deploy scripts
- `zk-proofs/scripts/deployRegistry.js` — deploys `CredentialRegistry` via Hardhat.
- `zk-proofs/scripts/deployVerifier.js` — deploys `IdentityVerifier`.

## ZK Proof Pipeline

**Circuit:** `zk-proofs/circuits/identity.circom` (Circom 2.1.6)

```text
Private inputs:  name, rollNo, dob, phoneNo, branch   (5 field elements)
                         │
                  Poseidon(5) hasher
                         │
Public output:   pubHash  (single field element, decimal string in publicSignals[0])
```

**Trusted setup artifacts** (committed to repo):
- `zk-proofs/build/identity.r1cs` — R1CS constraint system.
- `zkp-backend/identity.wasm` — WebAssembly witness generator (copy from build).
- `zkp-backend/identity_final.zkey` — Groth16 proving key.
- `zkp-backend/verification_key.json` — Verification key (JSON, used by snarkjs off-chain verify).
- `zk-proofs/verification_key.json` — Copy at zk-proofs root.

**Encoding contract (must match between admin backend and zkp-backend):**
Both services use the identical `stringToBigInt()` function:
```
BigInt(`0x${Buffer.from(String(value), 'utf8').toString('hex')}`)
```
Empty/null fields → `0n`. This is the field-consistency invariant.

**Field order in the circuit vs. field names in MongoDB:**

| Circuit signal | Admin backend source field | Normalization |
|----------------|---------------------------|---------------|
| `name`         | `student.name`             | `.trim()`     |
| `rollNo`       | `student.rollNo`           | `.trim()`     |
| `dob`          | `student.dob`              | `.trim()`     |
| `phoneNo`      | `student.contactNo`        | `normalizePhone()` → `+91XXXXXXXXXX` |
| `branch`       | `student.programme`        | `.trim()`     |

Note: the circuit and zkp-backend call the 5th input `branch`; the database stores it as `programme`. The field name mapping is explicit in `StudentProfileScreen.js` and `LoadingScreen.js`.

**Proof generation (server-side):**
`POST /generate-proof` on zkp-backend → `snarkjs.groth16.fullProve(input, wasmPath, zkeyPath)` → returns `{proof, publicSignals}`.

**Off-chain verification:**
`POST /verify` → `snarkjs.groth16.verify(vKey, publicSignals, proof)` → boolean.

**On-chain verification:**
`POST /verify-onchain` → formats proof for Solidity ABI (note: `pB` inner arrays are swapped: `[pi_b[0][1], pi_b[0][0]]`) → calls `verifierContract.verifyProof(pA, pB, pC, publicSignals)` (read-only `eth_call`).

## On-chain vs Off-chain Data

| Data | Where stored | Format |
|------|-------------|--------|
| Student name, email, rollNo, programme, contactNo, dob | MongoDB (`privdId_admin/backend/models/Student.js`) | Plaintext strings |
| Poseidon hash (`hashedData`) | MongoDB + Ethereum (as `pubHash` bytes32) | Decimal string in Mongo; bytes32 on-chain |
| Plaintext password | MongoDB (`Student.password`) | Plaintext — no hashing |
| Credential metadata blob | IPFS (Pinata) | JSON: `{rollNo, programme, email, hashedData, issuedAt, issuer, type, version}` |
| IPFS CID | MongoDB (`Student.ipfsCID`) + Ethereum (`CredentialRegistry.ipfsCID`) | CIDv0 string |
| On-chain tx hash / block | MongoDB (`onChainTxHash`, `onChainBlock`) | String / Number |
| Credential issuance + revocation record | Ethereum `CredentialRegistry` | Mapping by rollNo and pubHash |
| Groth16 proof validity | Ethereum `IdentityVerifier` | Stateless verification key constants |
| ZK circuit, proving key, WASM | zkp-backend filesystem + zk-proofs/build | Binary / JSON |

**What never leaves the device:** Raw private inputs exist only in transit from `StudentProfileScreen` → `LoadingScreen` → zkp-backend HTTP POST (in-flight). They are not persisted client-side.

## Authentication Model

### Admin authentication

**Web portal (`privdId_admin/frontend/`):**
- No authentication enforced on API routes. All CRUD endpoints on `privdId_admin/backend` are open (no auth middleware).
- The frontend has no login page; it accesses the API directly.

**Mobile admin (`digital-app/screens/admin/`):**
- `AdminLoginScreen.js` posts `{password}` to `POST /api/admin/login` on the admin backend.
- `adminController.js` compares against `process.env.ADMIN_PASSWORD` (plaintext comparison, no hashing).
- On success, returns a JWT signed with `process.env.JWT_SECRET || 'privid-admin-secret'` (24h expiry).
- The JWT token is passed as a navigation param to `AdminDashboardScreen` and forwarded as `Authorization: Bearer <token>` on admin API calls from mobile.
- **No middleware validates this JWT on the backend routes** — the admin routes do not use an `authenticate` middleware.

### Student authentication

- `POST /api/students/login` compares `req.body.password` directly against `student.password` (plaintext string equality: `student.password !== String(password)`).
- No JWT or session is issued to the student. The student object from the DB response is stored in component state.
- `StudentProfileScreen.js` polls `/api/students/:id` on every focus event to detect revocation.
- Revoked students get logged out immediately on next focus.

### On-chain access control

- `CredentialRegistry` uses a single-EOA `admin` pattern: `modifier onlyAdmin { require(msg.sender == admin); }`.
- The admin EOA private key is stored in `PRIVATE_KEY` env var of the admin backend.
- `IdentityVerifier` has no access control — `verifyProof` is a public view function.

## Key Architectural Decisions

1. **Proof generation is server-side** (`zkp-backend`): Circom WASM + proving key are too large for mobile. The mobile app sends raw attributes over HTTPS and receives `{proof, publicSignals}`.

2. **Selective disclosure is app-layer only**: The ZK circuit commits to all 5 attributes in one hash. "Selective disclosure" in the QR/UI means the student chooses which plaintext values to embed in the QR alongside the proof — the proof itself always covers all 5 fields. True selective disclosure (e.g., Merkle tree per-field) is not implemented.

3. **Admin backend is the sole on-chain writer**: Only `privdId_admin/backend` holds the signing wallet. The zkp-backend is read-only (ethers `JsonRpcProvider`, no `Wallet`).

4. **Non-blocking credential anchoring**: `issueCredentialOnChain()` failures are caught and logged but do not abort student creation. The student record is written to MongoDB first, then the on-chain anchoring is attempted.

5. **Re-issuance invalidates old hash**: When a student record is updated, `CredentialRegistry.issueCredential()` detects `existing.exists` and sets `isValidHash[existing.pubHash] = false` before writing the new hash. Old proofs are automatically invalidated on-chain.

6. **Dual verification pipeline**: Proof flows through off-chain snarkjs verify (fast, no gas) then on-chain Solidity verifier (authoritative) then `CredentialRegistry` lookup (checks revocation + IPFS anchor).
