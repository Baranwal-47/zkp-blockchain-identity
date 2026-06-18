---
phase: 05-benchmarking-metrics
verified: 2026-06-18T22:40:00Z
status: passed
score: 2/2 must-haves verified
overrides_applied: 0
---

# Phase 05: Benchmarking & Metrics Verification Report

**Phase Goal:** Every new cryptographic operation is instrumented to print elapsed seconds and a benchmark script produces statistically rigorous timings, recorded as a research deliverable.
**Verified:** 2026-06-18T22:40:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every new crypto operation prints elapsed seconds via the shared timing helper, and bench.js reports mean ± σ over n≥19 runs (dropping a warm-up run) | ✓ VERIFIED | `zkp-backend/utils/timing.js` and `privdId_admin/backend/utils/timing.js` both implement `timed(label, fn)` printing `[perf] {label}: {s.sss} s`. `server.js` routes `ProofGeneration`, `OffChainVerification`, `OnChainVerification`, `NonceIssue`, `NonceCheck` (×2 call sites) through `timed()`; `identityCommitment.js` routes `computeMerkleRoot` through the ESM `timed()`. Zero `console.time`/`console.timeEnd` remain in either file (grep confirmed empty). Live `npm test` run shows real `[perf] ProofGeneration: 0.659 s`, `[perf] OffChainVerification: 0.018 s`, `[perf] NonceCheck: 0.000 s`, `[perf] computeMerkleRoot: 0.002 s` lines printing during actual test execution — not just claimed in SUMMARY. `zkp-backend/bench.js` was executed live in this verification session (`node bench.js`, exit 0) against the real Sepolia RPC/verifier contract and printed all six `<label>: mean <m> s ± <sd> s (n=19)` lines plus `qr_payload_bytes`, `proof_size_bytes`, `public_signal_count: 19`, `end_to_end_latency`. Source code divides the variance sum by `(n - 1)` (18), confirming sample (not population) standard deviation. |
| 2 | docs/improvement/PERFORMANCE_METRICS_E1E2.md records constraint count, proof-gen time, off-chain and on-chain verify time, nonce issue+check time, and QR payload size for the new E1+E2 circuit (plus free side-effect numbers: proof size, public-signal count, end-to-end latency) | ✓ VERIFIED | File exists at the exact required path (not `docs/current/research/`). Contains a six-row timing table (MerkleRoot, ProofGeneration, OffChainVerification, OnChainVerification, NonceIssue, NonceCheck) with mean ± σ (n=19), a "Circuit Constraint Count" section citing **7891** total constraints sourced to Phase 3's `CEREMONY_LOG.md` (not recomputed), a QR payload size (981 bytes documented / 984 bytes reproduced live — expected proof-randomness variance), proof size (721/724 bytes), public-signal count (19), and end-to-end latency (0.776s documented / 0.533s reproduced live). Explicitly states `verifyProof` is a 0-gas view call with no fabricated gas figure. `docs/current/research/PERFORMANCE_METRICS.md` (the historical doc) shows zero diff against git history — confirmed untouched. |

