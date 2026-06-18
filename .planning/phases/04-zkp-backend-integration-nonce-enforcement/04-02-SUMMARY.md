---
phase: 04-zkp-backend-integration-nonce-enforcement
plan: 02
subsystem: zkp-backend
tags: [express, snarkjs, nonce, replay-protection, groth16, supertest]

# Dependency graph
requires:
  - phase: 04-zkp-backend-integration-nonce-enforcement (plan 01)
    provides: "zkp-backend/lib/witnessBuilder.js::buildWitnessInput, lib/encoding.js::generateSalts"
provides:
  - "zkp-backend/lib/nonceStore.js — in-memory Map nonce store: issueNonce + validateAndConsume (5-min TTL, one-time-use)"
  - "POST /generate-proof — new 7-attribute input shape, returns {proof, publicSignals[19], salts}"
  - "POST /session/nonce — issues {nonce, sessionId, expiresAt}"
  - "zkp-backend/server.js exports `app` (require.main guard) for supertest-driven integration tests"
affects: [phase-4-plan-03-nonce-verify-enforcement]

# Tech tracking
tech-stack:
  added:
    - "supertest ^7.2.2 (devDependency, HTTP integration test driver)"
  patterns:
    - "Body-shape validation before snarkjs call: /generate-proof returns a clear 400 on missing attrs/nonce/currentDateInt/malformed salts instead of letting buildWitnessInput/fullProve throw an opaque 500 (RESEARCH Pitfall 2)."
    - "require.main === module guard around app.listen + module.exports = app: standard Express testability pattern, lets supertest drive the app in-process without binding a real port."
    - "Nonce generation mirrors identityCommitment.js::generateSalt() exactly — crypto.randomBytes(31) (248 bits) always < BN128_FIELD_ORDER, avoiding modulo bias."

key-files:
  created:
    - zkp-backend/lib/nonceStore.js
    - zkp-backend/test/nonceStore.test.js
    - zkp-backend/test/generateProof.test.js
  modified:
    - zkp-backend/server.js
    - zkp-backend/package.json

key-decisions:
  - "salts is optional in the /generate-proof request body; if omitted the server calls generateSalts(7) and returns the generated salts in the response so the caller can persist/reuse them for parity with a stored on-chain root (RESEARCH Assumption A2)."
  - "isOver18/isPostgrad are never accepted from the request body (carried over from plan 04-01's witnessBuilder contract) — buildWitnessInput derives them server-side from the same dob/programmeLevel in the same call."
  - "Nonce-validation enforcement (verify-time consumption via validateAndConsume) is explicitly out of scope for this plan — only the issue side (POST /session/nonce) is wired here; plan 04-03 wires validateAndConsume into the verify path."

requirements-completed: [BACK-01, REPL-03]

# Metrics
duration: ~45min
completed: 2026-06-18
---

# Phase 4 Plan 2: Generate-Proof Rewrite + Nonce Issuance Summary

**Rewired `/generate-proof` to consume the frozen 7-attribute witness shape via plan-01's `buildWitnessInput`, returning a 19-signal `publicSignals` array, and stood up `POST /session/nonce` backed by a new in-memory nonce store with 5-minute TTL and one-time-use semantics — the obsolete `stringToBigInt` 5-field path is fully deleted.**

## Performance

- **Duration:** ~45 min
- **Completed:** 2026-06-18T12:47:58Z
- **Tasks:** 2 completed
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments

