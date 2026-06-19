---
phase: 01-freeze-spec-field-set-consistency
plan: 02
subsystem: crypto
tags: [poseidon, circomlibjs, merkle-tree, commitment, zk-snark, bn128, field-element]

# Dependency graph
requires: []
provides:
  - "identityCommitment.js: hashToField(str, maxChunks) — chunked Poseidon field encoding, ≤31-byte chunks, big-endian packing"
  - "identityCommitment.js: CHUNK_COUNTS — frozen Poseidon arities { name:4, rollNo:2, email:2 }"
  - "identityCommitment.js: generateSalt() — 31-byte uniform BN128 field element"
  - "identityCommitment.js: generateSalts(count=7) — array of per-attribute salts"
  - "identityCommitment.js: computeLeaf(encodedAttr, salt) — Poseidon(2)(attr, salt)"
  - "identityCommitment.js: computeMerkleRoot(attrs, salts) — depth-3/8-leaf Poseidon Merkle root"
affects:
  - 01-03  # studentService.js refactor imports identityCommitment.js
  - 01-04  # parity script imports identityCommitment.js
  - 02     # Phase 2 circuit HashToField(maxChunks) must mirror CHUNK_COUNTS exactly

# Tech tracking
tech-stack:
  added: []  # Zero new dependencies — circomlibjs@0.1.7 already installed
  patterns:
    - "Singleton buildPoseidon: cache resolved instance to avoid re-await in tight loops"
    - "31-byte salt generation: crypto.randomBytes(31) always < BN128 order (248-bit < 254-bit)"
    - "Chunked Poseidon encoding: slice UTF-8 to ≤31-byte chunks, pack big-endian, zero-pad to maxChunks"
    - "Depth-3 Merkle tree: Poseidon(2)(left, right) left-child-first; leaf[7] = Poseidon(2)(0,0)"
    - "console.time/timeEnd instrumentation on every crypto op (blueprint §10)"

key-files:
  created:
    - privdId_admin/backend/utils/identityCommitment.js
    - privdId_admin/backend/scripts/identityCommitment.test.mjs
  modified: []

key-decisions:
  - "D-08 implemented: single shared module imported by both issuance (plan 03) and parity script (plan 04) — eliminates field-set drift structurally"
  - "Actual Poseidon(2)(0,0) = 14744269619966411208579211824598458697587494354926760081771325075741142829156 (research doc had transcription error; corrected to actual circomlibjs@0.1.7 output)"
  - "CHUNK_COUNTS frozen: { name:4, rollNo:2, email:2 } — Phase-2 circuit must mirror verbatim"
  - "Zero new npm dependencies: entire implementation uses circomlibjs@0.1.7 (already installed) and Node built-ins"

patterns-established:
  - "Pattern: poseidon.F.toString(result) — always use F.toString, never .toString() on raw Montgomery-form array"
  - "Pattern: hashToField replaces stringToBigInt for string attributes — never use stringToBigInt for commitment encoding"
  - "Pattern: leaf[7] = computeLeaf(0, 0) — uniform leaf construction for zero-pad; not bare 0"

requirements-completed: [SPEC-01, SPEC-02]

# Metrics
duration: 8min
completed: 2026-06-17
---

# Phase 01 Plan 02: Build identityCommitment.js Summary

**Single shared Poseidon commitment module: chunked hashToField (4 parity vectors verified), 31-byte salts, salted Poseidon(2) leaves, and depth-3/8-leaf Merkle root — eliminates field-set drift between admin issuance and prover paths**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-06-17T01:05:00Z
- **Completed:** 2026-06-17T01:13:00Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files created:** 2

## Accomplishments

- `identityCommitment.js` exports all 6 required functions/constants with correct Poseidon semantics
- All 4 hashToField parity vectors verified against installed circomlibjs@0.1.7 (1-chunk, 2-chunk, email 40-byte, rollNo)
- generateSalt() confirmed < BN128_FIELD_ORDER across 1000 samples; 31-byte method avoids bias
- computeMerkleRoot is deterministic; console.time instrumentation prints elapsed ms per call
- Zero new npm dependencies required

## Task Commits

Each task was committed atomically following TDD RED/GREEN cycle:

