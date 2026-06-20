# PrivdID — Enhancement Plan (E1–E6)

## What This Is

PrivdID is a privacy-preserving student identity verification system for IIITDM Jabalpur, built on ZK-SNARKs, IPFS, and Ethereum. v1.0 rebuilt the cryptographic core (E1 depth-3 Merkle tree of salted commitments + E2 verifier-nonce replay protection, deployed and benchmarked). v2.0 shipped E3: credentials are AES-256-GCM encrypted with the DEK ECIES-wrapped to an on-device student keypair, so only the student can decrypt their own credential for proof generation. **This milestone (v3.0) adds E5 + E6**: 2-of-3 threshold control by the same three officials (AcadAdmin, Asst. Registrar, Dean) — a Gnosis Safe gates on-chain writes (E5), and Shamir 2-of-3 shares gate access to the encrypted DEK, enabling key recovery and real crypto-shredding erasure (E6, incl. E6-04).

## Core Value

A student's credential is never stored in plaintext anywhere off-device. Only the student (via their on-device secp256k1 key) can decrypt their own data to generate a proof; admin/custodians can pin/manage ciphertext but cannot read it. If everything else fails, this encrypt → wrap → claim → decrypt loop must work end-to-end without ever leaking the DEK or private key off-device.

## Current Milestone: v3.0 — Governance & Custody (E5 + E6)

**Goal:** Replace the single-EOA admin and single-custody DEK with 2-of-3 threshold control by the same three officials — a Gnosis Safe gates on-chain writes (E5); Shamir 2-of-3 shares gate access to the encrypted DEK, enabling key recovery and crypto-shredding erasure (E6).

**Target features:**
- E5: `CredentialRegistry` 2-step admin transfer → ownership held by a Gnosis Safe 2-of-3
- E5: backend `safeService.js` wrapping propose → sign → execute for issue/revoke
- E6: Shamir 2-of-3 split of the 32-byte DEK; 3 separated custodian stores
- E6: recovery flow — `/recovery/initiate` + `/recovery/submit-share` → reconstruct on 2 shares → re-wrap to new keypair → wipe
- E6-04: crypto-shredding erasure — destroy ≥2 shares ⇒ DEK unreconstructable (real GDPR/DPDPA erasure)

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

<!-- Shipped in v2.0 E3 (completed 2026-06-20). -->

- ✓ AES-256-GCM credential encryption: random 32-byte per-student DEK, only ciphertext pinned (`ciphertextCID`) — v2.0 (STORE-01/02)
- ✓ ECIES DEK wrapping (`eciesjs`) to an on-device secp256k1 keypair → `dekEnvelopeCID` — v2.0
- ✓ On-device secp256k1 student keypair, private key in `expo-secure-store`, never exported; public key sent to backend — v2.0 (KEY-01/02)
- ✓ Two-phase enrollment (admin holds DEK → student claims → backend wraps + wipes, `enrollmentPhase` active) — v2.0 (ENROLL-01/02)
- ✓ Daily access: fetch both CIDs, unwrap + decrypt on-device, send only `{attrs, salts, nonce, currentDateInt}` to ZKP backend — v2.0 (ACCESS-01/02)

### Active

<!-- v3.0 milestone: E5 Gnosis Safe governance + E6 Shamir custody/recovery/erasure. Requirements defined in REQUIREMENTS.md. -->

- [ ] E5: `CredentialRegistry` 2-step admin transfer (`transferAdmin`/`acceptAdmin`); ownership moved to a Gnosis Safe 2-of-3 (AcadAdmin, Asst. Registrar, Dean)
- [ ] E5: backend `services/safeService.js` wraps propose → sign → execute (`@safe-global/protocol-kit` + `api-kit`) for `issueCredential`/`revoke`
- [ ] E6: `crypto/shamir.js` — `splitDEK(dek) → [A,B,C]`, `reconstructDEK([s1,s2]) → dek` (2-of-3 over the 32-byte DEK)
- [ ] E6: 3 separated custodian stores so no single party holds ≥2 shares (Share A admin DB; B/C in stores admin can't read)
- [ ] E6: recovery flow — `POST /recovery/initiate` + `POST /recovery/submit-share`; reconstruct in-memory on 2 authenticated shares, re-wrap/modify, then wipe
- [ ] E6-04: crypto-shredding erasure — destroy ≥2 of 3 shares ⇒ DEK permanently unreconstructable (the GDPR/DPDPA erasure E3 couldn't deliver)

### Out of Scope

- E4 post-quantum — explicitly out of scope for the entire project
- UI redesign / theme token system (§9) — deferred
- Auth/bcrypt/session-JWT/rate-limit hardening (§12.3–5) — deferred, EXCEPT the custodian/recovery-submission auth E6 requires (in scope this milestone)
- Data migration of existing test students' plaintext-pinned credentials — wipe and re-seed instead, consistent with v1.0/v2.0's approach

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
| v2.0 = E3 only; E5/E6/UI deferred | E3 (storage privacy) is the most isolated remaining enhancement — no Gnosis Safe/Shamir infra needed to deliver value | ✓ Good — shipped v2.0 |
| DEK held in backend memory (not real Shamir) during awaiting-keypair | E6 was deferred; a real 2-of-3 split needs E6's custodian infra | ⚠️ Interim gap — closed by E6-03 this milestone (v3.0) |
| Proof generation stays server-side | On-device Groth16 in Expo is heavy; DEK/private key still never leave device | ✓ Good |
| Milestone versioned v2.0, not v1.1 | First milestone after v1.0 circuit rebuild; E3 is a new architecture layer, not a patch | ✓ Good |
| v3.0 bundles E5 + E6 (not split into two milestones) | Same 3 officials, complementary mechanisms; shipping governance without recovering the custody gap (E6-03) leaves v2.0's interim single-custody open. E5/E6 are also the last in-scope enhancements (E4 out). | — Pending |
| v3.0 versioned major (not v2.1) | E5 (multisig governance) + E6 (threshold custody) add new architecture layers, not a patch on E3 storage | — Pending |
| Phase 9 (crypto-shredding) removed from v2.0; erasure folded into E6 as E6-04 (2026-06-21) | Reliable erasure needs a destroyable custodial key; post-claim the institution no longer holds the DEK, so in the E3 model erasure is best-effort only (unpin ≠ IPFS delete, student device copy out of reach). E6's Shamir 2-of-3 makes "destroy ≥2 shares → DEK unreconstructable" a clean, auditable erasure. Proof-level revocation already exists (on-chain `revoked` flag), so no runtime-security gap is left open. | ✅ v2.0 closes at Phase 8; ERASE-01 → E6-04 |

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
*Last updated: 2026-06-21 — v2.0 (E3) shipped & archived; milestone v3.0 (E5+E6) started*
