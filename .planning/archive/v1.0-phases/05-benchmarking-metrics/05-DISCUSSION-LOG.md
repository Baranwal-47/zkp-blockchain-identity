# Phase 5: Benchmarking & Metrics - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-18
**Phase:** 5-Benchmarking & Metrics
**Areas discussed:** Timing strategy, On-chain bench methodology, Metrics doc placement, QR payload size

---

## Timing strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Shared timing helper, replace existing | Migrate every existing console.time/timeEnd call site to one shared helper, plus add it for nonce issue/check | ✓ (Claude's recommendation, user deferred) |
| Shared helper, only fill gaps | Leave existing call sites alone, only add the helper for nonce ops | |

**User's choice:** Deferred to Claude's judgment ("its upto u whatever u recommend").
**Notes:** Chose full migration because PERF-01's literal wording ("via the shared timing helper", "prints elapsed seconds") isn't satisfied by raw-ms console.time calls left in place. Diff is small (5 call sites).

---

## On-chain bench

| Option | Description | Selected |
|--------|-------------|----------|
| Full n>=19 live Sepolia calls | Same statistically rigorous loop as off-chain ops, against live Sepolia | ✓ |
| Smaller live sample + caveat note | Run ~5 live calls, note network-bound caveat | |

**User's choice:** Full n>=19 live Sepolia calls.
**Notes:** No methodology exception for on-chain — slower network-bound timing is itself a reportable characteristic.

---

## Metrics doc

| Option | Description | Selected |
|--------|-------------|----------|
| Append new dated section to same file | Add to existing docs/current/research/PERFORMANCE_METRICS.md | |
| New standalone file for this milestone | Fresh file scoped to E1+E2 rebuild, old baseline file untouched | ✓ |

**User's choice:** New standalone file.
**Notes:** Resolved as `docs/current/research/PERFORMANCE_METRICS_E1E2.md`. Constraint count (7891, already verified in Phase 3) is cited from its existing source, not recomputed.

---

## QR payload size

| Option | Description | Selected |
|--------|-------------|----------|
| Synthetic measurement from new shape | JSON.stringify({proof, publicSignals}) computed directly in bench.js, independent of mobile UI | ✓ |
| Something else | User-specified alternative | |

**User's choice:** Synthetic measurement from new shape.
**Notes:** digital-app/screens/ShowProof.js still references the pre-rebuild branch/phoneNo shape and is out of scope for this milestone — measurement does not depend on it.

---

## Claude's Discretion

- Timing strategy (full migration vs gap-fill only) — resolved in favor of full migration, see above.
- Exact bench.js invocation method (npm script vs node bench.js) and whether results also persist to a file.
- Whether nonce issue/check are benchmarked via direct function calls vs live HTTP endpoints.
- Whether the on-chain verify loop reuses one proof across all 20 calls or generates fresh ones each time.

## Deferred Ideas

- AES-GCM/ECIES/Shamir/Gnosis-Safe timing instrumentation (blueprint §10.2) — E3/E5/E6, v2 milestone.
- Gas re-measurement for issueCredential/revokeCredential and Safe-wrapped equivalents (blueprint §10.4) — tied to E5, v2 milestone.
- Updating digital-app/screens/ShowProof.js to the new field shape — would be its own UI phase if the mobile app is revisited.