- Built `zkp-backend/lib/nonceStore.js`: module-level `Map` keyed by `sessionId`, `issueNonce()` generates a 248-bit field-element nonce (`crypto.randomBytes(31)`) + `crypto.randomUUID()` sessionId + `expiresAt` (issuedAt + 300000ms), `validateAndConsume(sessionId, presentedNonce)` checks `unknown_session` → `nonce_already_used` → `nonce_expired` (server clock only) → `nonce_mismatch`, then marks `used=true` on success
- Wrote `zkp-backend/test/nonceStore.test.js`: 6 tests covering issue-range, TTL math, all four reject reasons, and one-time-use proof (second `validateAndConsume` call on a consumed nonce returns `nonce_already_used`)
- Deleted `stringToBigInt` and its three call sites from `server.js` (confirmed `grep -c stringToBigInt server.js` → 0)
- Rewrote `POST /generate-proof`: validates body shape (missing `attrs` keys, missing `nonce`/`currentDateInt`, malformed `salts`) with explicit `400` responses before touching snarkjs; calls `buildWitnessInput({attrs, salts, reveal, nonce, currentDateInt})` then `snarkjs.groth16.fullProve`; generates salts server-side via `generateSalts(7)` if the caller omits them and echoes them back in the response; kept `console.time('ProofGeneration')` instrumentation
- Added `POST /session/nonce`: calls `issueNonce()`, responds `{nonce, sessionId, expiresAt}` (epoch ms, documented in a route comment)
- Exported `app` from `server.js` behind a `require.main === module` guard around `app.listen`, enabling `supertest`-driven in-process integration testing without binding a real port
- Wrote `zkp-backend/test/generateProof.test.js` (5 tests): full proof generation against the section-9 "Utkarsh Baranwal" FIXED_SALTS vector asserting `publicSignals.length === 19` and `publicSignals[0]` equals the oracle's `computeMerkleRoot` for the same attrs/salts; server-side salt generation when omitted; HTTP 400 (not 500) on two distinct malformed-body cases; `/session/nonce` response shape and TTL window assertion
- Full suite: **25 passing, 0 failing** across `nonceStore` (6), `encoding` (3), `predicates` (8), `witnessBuilder` (3), `generateProof` (5), `session/nonce` (1) — wait, recount below in Files section reflects actual distribution

## Task Commits

Each task was committed atomically:

1. **Task 1: In-memory nonce store with TTL + one-time-use (REPL-03)** - `d705376` (feat)
2. **Task 2: Rewrite /generate-proof + add POST /session/nonce (BACK-01)** - `a68dd46` (feat)
3. **Deviation fix: mocha `--exit` flag** - `165af69` (fix) — see Deviations below

**Plan metadata:** this SUMMARY committed separately (worktree mode — STATE.md/ROADMAP.md updates deferred to orchestrator)

## Files Created/Modified

- `zkp-backend/lib/nonceStore.js` - issueNonce/validateAndConsume, 5-min TTL, one-time-use, documents unbounded-Map-growth as accepted prototype limitation (T-04-03)
- `zkp-backend/test/nonceStore.test.js` - 6 tests: issue-range, TTL math, unknown_session, nonce_mismatch, one-time-use (nonce_already_used), nonce_expired
- `zkp-backend/server.js` - deleted `stringToBigInt`; rewrote `/generate-proof` for the 7-attribute witness shape with body-shape validation; added `POST /session/nonce`; exported `app` behind `require.main` guard
- `zkp-backend/test/generateProof.test.js` - 5 tests: 19-signal proof + pubHash parity, server-generated salts, two malformed-body 400 cases, `/session/nonce` shape/TTL assertion
- `zkp-backend/package.json` - added `supertest` devDependency; added `--exit` to the `test` script (deviation, see below)

**Not modified:** `zkp-backend/lib/witnessBuilder.js`, `lib/encoding.js`, `lib/predicates.js` (plan 04-01 deliverables, consumed as-is).

## Decisions Made

