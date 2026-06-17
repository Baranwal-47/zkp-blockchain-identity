---
phase: 02-e1-e2-circuit-build
plan: 01
subsystem: zk-circuit
tags: [circom, circom2, snarkjs, poseidon, merkle, zk-snark, selective-disclosure]

# Dependency graph
requires:
  - phase: 01-freeze-spec-field-set-consistency
    provides: IDENTITY_SPEC.md frozen leaf layout, hash-to-field algorithm, Merkle construction, enum codes (POSTGRAD_CODES = {4,5,6})
provides:
  - "Rebuilt zk-proofs/circuits/identity.circom: depth-3 salted-leaf Merkle commitment, in-circuit selective disclosure, isOver18/isPostgrad predicates, nonce binding"
  - "Compiled build/identity.r1cs, build/identity.sym, build/identity_js/identity.wasm (regenerated via circom2, gitignored/regenerable, not committed)"
  - "Verified public-signal order matching blueprint section 3 exactly: [0]pubHash,[1]nonce,[2]currentDateInt,[3]isOver18,[4]isPostgrad,[5..11]revealedValue,[12..18]revealMask"
  - "Constraint count recorded in docs/current/research/PERFORMANCE_METRICS.md: 7825 constraints (3706 non-linear + 4119 linear)"
affects: [02-02-witness-parity-freeze, phase-3-trusted-setup, phase-4-zkp-backend]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "circom signal-output vs public-signal-input ordering: circom emits ALL signal outputs (declaration order) before ALL public signal inputs (declaration order) on a component's public signal list — outputs and public inputs cannot be interleaved positionally. To force a derived/computed value into a specific public-signal index position relative to other public inputs, declare it as a public `signal input` and constrain it equal (`===`) to the in-circuit-computed value, rather than declaring it `signal output`."
    - "Zero-padding Merkle leaf wired as an actual Poseidon(2)(0,0) component rather than a hardcoded 77-digit decimal constant, to eliminate transcription-error risk."
    - "Selective disclosure circuit-enforces the hidden-value-never-leaks guarantee via (1 - revealMask[i]) * revealedValue[i] === 0, not just witness-builder discipline."

key-files:
  created:
    - docs/current/research/PERFORMANCE_METRICS.md
  modified:
    - zk-proofs/circuits/identity.circom

key-decisions:
  - "isOver18/isPostgrad declared as public signal inputs (constrained via === to internally computed predicates) rather than signal outputs, because circom's outputs-before-inputs grouping rule made the blueprint's required interleaved public-signal order [pubHash, nonce, currentDateInt, isOver18, isPostgrad, ...] unreachable with them as outputs."
  - "Leaf hashing for attr[0..6] explicitly unrolled into 7 separate Poseidon(2) component declarations instead of a circom for-loop, so the Task 1 acceptance check (counting literal Poseidon(2) instantiations in source) reflects the true component count."
  - "Used circom2 directly (node_modules/.bin/circom2 with -l circomlib/circuits) instead of npx hardhat circom, since hardhat-circom's circom task requires the missing pot12_final.ptau even for r1cs/wasm/sym-only generation."
  - "Symlinked zk-proofs/node_modules into the worktree from the main repo checkout (package-lock.json verified identical) instead of running npm install, since node_modules is gitignored and absent in fresh worktrees."

patterns-established:
  - "Public-signal ordering for circuits with multiple computed/public values: model derived public values as constrained public inputs, not outputs, whenever they must be positioned among other public inputs in the signal list."

requirements-completed: [CIRC-01, CIRC-02, CIRC-03, CIRC-04, CIRC-05, REPL-01]

# Metrics
duration: 30min
completed: 2026-06-17
---

# Phase 2 Plan 1: E1+E2 Circuit Rewrite Summary

**Rewrote identity.circom from a flat Poseidon(5) hash into a depth-3 salted-leaf Merkle circuit with in-circuit selective disclosure, isOver18/isPostgrad predicates, and nonce binding, compiled via circom2 with the public-signal order verified bit-for-bit against the frozen blueprint spec.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-06-17T04:44:00Z (approx, plan load)
- **Completed:** 2026-06-17T05:14:07Z
- **Tasks:** 2 completed
- **Files modified:** 2 (1 circuit rewrite, 1 new metrics doc)

