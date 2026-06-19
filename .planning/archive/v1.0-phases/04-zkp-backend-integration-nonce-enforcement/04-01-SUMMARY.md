---
phase: 04-zkp-backend-integration-nonce-enforcement
plan: 01
subsystem: zkp-backend
tags: [witness, snarkjs, poseidon, field-set-consistency, groth16, parity-test]

# Dependency graph
requires:
  - phase: 03-trusted-setup-redeploy (plan 02)
    provides: "identity.wasm, identity_final.zkey, verification_key.json copied into zkp-backend/; Sepolia-deployed Groth16Verifier"
provides:
  - "zkp-backend/lib/encoding.js — hashToField + CHUNK_COUNTS + generateSalts, byte-identical to identityCommitment.js"
  - "zkp-backend/lib/predicates.js — computeIsOver18 / computeIsPostgrad, server-derived, never caller-supplied"
  - "zkp-backend/lib/witnessBuilder.js — buildWitnessInput({attrs, salts, reveal, nonce, currentDateInt}) -> full snarkjs circuit input"
  - "zkp-backend/test/{encoding,predicates,witnessBuilder}.test.js — 14 passing tests including the pubHash===oracle-root parity proof"
  - "zkp-backend mocha test runner wired via package.json"
affects: [phase-4-plan-02-route-rewrite, phase-4-plan-03-nonce-enforcement]

# Tech tracking
tech-stack:
  added:
    - "mocha ^11.7.6 (devDependency, test runner)"
  patterns:
    - "Vendor-don't-import: encoding.js copies hashToField/generateSalt body verbatim from the ESM oracle (identityCommitment.js) into CJS, with BN128_FIELD_ORDER hardcoded inline rather than deep-importing ffjavascript (which throws ERR_PACKAGE_PATH_NOT_EXPORTED)."
    - "Predicate derivation isolation: isOver18/isPostgrad are computed in predicates.js from real dob/programmeLevel and are never accepted as witness-builder input, closing the tampering vector where a caller could inject a false predicate result."
    - "Parity-anchored testing: witnessBuilder.test.js cross-imports the real ESM oracle via await import(...) and asserts strict equality against a live snarkjs.wtns.calculate run on the real identity.wasm, not a mocked one."

key-files:
  created:
    - zkp-backend/lib/encoding.js
    - zkp-backend/lib/predicates.js
    - zkp-backend/lib/witnessBuilder.js
    - zkp-backend/test/encoding.test.js
    - zkp-backend/test/predicates.test.js
    - zkp-backend/test/witnessBuilder.test.js
  modified:
    - zkp-backend/package.json

key-decisions:
  - "reveal object is name-keyed ({name, rollNo, dob, programmeLevel, discipline, batch, email}) rather than leaf-index-keyed, for caller ergonomics; internally mapped to the same 0..6 attr[]/salt[] order via the ATTR_KEYS constant — documented in witnessBuilder.js header comment."
  - "PROGRAMME_LEVEL/DISCIPLINE enum tables vendored (duplicated) into witnessBuilder.js rather than cross-imported from enumCodes.js, since that file is a synchronous ESM object literal and vendoring keeps witnessBuilder.js fully synchronous-importable as CommonJS without an async import indirection."
  - "resolveCode() accepts either the human-readable name or an already-numeric code, validated against the table's value set, so callers can pass either representation without the witness builder silently miscoding an unknown value."

requirements-completed: [BACK-01]

# Metrics
duration: ~20min (resumed after a session usage-limit reset; Task 1 was already committed)
completed: 2026-06-18
---

# Phase 4 Plan 1: ZKP Witness Library (Encoding, Predicates, WitnessBuilder) Summary

**Built and parity-tested the encoding/predicate/witness-construction library that makes zkp-backend's proof generation field-set-consistent with the admin issuance path — the witness builder's pubHash now provably matches `identityCommitment.js::computeMerkleRoot` for the same attrs+salts, closing CLAUDE.md ground rule #3's highest-risk gap for Phase 4.**

## Performance

- **Duration:** ~20 min in this resumed session (Task 1 — encoding.js/predicates.js — was already committed from before the usage-limit reset; this session verified it, then completed Task 2 — witnessBuilder.js + parity test — and committed it)
- **Completed:** 2026-06-18T12:21:01Z
- **Tasks:** 2 completed
- **Files modified:** 7 (6 created, 1 modified)