**Score:** 2/2 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `zkp-backend/utils/timing.js` | CommonJS `timed(label, fn)` helper, `[perf]` output, `{out, seconds}` return | ✓ VERIFIED | Exists, exports `{ timed }`, matches blueprint §10.1 exactly |
| `privdId_admin/backend/utils/timing.js` | ESM `timed(label, fn)` helper, identical output shape | ✓ VERIFIED | Exists, `export async function timed`, no cross-service import |
| `zkp-backend/server.js` | Five existing call sites + 2 new nonce ops migrated to `timed()` | ✓ VERIFIED | `require('./utils/timing')` present; 6 `timed(` call sites (NonceCheck used twice); zero `console.time`/`console.timeEnd` remain |
| `privdId_admin/backend/utils/identityCommitment.js` | `computeMerkleRoot` wrapped in `timed()` | ✓ VERIFIED | `import { timed } from "./timing.js"`; validation guards correctly kept outside the wrapper; root computation unchanged |
| `zkp-backend/bench.js` | N=20/n=19 benchmark driver, all six ops + QR size | ✓ VERIFIED | Exists; executed live in this session, exit 0, full expected output produced against live Sepolia RPC |
| `docs/improvement/PERFORMANCE_METRICS_E1E2.md` | Research-deliverable metrics doc, contains "7891" | ✓ VERIFIED | Exists at correct path; contains "7891" cited to Phase 3; six-row table; free numbers recorded |
| `zkp-backend/package.json` | `bench` script wired | ✓ VERIFIED | `"bench": "node bench.js"` present alongside intact `"test"` script |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `zkp-backend/server.js` | `zkp-backend/utils/timing.js` | `require('./utils/timing')` | ✓ WIRED | Confirmed at line 12, used at 6 call sites |
| `privdId_admin/backend/utils/identityCommitment.js` | `privdId_admin/backend/utils/timing.js` | `import { timed }` | ✓ WIRED | Confirmed at line 28, used to wrap `computeMerkleRoot` body |
| `zkp-backend/bench.js` | `lib/witnessBuilder.js`, `lib/nonceStore.js`, `utils/timing.js` | direct function calls driving all six ops | ✓ WIRED | Confirmed via live execution — `buildWitnessInput`, `issueNonce`, `validateAndConsume`, `snarkjs.groth16.fullProve/verify`, `verifierContract.verifyProof` all invoked and produced real output |
| `zkp-backend/package.json` | `zkp-backend/bench.js` | `npm run bench` script | ✓ WIRED | `"bench": "node bench.js"` confirmed runnable |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Existing test suite remains green after instrumentation | `cd zkp-backend && npm test` | 30 passing, 2 pending (pre-existing RPC-gated pending tests, unrelated to this phase) | ✓ PASS |
| `[perf]` lines print live during real operations | observed in `npm test` output | `[perf] ProofGeneration: 0.659 s`, `[perf] OffChainVerification: 0.018/0.020/0.013/0.009 s`, `[perf] NonceCheck: 0.000 s` ×multiple, `[perf] computeMerkleRoot: 0.002 s` | ✓ PASS |
| `bench.js` runs to completion against live Sepolia and prints rigorous timings | `cd zkp-backend && node bench.js` | exit 0; six `mean ± σ (n=19)` lines + `qr_payload_bytes: 984 bytes`, `proof_size_bytes: 724 bytes`, `public_signal_count: 19`, `end_to_end_latency: 0.533 s` | ✓ PASS |
| Sample (not population) stddev used | grep `bench.js` for divisor | `variance = ... / (n - 1)` confirmed (18 for n=19) | ✓ PASS |
| Historical doc untouched | `git diff --stat docs/current/research/PERFORMANCE_METRICS.md` | empty diff | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|--------------|--------|----------|
| PERF-01 | 05-01, 05-02 | Every new crypto operation prints elapsed seconds, and a benchmark script reports mean ± σ over n≥19 runs | ✓ SATISFIED | timed() helper instrumentation (05-01) + bench.js N=20/n=19 mean±sample-σ driver (05-02), both verified live |
| PERF-02 | 05-02 | Constraint count, proof-gen time, off-chain/on-chain verify time, nonce issue+check time, and QR payload size recorded in metrics doc | ✓ SATISFIED | `docs/improvement/PERFORMANCE_METRICS_E1E2.md` contains all required figures, correctly cited (not fabricated) constraint count |

No orphaned requirements — REQUIREMENTS.md maps exactly PERF-01 and PERF-02 to Phase 5, and both appear in plan frontmatter (05-01: PERF-01; 05-02: PERF-01, PERF-02).

### Anti-Patterns Found

None. Scanned all phase-modified files (`bench.js`, both `timing.js` copies, `server.js`, `identityCommitment.js`, the metrics doc, `package.json`) for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`/"not yet implemented"/"coming soon" patterns — zero matches.

### Human Verification Required

None. All must-haves were verifiable programmatically: artifacts exist, are substantive (not stubs), are wired (imported and invoked), and the data-flow was confirmed by actually executing the code (`npm test` and `node bench.js`) against the live Sepolia testnet rather than relying on SUMMARY.md narration.

### Gaps Summary

No gaps. Both observable truths are fully verified with first-hand execution evidence (not just static code reading): the live test run shows real `[perf]` lines printing from the actual instrumented call sites, and a fresh `node bench.js` run in this verification session reproduced the expected six-line mean±σ(n=19) output, QR/proof size, public-signal count, and end-to-end latency — closely matching (within proof-randomness variance) the figures already transcribed into `PERFORMANCE_METRICS_E1E2.md`. The historical doc is confirmed untouched, the constraint count is correctly cited rather than recomputed, no gas figure was fabricated, and the sample standard-deviation divisor (n-1=18) is correct in the source.

---

*Verified: 2026-06-18T22:40:00Z*
*Verifier: Claude (gsd-verifier)*
