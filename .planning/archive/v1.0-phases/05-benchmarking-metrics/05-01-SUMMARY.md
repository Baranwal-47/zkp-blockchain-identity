---
phase: 05-benchmarking-metrics
plan: 01
subsystem: testing
tags: [performance, instrumentation, snarkjs, poseidon, nonce, zkp-backend, admin-backend]

# Dependency graph
requires:
  - phase: 04-zkp-backend-integration-nonce-enforcement
    provides: working /generate-proof, /verify, /verify-onchain, /session/nonce endpoints with nonce enforcement (E2), and computeMerkleRoot in the admin backend (E1)
provides:
  - "Shared timed(label, fn) helper (CommonJS copy in zkp-backend, ESM copy in privdId_admin/backend) per blueprint §10.1"
  - "All six measured E1+E2 crypto ops (Merkle root, proof gen, off-chain verify, on-chain verify, nonce issue, nonce check) instrumented through timed() with a single [perf] {label}: {seconds} s console format"
affects: [05-02 benchmark script (bench.js) — drives these instrumented call sites and the PERFORMANCE_METRICS_E1E2.md doc]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "timed(label, fn) async wrapper: performance.now() delta, console.log '[perf] {label}: {s.sss} s', returns { out, seconds } verbatim"
    - "Two independent per-module-system copies of the same helper (CommonJS in zkp-backend, ESM in privdId_admin/backend) — no cross-service import (D-15)"

key-files:
  created:
    - zkp-backend/utils/timing.js
    - privdId_admin/backend/utils/timing.js
  modified:
    - zkp-backend/server.js
    - privdId_admin/backend/utils/identityCommitment.js

key-decisions:
  - "Used Node's global performance object (Node 16+) for both copies — no new dependency added, matching blueprint §10.1 verbatim"
  - "Validation guards (7-attrs/7-salts throws) in computeMerkleRoot stay outside the timed() wrapper so a rejection isn't mislabeled as timed work"
  - "NonceIssue/NonceCheck wrap synchronous issueNonce()/validateAndConsume() calls in an async arrow (`async () => issueNonce()`) so they fit the same await timed(...) pattern as the async ops"

patterns-established:
  - "Any future crypto op added to either backend must route through its service's timed() helper rather than introducing raw console.time/console.timeEnd"

requirements-completed: [PERF-01]

# Metrics
duration: 25min
completed: 2026-06-18
---

# Phase 5 Plan 1: Shared Timing Helper Migration Summary

**All six measured E1+E2 crypto ops (Merkle root, proof gen, off-chain verify, on-chain verify, nonce issue, nonce check) now print elapsed seconds through one shared `timed()` helper in `[perf] {label}: {seconds} s` format, replacing raw-ms `console.time`/`console.timeEnd` and adding new timing for the two previously-untimed nonce operations.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-06-18T17:50:00Z
- **Completed:** 2026-06-18T18:15:36Z
- **Tasks:** 3 completed
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- Created two independent `timed(label, fn)` helper copies (`zkp-backend/utils/timing.js` CommonJS, `privdId_admin/backend/utils/timing.js` ESM) matching blueprint §10.1 exactly
- Migrated all five existing `console.time`/`console.timeEnd` call sites in `zkp-backend/server.js` (`ProofGeneration`, `OffChainVerification`, `OnChainVerification`) and `identityCommitment.js` (`computeMerkleRoot`) to `timed()`
- Added new timing for the two previously-untimed nonce operations (`NonceIssue`, `NonceCheck` — the latter applied at both `/verify` and `/verify-onchain` call sites)
- Verified response shapes, the proof-first/nonce-second enforcement order, and the computed Merkle root are all byte-for-byte unchanged (T-05-01 mitigation satisfied)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create both timing helper copies (CommonJS + ESM)** - `f8734de` (feat)
2. **Task 2: Migrate the five zkp-backend call sites + add nonce-issue and nonce-check timing** - `e85a38f` (feat)
3. **Task 3: Migrate computeMerkleRoot timing in the admin backend** - `7d52375` (feat)

