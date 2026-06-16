# Roadmap: PrivdID — Circuit Rebuild (E1 + E2)

## Overview

This milestone rebuilds the cryptographic core of PrivdID along a strict design-once critical path. We first freeze the 7-attribute identity spec on paper and resolve the §1.4 field-set inconsistency between admin issuance and the prover. We then build the E1 (depth-3 Merkle of salted per-attribute leaves, selective disclosure, age/postgrad predicates) and E2 (verifier-nonce binding) circuit together as one frozen artifact. Only once the circuit is final do we run the Groth16 Phase-2 trusted-setup ceremony, export and redeploy the verifier, and copy fresh artifacts into the ZKP backend. We then wire the new proof input/output shape and nonce session enforcement through the backend, and finally instrument and benchmark every new crypto operation as a research deliverable. The endpoint: a verifier can confirm selectively-disclosed attributes and predicates against an on-chain Merkle root, with replay-proof freshness, end to end.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Freeze Spec & Field-Set Consistency** - Lock the 7-attribute spec and make admin issuance byte-for-byte identical to the prover input
- [ ] **Phase 2: E1+E2 Circuit Build** - Build and freeze the depth-3 Merkle circuit with salted leaves, disclosure binding, predicates, and nonce binding
- [ ] **Phase 3: Trusted Setup & Redeploy** - Run the Groth16 Phase-2 ceremony, export and redeploy IdentityVerifier.sol, ship fresh artifacts to the ZKP backend
- [ ] **Phase 4: ZKP Backend Integration & Nonce Enforcement** - Wire the new proof input/output shape and the session-nonce challenge + freshness + one-time-use enforcement
- [ ] **Phase 5: Benchmarking & Metrics** - Instrument every new crypto op and report mean ± σ over n≥19 runs

## Phase Details

### Phase 1: Freeze Spec & Field-Set Consistency
**Goal**: The 7-attribute identity spec is frozen and the admin issuance hash is byte-for-byte identical to what the prover will consume, eliminating the §1.4 branch/programme mismatch at the root before any circuit code exists.
**Depends on**: Nothing (first phase)
**Requirements**: SPEC-01, SPEC-02, SPEC-03
**Success Criteria** (what must be TRUE):
  1. The frozen spec documents all 7 leaf attributes in fixed order (name, rollNo, dob-int, programmeLevel, discipline, batch-int, email) with per-attribute type/encoding and the final public-signal layout, with leaf 7 reserved as zero padding.
  2. The admin issuance hash and the prover consume an identical attribute list, order, and encoding — `programme` is split into `programmeLevel`+`discipline`, `phone` is dropped for `email`, and integer attrs (dob `YYYYMMDD`, batch year) are encoded as integers.
  3. Re-seeding a test student and recomputing the commitment yields the same root from both the admin issuance path and the prover-side leaf computation.
  4. The credential issuer string reads "PrivdID — IIITDM Jabalpur" with no VIT references in issuance output.
**Plans**: 4 plans
- [x] 01-01-PLAN.md — Frozen IDENTITY_SPEC.md spec doc + canonical enumCodes.js (SPEC-01)
- [x] 01-02-PLAN.md — Shared identityCommitment.js module: hash-to-field, salts, salted Merkle root (SPEC-01/02)
- [x] 01-03-PLAN.md — Admin issuance refactor: schema, validator, both recompute sites, branding (SPEC-02/03)
- [ ] 01-04-PLAN.md — Wipe-and-reseed script + root-equality acceptance gate (SPEC-02)

