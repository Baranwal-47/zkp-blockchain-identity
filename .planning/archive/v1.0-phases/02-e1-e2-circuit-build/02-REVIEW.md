---
phase: 02-e1-e2-circuit-build
reviewed: 2026-06-17T19:13:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - zk-proofs/circuits/identity.circom
  - docs/current/research/PERFORMANCE_METRICS.md
  - zk-proofs/test/circuitParity.test.js
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: fixed
fixed_at: "2026-06-17T19:30:00Z"
fix_commits: [a6c716e, 1144334, b01f648, 7740a11]
fix_note: "Critical + Warning findings fixed and verified (13/13 tests pass). Info findings (IN-01, IN-02) left open by design (--fix without --all)."
---

# Phase 02-e1-e2-circuit-build: Code Review Report

**Reviewed:** 2026-06-17T19:13:00Z
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Reviewed the rewritten depth-3 salted-leaf Merkle circuit (`identity.circom`), the new performance-metrics record, and the witness-level parity test (`circuitParity.test.js`) that gates the freeze. The Merkle topology, leaf ordering, zero-padding-as-component, selective-disclosure constraints, and nonce-binding constraint all match `IDENTITY_SPEC.md` and the JS oracle (`identityCommitment.js`) correctly, and the public-signal ordering deviation (isOver18/isPostgrad as constrained public inputs rather than outputs) is a sound and well-documented circom idiom.

However, one correctness/soundness gap exists in the age predicate (`GreaterEqThan(32)` consuming an unconstrained, potentially out-of-range `attr[2]`/`currentDateInt - 180000` value), which is a known circomlib comparator pitfall and should be fixed before this DESIGN-ONCE circuit is frozen, since it cannot be patched afterward without a full trusted-setup redo. Additionally, the parity test — despite being thorough on the Merkle/root parity front — has real coverage gaps on the predicate and selective-disclosure paths that this is the last cheap opportunity to close.

## Critical Issues

### CR-01: `attr[2]` and `currentDateInt` are not range-checked before feeding `GreaterEqThan(32)`, enabling a soundness bypass of the age predicate

**File:** `zk-proofs/circuits/identity.circom:185-190`
**Issue:** `GreaterEqThan(32)` is built from circomlib's `LessThan(n)`, which computes `Num2Bits(n+1)` on `in[0] + 2^n - in[1]`. This construction is only sound when both `in[0]` and `in[1]` are independently guaranteed to fit within `n` bits (i.e. `< 2^32`). Neither `attr[2]` (the private dob signal) nor `currentDateInt` (a public input) is constrained to be `< 2^32` anywhere in this circuit. A prover that controls `attr[2]` (e.g. attempting to prove a predicate against a self-chosen or maliciously-crafted attribute, or any future code path that lets a prover pick `attr[2]` before it is bound to an honestly-issued commitment) can choose a huge field element close to the BN128 modulus such that `currentDateInt - 18*10000 - attr[2] (mod p)` lands inside the 33-bit window `Num2Bits(33)` checks, forcing `isOver18 = 1` for a `dob` value that does not correspond to any real YYYYMMDD date. This is the textbook "circomlib comparator unsoundness from missing range checks on operands" failure mode. Because the circuit is about to be frozen (DESIGN-ONCE — any post-freeze fix requires a full Groth16 trusted-setup redo per CLAUDE.md ground rule 1), this is the last cheap point to add the missing range constraints.

Note: under the current single trusted-issuer flow (backend computes `attr[2]` from a validated `YYYY-MM-DD` form field and the same `attr[2]` is committed into the Merkle leaf), this is not exploitable *today* because the prover does not freely choose `attr[2]` independent of the committed identity. But the circuit itself provides no defense-in-depth: nothing in the constraint system prevents a future prover-controlled input path (e.g. a self-issuance flow, a different verifier context, or a bug elsewhere that lets attacker-supplied dob reach the witness) from exploiting this. A frozen, audited ZK circuit should not rely on "the caller will always behave" for a security-relevant predicate.

**Fix:**
```circom
// Before the age predicate, range-check both operands of GreaterEqThan(32):
component dobRangeCheck = Num2Bits(32);
dobRangeCheck.in <== attr[2];

component dateRangeCheck = Num2Bits(32);
dateRangeCheck.in <== currentDateInt;

component ageCheck = GreaterEqThan(32);
ageCheck.in[0] <== currentDateInt - 18 * 10000;
ageCheck.in[1] <== attr[2];
isOver18 === ageCheck.out;
```
(`Num2Bits(32)` is already transitively included via `comparators.circom -> bitify.circom`; no new include needed.) Alternatively, use `LessEqThan`/`GreaterEqThan` with a larger bit-width plus explicit upper-bound assertions on `attr[2]` and `currentDateInt` (e.g. `<= 99999999`) if a tighter domain check is preferred over a raw 32-bit range check.

## Warnings

### WR-01: Parity test never exercises the selective-disclosure constraint paths (CIRC-03)

