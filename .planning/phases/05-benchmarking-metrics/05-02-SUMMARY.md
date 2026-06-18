---
phase: 05-benchmarking-metrics
plan: 02
subsystem: testing
tags: [benchmarking, performance, snarkjs, poseidon, ethers, zkp-backend]

# Dependency graph
requires:
  - phase: 05-benchmarking-metrics
    plan: "05-01"
    provides: "Shared timed(label, fn) helper instrumenting all six measured E1+E2 crypto ops"
provides:
  - "zkp-backend/bench.js — N=20/n=19 mean±sample-σ benchmark driver for all six measured E1+E2 ops plus QR payload size, proof size, public-signal count, and end-to-end latency"
  - "npm run bench script wired in zkp-backend/package.json"
  - "docs/improvement/PERFORMANCE_METRICS_E1E2.md — research-deliverable metrics doc citing the frozen 7891-constraint count and recording all measured/free numbers"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "runLoop(label, fn, N=20) generic benchmark loop: drops warm-up sample, computes mean + SAMPLE stddev (n-1=18) over n=19, prints '<label>: mean <m> s ± <sd> s (n=19)' per blueprint §10.3"
    - "On-chain verify gets the full N=20/n=19 live-Sepolia treatment, no reduced sample size (D-17) — one funded proof reused across all 20 stateless 0-gas view calls"
    - "Nonce ops measured via direct function calls (issueNonce/validateAndConsume) rather than HTTP, to avoid Express overhead skewing sub-ms timings"

key-files:
  created:
    - zkp-backend/bench.js
    - docs/improvement/PERFORMANCE_METRICS_E1E2.md
  modified:
    - zkp-backend/package.json

key-decisions:
  - "Mirrored identityCommitment.js's Poseidon(2) leaf/level/root math directly in bench.js (no standalone root helper exported from lib/encoding.js, and cross-service import from privdId_admin/backend is explicitly out of scope per D-16)"
  - "Force-added docs/improvement/PERFORMANCE_METRICS_E1E2.md despite docs/ being wholesale gitignored, following the existing precedent of docs/current/research/PERFORMANCE_METRICS.md and IDENTITY_SPEC.md already being tracked under that same gitignored directory"
  - "Reused one funded proof across all 20 OnChainVerification iterations (Claude's-discretion item, D-17 confirms this is valid since verify-onchain is a stateless 0-gas view call)"

requirements-completed: [PERF-01, PERF-02]

# Metrics
duration: 24min
completed: 2026-06-18
---

# Phase 5 Plan 2: Benchmark Driver + E1+E2 Performance Metrics Doc Summary

**`zkp-backend/bench.js` drives all six measured E1+E2 crypto ops at N=20/n=19 mean ± sample-σ (warm-up dropped), measures QR payload size/proof size/public-signal count/end-to-end latency from a real proof, and the results are recorded in the new `docs/improvement/PERFORMANCE_METRICS_E1E2.md` alongside the cited (not recomputed) 7891-constraint count from Phase 3.**

## Performance

