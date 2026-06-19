# PrivdID — Enhancement Plan (E1–E6)

## What This Is

PrivdID is a privacy-preserving student identity verification system for IIITDM Jabalpur, built on ZK-SNARKs, IPFS, and Ethereum. The v1.0 milestone rebuilt the cryptographic core: the current circuit is an E1 depth-3 Merkle tree of per-attribute salted commitments with E2 verifier-nonce replay protection, deployed and benchmarked end-to-end. **This milestone (v2.0) adds E3**: encrypted, holder-controlled IPFS storage — credentials are AES-256-GCM encrypted, the DEK is ECIES-wrapped to an on-device student keypair, and the student becomes the sole party who can decrypt their own credential for daily proof generation.

## Core Value

A student's credential is never stored in plaintext anywhere off-device. Only the student (via their on-device secp256k1 key) can decrypt their own data to generate a proof; admin/custodians can pin/manage ciphertext but cannot read it. If everything else fails, this encrypt → wrap → claim → decrypt loop must work end-to-end without ever leaking the DEK or private key off-device.

## Current Milestone: v2.0 E3 — Encrypted Holder-Controlled Storage

**Goal:** Credentials on IPFS are AES-256-GCM encrypted with the DEK ECIES-wrapped to an on-device student keypair, so only the student can decrypt their own data.

**Target features:**
- AES-256-GCM credential encryption + ECIES DEK wrapping
- On-device secp256k1 student keypair (SecureStore)
- Two-phase enrollment (admin holds DEK → student claims → backend wraps + wipes)
- Normal daily access flow (unwrap → decrypt → server-side proof gen)
- Crypto-shredding erasure

## Requirements

### Validated

<!-- Shipped in v1.0 (completed 2026-06-18). -->

- ✓ Mobile app: student login, server-side proof generation, QR share, 3-phase verify, embedded admin screens
- ✓ Admin backend (Express 5 + MongoDB, ESM): student CRUD, Poseidon hash, Pinata pin, on-chain issuance/revocation writes
- ✓ ZKP backend (snarkjs + ethers v6): `/generate-proof`, `/verify`, `/verify-onchain`, `/credential-info`
- ✓ Smart contracts: `CredentialRegistry.sol` (admin-gated issue/revoke/lookup) + `IdentityVerifier.sol`, deployed to Sepolia + local
- ✓ ZK toolchain: Circom 2.1.6 — E1 depth-3 Merkle circuit (salted leaves, selective disclosure, isOver18/isPostgrad predicates) + E2 verifier-nonce binding, frozen and trusted-setup complete
- ✓ ZKP backend: new 19-signal proof shape; nonce lifecycle (issue → match → 5-min freshness → one-time use)
- ✓ Benchmarked: constraint count, proof-gen, off-/on-chain verify, nonce ops, QR payload size (mean ± σ, n≥19) — `docs/improvement/PERFORMANCE_METRICS_E1E2.md`

### Active

<!-- v2.0 milestone: E3 encrypted holder-controlled IPFS storage. -->

- [ ] AES-256-GCM credential encryption: admin backend generates a random 32-byte DEK, encrypts the credential JSON (7 attrs + 7 salts + merkleRoot + metadata), pins ciphertext → `ciphertextCID`
- [ ] ECIES DEK wrapping (`eciesjs`) to an on-device secp256k1 student keypair → `dekEnvelopeCID`; only the student's private key can unwrap it
- [ ] Student keypair generated on-device at first login, private key in `expo-secure-store`, never exported; public key sent to backend
- [ ] Two-phase enrollment: admin enrolls + holds DEK (`enrollmentPhase: awaiting-keypair`) → student claims via `ClaimCredentialScreen` on first login → backend wraps DEK with student pubkey, wipes plaintext DEK, sets `enrollmentPhase: active`
- [ ] Normal daily access: app fetches both CIDs, ECIES-unwraps DEK on-device, AES-GCM decrypts, sends plaintext `{attrs, salts, nonce, currentDateInt}` to ZKP backend over HTTPS for proof gen — DEK and private key never leave the device
- [ ] Crypto-shredding erasure: destroying the DEK makes the ciphertext permanently unreadable (GDPR/DPDPA right-to-erasure story)
- [ ] Backend additions: `crypto/aesgcm.js`, `crypto/ecies.js`, `credentialService.js` pins ciphertext + envelope instead of plaintext; `POST /students/:id/pubkey`, `GET /credential/:rollNo/blobs`
- [ ] MongoDB schema: `ciphertextCID`, `dekEnvelopeCID`, `enrollmentPhase` fields added to student record

