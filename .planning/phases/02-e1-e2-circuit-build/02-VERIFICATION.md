---
phase: 02-e1-e2-circuit-build
verified: 2026-06-17T15:29:16Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
---

# Phase 2: E1+E2 Circuit Build Verification Report

**Phase Goal:** A single frozen `identity.circom` computes the depth-3 Merkle root from salted per-attribute leaves, binds selective disclosure, evaluates the age and postgrad predicates, and binds the verifier nonce — built together so the circuit can be frozen exactly once.

**Verified:** 2026-06-17T15:29:16Z
**Status:** passed
**Re-verification:** No — initial verification (note: SUMMARY.md files document the pre-code-review-fix state; this verification checks the current post-fix codebase, including the CR-01/WR-01/WR-02/WR-03 fix commits a6c716e, 1144334, b01f648, 7740a11, per 02-REVIEW.md `status: fixed`)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Circuit computes `leaf_i = Poseidon(2)(attr_i, salt_i)` for 7 attributes + zero-pad leaf, outputs depth-3 Merkle root as `pubHash` (public signal [0]); every committed attribute carries a mandatory salt | VERIFIED | `zk-proofs/circuits/identity.circom:71-146` — 7 explicit `Poseidon(2)` leaf hashers (`leaf0Hasher`..`leaf6Hasher`) each consuming `attr[i]`/`salt[i]`, plus `zeroPad = Poseidon(2)(0,0)` as a real component (not hardcoded constant), combined depth-3 (n01/n23/n45/n67 -> n0123/n4567 -> rootHasher), `pubHash <== rootHasher.out`. `build/identity.sym` line 1 confirms `pubHash` is witness/public signal [0]. `salt[7]` is a mandatory private input array (line 65), consumed by every leaf hasher — no leaf bypasses its salt. Compile succeeds (`circom2 ... Everything went okay`), `snarkjs r1cs info` reports 1 public output (pubHash) matching expectation. |
| 2 | Selective disclosure bound in-circuit: `revealMask_i` boolean, `revealMask_i*(revealedValue_i-attr_i)===0`, hidden attribute never appears in publicSignals | VERIFIED | `identity.circom:154-158` — for loop over 7 attrs: boolean constraint, conditional-equality constraint, and the stronger `(1-revealMask[i])*revealedValue[i]===0` hidden-zeroing constraint. Test file `circuitParity.test.js` "Task 3" positive case confirms disclosed attr[2] surfaces correctly while all other indices remain zeroed in `revealedValue`/`revealMask` witness signals; negative case confirms a mismatched `revealedValue[2]` causes witness generation to reject (constraint fires). Both pass (`13 passing`, run independently below). |
| 3 | `isOver18` computed from `currentDateInt` vs `dobInt` (bound to leaf attr 2): over-18 DOB -> 1, under-18 -> 0; `isPostgrad` is set-membership of `programmeLevel` over {M.Tech, M.Des, PhD} (codes 4,5,6) | VERIFIED | `identity.circom:160-231`. CR-01 fix present: `Num2Bits(32)` range-checks on both `attr[2]` and `currentDateInt` (lines 197-201) before they reach `GreaterEqThan(32)` (lines 203-208), closing the soundness gap the code review flagged. `isPostgrad` is sum of three `IsEqual()` against literals 4/5/6 (lines 214-231), excluding Dual/3 per D-13. Test "Task 4" boundary coverage (added by fix commit b01f648) exercises: under-18 dob rejected when isOver18='1' asserted, exact 18-year boundary accepted as isOver18=1 (inclusive), programmeLevel=4 -> isPostgrad=1, programmeLevel=3 (Dual) -> isPostgrad=0 and rejected when isPostgrad='1' is asserted for it. All pass. |
| 4 | `nonce` forced into constraint system (`nonceSq <== nonce*nonce`), compiler cannot optimize it away; witness/proof for nonce A fails verification against nonce B | VERIFIED | `identity.circom:233-237` — `nonceSq <== nonce * nonce`. Test "Task 2" (strengthened by fix commit 7740a11/WR-03): nonce-A witness binds A not B (positive binding check) AND omitting `nonce` entirely from witness input causes witness generation to fail (`assert.rejects`), proving `nonce` reaches a real, load-bearing constraint rather than being an unconstrained free wire — the prior tautological-only check (WR-03 finding) is now closed. Full `groth16.verify` nonce-swap is explicitly and correctly deferred to Phase 4 (needs zkey/ptau, a documented Phase-3 prerequisite, not a Phase-2 gap). |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `zk-proofs/circuits/identity.circom` | Rebuilt depth-3 Merkle + disclosure + predicate + nonce circuit, `template Identity`, post-fix CR-01 range checks | VERIFIED | 240 lines; contains `template Identity()`, 15 `Poseidon(2)` instantiations (7 leaf + 1 zero-pad + 4 + 2 + 1 root), CR-01 `Num2Bits(32)` range checks present, ends with `component main {public [...]} = Identity();` |
| `zk-proofs/build/identity.r1cs` / `.sym` / `identity_js/identity.wasm` | Compiled artifacts (regenerated, gitignored) | VERIFIED | Recompiled fresh in this verification session via `circom2 ... --r1cs --wasm --sym -o build -l circomlib/circuits` -> "Everything went okay"; `snarkjs r1cs info`: 1 public output, 18 public inputs, 14 private inputs, 7891 constraints (3770 non-linear + 4121 linear) — consistent with CR-01 fix adding 2 range-check components (+65/+2 vs pre-fix 7825) |
| `docs/current/research/PERFORMANCE_METRICS.md` | Constraint count recorded | VERIFIED | Contains both the original 7825 entry and a second dated entry recording the post-CR-01-fix count of 7891, with an explicit note that "this is the constraint count the circuit was frozen at for Phase 3 trusted setup" |
| `zk-proofs/test/circuitParity.test.js` | Witness-level parity gate + nonce-rejection test, post-fix coverage (WR-01/02/03) | VERIFIED | 436 lines; contains D-14 parity cases (single-chunk, 37-byte name multi-chunk, 40-byte email multi-chunk, zero-pad sanity, negative attr-swap control), Task 3 selective-disclosure positive/negative cases (WR-01 fix), Task 4 age/postgrad boundary cases (WR-02 fix), Task 2 nonce-binding + nonce-omission-rejection cases (WR-03 fix) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `identity.circom` | `circomlib/circuits/poseidon.circom` | bare `include "poseidon.circom"` resolved via `-l circomlib/circuits` | WIRED | Compile succeeds; 15 `Poseidon(2)` components instantiate and produce correct outputs matching JS oracle |
| `identity.circom` | `circomlib/circuits/comparators.circom` | bare `include "comparators.circom"` (GreaterEqThan, IsEqual, Num2Bits transitively via bitify.circom) | WIRED | Compile succeeds; age/postgrad predicate tests pass against real witnesses |
| `circuitParity.test.js` | `privdId_admin/backend/utils/identityCommitment.js` | dynamic `import()` of ESM oracle | WIRED | `before()` hook dynamically imports `computeMerkleRoot`/`computeLeaf`; all parity assertions execute against real oracle output, confirmed passing in live test run |
| `circuitParity.test.js` | `zk-proofs/build/identity_js/identity.wasm` | `snarkjs.wtns.calculate` | WIRED | Test asserts `fs.existsSync(WASM_PATH)` in `before()`; witness calculation succeeds for all positive cases and correctly rejects all negative cases |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Circuit compiles cleanly via circom2 | `circom2 circuits/identity.circom --r1cs --wasm --sym -o build -l circomlib/circuits` | "Everything went okay"; 1 public output, 18 public inputs, 14 private inputs, 7891 constraints | PASS |
| Public-signal order matches blueprint section 3 | inspect `build/identity.sym` lines 1-19 | `[1]pubHash [2]nonce [3]currentDateInt [4]isOver18 [5]isPostgrad [6-12]revealedValue[0..6] [13-19]revealMask[0..6]` (witness index 0 = constant-1 wire, so signal[N] = witness index N+1) — exact match to required order | PASS |
| Full parity + predicate + disclosure + nonce test suite passes against the live, post-fix circuit | `npx hardhat test test/circuitParity.test.js` (run directly in this verification session, not taken from SUMMARY claims) | `13 passing (2s)`, zero failures; the "ERROR" log lines mid-run are expected `assert.rejects` negative-case witness-generation failures, not test failures | PASS |
| All four code-review fix commits exist and are real, on top of the SUMMARY-documented state | `git log --oneline -- zk-proofs/circuits/identity.circom zk-proofs/test/circuitParity.test.js` | `7740a11 fix(02): WR-03...`, `b01f648 fix(02): WR-02...`, `1144334 fix(02): WR-01...`, `a6c716e fix(02): CR-01...` all present, applied after `e5bb777` (the 02-02 plan commit) | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CIRC-01 | 02-01 | leaf_i = Poseidon(2)(attr_i,salt_i) for 7 attrs + zero-pad leaf, pubHash = depth-3 root | SATISFIED | identity.circom:71-146, build/identity.sym signal[0] |
| CIRC-02 | 02-01 | mandatory random salt per committed attribute | SATISFIED | identity.circom:65 `signal input salt[7]`, consumed by all 7 leaf hashers |
| CIRC-03 | 02-01 | selective disclosure bound in-circuit, hidden attrs never appear in publicSignals | SATISFIED | identity.circom:154-158; circuitParity.test.js Task 3 positive/negative cases pass |
| CIRC-04 | 02-01 | isOver18 from currentDateInt vs dobInt (attr[2]) | SATISFIED | identity.circom:160-208 (incl. CR-01 range-check fix); circuitParity.test.js Task 4 boundary cases pass |
| CIRC-05 | 02-01 | isPostgrad set-membership {M.Tech,M.Des,PhD} | SATISFIED | identity.circom:210-231; circuitParity.test.js Task 4 isPostgrad cases pass |
| REPL-01 | 02-01 | nonce forced into real constraint (nonceSq) | SATISFIED | identity.circom:233-237; circuitParity.test.js Task 2 nonce-omission-rejection case (WR-03 fix) pass |
| REPL-02 | 02-02 | proof for nonce A rejected when verified against nonce B | SATISFIED (witness-level, full groth16.verify deferred to Phase 4 by design — zkey/ptau not yet available) | circuitParity.test.js Task 2 nonce-binding case pass; deferral explicitly documented as a Phase-3 prerequisite gap, not a Phase-2 gap |

