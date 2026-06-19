# Roadmap: PrivdID — v2.0 E3 Encrypted Holder-Controlled Storage

## Overview

This milestone adds E3 on top of the frozen E1+E2 circuit: credentials are no longer pinned to IPFS in plaintext. The admin backend generates a random DEK per student, AES-256-GCM encrypts the full credential JSON, and pins only ciphertext. A secp256k1 keypair is generated on-device at first login and never leaves the device. A two-phase enrollment ties these together: the admin enrolls and holds the DEK in escrow, then on first login the student's app submits its public key and the backend ECIES-wraps the DEK to it, pins the wrapped envelope, and wipes the plaintext DEK from memory — at which point only the student can ever unwrap it again. Daily proof generation becomes a fetch-unwrap-decrypt-send flow: the app pulls both CIDs, unwraps the DEK with the on-device private key, decrypts the credential locally, and forwards only the decrypted attributes to the existing (unmodified) ZKP backend over HTTPS — the DEK and private key never leave the device. Finally, crypto-shredding gives a real right-to-erasure story: destroying the DEK (or its envelope) makes the ciphertext permanently unrecoverable, with no separate plaintext copy anywhere to fall back on. E5 (Gnosis Safe governance) and E6 (real Shamir custody) remain deferred; the DEK during the enrollment window is held in backend memory as a documented interim gap.

## Target End-to-End UX (north star for Phases 7-9)

This is the complete student-facing workflow E3 is building toward. Phase 7 delivers the first screen below; Phases 8 and 9 must deliver the rest. Any phase planning for 8/9 should treat this as the UI/UX source of truth, not just the backend success criteria in the Phase Details below.

**1. First login / setup (Phase 7 — in progress):** Student logs in with institute-issued username/password → sees "Welcome {name}, your credential account has been created" → taps "Setup Secure Credential Access" → app generates the on-device keypair and claims the credential. All DEK-generation/encryption/IPFS-pin/wrap internals stay hidden from the student.

**2. Dashboard (Phase 8 — not yet planned):** Lands on a simple 3-button dashboard: credential status, institution, issued-credentials count, and exactly three actions — **View Credentials**, **Generate Proof**, **Verify Proof**. No more buttons than that.

**3. View Credentials (Phase 8):** Shows the decrypted credential (name, roll no, program, status, "Blockchain Status: Verified"). Internally: fetch CID(s) → download ciphertext from IPFS → unwrap DEK with on-device private key → decrypt → display. All hidden.

**4. Generate Proof (Phase 8 — the most important E3 UI feature):** Student checks which attributes to prove (Name / Enrollment Status / Degree Program / Graduation Year / Full Credential — selective disclosure), enters a verifier-supplied challenge nonce, taps Generate. Internally: decrypt credential → generate ZKP including the nonce. Result shown: a **Proof ID** (e.g. `P-123456`) and a **Verification URL** (`https://privdid/verify/P-123456`), with Copy Link / Download Proof actions.

**5. Verify Proof (net-new scope, not yet owned by any phase):** Anyone can paste a Proof ID or verification URL and get a result: proof valid/invalid, issuer, attribute proven, boolean result, timestamp, on-chain verified status; invalid case shows a reason (e.g. "Nonce Mismatch"). Internally: fetch the stored proof by ID → re-verify the ZKP → check blockchain record → check revocation status.

**Key architectural requirement this implies:** verifying *by Proof ID* must be a durable, repeatable lookup — not the existing single-use `/session/nonce` + `/verify` anti-replay pair, whose nonce is consumed at proof-*generation* time. There must be a persistent Proof-ID/result store (new) that can be re-queried indefinitely without re-consuming anything. This affects both Phase 8 (issuing the Proof ID) and Phase 9 (the revocation-status check on verify).

## Phases

