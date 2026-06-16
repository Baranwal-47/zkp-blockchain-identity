# Requirements: PrivdID — Circuit Rebuild (E1 + E2)

**Defined:** 2026-06-16
**Core Value:** A verifier can cryptographically confirm a student's selectively-disclosed identity attributes and predicates against an on-chain Merkle-root commitment, with replay-proof freshness.

## v1 Requirements

Scope = the circuit critical path (blueprint Phase 0 + Phase 1, plus the §1.4 field-set fix and §12.1 branding cleanup). Each maps to roadmap phases.

### Spec & Consistency

- [ ] **SPEC-01**: The 7-attribute identity spec is frozen and documented — fixed leaf order (name, rollNo, dob-int, programmeLevel, discipline, batch-int, email), per-attribute types/encodings, and the final public-signal layout
- [ ] **SPEC-02**: Admin issuance hash uses the byte-for-byte identical attribute list, order, and encoding as the prover (resolves the §1.4 branch/programme mismatch)
- [ ] **SPEC-03**: The credential issuer string reads "PrivdID — IIITDM Jabalpur" (VIT references removed from issuance output)

### Circuit (E1)

- [ ] **CIRC-01**: The circuit computes `leaf_i = Poseidon(2)(attr_i, salt_i)` for 7 attributes plus a zero-padding leaf, and outputs the depth-3 Merkle root as `pubHash`
- [ ] **CIRC-02**: Every committed attribute carries a mandatory random salt so low-entropy attributes (dob, level, discipline, batch) are not brute-forceable when hidden
- [ ] **CIRC-03**: Selective disclosure is bound in-circuit — each `revealMask_i` is boolean, `revealMask_i * (revealedValue_i - attr_i) === 0`, and hidden attributes never appear in the public signals
- [ ] **CIRC-04**: The circuit computes `isOver18` from `currentDateInt` vs `dobInt`, with `dobInt` bound to leaf attribute 2
- [ ] **CIRC-05**: The circuit computes `isPostgrad` as set-membership of `programmeLevel` over {M.Tech, M.Des, PhD}

### Replay Protection (E2)

- [ ] **REPL-01**: `nonce` is a public input forced into the constraint system (e.g. `nonceSq <== nonce * nonce`) so the compiler cannot optimize it away
- [ ] **REPL-02**: A proof generated for nonce A is rejected when verified against nonce B
- [ ] **REPL-03**: The backend issues nonces via `POST /session/nonce` (random field element < BN128 order, sessionId, 5-min TTL) and at verify-time enforces nonce match AND freshness AND one-time use (marks consumed)

### Trusted Setup & Redeploy

- [ ] **SETUP-01**: A fresh Groth16 Phase-2 setup is performed via a 3-contribution chain + final beacon; `zkey verify` passes and the constraint count is recorded
- [ ] **SETUP-02**: `verification_key.json` and `IdentityVerifier.sol` are exported and the verifier is redeployed (Sepolia + local), with `VERIFIER_ADDRESS` updated in env
- [ ] **SETUP-03**: Fresh `identity.wasm`, `identity_final.zkey`, and `verification_key.json` are copied into the ZKP backend and used by proof generation

### ZKP Backend Integration

- [ ] **BACK-01**: `POST /generate-proof` accepts the new input shape (attrs, salts, reveal flags, nonce, currentDateInt) and returns `{proof, publicSignals}` in the frozen §3 order
- [ ] **BACK-02**: `POST /verify` (off-chain `groth16.verify`) and `POST /verify-onchain` (verifier view call) both return true for a freshly generated proof
- [ ] **BACK-03**: `POST /credential-info` treats `pubHash` as the Merkle root (decimal → bytes32 conversion unchanged) and resolves the credential from the registry

### Performance (research deliverable)

- [ ] **PERF-01**: Every new crypto operation prints elapsed seconds, and a benchmark script reports mean ± σ over n≥19 runs
- [ ] **PERF-02**: Constraint count, proof-gen time, off-chain/on-chain verify time, nonce issue+check time, and QR payload size are recorded in PERFORMANCE_METRICS.md

## v2 Requirements

Deferred to later milestones (tracked, not in this roadmap).

### Storage (E3)

- **E3-01**: AES-256-GCM encrypted credential blob + ECIES-wrapped DEK envelope pinned to IPFS (no plaintext PII)
- **E3-02**: On-device secp256k1 keypair in expo-secure-store; two-phase enrollment (ClaimCredentialScreen)

### Governance (E5)

- **E5-01**: Gnosis Safe 2-of-3 becomes the CredentialRegistry admin; `transferAdmin`/`acceptAdmin` added
- **E5-02**: Sensitive on-chain writes (issue/revoke/update) flow through the Safe

### Key Recovery (E6)

- **E6-01**: Shamir 2-of-3 split/reconstruct over the DEK; custodian share distribution
- **E6-02**: Recovery flows (record modification, lost-key re-wrap)

### UI & Hardening

- **UI-01**: Central theme token system; refactor all screens off hardcoded hex; light institutional palette
- **HARD-01**: Auth middleware on student CRUD, bcrypt passwords, session JWT, rate limiting

## Out of Scope

| Feature | Reason |
|---------|--------|
| E4 post-quantum | Explicitly excluded from the entire project |
| Data migration of old flat-Poseidon(5) credentials | Prototype: wipe and re-seed test students instead of writing a migration |
| On-device Groth16 proving | Too heavy for Expo; proof gen stays server-side (DEK/private key still never leave device) |
| E3/E5/E6/UI/hardening (full) | Deferred to later milestones — keeps the circuit critical path unblocked |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SPEC-01 | Phase 1 | Pending |
| SPEC-02 | Phase 1 | Pending |
| SPEC-03 | Phase 1 | Pending |
| CIRC-01 | Phase 2 | Pending |
| CIRC-02 | Phase 2 | Pending |
| CIRC-03 | Phase 2 | Pending |
| CIRC-04 | Phase 2 | Pending |
| CIRC-05 | Phase 2 | Pending |
| REPL-01 | Phase 2 | Pending |
| REPL-02 | Phase 2 | Pending |
| REPL-03 | Phase 4 | Pending |
| SETUP-01 | Phase 3 | Pending |
| SETUP-02 | Phase 3 | Pending |
| SETUP-03 | Phase 3 | Pending |
| BACK-01 | Phase 4 | Pending |
| BACK-02 | Phase 4 | Pending |
| BACK-03 | Phase 4 | Pending |
| PERF-01 | Phase 5 | Pending |
| PERF-02 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 19 total
- Mapped to phases: 19 ✓
- Unmapped: 0

---
*Requirements defined: 2026-06-16*
*Last updated: 2026-06-16 after roadmap creation (traceability mapped)*