### Phase 2: E1+E2 Circuit Build
**Goal**: A single frozen `identity.circom` computes the depth-3 Merkle root from salted per-attribute leaves, binds selective disclosure, evaluates the age and postgrad predicates, and binds the verifier nonce — built together so the circuit can be frozen exactly once.
**Depends on**: Phase 1
**Requirements**: CIRC-01, CIRC-02, CIRC-03, CIRC-04, CIRC-05, REPL-01, REPL-02
**Success Criteria** (what must be TRUE):
  1. The circuit computes `leaf_i = Poseidon(2)(attr_i, salt_i)` for 7 attributes plus a zero-padding leaf and outputs the depth-3 Merkle root as `pubHash` (public signal [0]), with every committed attribute carrying a mandatory random salt.
  2. Selective disclosure is bound in-circuit: each `revealMask_i` is boolean, `revealMask_i * (revealedValue_i - attr_i) === 0`, and a hidden attribute never appears in `publicSignals`.
  3. `isOver18` is computed from `currentDateInt` vs `dobInt` (with `dobInt` bound to leaf attr 2): an over-18 DOB yields `isOver18=1` and an under-18 DOB yields `0`; `isPostgrad` is set-membership of `programmeLevel` over {M.Tech, M.Des, PhD}.
  4. `nonce` is a public input forced into the constraint system (`nonceSq <== nonce * nonce`) so the compiler cannot optimize it away, and a witness/proof generated for nonce A fails verification against nonce B.
**Plans**: TBD

### Phase 3: Trusted Setup & Redeploy
**Goal**: A fresh Groth16 Phase-2 setup is performed against the frozen circuit, the Solidity verifier is exported and redeployed, and the new wasm/zkey/vkey are live in the ZKP backend — run once, only after the circuit is final.
**Depends on**: Phase 2
**Requirements**: SETUP-01, SETUP-02, SETUP-03
**Success Criteria** (what must be TRUE):
  1. A fresh Phase-2 setup runs as a 3-contribution chain plus final beacon, `snarkjs zkey verify` passes, and the circuit constraint count is recorded.
  2. `verification_key.json` and `IdentityVerifier.sol` are exported from `identity_final.zkey`, and the verifier is redeployed (Sepolia + local) with `VERIFIER_ADDRESS` updated in env.
  3. Fresh `identity.wasm`, `identity_final.zkey`, and `verification_key.json` are copied into the ZKP backend, and proof generation uses these new artifacts (not the stale flat-Poseidon(5) ones).
**Plans**: TBD

### Phase 4: ZKP Backend Integration & Nonce Enforcement
**Goal**: The ZKP backend accepts the new proof input shape, returns publicSignals in the frozen §3 order, verifies proofs both off-chain and on-chain, and enforces the full session-nonce lifecycle (issue → match → freshness → one-time use).
**Depends on**: Phase 3
**Requirements**: BACK-01, BACK-02, BACK-03, REPL-03
**Success Criteria** (what must be TRUE):
  1. `POST /generate-proof` accepts the new input shape (attrs, salts, reveal flags, nonce, currentDateInt) and returns `{proof, publicSignals}` with publicSignals in the frozen §3 order.
  2. For a freshly generated proof, `POST /verify` (off-chain `groth16.verify`) and `POST /verify-onchain` (verifier view call) both return true, and `POST /credential-info` treats `pubHash` as the Merkle root and resolves the credential from the registry.
  3. `POST /session/nonce` issues a random field element (< BN128 order) with sessionId and 5-minute TTL, and verify-time enforcement rejects a proof whose nonce does not match, is expired, or has already been consumed, marking the nonce consumed on first successful use.
**Plans**: TBD

### Phase 5: Benchmarking & Metrics
**Goal**: Every new cryptographic operation is instrumented to print elapsed seconds and a benchmark script produces statistically rigorous timings, recorded as a research deliverable.
**Depends on**: Phase 4
**Requirements**: PERF-01, PERF-02
**Success Criteria** (what must be TRUE):
  1. Every new crypto operation prints elapsed seconds via the shared timing helper, and `bench.js` reports mean ± σ over n≥19 runs (dropping a warm-up run).
  2. PERFORMANCE_METRICS.md records constraint count, proof-gen time, off-chain and on-chain verify time, nonce issue+check time, and QR payload size for the new E1+E2 circuit.
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Freeze Spec & Field-Set Consistency | 3/4 | In Progress|  |
| 2. E1+E2 Circuit Build | 0/TBD | Not started | - |
| 3. Trusted Setup & Redeploy | 0/TBD | Not started | - |
| 4. ZKP Backend Integration & Nonce Enforcement | 0/TBD | Not started | - |
| 5. Benchmarking & Metrics | 0/TBD | Not started | - |