_No TDD tasks in this plan — all three are `type="auto"` instrumentation tasks._

## Files Created/Modified
- `zkp-backend/utils/timing.js` - CommonJS `timed(label, fn)` helper, `module.exports = { timed }`
- `privdId_admin/backend/utils/timing.js` - ESM `timed(label, fn)` helper, `export async function timed`
- `zkp-backend/server.js` - five call sites migrated (`ProofGeneration`, `OffChainVerification`, `OnChainVerification`), two new timed ops added (`NonceIssue`, `NonceCheck` ×2)
- `privdId_admin/backend/utils/identityCommitment.js` - `computeMerkleRoot` body wrapped in `timed("computeMerkleRoot", ...)`, validation guards kept outside the wrapper

## Decisions Made
- Used the global `performance` object (confirmed available on installed Node v22.17.1, and per Node 16+ baseline) rather than requiring `node:perf_hooks` — keeps the helper dependency-free exactly as blueprint §10.1 specifies.
- Kept the two `computeMerkleRoot` argument-count guard throws (7-attrs / 7-salts checks) outside the `timed()` wrapper per the plan's explicit instruction, so a validation rejection is never counted as measured crypto work.

## Deviations from Plan

None - plan executed exactly as written. All three tasks' acceptance criteria were met without requiring Rule 1-4 deviations to the production code.

### Environment-only adjustments (not code deviations, not committed)

To run `npm test` for verification (required by Task 2 and Task 3 acceptance criteria), this git worktree needed `node_modules`, `.env`, and gitignored build artifacts (`identity.wasm`, `identity_final.zkey`, `verification_key.json`, `zk-proofs/artifacts/`) that exist in the main repo checkout but are gitignored (not present in a fresh worktree). Symlinked these from the main repo checkout into the worktree purely to execute `npm test` locally, then removed all symlinks afterward. While removing them, three tracked binary build artifacts (`identity.wasm`, `identity_final.zkey`, `verification_key.json` — committed in a prior phase despite the `.gitignore` pattern) were accidentally deleted by an `rm -f` that didn't distinguish symlinks from tracked files; immediately caught via `git status --short` showing them as deletions and restored with `git checkout --` before any commit. Final `git status --short` confirmed a clean working tree with no unintended changes. No production code or plan deliverable was affected.

## Issues Encountered

`npm test` initially failed with `ERR_MODULE_NOT_FOUND` for `circomlibjs` (a test imports `privdId_admin/backend/utils/identityCommitment.js`, which has its own gitignored `node_modules` not present in the worktree) — resolved by symlinking that service's `node_modules` from the main repo checkout alongside zkp-backend's, as described above. After this, the full suite ran cleanly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All six measured ops now route through `timed()` with one consistent `[perf] {label}: {s.sss} s` output format, giving Plan 02's `bench.js` a single instrumentation path to drive (per 05-CONTEXT.md D-15/D-16).
- `npm test` in `zkp-backend` passes 30/32 (2 pending, gated behind `TEST_FIXTURE_REGISTERED_ONCHAIN`/live RPC — unrelated to this plan, pre-existing test design).
- No blockers for Plan 02 (benchmark script + PERFORMANCE_METRICS_E1E2.md).

---
*Phase: 05-benchmarking-metrics*
*Completed: 2026-06-18*

## Self-Check: PASSED

- FOUND: zkp-backend/utils/timing.js
- FOUND: privdId_admin/backend/utils/timing.js
- FOUND: .planning/phases/05-benchmarking-metrics/05-01-SUMMARY.md
- FOUND commit: f8734de (Task 1)
- FOUND commit: e85a38f (Task 2)
- FOUND commit: 7d52375 (Task 3)
- FOUND commit: 4de1687 (docs: SUMMARY)