Note: `.planning/REQUIREMENTS.md` lines 18-28 and the traceability table (lines 87-94) still show these IDs as unchecked `[ ]` / status "Pending" — this is a tracking-document sync gap (REQUIREMENTS.md was not updated after the phase's work and fixes completed), not a functional gap. The underlying requirements are satisfied in code and tests as evidenced above. This is noted for the orchestrator to update REQUIREMENTS.md bookkeeping; it does not block phase goal achievement since the actual implementation evidence is independently verified.

### Anti-Patterns Found

None. No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` debt markers in `identity.circom` or `circuitParity.test.js` (the single "XXX" grep hit is the substring inside a `20XXXXXX` date-format comment, not a marker). No stub return values, no empty handlers, no hardcoded-empty data paths flowing to output.

### Human Verification Required

None. All success criteria are mechanically verifiable via compilation, witness generation, and the parity/predicate/disclosure/nonce test suite, and have been independently re-run in this verification session against the current (post-fix) codebase rather than relying on SUMMARY.md narrative.

### Gaps Summary

No gaps. The Critical finding (CR-01) and all three Warnings (WR-01, WR-02, WR-03) raised by the 02-REVIEW.md code review were fixed via four discrete, well-documented commits (a6c716e, 1144334, b01f648, 7740a11), and this verification independently confirmed:
1. The CR-01 range-check fix is present in the live circuit source and the constraint count increased as expected (7825 -> 7891).
2. The full 13-test suite (up from the original 6) passes when run fresh against a freshly recompiled circuit in this verification session.
3. Public-signal order is exactly correct per `build/identity.sym`.
4. Both mandatory multi-chunk parity vectors (37-byte name, 40-byte email) pass byte-for-byte against the JS oracle.

The two Info-level findings (IN-01: no content-hash/commit-SHA tying PERFORMANCE_METRICS.md entries to the exact circuit revision; IN-02: no defensive lower-bound check on `currentDateInt` beyond the 32-bit range check) were left open by design (the code-fixer ran `--fix` without `--all`, addressing only Critical+Warning per 02-REVIEW.md `fix_note`). These are non-blocking hardening suggestions, not soundness gaps, and do not affect goal achievement.

The only non-blocking observation is that `.planning/REQUIREMENTS.md`'s checklist/status table has not been updated to reflect the satisfied requirements — a documentation bookkeeping gap, not a code gap.

---

*Verified: 2026-06-17T15:29:16Z*
*Verifier: Claude (gsd-verifier)*
