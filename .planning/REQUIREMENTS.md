# Requirements: PrivdID — Enhancement Plan (E1–E6)

**Defined:** 2026-06-19
**Core Value:** A student's credential is never stored in plaintext anywhere off-device; only the student can decrypt their own data to generate a proof.

## v2.0 Requirements (E3 — Encrypted Holder-Controlled Storage)

Scope = blueprint §E3 (E3.1–E3.6). Each maps to roadmap phases.

### Storage

- [x] **STORE-01**: Admin backend generates a random 32-byte DEK per student, AES-256-GCM encrypts the credential JSON (7 attrs + 7 salts + merkleRoot + metadata, §E3.2 shape), and pins the ciphertext to IPFS as `ciphertextCID`
- [x] **STORE-02**: No plaintext credential blob is ever pinned to IPFS post-encryption — only ciphertext and the DEK envelope are pinned

### Student Keypair

- [x] **KEY-01**: The app generates a secp256k1 keypair on-device at first login; the private key is stored in `expo-secure-store` (Keystore/Keychain-backed) and never exported
- [x] **KEY-02**: The app sends only the public key to the backend via `POST /students/:id/pubkey`

### Two-Phase Enrollment

- [x] **ENROLL-01**: Admin enrollment pins the ciphertext and holds the DEK server-side, marking the student record `enrollmentPhase: "awaiting-keypair"`
- [x] **ENROLL-02**: On first login (`ClaimCredentialScreen`), the backend ECIES-wraps the held DEK with the submitted pubkey, pins the envelope to IPFS as `dekEnvelopeCID`, wipes the plaintext DEK, and sets `enrollmentPhase: "active"`

### Daily Access

- [x] **ACCESS-01**: `GET /credential/:rollNo/blobs` returns both `ciphertextCID` and `dekEnvelopeCID` for an active student
- [x] **ACCESS-02**: The app fetches both blobs, ECIES-unwraps the DEK with the on-device private key, AES-GCM decrypts the credential JSON, and sends only `{attrs, salts, nonce, currentDateInt}` to the existing ZKP backend over HTTPS to generate a proof — the DEK and private key never leave the device

### Erasure

- [ ] **ERASE-01**: Destroying a student's DEK (crypto-shredding) makes their ciphertext on IPFS permanently unreadable, satisfying the GDPR/DPDPA right-to-erasure story

## Deferred Requirements

Tracked, not in this roadmap.

### Governance (E5)

- **E5-01**: Gnosis Safe 2-of-3 becomes the CredentialRegistry admin; `transferAdmin`/`acceptAdmin` added
- **E5-02**: Sensitive on-chain writes (issue/revoke/update) flow through the Safe

### Key Recovery (E6)

- **E6-01**: Shamir 2-of-3 split/reconstruct over the DEK; custodian share distribution
- **E6-02**: Recovery flows (record modification, lost-key re-wrap)
- **E6-03**: Replace this milestone's single-custody DEK-in-memory interim gap (ENROLL-01) with a real 2-of-3 Shamir split once E6 ships

### UI & Hardening

- **UI-01**: Central theme token system; refactor all screens off hardcoded hex; light institutional palette
- **HARD-01**: Auth middleware on student CRUD, bcrypt passwords, session JWT, rate limiting

## Out of Scope

| Feature | Reason |
|---------|--------|
| E4 post-quantum | Explicitly excluded from the entire project |
| Data migration of existing test students' plaintext-pinned credentials | Wipe and re-seed instead, consistent with v1.0's approach |
| E5/E6/UI/hardening (full) | Deferred to later milestones — E3 is isolated enough to ship without them |
| Real Shamir custody of the in-flight DEK during `awaiting-keypair` | Needs E6 infra that doesn't exist yet; accepted interim gap (see E6-03) |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| STORE-01 | Phase 6 | Complete |
| STORE-02 | Phase 6 | Complete |
| KEY-01 | Phase 7 | Complete |
| KEY-02 | Phase 7 | Complete |
| ENROLL-01 | Phase 7 | Complete |
| ENROLL-02 | Phase 7 | Complete |
| ACCESS-01 | Phase 8 | Complete |
| ACCESS-02 | Phase 8 | Complete |
| ERASE-01 | Phase 9 | Pending |

Coverage: 9/9 v2.0 requirements mapped. No orphans.

---
*Requirements defined: 2026-06-19*
*v1.0 requirements history: see git log / `.planning/archive/v1.0-phases/` for the completed E1+E2 circuit-rebuild requirements.*
