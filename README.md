# PrivdID

A privacy-preserving student identity system for **IIITDM Jabalpur**, built on ZK-SNARKs, IPFS, and Ethereum.

A student's credential is never stored in plaintext anywhere off-device. It's encrypted (AES-256-GCM) with a per-student key that is itself wrapped to the student's own on-device keypair (ECIES) — only the student can decrypt their own data to generate a proof. Admins and custodians can pin and manage ciphertext, but cannot read it. Selective-disclosure proofs (e.g. "is over 18", "is postgrad") are generated from a depth-3 salted-attribute Merkle tree and verified on-chain via a Groth16 verifier, with replay protection via a one-time verifier nonce.

Two layers of 2-of-3 threshold control by the same three institute officials (Academic Admin, Assistant Registrar, Dean) gate the system:
- **E5 — Governance:** the on-chain `CredentialRegistry` is administered by a Gnosis Safe 2-of-3; issuing or revoking a credential requires 2 of 3 signatures, not a single admin key.
- **E6 — Custody:** each credential's decryption key (DEK) is Shamir-split 2-of-3 across separated custodian stores at issuance, so the admin alone never holds enough material to decrypt a student's credential. The same 2-of-3 custodian quorum can reconstruct the DEK to recover a student's access after device loss, or to support a credential modification.

Authors: Utkarsh Baranwal & Dhruv Anand Singh · Supervisor: Dr. Durgesh Singh.

## Repo layout

5 services:

| Service | Path | Stack | Role |
|---|---|---|---|
| Mobile app | `digital-app/` | Expo React Native | Student-facing: claim credential, view/decrypt on-device, generate proof QR, two-hop verify, device-loss recovery screen |
| Admin web portal | `privdId_admin/frontend/` | React + Vite | Admin/custodian-facing: student CRUD, Safe governance (propose/sign/execute), custodian onboarding, recovery dashboard |
| Admin backend | `privdId_admin/backend/` | Express 5 + MongoDB (ESM) | Student CRUD, Poseidon hash + Merkle root, encryption, Pinata/IPFS pinning, Shamir split/reconstruct, Safe propose/sign/execute, recovery sessions |
| ZKP backend | `zkp-backend/` | Express + snarkjs + ethers v6 | Proof generation (server-side), off-chain verify, read-only on-chain verify, verifier-nonce issuance/check |
| Circuits & contracts | `zk-proofs/` | Hardhat + Circom 2.1.6 + Solidity | `identity.circom` (frozen), `IdentityVerifier.sol`, `CredentialRegistry.sol`, deploy scripts |

**The ZK circuit (`identity.circom`) and its Groth16 verifier are frozen** — any change forces a new trusted setup and redeploy, so treat them as immutable.

The frozen leaf set (7 attributes, exact order matters everywhere a credential commitment is built): `name, rollNo, dob, programmeLevel, discipline, batch, email`.

## How a credential moves through the system

1. **Issuance** — admin enters a student's attributes. Backend computes the Merkle root over the 7 salted attributes, generates a random DEK, AES-256-GCM-encrypts the credential JSON, Shamir-splits the DEK 2-of-3 across custodian stores, pins the ciphertext to IPFS, and proposes `issueCredential(rollNo, CID, pubHash)` through the Gnosis Safe 2-of-3 (2 of 3 officials must sign before it executes on-chain).
2. **Claim** — the student installs the app, generates an on-device secp256k1 keypair (private key never leaves the device), and submits the public key. The backend ECIES-wraps the DEK to that public key and pins the wrapped envelope.
3. **Daily access** — the student's device fetches the ciphertext + wrapped-DEK envelope from IPFS, unwraps the DEK on-device, decrypts the credential, and can generate a selective-disclosure ZK proof (server-side proof generation, but only after on-device decryption supplies the witness input).
4. **Verification** — a verifier issues a one-time nonce; the student's proof embeds it; the verifier checks proof validity off-chain, on-chain revocation status, and nonce freshness/single-use.
5. **Recovery (E6)** — if a student loses their device, or a credential needs modification, 2 of the 3 custodians submit their Shamir shares to reconstruct the DEK in memory just long enough to re-wrap it to a new device key (device-loss) or re-encrypt updated attributes (credential modification, re-anchored through the Safe). The DEK is wiped immediately after use and never persisted or logged.

Erasure / crypto-shredding (destroying ≥2 Shamir shares for irreversible unrecoverability) was scoped for this milestone but explicitly descoped — see `.planning/MILESTONES.md`. It does not represent a security gap: a revoked credential is already independently blocked by the on-chain `revoked` flag.

## Quick start (local dev)

Each service has its own `.env` — check `.env.example` (or ask a maintainer) for required keys (Mongo URI, Pinata JWT, Sepolia RPC URL, Safe address/owner keys, custodian PEM paths).

```bash
# 1. Blockchain — local Hardhat node (or point everything at Sepolia instead)
cd zk-proofs && npx hardhat node

# 2. Deploy contracts (separate terminal, only needed against a fresh local node)
cd zk-proofs && npx hardhat run scripts/deploy.js --network localhost

# 3. ZKP backend — proof generation + verification
cd zkp-backend && npm install && npm run dev   # port 3001

# 4. Admin backend — student CRUD, governance, custody, recovery
cd privdId_admin/backend && npm install && npm run dev   # port 5000

# 5. Admin web portal
cd privdId_admin/frontend && npm install && npm run dev   # vite, port 5173

# 6. Mobile app (Expo)
cd digital-app && npm install && npx expo start
```

Project currently runs live against **Sepolia testnet** for the contracts (`CredentialRegistry`, `IdentityVerifier`, the Gnosis Safe) rather than a local Hardhat node — see `.env` files for the deployed addresses and RPC URL. Real performance/gas numbers from a live walkthrough are recorded in `docs/improvement/PERFORMANCE_METRICS.md`.

## Where to look next

- **`.planning/STATE.md`** — current milestone status, accumulated decisions, blockers (the live source of truth — read this before `docs/current/`, which is stale pre-rebuild research).
- **`.planning/ROADMAP.md`** — phase-by-phase breakdown of what shipped.
- **`.planning/REQUIREMENTS.md`** — per-requirement status (shipped / descoped).
- **`docs/CLAUDE_CODE_BLUEPRINT.md`** — the implementation spec for the enhanced architecture (E1, E2, E3, E5, E6).
- **`docs/improvement/PERFORMANCE_METRICS.md`** — measured timings, gas costs, and storage sizes, including real numbers pulled from live dev-server logs.
