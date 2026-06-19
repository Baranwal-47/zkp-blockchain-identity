# Phase 5: Benchmarking & Metrics - Context

**Gathered:** 2026-06-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Instrument every new E1+E2 crypto operation to print elapsed seconds via one shared timing helper, write a benchmark script that loops each op N=20 (drop warm-up, report mean ± σ over n≥19), and record the results as a research deliverable in a new PERFORMANCE_METRICS doc. This is the final phase of the milestone — no new crypto/circuit/backend code, only instrumentation, measurement, and reporting on what Phases 1-4 already built.

**In scope (per blueprint §10.2 / PERF-02), six measured operations:**
1. Merkle root build time (`computeMerkleRoot` in `identityCommitment.js`)
2. Proof generation (`POST /generate-proof`, new E1+E2 circuit)
3. Off-chain verify (`POST /verify`, `groth16.verify`)
4. On-chain verify (`POST /verify-onchain`, live Sepolia view call)
5. Nonce issue (`POST /session/nonce`)
6. Nonce check (verify-time `validateAndConsume`)

Plus two static facts to record (not timed loops): circuit constraint count (already captured — see below) and QR payload size in bytes.

**Out of scope:** AES-GCM/ECIES/Shamir/Gnosis-Safe timings and gas re-measurement for Safe-wrapped registry ops (blueprint §10.2/§10.4) — those belong to E3/E5/E6, deferred to v2. Do not pull them into this phase. No mobile-app (digital-app) code changes — its QR screen still references the pre-rebuild field shape and updating it is out of scope for this milestone.

</domain>

<decisions>
## Implementation Decisions

### Timing helper (PERF-01)
- **D-15:** One shared `timed(label, fn)` helper (per blueprint §10.1 — `performance.now()` delta, prints `[perf] {label}: {seconds.toFixed(3)} s`) is added and **every existing ad-hoc `console.time`/`console.timeEnd` call site is migrated to use it**: `ProofGeneration`, `OffChainVerification`, `OnChainVerification` in `zkp-backend/server.js`, and `computeMerkleRoot` in `privdId_admin/backend/utils/identityCommitment.js`. New timing is added (not migrated, since none exists) for nonce issue (`POST /session/nonce`) and nonce check (`validateAndConsume`).
  - Rationale: PERF-01 says ops print elapsed **seconds** "via the shared timing helper" — existing call sites print raw ms with no aggregation, so they don't satisfy the requirement as written. The diff is small (5 call sites) and gives one consistent instrumentation path for `bench.js` to drive.
- Helper file: `zkp-backend/utils/timing.js`, matching blueprint §10.1 exactly (`timed(label, fn)` returns `{ out, seconds }`).
- The Merkle-root timing in `identityCommitment.js` (a different service, `privdId_admin/backend`) gets its own local copy of the same helper shape (not a cross-service import) — same console output format, no new dependency between services.

