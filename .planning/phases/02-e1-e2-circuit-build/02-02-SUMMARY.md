---
phase: 02-e1-e2-circuit-build
plan: 02
subsystem: testing
tags: [circom, snarkjs, mocha, poseidon, merkle, zk-snark, parity-test, replay-protection]

# Dependency graph
requires:
  - phase: 02-e1-e2-circuit-build (plan 01)
    provides: "Compiled identity.circom (build/identity.r1cs, build/identity.sym, build/identity_js/identity.wasm), verified public-signal order [0]pubHash,[1]nonce,[2]currentDateInt,[3]isOver18,[4]isPostgrad,[5..11]revealedValue,[12..18]revealMask"
provides:
  - "zk-proofs/test/circuitParity.test.js: witness-level D-14 parity gate against IDENTITY_SPEC.md section 9 vectors (incl. both mandatory multi-chunk cases) + REPL-02 witness-level nonce-binding test"
  - "CIRCUIT FROZEN sign-off — identity.circom must not be edited without a full Phase-3 trusted-setup redo"
affects: [phase-3-trusted-setup, phase-4-zkp-backend]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Witness-level parity testing: drive snarkjs.wtns.calculate against the compiled wasm directly (zero new deps) instead of full Groth16 proving, when no zkey/ptau exists yet — sufficient to validate circuit Merkle math against a JS oracle pre-trusted-setup."
    - "Cross-package ESM oracle import from a CommonJS test file via dynamic import() — avoids duplicating identityCommitment.js logic."
    - "Witness public-signal indices are offset by +1 from the blueprint's documented signal numbering, because witness index 0 is always the constant-1 wire (signal [0]=pubHash lives at witness index 1, etc.) — verified directly against build/identity.sym."

key-files:
  created:
    - zk-proofs/test/circuitParity.test.js
  modified: []

key-decisions:
  - "Oracle obtained via dynamic import() of identityCommitment.js (ESM) from the CommonJS test file — confirmed working, no local duplication needed."
  - "REPL-02 verified at the witness level only (nonce A binds A, not B in the public-signal vector) — the full groth16.verify nonce-swap assertion is explicitly deferred to Phase 4 once pot12_final.ptau/zkey exist, per RESEARCH.md risk 8; no dev ptau was generated this phase (not attempted, kept fully in scope of the plan's optional/non-mandatory path)."
  - "Added a negative-control test (deliberate attr swap) proving the parity gate is not vacuous — it asserts the JS oracle root changes when two attrs are swapped, demonstrating the gate would catch a real encoding/ordering bug."

patterns-established:
  - "Freeze sign-off discipline: a circuit is declared FROZEN only after an explicit recorded SUMMARY line, gated on 100% green parity + nonce tests — not implicit completion."

requirements-completed: [REPL-02]

# Metrics
duration: 25min
completed: 2026-06-17
---

# Phase 2 Plan 2: Witness-Level Circuit Parity Gate + Nonce-Rejection Test Summary

**Built the D-14 freeze-precondition test (`zk-proofs/test/circuitParity.test.js`) proving the compiled identity.circom circuit's witness pubHash matches identityCommitment.js's computeMerkleRoot byte-for-byte across all IDENTITY_SPEC.md section 9 vectors (including both mandatory multi-chunk cases), plus a witness-level REPL-02 nonce-binding test — all 6 assertions pass, and the circuit is now signed off as FROZEN for Phase 3.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-06-17T14:50:00Z (approx, plan load)
- **Completed:** 2026-06-17T15:03:28Z
- **Tasks:** 2 completed
- **Files modified:** 1 (new test file)