### Out of Scope

- E5 Gnosis Safe 2-of-3 governance + registry admin transfer — deferred
- E6 Shamir 2-of-3 key recovery — deferred. Consequence: the DEK held in memory during `awaiting-keypair` has no real 2-of-3 custodial split this milestone — single-custody in admin backend memory until the student claims, accepted as a deliberate interim gap until E6 ships
- E4 post-quantum — explicitly out of scope for the entire project
- UI redesign / theme token system (§9) — deferred
- Auth/bcrypt/session-JWT/rate-limit hardening (§12.3–5) — deferred
- Data migration of existing test students' plaintext-pinned credentials — wipe and re-seed instead, consistent with v1.0's approach

## Context

- **Single source of truth:** `docs/CLAUDE_CODE_BLUEPRINT.md` (the full engineering plan). This milestone implements §E3 (E3.1–E3.6).
- **Codebase map:** `.planning/codebase/` (STACK, ARCHITECTURE, STRUCTURE, INTEGRATIONS, CONVENTIONS, TESTING, CONCERNS) — predates E3, will need an `update` pass after this milestone.
- **Encrypted credential JSON shape (§E3.2):** the plaintext that gets AES-GCM'd must contain all 7 attrs + 7 salts (same order as the frozen §3 leaf indices) + merkleRoot + issuedAt/issuer/type/version. Enrollment status is NOT in this object — stays on-chain.
- **Proof generation stays server-side** (decided in v1.0, reaffirmed): on-device Groth16 in Expo is heavy. After on-device decryption, the app sends only the decrypted `{attrs, salts, nonce, currentDateInt}` to the ZKP backend over HTTPS — DEK and private key never leave the device.
- **WSL tooling:** repo is on a `\\wsl.localhost\...` path; run any circom/hardhat/snarkjs from a real WSL shell with relative paths (not relevant to most of E3, which is backend/mobile JS).

## Constraints

- **Tech stack additions**: `eciesjs` (ECIES over secp256k1, Node + RN compatible), Node's built-in `crypto` (AES-256-GCM, `randomBytes`), `expo-secure-store` (Android Keystore / iOS Keychain backed). Do not introduce a different encryption scheme.
- **Crypto correctness**: nothing in the encrypted credential JSON is ever pinned in plaintext; the DEK and student private key never leave the device/backend boundary they're supposed to stay within.
- **No real E6 this milestone**: E3.3 step 4 calls for "Shamir split on the DEK (E6) → distribute shares" while the DEK awaits the student's keypair — since E6 is deferred, hold the DEK in memory/short-lived secure store on the admin backend instead of real Shamir shares (documented gap, see Out of Scope).
- **Timeline**: same hard deadline pressure as v1.0 — favor coarse phases and demonstrable end-to-end acceptance over polish.
- **Network**: Sepolia testnet (and local Hardhat for dev) — unaffected by E3, which is off-chain storage/crypto only.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| This milestone = E3 only; E5/E6/UI remain deferred | E3 (storage privacy) is the most isolated of the remaining enhancements — doesn't require Gnosis Safe or Shamir infra to deliver real value | — Pending |
| DEK held in backend memory (not real Shamir) during awaiting-keypair | E6 is deferred; a real 2-of-3 split needs E6's custodian infra which doesn't exist yet | — Pending |
| Proof generation stays server-side | On-device Groth16 in Expo is heavy; DEK/private key still never leave device | — Pending |
| Milestone versioned v2.0, not v1.1 | First milestone after v1.0 circuit rebuild shipped; E3 introduces a new architecture layer (storage/encryption), not a patch | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-19 — milestone v2.0 (E3) started*
