# Requirements — Milestone v3.0: Governance & Custody (E5 + E6)

Scope: 2-of-3 threshold control by the same three officials (AcadAdmin, Asst. Registrar, Dean). E5 — a Gnosis Safe gates on-chain registry writes. E6 — Shamir 2-of-3 shares gate access to the encrypted DEK, enabling key recovery, credential modification, and crypto-shredding erasure (E6-04). Closes v2.0's documented single-custody interim gap (E6-03).

Spec source: `docs/CLAUDE_CODE_BLUEPRINT.md` §E5, §E6, §16.2. Same 7-attribute frozen leaf set and server-side proof generation as v1.0/v2.0 — unchanged.

## v3.0 Requirements

### E5 — Multisig Governance (GOV)

- [ ] **GOV-01**: `CredentialRegistry` gains a 2-step admin transfer (`transferAdmin`/`acceptAdmin`); registry admin is transferred from the deployer EOA to a Gnosis Safe 2-of-3 address
- [ ] **GOV-02**: Sensitive registry writes (`issueCredential`, `revoke`) succeed only through a Safe 2-of-3 transaction — one official acting alone cannot mutate registry state
- [ ] **GOV-03**: Backend `services/safeService.js` wraps the Safe propose → confirm → execute flow (`@safe-global/protocol-kit` + `api-kit`) and is the path the admin issue/revoke flow uses
- [ ] **GOV-04**: A real Safe 2-of-3 (3 official owner addresses, threshold 2) is deployed on Sepolia; local dev exercises the same propose/sign/execute flow with 3 Hardhat keys

### E6 — Threshold Custody (CUST)

- [ ] **CUST-01**: `crypto/shamir.js` splits the 32-byte DEK into 3 shares with threshold 2 (`splitDEK(dek) → [A,B,C]`, `reconstructDEK([s1,s2]) → dek`); any single share reveals nothing about the DEK
- [ ] **CUST-02**: At issuance the DEK is Shamir-split and the 3 shares are written to 3 **separated stores with independent access credentials** (simulated separation — Share A admin-readable; B and C in stores the admin process cannot read), so the admin alone never holds ≥2 shares
- [ ] **CUST-03**: The Shamir 2-of-3 split replaces v2.0's interim single-custody DEK-in-memory gap (E6-03) as the custodial recovery copy of the DEK

### E6 — Key Recovery (REC)

- [ ] **REC-01**: `POST /recovery/initiate` opens a recovery request for a student; `POST /recovery/submit-share` accepts authenticated custodian shares and reconstructs the DEK in memory once 2 arrive, wiping it immediately after the operation completes
- [ ] **REC-02**: Device-loss recovery re-wraps the reconstructed DEK (ECIES) to the student's **new** on-device public key and re-pins a fresh `dekEnvelopeCID` — daily access works again on the new device
- [ ] **REC-03**: Credential-modification recovery uses the reconstructed DEK to decrypt, lets an official re-encrypt updated attributes, and re-pins ciphertext (re-issue) — preserving the frozen 7-attribute field-set/encoding so proofs still verify
- [ ] **REC-04**: Custodian share submissions are authenticated (custodian login / signed payload); an unauthenticated request cannot contribute a share

### E6-04 — Crypto-Shredding Erasure (ERASE)

- [ ] **ERASE-01**: A governed erasure operation destroys ≥2 of the 3 shares so the DEK becomes permanently unreconstructable; a subsequent recovery attempt with the remaining material fails
- [ ] **ERASE-02**: Erasure also best-effort unpins the ciphertext + envelope and flags the record erased; documents that proof rejection already comes from the on-chain `revoked` flag (no runtime-security gap added)

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
| GOV-01 | TBD | Not started |
| GOV-02 | TBD | Not started |
| GOV-03 | TBD | Not started |
| GOV-04 | TBD | Not started |
| CUST-01 | TBD | Not started |
| CUST-02 | TBD | Not started |
| CUST-03 | TBD | Not started |
| REC-01 | TBD | Not started |
| REC-02 | TBD | Not started |
| REC-03 | TBD | Not started |
| REC-04 | TBD | Not started |
| ERASE-01 | TBD | Not started |
| ERASE-02 | TBD | Not started |

Coverage: 13 active v3.0 requirements (E5 ×4, E6 custody ×3, E6 recovery ×4, E6-04 erasure ×2). Phase mapping filled by the roadmapper.