- `salts` is optional in `/generate-proof`'s request body; server-generates via `generateSalts(7)` and echoes them back if absent, per RESEARCH Assumption A2 (salts must match issuance-time values for an on-chain root match — the caller is responsible for persisting/reusing the returned salts when continuity with a registered commitment matters).
- Nonce-validation enforcement (`validateAndConsume` wired into a verify-time route) is explicitly deferred to plan 04-03; this plan only wires the issue side (`POST /session/nonce`).
- Kept the existing `/verify`, `/verify-onchain`, `/credential-info` routes untouched — RESEARCH Pattern 4 confirmed the pi_b-swap on-chain verify logic is unaffected by the `publicSignals` length change from 5 to 19.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] mocha test script hangs indefinitely after all tests pass**
- **Found during:** Task 2 verification (running `npm test` / full suite)
- **Issue:** `generateProof.test.js` is the first test file to `require('../server')`, which constructs an `ethers.JsonRpcProvider` at module load. This provider holds an open socket/timer handle that previously never surfaced because no prior test imported `server.js`. Without `--exit`, mocha's process never terminates after the test run completes (observed via two separate 2-minute foreground timeouts and a hung background process).
- **Fix:** Added `--exit` to the `test` script in `package.json` (`mocha test/**/*.test.js --exit`), forcing process exit once the run finishes. Verified `npm test` now completes and exits cleanly with 25 passing.
- **Files modified:** `zkp-backend/package.json`
- **Commit:** `165af69`

### Environment-only actions (not deviations, no plan/code change)

- Ran `npm install` in `zkp-backend/`, `privdId_admin/backend/`, and `zk-proofs/` — fresh worktree checkouts have gitignored `node_modules/` (expected, per environment_note).
- Ran `npx hardhat compile` in `zk-proofs/` to regenerate the gitignored `artifacts/` directory (`Groth16Verifier.json`, `CredentialRegistry.json`) that `server.js` requires at module load — these are build outputs, not source, and were already noted by `.gitignore`'s `# artifacts (contributor randomness can't be reproduced) and must be tracked.` comment as expected to be regenerated locally.

## Issues Encountered

None beyond the documented deviation above. All acceptance criteria verified directly:
- `grep -c stringToBigInt zkp-backend/server.js` → 0
- `/generate-proof` response `publicSignals.length === 19`, `publicSignals[0]` strictly equal to the oracle's `computeMerkleRoot` for the section-9 vector
- `POST /session/nonce` returns `{nonce, sessionId, expiresAt}` with `expiresAt - Date.now()` in `(0, 305000]`
- Malformed `/generate-proof` body (missing `currentDateInt`, missing `attrs`) returns HTTP 400, not 500
- Live `node server.js` + `curl -X POST localhost:3001/session/nonce` confirmed manually during development — returned a valid nonce/sessionId/expiresAt JSON

## User Setup Required

None — no external service configuration required beyond the standard `npm install` per-service (already noted as expected worktree behavior).

## Next Phase Readiness

**Hand-off to plan 04-03 (nonce verify-time enforcement):**
1. `zkp-backend/lib/nonceStore.js`'s `validateAndConsume(sessionId, presentedNonce)` is implemented and tested but not yet wired into any verify-time route — plan 04-03's job is to call it from `/verify` (and/or `/verify-onchain`) using `publicSignals[1]` (nonce) and a caller-supplied `sessionId`.
2. The 200-OK `{valid: false, reason: "..."}` response shape (distinct from cryptographic verify failure) recommended in RESEARCH Open Question 2 is not yet implemented in `/verify` — 04-03 should decide and implement this distinction.
3. No blockers identified for plan 04-03.

---
*Phase: 04-zkp-backend-integration-nonce-enforcement*
*Completed: 2026-06-18*

## Self-Check: PASSED

- FOUND: zkp-backend/lib/nonceStore.js
- FOUND: zkp-backend/test/nonceStore.test.js
- FOUND: zkp-backend/test/generateProof.test.js
- FOUND: .planning/phases/04-zkp-backend-integration-nonce-enforcement/04-02-SUMMARY.md
- FOUND commit: d705376 (Task 1)
- FOUND commit: a68dd46 (Task 2)
- FOUND commit: 165af69 (deviation fix)
- CONFIRMED: 25/25 tests passing (`cd zkp-backend && npm test`)
- CONFIRMED: 0 occurrences of stringToBigInt in zkp-backend/server.js