- **Duration:** 24 min
- **Started:** 2026-06-18T18:04:00Z (approx, continuing from 05-01)
- **Completed:** 2026-06-18T18:28:09Z
- **Tasks:** 2 completed
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments
- Wrote `zkp-backend/bench.js`: a generic `runLoop(label, fn, N=20)` helper that drops the first (warm-up) sample and computes mean + SAMPLE standard deviation (divide by n-1=18) over the remaining n=19 samples, printing the blueprint §10.3 format
- Drove all six measured ops: `MerkleRoot` (mirrors identityCommitment.js's Poseidon(2) tree math directly, no cross-service import), `ProofGeneration` (fresh nonce per iteration), `OffChainVerification`, `OnChainVerification` (full N=20/n=19 live-Sepolia treatment per D-17, one funded proof reused across calls), `NonceIssue`, `NonceCheck` (fresh session per iteration to avoid `nonce_already_used` no-ops)
- Measured QR payload size (981-982 bytes, varies slightly per proof randomness), proof size (721 bytes), public-signal count (19), and end-to-end latency (issueNonce → buildWitnessInput → fullProve → groth16.verify, ~0.78s) as free side-effect numbers
- Wired `npm run bench` in `zkp-backend/package.json` alongside the existing `test` script
- Wrote `docs/improvement/PERFORMANCE_METRICS_E1E2.md` recording all six op timings, the cited 7891-constraint count (Phase 3 source, not recomputed), and all free numbers — explicitly stating `verifyProof` is a 0-gas view call with no fabricated gas figure
- Verified `docs/current/research/PERFORMANCE_METRICS.md` remains byte-for-byte unchanged (historical record preserved)
- Ran the full `zkp-backend` mocha suite after adding bench.js — 32/32 passing, confirming no regression to the instrumented call sites from 05-01

## Task Commits

Each task was committed atomically:

1. **Task 1: Write bench.js driving all six ops at N=20/n=19 plus QR payload size** - `e85d89c` (feat)
2. **Task 2: Wire npm run bench and write PERFORMANCE_METRICS_E1E2.md** - `b0dd045` (docs)

_No TDD tasks in this plan — both are `type="auto"` instrumentation/reporting tasks._

## Files Created/Modified
- `zkp-backend/bench.js` - benchmark driver: `runLoop` generic harness + six op-specific loops + QR/proof-size/public-signal-count/end-to-end-latency measurements + final transcribable summary block
- `zkp-backend/package.json` - added `"bench": "node bench.js"` script, kept `test` intact
- `docs/improvement/PERFORMANCE_METRICS_E1E2.md` - new standalone metrics doc (Methodology, Timing Results table, cited constraint count, Free Side-Effect Numbers table, Footer)

## Decisions Made
- Mirrored `identityCommitment.js`'s Poseidon(2) leaf/level/root math directly inside `bench.js` using `circomlibjs`'s `buildPoseidon()` (same pattern as `lib/encoding.js`) rather than cross-importing from `privdId_admin/backend`, since `lib/encoding.js` does not export a standalone Merkle-root helper and D-16 explicitly scopes `bench.js` to zkp-backend's own self-contained building blocks.
- Force-added `docs/improvement/PERFORMANCE_METRICS_E1E2.md` with `git add -f` because the repo's `.gitignore` wholesale-ignores `docs/` ("Workspace handoff" comment), but the plan's exact-path requirement (D-18) and the existing precedent of `docs/current/research/PERFORMANCE_METRICS.md` / `IDENTITY_SPEC.md` already being tracked under that same gitignored directory both confirm this is the intended pattern, not an accidental override.
- Reused one funded proof across all 20 `OnChainVerification` loop iterations (Claude's-discretion item in 05-CONTEXT.md, explicitly validated by D-17 since `verify-onchain` is a stateless 0-gas view call with no on-chain state mutation or nonce consumption).
- Measured `NonceIssue`/`NonceCheck` via direct function calls to `lib/nonceStore.js` rather than through the live HTTP endpoints, per the Claude's-discretion note — avoids Express/HTTP round-trip overhead skewing operations that are genuinely sub-millisecond at the crypto layer.

## Deviations from Plan

None - plan executed exactly as written. The `git add -f` step for the gitignored-but-precedented doc path was a mechanical git operation required to fulfill the plan's explicit deliverable path (D-18), not a deviation from the plan's intent.

## Issues Encountered

None. `bench.js` ran to completion on the first attempt without requiring debugging iterations.

## User Setup Required

None - no external service configuration required. The existing `.env` (`VERIFIER_ADDRESS`, `BLOCKCHAIN_RPC_URL`) already present from prior phases was sufficient.

## Next Phase Readiness

- This is the final plan of the final phase (05) in the milestone's roadmap — `bench.js` and `PERFORMANCE_METRICS_E1E2.md` are terminal research deliverables with no downstream phase consuming them further.
- All PERF-01 (statistically rigorous mean±σ, n≥19 timings via the shared timing helper) and PERF-02 (metrics recorded for the new E1+E2 circuit) requirements are now complete.

---
*Phase: 05-benchmarking-metrics*
*Completed: 2026-06-18*

## Self-Check: PASSED

- FOUND: zkp-backend/bench.js
- FOUND: docs/improvement/PERFORMANCE_METRICS_E1E2.md
- FOUND: zkp-backend/package.json (bench script present)
- FOUND commit: e85d89c (Task 1)
- FOUND commit: b0dd045 (Task 2)