## Accomplishments
- Confirmed Task 1's prior commit (`58e025c`) delivered `zkp-backend/lib/encoding.js` (hashToField/CHUNK_COUNTS/generateSalts, vendored byte-identical from identityCommitment.js, BN128_FIELD_ORDER hardcoded literally) and `zkp-backend/lib/predicates.js` (computeIsOver18/computeIsPostgrad), with mocha wired into package.json
- Built `zkp-backend/lib/witnessBuilder.js` exporting `buildWitnessInput({attrs, salts, reveal, nonce, currentDateInt})`: encodes attr[] in frozen leaf order (name, rollNo, dob, programmeLevel, discipline, batch, email), derives isOver18/isPostgrad server-side via predicates.js (never caller-supplied), builds revealedValue/revealMask from a name-keyed reveal object, and normalizes every field to a decimal string
- Wrote `zkp-backend/test/witnessBuilder.test.js`: cross-imports the real ESM oracle (`identityCommitment.js`) via `await import(...)`, runs `snarkjs.wtns.calculate` against the real `identity.wasm`, and strictly asserts witness[1] (pubHash) === `computeMerkleRoot(attrs, salts)` for the section-9 "Utkarsh Baranwal" vector
- Full suite: **14 passing, 0 failing** — `encoding` (3 hashToField parity vectors), `predicates` (8 boundary/postgrad cases), `witnessBuilder` (3 cases: full encode, pubHash parity, reveal-flag isolation)
- Verified all acceptance criteria via direct grep: `stringToBigInt` appears 0 times across `lib/encoding.js`, `lib/predicates.js`, `lib/witnessBuilder.js`; `BN128_FIELD_ORDER` literal confirmed present in `encoding.js`

## Task Commits

Each task was committed atomically:

1. **Task 1: Vendor encoding + predicates from canonical oracle (BACK-01)** - `58e025c` (feat) — committed in the prior session before the usage-limit reset
2. **Task 2: Build witnessBuilder and assert pubHash parity against the oracle (BACK-01)** - `37f3221` (feat) — completed this session

**Plan metadata:** this SUMMARY committed separately (worktree mode — STATE.md/ROADMAP.md updates deferred to orchestrator)

## Files Created/Modified
- `zkp-backend/lib/encoding.js` - hashToField/CHUNK_COUNTS/generateSalts vendored verbatim from identityCommitment.js
- `zkp-backend/lib/predicates.js` - computeIsOver18 (inclusive GreaterEqThan boundary)/computeIsPostgrad ([4,5,6] set)
- `zkp-backend/lib/witnessBuilder.js` - buildWitnessInput; frozen leaf-order encoding; vendored PROGRAMME_LEVEL/DISCIPLINE tables; resolveCode/resolveDobInt helpers
- `zkp-backend/test/encoding.test.js` - 3 hashToField parity-vector assertions
- `zkp-backend/test/predicates.test.js` - 8 boundary/postgrad behavior cases
- `zkp-backend/test/witnessBuilder.test.js` - full encode assertion, live-wasm pubHash parity assertion, reveal-flag isolation assertion
- `zkp-backend/package.json` - added `test` script (`mocha test/**/*.test.js`) and mocha devDependency

**Not tracked (pre-existing, copied in Phase 3):** `zkp-backend/identity.wasm`, `identity_final.zkey`, `verification_key.json` — consumed by the parity test, not modified by this plan.

## Decisions Made
- reveal object is name-keyed for caller ergonomics rather than leaf-index-keyed; ATTR_KEYS constant documents and enforces the mapping to attr[]/salt[] index order.
- enumCodes.js tables (PROGRAMME_LEVEL/DISCIPLINE) are vendored/duplicated into witnessBuilder.js rather than cross-imported, keeping the module synchronously CommonJS-importable.
- resolveCode() accepts either a human-readable name or a validated numeric code, throwing a clear Error on anything outside the known table — mirrors studentService.js's validation posture.

## Deviations from Plan

None. Both tasks executed exactly as specified in 04-01-PLAN.md. The only operational deviation was temporal: Task 1 was completed and committed in a prior session that hit its usage limit; this session verified that work was intact and complete, then carried out Task 2 to finish the plan.

## Issues Encountered

None. All 14 tests passed on the first full run in this session; no parity mismatches, no encoding drift from the oracle.

## User Setup Required

None — no external service configuration required. `npm install` (mocha) was already reflected in the committed `package.json`/lockfile state from Task 1.

## Next Phase Readiness

**Hand-off to plan 04-02 (route rewrite):**
1. `zkp-backend/lib/witnessBuilder.js`'s `buildWitnessInput` is ready to be wired into the `/generate-proof` route as the witness-construction step, replacing the old `stringToBigInt` path in `server.js`.
2. The route rewrite is "thin wiring, not crypto" per this plan's objective — all parity-critical math is isolated, tested, and proven here.
3. Plan 04-03 (nonce enforcement) is independent of this plan's deliverables and can proceed in parallel once started.

No blockers identified for plan 04-02 or 04-03.

---
*Phase: 04-zkp-backend-integration-nonce-enforcement*
*Completed: 2026-06-18*

## Self-Check: PASSED

- FOUND: zkp-backend/lib/encoding.js
- FOUND: zkp-backend/lib/predicates.js
- FOUND: zkp-backend/lib/witnessBuilder.js
- FOUND: zkp-backend/test/witnessBuilder.test.js
- FOUND: zkp-backend/test/encoding.test.js
- FOUND: zkp-backend/test/predicates.test.js
- CONFIRMED: 14/14 tests passing (`cd zkp-backend && npm test`)
- CONFIRMED: 0 occurrences of stringToBigInt in zkp-backend/lib/
- CONFIRMED: BN128_FIELD_ORDER literal present in encoding.js
- FOUND commit: 58e025c (Task 1)
- FOUND commit: 37f3221 (Task 2)