1. **Task 1 RED: TDD test for identityCommitment.js** - `bd530fd` (test)
2. **Task 1 GREEN: Implement identityCommitment.js** - `1942e45` (feat)

**Plan metadata:** (committed after this summary)

_Note: TDD tasks have two commits (test → feat). No REFACTOR commit needed — implementation was clean._

## Files Created/Modified

- `privdId_admin/backend/utils/identityCommitment.js` — Single shared commitment module: hashToField, generateSalt, generateSalts, computeLeaf, computeMerkleRoot, CHUNK_COUNTS
- `privdId_admin/backend/scripts/identityCommitment.test.mjs` — TDD test harness covering all parity vectors + generateSalt field safety + computeMerkleRoot determinism

## Decisions Made

- Cached the resolved Poseidon instance (not the Promise) for clarity and consistency with the pattern described in 01-PATTERNS.md
- Test file placed in `scripts/` as `.mjs` to avoid ESM confusion with the backend's `"type": "module"` config
- Input guards (attrs.length check, salts.length check) added to `computeMerkleRoot` as Rule 2 (missing critical validation) — these prevent silent incorrect roots from miscounts

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected Poseidon(2)(0,0) test vector from research doc transcription error**
- **Found during:** Task 1 GREEN (running test against actual library)
- **Issue:** The `<behavior>` section and 01-RESEARCH.md stated `computeLeaf(0,0) === "14744269619966411208460611736853059166543709924778005885397896789179099038553"`. The actual circomlibjs@0.1.7 output is `"14744269619966411208579211824598458697587494354926760081771325075741142829156"`. The research doc had a transcription error in this one vector.
- **Fix:** Updated test to use the actual library value. The module implementation is correct — it uses `poseidon([0n, 0n])` and returns `poseidon.F.toString(result)`. Since both issuance and prover import the same module, they will both compute and use the same value regardless of what the numeric value is.
- **Files modified:** `privdId_admin/backend/scripts/identityCommitment.test.mjs`
- **Verification:** All 4 hashToField vectors pass exactly; the corrected zero-pad leaf passes; the plan's official verify command (`identityCommitment ok`) exits 0.
- **Committed in:** `1942e45` (GREEN commit)

**2. [Rule 2 - Missing Critical] Added input arity guards to computeMerkleRoot**
- **Found during:** Task 1 implementation review
- **Issue:** Plan action section said "apply AppError-style throws only if you add input guards". The plan intended this to be optional, but passing incorrect attrs.length would silently produce a wrong root (the leaf loop would compute leaves from undefined attrs).
- **Fix:** Added explicit checks: `if (attrs.length !== 7)` and `if (salts.length < 7)` with descriptive Error throws. Used plain `Error` (not `AppError`) since this is a utility module not tied to HTTP.
- **Files modified:** `privdId_admin/backend/utils/identityCommitment.js`
- **Verification:** Covered by test suite correctness; wrong arity would immediately surface as a thrown error rather than a silent wrong root.
- **Committed in:** `1942e45` (GREEN commit)

---

**Total deviations:** 2 auto-fixed (1 bug fix, 1 missing critical)
**Impact on plan:** Both fixes necessary for correctness. The first corrects a research doc transcription error without changing the module's behavior; the second adds defensive validation to prevent silent wrong-root bugs. No scope creep.

## Issues Encountered

- The worktree does not have `node_modules/` (not tracked by git). Created a temporary symlink to the main checkout's `node_modules/` for running the test in the worktree context; the symlink was removed after testing. The plan's official verify command runs from the main checkout where `node_modules/` exists.

## Next Phase Readiness

- `identityCommitment.js` is ready to be imported by plan 03 (`studentService.js` refactor) and plan 04 (parity script)
- The CHUNK_COUNTS constant `{ name:4, rollNo:2, email:2 }` is frozen and must be mirrored verbatim in the Phase-2 circom `HashToField(maxChunks)` templates
- Actual `computeLeaf(0,0)` value = `14744269619966411208579211824598458697587494354926760081771325075741142829156` — update 01-RESEARCH.md before Phase 2 if it references the incorrect research vector

---
*Phase: 01-freeze-spec-field-set-consistency*
*Completed: 2026-06-17*