**Phase Numbering:**
- Integer phases (6, 7, 8, 9): Planned milestone work, continuing from v1.0's Phase 5
- Decimal phases (6.1, 6.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 6: Encryption & Ciphertext Storage** - Admin backend encrypts every credential with a per-student AES-256-GCM DEK and pins only ciphertext to IPFS — no plaintext blob exists post-encryption (completed 2026-06-19)
- [ ] **Phase 7: Student Keypair & Two-Phase Enrollment** - Students get an on-device secp256k1 keypair at first login, and claiming a credential ECIES-wraps the escrowed DEK to that keypair, ending single-custody of the DEK
- [ ] **Phase 8: Daily Access Flow** - An active student's app fetches both CIDs, unwraps the DEK on-device, decrypts the credential locally, and generates a proof via the existing ZKP backend without the DEK or private key ever leaving the device
- [ ] **Phase 9: Crypto-Shredding Erasure** - Destroying a student's DEK/envelope makes their ciphertext permanently unreadable, satisfying the GDPR/DPDPA right-to-erasure story

## Phase Details

### Phase 6: Encryption & Ciphertext Storage
**Goal**: Every credential issued by the admin backend is AES-256-GCM encrypted under a random per-student DEK before it ever touches IPFS; plaintext credential blobs are eliminated from the storage layer entirely.
**Depends on**: Nothing (first phase of v2.0; builds on v1.0's frozen issuance commitment)
**Requirements**: STORE-01, STORE-02
**Success Criteria** (what must be TRUE):
  1. Issuing a credential generates a random 32-byte DEK, AES-256-GCM-encrypts the §E3.2 credential JSON (7 attrs + 7 salts + merkleRoot + issuedAt/issuer/type/version), and pins the resulting ciphertext to IPFS, returning a `ciphertextCID`.
  2. Inspecting any newly-pinned IPFS object for a freshly issued student shows only ciphertext bytes — the plaintext credential JSON is never pinned, logged to a persistent store, or otherwise retrievable from IPFS.
  3. Re-running issuance for two different students yields two different DEKs and two different ciphertexts, even if their underlying credential attributes were identical (confirms DEK randomness, not deterministic encryption).
**Plans**: 3 plans
- [x] 06-01-PLAN.md — AES-256-GCM crypto module (crypto/aesgcm.js) + Student schema (dek field, ipfsCID→ciphertextCID rename) [Wave 1]
- [x] 06-02-PLAN.md — Encrypt-before-pin in issuance: buildCredentialJson + DEK generate/reuse across 3 call sites + sanitizeStudent dek exclusion [Wave 2]
- [x] 06-03-PLAN.md — ipfsCID→ciphertextCID rename in zkp-backend/server.js + digital-app/VerifyProof.js [Wave 1]

### Phase 7: Student Keypair & Two-Phase Enrollment
**Goal**: Each student controls a private secp256k1 key that never leaves their device, and the act of claiming a credential transfers DEK custody from the admin backend (single-custody escrow) to that keypair via ECIES wrapping — closing the window during which anyone but the student can read the plaintext DEK.
**Depends on**: Phase 6
**Requirements**: KEY-01, KEY-02, ENROLL-01, ENROLL-02
**Success Criteria** (what must be TRUE):
  1. On first login, the app generates a secp256k1 keypair on-device, stores the private key in `expo-secure-store` (Keystore/Keychain-backed), and never transmits, logs, or exports it off-device.
  2. The app sends only the derived public key to the backend via `POST /students/:id/pubkey`; the backend never receives or stores a private key for any student.
  3. A newly enrolled student's record shows `enrollmentPhase: "awaiting-keypair"` immediately after admin enrollment, with the DEK held server-side and the ciphertext already pinned from Phase 6.
  4. Completing `ClaimCredentialScreen` on first login causes the backend to ECIES-wrap the held DEK with the submitted pubkey, pin the wrapped envelope to IPFS as `dekEnvelopeCID`, wipe the plaintext DEK from backend memory, and flip the record to `enrollmentPhase: "active"`.
  5. After claiming, no plaintext DEK for that student exists anywhere in the backend process or persistent storage — only the wrapped envelope (decryptable solely by the student's private key) remains.
**Plans**: 4 plans
- [x] 07-01-PLAN.md — Backend crypto/schema foundation: crypto/ecies.js (wrapDEK/unwrapDEK) + Student pubKey/dekEnvelopeCID/enrollmentPhase fields + awaiting-keypair default (ENROLL-01) [Wave 1]
- [x] 07-02-PLAN.md — Claim endpoint: POST /students/:id/pubkey wraps the held DEK, pins dekEnvelopeCID, wipes the plaintext dek, flips to active (ENROLL-02, KEY-02 backend) [Wave 2]
- [~] 07-03-PLAN.md — Mobile crypto foundation: RNG polyfill + deps install + on-device smoke test + utils/keypair.js keygen/storage (KEY-01) [Wave 1] — code complete; on-device RNG human-check still pending (no device/emulator in execution environment)
- [ ] 07-04-PLAN.md — ClaimCredentialScreen + nav registration + LoginScreen D-01 auto-redirect (KEY-02 client) [Wave 2]

### Phase 8: Daily Access Flow
**Goal**: An actively-enrolled student can generate a fresh ZK proof on demand by having their app transparently fetch, unwrap, and decrypt their own credential on-device, with the existing ZKP backend untouched and the DEK/private key never crossing the device boundary.
**Depends on**: Phase 7
**Requirements**: ACCESS-01, ACCESS-02
**Success Criteria** (what must be TRUE):
  1. `GET /credential/:rollNo/blobs` returns both `ciphertextCID` and `dekEnvelopeCID` for any student whose `enrollmentPhase` is `"active"`.
  2. The app fetches both blobs, ECIES-unwraps the DEK using the on-device private key, and AES-GCM-decrypts the credential JSON locally — all without any network call exposing the DEK or private key.
  3. The app sends only the decrypted `{attrs, salts, nonce, currentDateInt}` to the existing ZKP backend over HTTPS, and a valid Groth16 proof is returned and verifies successfully (off-chain and on-chain), confirming the new storage layer is fully compatible with the v1.0 circuit/backend.
  4. A student whose `enrollmentPhase` is still `"awaiting-keypair"` cannot complete this flow (no envelope exists yet to unwrap), demonstrating the two-phase gate from Phase 7 is enforced end-to-end.
**Plans**: 5 plans
- [x] 08-01-PLAN.md — Backend: GET /credential/:rollNo/blobs endpoint (ACCESS-01) + nonce TTL 5→15min (D-08) [Wave 1]
- [x] 08-02-PLAN.md — Mobile crypto utils: on-device unwrapDEK (eciesjs) + decryptCredentialBlob (@noble/ciphers) [Wave 1]
- [ ] 08-03-PLAN.md — Dashboard (3-button hub) + View Credentials (decrypt + live Blockchain Status, D-05) [Wave 2]
- [ ] 08-04-PLAN.md — Generate Proof: selective-disclosure checklist + nonce + /generate-proof + result QR (D-06/07/10) [Wave 2]
- [ ] 08-05-PLAN.md — Verify Proof two-hop QR (D-09) + App.js wiring/legacy deletion (D-04) + device checkpoint [Wave 3]

**UI scope still missing from the success criteria above** — see "Target End-to-End UX" section: Dashboard (3 buttons), View Credentials screen, Generate Proof screen (attribute checkboxes + nonce entry + Proof ID/Verification URL result). Must be added during `/gsd:plan-phase` for this phase, not assumed.

### Phase 9: Crypto-Shredding Erasure
**Goal**: A custodian can permanently and verifiably revoke a student's ability to ever decrypt their stored credential again by destroying the DEK material, giving the system a real technical right-to-erasure mechanism rather than a policy promise.
**Depends on**: Phase 7 (requires the envelope/DEK custody model to exist)
**Requirements**: ERASE-01
**Success Criteria** (what must be TRUE):
  1. Triggering erasure for a student destroys the only path to recovering their DEK (the envelope and/or any escrowed copy), with no backup plaintext DEK retained anywhere in the system.
  2. After erasure, attempting the Phase 8 daily-access flow for that student fails to recover a usable DEK — the ciphertext on IPFS remains physically present but is permanently unreadable.
  3. The erasure action is auditable (recorded against the student record, e.g. a revoked/erased status or timestamp) so it is distinguishable from a transient fetch failure.

**Net-new scope likely belongs here** — see "Target End-to-End UX": the **Verify Proof** screen's "check revocation status" step needs this phase's erasure/revocation state to be queryable by the verify-by-Proof-ID lookup (Phase 8). Confirm during planning whether the persistent Proof-ID store itself is built here or in Phase 8.
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 6 → 7 → 8 → 9

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 6. Encryption & Ciphertext Storage | 3/3 | Complete   | 2026-06-19 |
| 7. Student Keypair & Two-Phase Enrollment | 3/4 | In Progress|  |
| 8. Daily Access Flow | 2/5 | In Progress|  |
| 9. Crypto-Shredding Erasure | 0/TBD | Not started | - |