## Accomplishments
- Rebuilt `zk-proofs/circuits/identity.circom` end-to-end: 7 salted leaves + 1 zero-pad leaf, depth-3 Merkle tree (left=lower-index always), in-circuit selective disclosure with circuit-enforced hidden-value zeroing, isOver18 (YYYYMMDD digit-shift age threshold), isPostgrad (set-membership {4,5,6}), and nonce-binding (`nonceSq <== nonce*nonce`)
- Compiled cleanly via circom2 ("Everything went okay"), producing `build/identity.r1cs`, `build/identity.sym`, `build/identity_js/identity.wasm`
- Verified the emitted public-signal order via `build/identity.sym` matches blueprint section 3 exactly: `[0]pubHash,[1]nonce,[2]currentDateInt,[3]isOver18,[4]isPostgrad,[5..11]revealedValue[0..6],[12..18]revealMask[0..6]`
- Recorded the constraint count (7825 total: 3706 non-linear + 4119 linear) in a newly created `docs/current/research/PERFORMANCE_METRICS.md`

## Task Commits

1. **Task 1: Rewrite identity.circom — Merkle, disclosure, predicates, nonce** - `51c6da5` (feat)
2. **Task 2: Compile with circom2, verify public-signal order, record constraint count** - `662c302` (feat — includes the public-signal-ordering fix discovered during this task's verification step)

**Plan metadata:** committed separately by this SUMMARY's own commit (worktree mode — STATE.md/ROADMAP.md updates deferred to orchestrator)

## Files Created/Modified
- `zk-proofs/circuits/identity.circom` - Full rewrite: Merkle commitment, selective disclosure, age/postgrad predicates, nonce binding; isOver18/isPostgrad declared as constrained public inputs (see Deviations) to satisfy the frozen public-signal order
- `docs/current/research/PERFORMANCE_METRICS.md` - New file; records the Phase 2 circuit's constraint count (7825) and other r1cs info fields

## Decisions Made
- isOver18/isPostgrad modeled as public signal inputs constrained via `===` to internally-computed predicate values, rather than `signal output` — this is the only way to interleave them positionally between the nonce/currentDateInt and revealedValue/revealMask public inputs, since circom always groups all outputs before all public inputs in the emitted public-signal list (see Deviations for full detail).
- Leaf hashers (attr[0..6]) explicitly unrolled as 7 distinct `Poseidon(2)` component declarations rather than a `for` loop, so the plan's literal grep-based Poseidon(2) instantiation count check passes meaningfully (a for-loop body appears once in source text regardless of its runtime unroll count).
- Compiled via standalone `circom2` binary (not `npx hardhat circom`), per the plan's explicit guidance, since hardhat-circom's task fails on the missing `pot12_final.ptau` even though r1cs/wasm/sym generation doesn't need it.
- Symlinked `zk-proofs/node_modules` from the main repo checkout into the worktree (verified `package-lock.json` is byte-identical between the two) instead of running `npm install` in the worktree, avoiding any new package installs in an isolated execution context.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Required public-signal order is unreachable with isOver18/isPostgrad as `signal output`**
- **Found during:** Task 2 (compile + verify public-signal order)
- **Issue:** The plan's Task 1 action specified declaring `isOver18`/`isPostgrad` as `signal output` while requiring the emitted public-signal order to be `[0]pubHash,[1]nonce,[2]currentDateInt,[3]isOver18,[4]isPostgrad,[5..11]revealedValue,[12..18]revealMask`. After the first compile, `build/identity.sym` showed the actual emitted order was `pubHash, isOver18, isPostgrad, nonce, currentDateInt, revealedValue[...], revealMask[...]` — circom groups ALL `signal output`s first (in declaration order), then ALL public `signal input`s (in declaration order); outputs and public inputs cannot be interleaved in the emitted list regardless of source declaration order. With pubHash, isOver18, and isPostgrad all declared as outputs, they would always be grouped together at positions [0..2], making the required `[1]nonce,[2]currentDateInt` before `[3]isOver18,[4]isPostgrad` order structurally impossible.
- **Fix:** Declared `isOver18` and `isPostgrad` as public `signal input`s instead of `signal output`s. The circuit still computes both predicates internally (via `GreaterEqThan(32)` and the `IsEqual` sum, respectively) and now constrains the public input to equal the computed value via `===` (e.g. `isOver18 === ageCheck.out;`). A malicious prover cannot supply an incorrect isOver18/isPostgrad value because the equality constraint fails witness generation. `pubHash` remains the sole `signal output`, so it alone occupies position [0]. Recompiled and confirmed via `build/identity.sym` that the order now matches blueprint section 3 exactly.
- **Files modified:** `zk-proofs/circuits/identity.circom`
- **Verification:** `snarkjs r1cs info build/identity.r1cs` now reports 1 public output, 18 public inputs, 14 private inputs (was 3/16/14 before the fix); `build/identity.sym` lines 1-19 confirm the exact required positional order.
- **Committed in:** `662c302` (Task 2 commit)

**2. [Rule 3 - Blocking] PERFORMANCE_METRICS.md did not exist**
- **Found during:** Task 2 (record constraint count)
- **Issue:** The plan's `files_modified` frontmatter lists `docs/current/research/PERFORMANCE_METRICS.md` as a file to modify, but the file did not exist anywhere in the repo (`docs/current/research/` only contained `IDENTITY_SPEC.md`).
- **Fix:** Created `docs/current/research/PERFORMANCE_METRICS.md` with a header structure and the required dated constraint-count entry, following the project's "measure everything, print/record concretely" convention (CLAUDE.md ground rule 5).
- **Files modified:** `docs/current/research/PERFORMANCE_METRICS.md` (new)
- **Verification:** File exists and contains the dated `nConstraints` line; `git status` confirmed it as a new file before staging.
- **Committed in:** `662c302` (Task 2 commit)

**3. [Rule 3 - Blocking] zk-proofs/node_modules absent in the worktree**
- **Found during:** Task 2 (before first compile attempt)
- **Issue:** `node_modules/` is gitignored repo-wide; the worktree checkout (a separate working directory from the main repo) had no `node_modules` at all, so `node_modules/.bin/circom2` and `node_modules/.bin/snarkjs` referenced by the plan's exact verification commands did not exist.
- **Fix:** Verified `zk-proofs/package-lock.json` is byte-identical between the main repo and the worktree, then created a symlink `zk-proofs/node_modules -> /home/chetan/digital_id_app/zk-proofs/node_modules` rather than running `npm install` (which would count as a new package-manager install requiring the Rule 3 package-legitimacy exclusion path, even though no new package was actually being added — it's the exact same lockfile-resolved tree already vetted in the main checkout).
- **Files modified:** none tracked (symlink is gitignored, shows as untracked in `git status`, intentionally not staged)
- **Verification:** `node_modules/.bin/circom2`, `node_modules/.bin/snarkjs` resolve and execute correctly from within `zk-proofs/`.
- **Committed in:** not committed (gitignored, left as an untracked local symlink for this worktree's lifetime)

---

**Total deviations:** 3 auto-fixed (1 Rule 1 bug, 2 Rule 3 blocking)
**Impact on plan:** All three fixes were necessary to complete the plan's stated acceptance criteria — none represent scope creep. Deviation #1 is the most significant: it preserves the functionally critical requirement (exact positional public-signal order for Phase 3/4 to index against) by using the correct circom idiom, at the cost of changing isOver18/isPostgrad from `signal output` to a constrained public `signal input` — a purely mechanical circom-syntax difference with no change to what the circuit actually proves or what a verifier checks.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
None - no external service configuration required. `pot12_final.ptau` remains a known, expected-missing Phase-3 prerequisite (not an action item for this plan); it is required only for `groth16 setup`, which this plan explicitly does not run.

## Next Phase Readiness
- The circuit is compiled and its public-signal order is verified against the blueprint, ready for plan 02-02's witness-level parity test (D-14) against `identityCommitment.js`'s `computeLeaf`/`computeMerkleRoot` JS oracle, using the exact vectors in `IDENTITY_SPEC.md` section 9.
- Phase 3's trusted setup can proceed once `pot12_final.ptau` is obtained and plan 02-02's parity gate + freeze sign-off pass.
- No blockers identified for 02-02.

---
*Phase: 02-e1-e2-circuit-build*
*Completed: 2026-06-17*