## Accomplishments
- Created `zk-proofs/test/circuitParity.test.js` (CommonJS mocha test, matching `Registry.js`'s shape, run via `npx hardhat test test/circuitParity.test.js`)
- D-14 parity gate: 3 `it()` cases (single-chunk set, 37-byte name multi-chunk, 40-byte email multi-chunk) each compute a circuit witness via `snarkjs.wtns.calculate` against `build/identity_js/identity.wasm` and assert the witness `pubHash` (witness index 1, signal [0]) equals `identityCommitment.js::computeMerkleRoot` for the same `attr[]`/`salt[]` inputs — all 3 pass
- Named zero-padding-leaf sanity assertion: `identityCommitment.js::computeLeaf(0,0)` matches IDENTITY_SPEC.md section 9's `Poseidon(2)(0,0)` constant exactly
- Negative-control sanity test: swapping `attr[0]`/`attr[1]` produces a different JS oracle root than the unswapped input, proving the parity gate is not vacuous
- REPL-02 nonce-rejection test: a witness generated for `nonce=A` binds `A` (not a different `B`) at its public nonce signal (witness index 2, signal [1]) — the strongest no-ptau check available this phase; full `groth16.verify` nonce-swap assertion explicitly deferred to Phase 4 (comment in test file)
- All 6 mocha assertions pass: `6 passing (1s)`
- **CIRCUIT FROZEN** — `zk-proofs/circuits/identity.circom` must not be edited; any change forces a full Phase-3 Groth16 trusted-setup redo and `IdentityVerifier.sol` redeploy
- Carried-forward Phase-3 prerequisite restated: `build/pot12_final.ptau` is still missing from the repo and must be obtained before the trusted setup can run

## Task Commits

1. **Task 1 + Task 2 (combined — single new test file): parity gate + nonce-rejection test** - `e5bb777` (test)

**Plan metadata:** committed separately by this SUMMARY's own commit (worktree mode — STATE.md/ROADMAP.md updates deferred to orchestrator)

## Files Created/Modified
- `zk-proofs/test/circuitParity.test.js` - New file: D-14 witness-level parity gate (3 vector cases + zero-pad sanity + negative control) and REPL-02 witness-level nonce-binding test, 6 `it()` assertions total, all passing

## Decisions Made
- Combined Task 1 (parity gate) and Task 2 (nonce-rejection test) into a single commit because both were authored together in one new file (`circuitParity.test.js`) — splitting would have required partial-file staging with no benefit; the commit message documents both tasks explicitly.
- Used dynamic `import("../../privdId_admin/backend/utils/identityCommitment.js")` from the CommonJS test file to reach the ESM oracle — confirmed working on first attempt, no local duplication needed.
- Did not attempt the plan's *optional* local dev-ptau + full `groth16.verify` nonce-swap path — the witness-level REPL-02 check fully satisfies the plan's acceptance criteria, and generating even a throwaway dev ptau was unnecessary scope for this gate.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `zk-proofs/build/` and `zk-proofs/node_modules` absent in this fresh worktree**
- **Found during:** Task 1, before first test run
- **Issue:** `build/identity.r1cs`/`.sym`/`identity_js/identity.wasm` (the witness source for this plan) did not exist in this worktree — plan 02-01's compiled artifacts are gitignored and were only produced in that plan's own worktree, not persisted to this one. `zk-proofs/node_modules` was also absent (gitignored, same root cause as 02-01's deviation #3).
- **Fix:** Verified `zk-proofs/package-lock.json` is byte-identical between the main repo checkout and this worktree, then symlinked `zk-proofs/node_modules -> /home/chetan/digital_id_app/zk-proofs/node_modules` (same pattern as 02-01). Recompiled the circuit via `node_modules/.bin/circom2 circuits/identity.circom --r1cs --wasm --sym -o build/ -l circomlib/circuits`, confirming the exact same constraint count (3706 non-linear + 4119 linear = 7825 total) and public-signal order recorded in 02-01-SUMMARY.md (verified via `build/identity.sym`).
- **Files modified:** none tracked (build/ and node_modules are both gitignored; build/ regenerated locally, node_modules symlinked, neither staged)
- **Verification:** `npx snarkjs r1cs info build/identity.r1cs` reports identical wire/constraint/public-signal counts to 02-01-SUMMARY.md; `build/identity.sym` lines 1-19 confirm the exact frozen positional order.
- **Committed in:** not committed (gitignored, regenerated/symlinked locally for this worktree's lifetime, consistent with 02-01's precedent)

**2. [Rule 3 - Blocking] `privdId_admin/backend/node_modules` absent in this worktree**
- **Found during:** Task 1, first test run (`Cannot find package 'circomlibjs'` from the dynamically-imported oracle module)
- **Issue:** `identityCommitment.js`'s dynamic import resolves `circomlibjs` relative to `privdId_admin/backend/`, whose `node_modules` was also absent in this gitignored-fresh worktree.
- **Fix:** Verified `privdId_admin/backend/package-lock.json` is byte-identical between the main repo and this worktree, then symlinked `privdId_admin/backend/node_modules -> /home/chetan/digital_id_app/privdId_admin/backend/node_modules` (same lockfile-verified-identical pattern, no new package installed).
- **Files modified:** none tracked (gitignored symlink, not staged)
- **Verification:** `import(...)`'s `computeMerkleRoot`/`computeLeaf` resolve and execute correctly; all parity assertions pass.
- **Committed in:** not committed (gitignored, untracked local symlink)

**3. [Rule 3 - Blocking] Hardhat config requires `SEPOLIA_RPC_URL`/`PRIVATE_KEY` env vars not present in this worktree**
- **Found during:** Task 1, first test invocation (`HH8` config validation error before any test ran)
- **Issue:** `zk-proofs/hardhat.config.js` validates `networks.sepolia.url`/`accounts` eagerly at config-load time even though this test suite never touches the sepolia network. The real `.env` (with actual secrets) exists in the main repo checkout but was correctly NOT present in this worktree (gitignored) and was NOT copied in, to avoid introducing secrets into the worktree.
- **Fix:** Supplied placeholder, non-secret env vars (`SEPOLIA_RPC_URL=http://localhost:8545`, a dummy 32-byte hex `PRIVATE_KEY`) inline on the test-invocation command line only — sufficient to satisfy Hardhat's config-shape validation without touching any real credential. Not written to any file; not persisted beyond the shell invocation.
- **Files modified:** none
- **Verification:** `npx hardhat test test/circuitParity.test.js` proceeds past config validation and all 6 assertions pass.
- **Committed in:** not committed (no file changes; ephemeral env vars on the test command only)

---

**Total deviations:** 3 auto-fixed (all Rule 3 — blocking, none architectural). All three are environment/tooling gaps inherent to fresh gitignored worktrees, consistent with and extending the exact pattern already documented in plan 02-01's SUMMARY. No scope creep; no plan logic was altered.
**Impact on plan:** All three fixes were necessary just to run the test suite at all in this worktree; none change what the test asserts or how the circuit/oracle behave.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
None — no external service configuration required. `pot12_final.ptau` remains a known, expected-missing Phase-3 prerequisite (not an action item for this plan); it is required only for `groth16 setup`, which this plan explicitly does not run.

## CIRCUIT FROZEN

**CIRCUIT FROZEN — do not edit `zk-proofs/circuits/identity.circom`; any change forces a Phase-3 trusted-setup redo.**

Sign-off basis:
- D-14 witness-level parity gate green: all 3 IDENTITY_SPEC.md section 9 vector cases pass, including both mandatory multi-chunk vectors (37-byte name "Rajesh Kumar Sharma Gupta Verma Singh" maxChunks=4, and 40-byte email "utkarshbaranwal47@students.iiitdmj.ac.in" maxChunks=2)
- Zero-padding leaf sanity assertion confirmed: `Poseidon(2)(0,0) = 14744269619966411208579211824598458697587494354926760081771325075741142829156`
- Negative-control test confirms the gate is non-vacuous (would catch a real attr-ordering bug)
- REPL-02 nonce-binding confirmed at the witness level (nonce A binds A, not B)
- All 6 mocha assertions green: `npx hardhat test test/circuitParity.test.js` → `6 passing`

**Carried-forward Phase-3 prerequisite:** `build/pot12_final.ptau` is still missing from the repo (not committed, not downloaded) and must be obtained before the trusted setup (`npx snarkjs groth16 setup ...`) can run. This was already known going into Phase 2 (RESEARCH.md risk 8) and remains unchanged by this plan.

## Next Phase Readiness
- The circuit is frozen; Phase 3 (trusted setup) can proceed once `pot12_final.ptau` is obtained.
- Phase 3 should reuse the exact public-signal order verified in 02-01-SUMMARY.md and re-confirmed here via `build/identity.sym`: `[0]pubHash,[1]nonce,[2]currentDateInt,[3]isOver18,[4]isPostgrad,[5..11]revealedValue,[12..18]revealMask`.
- No blockers identified for Phase 3 beyond the already-known missing ptau.

---
*Phase: 02-e1-e2-circuit-build*
*Completed: 2026-06-17*