**File:** `zk-proofs/test/circuitParity.test.js:82-96`
**Issue:** `buildInput()` always sets `revealMask` to all-zero and `revealedValue` to all-zero. No test case exercises `revealMask[i]=1` (the conditional-equality branch `revealMask[i] * (revealedValue[i] - attr[i]) === 0`), and none exercises a deliberately-wrong `revealedValue` to confirm witness generation rejects it. Given this is the freeze gate for a DESIGN-ONCE circuit, the disclosure logic — one of the three headline features being frozen (CIRC-03) — has zero positive or negative test coverage at the witness level. A subtle bug in the disclosure constraints (e.g. an off-by-one in which attribute index is being disclosed, or a sign error in `(1 - revealMask[i])`) would not be caught by this suite.
**Fix:** Add at least two `it()` cases: (1) a positive case with `revealMask[2]=1, revealedValue[2]=attr[2]` (and the rest hidden) asserting witness generation succeeds and the witness's `revealedValue[2]` equals the disclosed attribute; (2) a negative case with `revealMask[2]=1, revealedValue[2]` set to a wrong value, asserting `snarkjs.wtns.calculate` throws/rejects (proving the `===` constraint actually fires).

### WR-02: No test exercises `isOver18=false` or the exact age-threshold boundary

**File:** `zk-proofs/test/circuitParity.test.js:108-111`
**Issue:** `DOB_INT` is hardcoded to a date far in the past (`20040215`) so `isOver18` is always true across every test case; `isPostgrad` is likewise always false (`PROGRAMME_LEVEL="1"`). There is no test for: (a) a dob that makes `isOver18=false` (someone under 18), (b) the exact boundary date where `dobInt == currentDateInt - 180000` (should be `true`, i.e. turning 18 today), (c) any `programmeLevel` in `{4,5,6}` to confirm `isPostgrad=1` actually computes correctly, or (d) `programmeLevel=3` (Dual) confirming it is correctly excluded (`isPostgrad=0`). Since the predicate logic is bound for permanent freeze, none of its branches besides the "always true / always false" defaults are verified against a live witness.
**Fix:** Add boundary-condition test cases for both predicates: a just-under-18 dob (expect circuit to reject `isOver18="1"` supplied as witness input, i.e. `snarkjs.wtns.calculate` should throw), an exactly-18-today dob (expect `isOver18="1"` to succeed), and at least one of `{4,5,6}` plus `3` for `isPostgrad`.

### WR-03: `pot12_final.ptau` absence makes the nonce-rejection test purely a self-consistency check, not a true REPL-02 verification

**File:** `zk-proofs/test/circuitParity.test.js:229-258`
**Issue:** The "nonce-rejection" test only asserts that a witness computed with `nonce=NONCE_A` reports `NONCE_A` (not `NONCE_B`) at its own public-signal index — this is tautologically true for any witness (the witness always reflects the input it was given) and does not actually exercise Groth16's binding property at all. It is not a meaningful regression test for REPL-02; it would pass identically even if `nonceSq <== nonce * nonce` were entirely removed from the circuit, because nothing about the constraint system is exercised by this assertion — only that snarkjs reports back the same value that was fed in. The SUMMARY's claim that this is "the witness-level approximation" of nonce rejection somewhat overstates what's actually being verified.
**Fix:** At minimum, add an assertion that `nonceSq` (or the constraint depending on `nonce`) is present in the r1cs by checking that the constraint count would differ if `nonce` were unconstrained — or, more directly, assert that witness generation succeeds only when `nonce` is supplied (e.g. attempt to omit `nonce` from the input and confirm `snarkjs.wtns.calculate` throws), which at least proves `nonce` is a required wire reachable by some constraint. The full `groth16.verify` deferral to Phase 4 is reasonable and explicitly documented — that part is fine — but the current witness-level check as written provides near-zero regression protection against a `nonceSq` constraint being silently removed.

## Info

### IN-01: `PERFORMANCE_METRICS.md` records counts without the circuit-content hash, risking silent drift detection failure

**File:** `docs/current/research/PERFORMANCE_METRICS.md:7-10`
**Issue:** The recorded constraint count (7825) has no accompanying content hash or commit SHA of `identity.circom` tying the measurement to the exact frozen source. If the circuit is edited later (in violation of the freeze) and recompiled, this file alone cannot prove whether the count corresponds to the pre- or post-edit circuit, weakening its usefulness as a freeze/drift detector.
**Fix:** Append the git commit hash of `identity.circom` (e.g. `git log -1 --format=%H -- zk-proofs/circuits/identity.circom`) alongside the constraint count, e.g. `... (recorded 2026-06-17, circuit commit 662c302)`.

### IN-02: Field-underflow risk on `currentDateInt - 18*10000` is documented as "accepted" but not defensively guarded

**File:** `zk-proofs/circuits/identity.circom:176-181`
**Issue:** The in-circuit comment and the SUMMARY both correctly identify that `currentDateInt < 180000` would wrap around the BN128 field and break the `GreaterEqThan` comparison, and the team explicitly accepted this risk (T-02-05) on the grounds that the trusted backend always supplies a sane ~20XXXXXX value. This is a reasonable call given today's threat model, but it is the same class of issue as CR-01 — relying on a non-circuit-enforced invariant for predicate soundness. Once CR-01's range check on `currentDateInt` (`< 2^32`, i.e. roughly `< 4.29 billion`) is added, it does **not** by itself rule out a `currentDateInt` of, say, `100000` (which still fits in 32 bits) causing underflow before the `GreaterEqThan` call — the range check fixes the comparator-soundness gap (CR-01) but does not fix this semantically-invalid-date acceptance gap.
**Fix:** Optional defense-in-depth: assert `currentDateInt >= 19000101` (a plausible lower bound for the system's operating dates) via an additional `GreaterEqThan` or explicit range comparator, closing both the comparator-soundness gap and the semantic-validity gap together. Not blocking given the trusted-backend assumption, but worth a one-line note in the freeze sign-off acknowledging this composes with CR-01's fix.

---

_Reviewed: 2026-06-17T19:13:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
