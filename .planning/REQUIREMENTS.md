# Requirements — Milestone v3.0: Governance & Custody (E5 + E6)

Scope: 2-of-3 threshold control by the same three officials (AcadAdmin, Asst. Registrar, Dean). E5 — a Gnosis Safe gates on-chain registry writes. E6 — Shamir 2-of-3 shares gate access to the encrypted DEK, enabling key recovery, credential modification, and crypto-shredding erasure (E6-04). Closes v2.0's documented single-custody interim gap (E6-03).

Spec source: `docs/CLAUDE_CODE_BLUEPRINT.md` §E5, §E6, §16.2. Same 7-attribute frozen leaf set and server-side proof generation as v1.0/v2.0 — unchanged.

## v3.0 Requirements

### E5 — Multisig Governance (GOV)

- [x] **GOV-01**: `CredentialRegistry` gains a 2-step admin transfer (`transferAdmin`/`acceptAdmin`); registry admin is transferred from the deployer EOA to a Gnosis Safe 2-of-3 address
- [x] **GOV-02**: Sensitive registry writes (`issueCredential`, `revoke`) succeed only through a Safe 2-of-3 transaction — one official acting alone cannot mutate registry state
- [x] **GOV-03**: Backend `services/safeService.js` wraps the Safe propose → confirm → execute flow (`@safe-global/protocol-kit` + `api-kit`) and is the path the admin issue/revoke flow uses
- [x] **GOV-04**: A real Safe 2-of-3 (3 official owner addresses, threshold 2) is deployed on Sepolia; local dev exercises the same propose/sign/execute flow with 3 Hardhat keys

### E6 — Threshold Custody (CUST)

- [x] **CUST-01**: `crypto/shamir.js` splits the 32-byte DEK into 3 shares with threshold 2 (`splitDEK(dek) → [A,B,C]`, `reconstructDEK([s1,s2]) → dek`); any single share reveals nothing about the DEK
- [x] **CUST-02**: At issuance the DEK is Shamir-split and the 3 shares are written to 3 **separated stores with independent access credentials** (simulated separation — Share A admin-readable; B and C in stores the admin process cannot read), so the admin alone never holds ≥2 shares
- [x] **CUST-03**: The Shamir 2-of-3 split replaces v2.0's interim single-custody DEK-in-memory gap (E6-03) as the custodial recovery copy of the DEK

### E6 — Key Recovery (REC)

- [x] **REC-01**: `POST /recovery/initiate` opens a recovery request for a student; `POST /recovery/submit-share` accepts authenticated custodian shares and reconstructs the DEK in memory once 2 arrive, wiping it immediately after the operation completes
- [x] **REC-02**: Device-loss recovery re-wraps the reconstructed DEK (ECIES) to the student's **new** on-device public key and re-pins a fresh `dekEnvelopeCID` — daily access works again on the new device
- [x] **REC-03**: Credential-modification recovery uses the reconstructed DEK to decrypt, lets an official re-encrypt updated attributes, and re-pins ciphertext (re-issue) via the Phase 9 Safe 2-of-3 path — preserving the frozen 7-attribute field-set/encoding so proofs still verify
- [x] **REC-04**: Custodian share submissions are authenticated (custodian login / signed payload); an unauthenticated request cannot contribute a share

### E6-04 — Crypto-Shredding Erasure (ERASE) — DESCOPED 2026-06-23

- [~] **ERASE-01**: A governed erasure operation destroys ≥2 of the 3 shares so the DEK becomes permanently unreconstructable; a subsequent recovery attempt with the remaining material fails — **descoped, not built**: deferred mid-session by the user (time-constrained before a demo); no `erasureService.js`/controller/routes exist
- [~] **ERASE-02**: Erasure also best-effort unpins the ciphertext + envelope and flags the record erased; documents that proof rejection already comes from the on-chain `revoked` flag (no runtime-security gap added) — **descoped, not built**, same reason as ERASE-01. The existing `revoked` flag already independently blocks proof verification, so descoping leaves no security gap, only a storage-layer cleanup gap.

## Future Requirements (deferred beyond v3.0)

- **HARD-01**: General auth hardening on student CRUD (bcrypt passwords, session JWT, rate limiting) — distinct from the custodian/recovery-submission auth REC-04 delivers this milestone

## Out of Scope

- E4 post-quantum — explicitly out of scope for the entire project
- UI redesign / theme token system (§9) — deferred
- General auth/bcrypt/session-JWT/rate-limit hardening (§12.3–5) — deferred (HARD-01), except the custodian/recovery auth in REC-04
- Real independent third-party custodians / 3 separate cloud accounts — using simulated separation this milestone (honest 2-of-3 + erasure demo without external custodian ops)
- Data migration of existing test students — wipe and re-seed under the new split-at-issuance flow, consistent with v1.0/v2.0

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| GOV-01 | 9 | Complete |
| GOV-02 | 9 | Complete |
| GOV-03 | 9 | Complete |
| GOV-04 | 9 | Complete |
| CUST-01 | 10 | Complete |
| CUST-02 | 10 | Complete |
| CUST-03 | 10 | Complete |
| REC-01 | 11 | Complete |
| REC-02 | 11 | Complete |
| REC-03 | 11 | Complete |
| REC-04 | 11 | Complete |
| ERASE-01 | 11 | Descoped (not built) |
| ERASE-02 | 11 | Descoped (not built) |

Coverage: 13 v3.0 requirements (E5 ×4, E6 custody ×3, E6 recovery ×4, E6-04 erasure ×2) — 11/13 shipped, 2/13 (erasure) explicitly descoped 2026-06-23 across Phases 9-11 (Phase 9: E5 governance; Phase 10: E6 custody split; Phase 11: E6 recovery, erasure descoped).