### Benchmark script (PERF-01)
- **D-16:** `bench.js` lives in `zkp-backend/` (not `zk-proofs/scripts/`), since zkp-backend already self-contains everything needed to drive all 6 measured ops (`lib/encoding.js`'s own `computeMerkleRoot`-equivalent, `lib/witnessBuilder.js`, the live Express endpoints, `lib/nonceStore.js`) — no cross-service wiring required.
- Loop each op **N=20**, drop the first (warm-up) run, compute mean and sample stddev over the remaining n=19, print a results table in seconds (format per blueprint §10.3 example: `proof_gen: mean 1.42 s ± 0.08 s (n=19)`).

### On-chain verify benchmarking
- **D-17:** On-chain verify gets the **full N=20 / n=19 live-Sepolia treatment**, same as every other op — no reduced sample size, no methodology exception. Accept that this loop is slower (network-bound) than the off-chain loops; that's a real, reportable characteristic of on-chain verification, not noise to work around.

### Metrics doc placement (PERF-02)
- **D-18 (revised 2026-06-18):** Write a **new standalone file**, `docs/improvement/PERFORMANCE_METRICS_E1E2.md` (not `docs/current/research/` — that directory's `PERFORMANCE_METRICS.md` stays untouched as the existing/historical record). Scope: this milestone's six measured ops + constraint count + QR payload size, **plus any other research-paper-relevant number that falls out of this phase's work for free** (e.g. proof size in bytes, public-signal count, verifier gas cost if already on record from the Phase 3 deploy, end-to-end issue-nonce→proof→verify latency) — this doc feeds the team's research paper, so capture any real number already at hand rather than narrowly six rows. Do not invent new measurement surfaces to chase this — only record numbers that are already produced as a side effect of `bench.js` or already on record from prior phases.
  - Carry the constraint count forward from Phase 3's already-verified number (**7891 total constraints**, recorded in `.planning/phases/03-trusted-setup-redeploy/CEREMONY_LOG.md` and `docs/current/research/PERFORMANCE_METRICS.md`) — do not recompute via `snarkjs r1cs info`, just cite the frozen figure with its source.

### QR payload size (PERF-02)
- **D-19:** Measure synthetically: `JSON.stringify({ proof, publicSignals })` byte length using a real generated proof against the new 19-signal shape, computed directly in `bench.js` or a small companion script. Independent of `digital-app/screens/ShowProof.js` (which still references the pre-rebuild `branch`/`phoneNo` shape and is not touched this milestone).

### Claude's Discretion
- Exact `bench.js` invocation (`npm run bench` vs `node bench.js`) and whether results also get written to a file vs console-table-only — pick whichever is simplest to wire into `package.json`.
- Whether nonce issue/check are benchmarked via direct function calls to `lib/nonceStore.js` or through the live HTTP endpoints — direct calls avoid HTTP overhead skewing a sub-millisecond operation, but either satisfies PERF-01/02 as long as the label is honest about what was measured.
- Whether the on-chain verify loop reuses one funded proof across all 20 calls or generates a fresh proof per call — reusing one proof is fine since `verify-onchain` is a stateless view call with no nonce consumption on-chain.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spec (single source of truth)
- `docs/CLAUDE_CODE_BLUEPRINT.md` §10 — full benchmarking spec: §10.1 exact `timed()` helper code, §10.2 what to measure, §10.3 bench script N=20/mean±σ format and example output line, §10.4 gas measurement (explicitly out of scope here — E5-tied)
- `docs/CLAUDE_CODE_BLUEPRINT.md` §3 — frozen public-signal order (needed to build a real `{proof, publicSignals}` payload for the QR-size measurement)

### Existing instrumentation to migrate (exact files/lines confirmed)
- `zkp-backend/server.js:105,112` — `console.time/timeEnd('ProofGeneration')`
- `zkp-backend/server.js:139,141` — `console.time/timeEnd('OffChainVerification')`
- `zkp-backend/server.js:185,188` — `console.time/timeEnd('OnChainVerification')`
- `privdId_admin/backend/utils/identityCommitment.js:183,217` — `console.time/timeEnd('computeMerkleRoot')`
- `zkp-backend/server.js:124-126` — `POST /session/nonce` (`issueNonce()`, no timing yet)
- `zkp-backend/server.js:147-149,194-196` — `validateAndConsume()` call sites at verify-time (no timing yet)

### Source of the already-frozen constraint count (do not recompute)
- `.planning/phases/03-trusted-setup-redeploy/CEREMONY_LOG.md` and `03-01-SUMMARY.md` — **7891 total constraints** (3770 non-linear + 4121 linear), verified via `snarkjs zkey verify` ("ZKey Ok!")
- `docs/current/research/PERFORMANCE_METRICS.md` — existing Phase-3 dated entry citing the same count (existing file; do not edit further, new doc goes in `docs/improvement/` per D-18)

### zkp-backend self-contained building blocks for bench.js
- `zkp-backend/lib/encoding.js` — `hashToField`/`CHUNK_COUNTS`, copied verbatim from `identityCommitment.js`
- `zkp-backend/lib/witnessBuilder.js` — builds circuit witness input from attrs/salts/reveal/nonce
- `zkp-backend/lib/nonceStore.js` — `issueNonce()`, `validateAndConsume()`
- `zkp-backend/server.js` — live Express endpoints if HTTP-level measurement is chosen over direct function calls

### Stale code confirmed out of scope
- `digital-app/screens/ShowProof.js:82-93` — still builds QR JSON with `phoneNo`/`branch` keys from the pre-rebuild shape; not touched this phase

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- All 6 measured ops already exist and work end-to-end (confirmed via the just-completed Phase 4 on-chain test run: `ProofGeneration: ~420-600ms`, `OffChainVerification: ~6-17ms`, `OnChainVerification: ~470-495ms` observed live against Sepolia in this session) — Phase 5 adds rigor (n≥19, mean±σ) and a standard helper, it does not build new measurement surfaces.
- `zkp-backend/test/verifyFlow.test.js`'s `TEST_FIXTURE_REGISTERED_ONCHAIN=true` gate (now passing, fixture re-issued on-chain this session under rollNo `22BCSD01`) means `bench.js` can hit a live, registered credential on Sepolia without any new on-chain setup.

### Established Patterns
- zkp-backend is CommonJS (`require`), Express; `privdId_admin/backend` is ESM — the timing helper needs two small copies (one per module system), not a shared cross-service import.

### Integration Points
- `bench.js` is the final new artifact this milestone produces; nothing downstream consumes it further (no Phase 6 in this milestone's roadmap).

</code_context>

<specifics>
## Specific Ideas

- User deferred the timing-helper migration choice to Claude's judgment; resolved in favor of full migration (D-15) because PERF-01's literal wording ("via the shared timing helper", "prints elapsed seconds") isn't satisfied by leaving raw-ms `console.time` calls in place.
- User was explicit and decisive on the other three: full n≥19 on-chain (no shortcut), a clean new metrics file rather than mixing into the old baseline doc, and a synthetic (not mobile-UI-dependent) QR size measurement.

</specifics>

<deferred>
## Deferred Ideas

- AES-GCM/ECIES/Shamir/Gnosis-Safe timing instrumentation (blueprint §10.2) — E3/E5/E6, v2 milestone.
- Gas re-measurement for `issueCredential`/`revokeCredential` and their Safe-wrapped equivalents (blueprint §10.4) — tied to E5, v2 milestone.
- Updating `digital-app/screens/ShowProof.js` to the new field shape — separate from this phase's measurement goal; would be its own UI phase if/when the mobile app is revisited.

None of the above were pulled into Phase 5 scope.

</deferred>

---

*Phase: 5-Benchmarking & Metrics*
*Context gathered: 2026-06-18*
