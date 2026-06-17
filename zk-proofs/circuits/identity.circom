pragma circom 2.1.6;

include "poseidon.circom";
include "comparators.circom";

// PrivdID identity circuit (E1: depth-3 salted-leaf Merkle commitment +
// in-circuit selective disclosure + age/postgrad predicates; E2: nonce
// replay-binding). DESIGN-ONCE per CLAUDE.md ground rule #1 — any future
// edit to this file invalidates the Phase 3 trusted setup and forces a
// full Groth16 redo + IdentityVerifier.sol redeploy.
//
// Leaf layout (frozen, IDENTITY_SPEC.md section 1 — NEVER reorder):
//   attr[0] = name           (already hash-to-field'd off-circuit)
//   attr[1] = rollNo         (already hash-to-field'd off-circuit)
//   attr[2] = dob            (YYYYMMDD integer — bound to isOver18)
//   attr[3] = programmeLevel (enum code 1-6  — bound to isPostgrad)
//   attr[4] = discipline     (enum code 1-6)
//   attr[5] = batch          (4-digit year integer)
//   attr[6] = email          (already hash-to-field'd off-circuit)
//   leaf[7] = Poseidon(2)(0,0) zero-padding leaf
//
// Public-signal order (blueprint section 3 — frozen, downstream Phase 3
// verifier + Phase 4 backend index positionally):
//   [0]      pubHash
//   [1]      nonce
//   [2]      currentDateInt
//   [3]      isOver18
//   [4]      isPostgrad
//   [5..11]  revealedValue[7]
//   [12..18] revealMask[7]
//
// circom emits a component's public signal list as ALL signal outputs
// (declaration order) followed by ALL public signal inputs (declaration
// order) — outputs and public inputs cannot be interleaved positionally.
// Since pubHash must be the lone signal [0] and isOver18/isPostgrad must sit
// at signals [3]/[4] AFTER the nonce/currentDateInt public inputs at [1]/[2],
// isOver18 and isPostgrad are declared as public INPUT signals (not circom
// `signal output`s) that the circuit computes internally and then asserts
// equal to via `===`. This is the standard circom idiom for forcing a
// derived value into a specific public-signal position: the prover supplies
// isOver18/isPostgrad as part of the witness, and the circuit constrains
// them to equal the in-circuit-computed predicate — a malicious prover
// cannot supply a value that does not match the computed predicate because
// the equality constraint would fail. pubHash remains the only true
// `signal output`, so it alone occupies position [0]. Verified against the
// emitted .sym file in Task 2 of this plan.
template Identity() {
    // ---- Public signals (declared in blueprint section 3 order) ----
    signal output pubHash;

    signal input nonce;
    signal input currentDateInt;

    // Public inputs constrained (not free) to equal the in-circuit-computed
    // predicates below — see note above on why these are `signal input`
    // rather than `signal output`.
    signal input isOver18;
    signal input isPostgrad;

    signal input revealedValue[7];
    signal input revealMask[7];

    // ---- Private signals ----
    signal input attr[7];
    signal input salt[7];

    // ================= MERKLE (CIRC-01, CIRC-02) =================
    // leaf_i = Poseidon(2)(attr_i, salt_i) for i = 0..6 — explicitly unrolled
    // (7 distinct Poseidon(2) component instantiations) rather than a
    // circom for-loop, so the leaf stage is self-evidently 7 components.
    signal leaf[8];

    component leaf0Hasher = Poseidon(2);
    leaf0Hasher.inputs[0] <== attr[0];
    leaf0Hasher.inputs[1] <== salt[0];
    leaf[0] <== leaf0Hasher.out;

    component leaf1Hasher = Poseidon(2);
    leaf1Hasher.inputs[0] <== attr[1];
    leaf1Hasher.inputs[1] <== salt[1];
    leaf[1] <== leaf1Hasher.out;

    component leaf2Hasher = Poseidon(2);
    leaf2Hasher.inputs[0] <== attr[2];
    leaf2Hasher.inputs[1] <== salt[2];
    leaf[2] <== leaf2Hasher.out;

    component leaf3Hasher = Poseidon(2);
    leaf3Hasher.inputs[0] <== attr[3];
    leaf3Hasher.inputs[1] <== salt[3];
    leaf[3] <== leaf3Hasher.out;

    component leaf4Hasher = Poseidon(2);
    leaf4Hasher.inputs[0] <== attr[4];
    leaf4Hasher.inputs[1] <== salt[4];
    leaf[4] <== leaf4Hasher.out;

    component leaf5Hasher = Poseidon(2);
    leaf5Hasher.inputs[0] <== attr[5];
    leaf5Hasher.inputs[1] <== salt[5];
    leaf[5] <== leaf5Hasher.out;

    component leaf6Hasher = Poseidon(2);
    leaf6Hasher.inputs[0] <== attr[6];
    leaf6Hasher.inputs[1] <== salt[6];
    leaf[6] <== leaf6Hasher.out;

    // leaf_7 = Poseidon(2)(0,0) — wired as an actual component, not a
    // hardcoded 77-digit constant, to avoid a transcription error (RESEARCH
    // section 4 risk 5 / D-14 risk control).
    component zeroPad = Poseidon(2);
    zeroPad.inputs[0] <== 0;
    zeroPad.inputs[1] <== 0;
    leaf[7] <== zeroPad.out;

    // Internal nodes — lower-index child is ALWAYS inputs[0] (left), matching
    // identityCommitment.js lines 198-216 exactly. Poseidon(2) is asymmetric.
    component n01 = Poseidon(2);
    n01.inputs[0] <== leaf[0];
    n01.inputs[1] <== leaf[1];

    component n23 = Poseidon(2);
    n23.inputs[0] <== leaf[2];
    n23.inputs[1] <== leaf[3];

    component n45 = Poseidon(2);
    n45.inputs[0] <== leaf[4];
    n45.inputs[1] <== leaf[5];

    component n67 = Poseidon(2);
    n67.inputs[0] <== leaf[6];
    n67.inputs[1] <== leaf[7];

    component n0123 = Poseidon(2);
    n0123.inputs[0] <== n01.out;
    n0123.inputs[1] <== n23.out;

    component n4567 = Poseidon(2);
    n4567.inputs[0] <== n45.out;
    n4567.inputs[1] <== n67.out;

    component rootHasher = Poseidon(2);
    rootHasher.inputs[0] <== n0123.out;
    rootHasher.inputs[1] <== n4567.out;

    pubHash <== rootHasher.out;

    // ================= SELECTIVE DISCLOSURE (CIRC-03) =================
    // For each attribute: revealMask must be boolean; when revealed, the
    // published value must equal the committed attribute; when hidden, the
    // published value is circuit-forced to 0 (stronger option (b) from
    // RESEARCH section 1 / section 4 risk 2 — the "never appears in
    // publicSignals" guarantee is circuit-enforced, not witness-discipline).
    for (var i = 0; i < 7; i++) {
        revealMask[i] * (revealMask[i] - 1) === 0;
        revealMask[i] * (revealedValue[i] - attr[i]) === 0;
        (1 - revealMask[i]) * revealedValue[i] === 0;
    }

    // ================= AGE PREDICATE (CIRC-04) =================
    // isOver18 = dobInt <= currentDateInt - 18*10000.
    // Reuses the SAME attr[2] signal that feeds leaf 2 (T-02-01 mitigation) —
    // a malicious prover cannot commit one DOB and prove a predicate on
    // another.
    //
    // Digit-shift correctness: currentDateInt and attr[2] (dobInt) are both
    // YYYYMMDD integers, i.e. YYYY*10000 + MMDD. Subtracting 18*10000 = 180000
    // shifts only the YYYY digit group down by 18 and leaves the MMDD digit
    // group untouched, because 10000 aligns exactly with the YYYY/MMDD digit
    // boundary. E.g. currentDateInt=20260617 - 180000 = 20080617; comparing
    // dobInt <= 20080617 correctly captures "born on or before 2008-06-17",
    // i.e. "is at least 18 years old today." This is exact as long as MMDD is
    // a valid 4-digit month-day fragment, which the spec's date encoding
    // always guarantees.
    //
    // Field-underflow assumption: circom subtraction happens in the BN128
    // field, not in integers — if currentDateInt < 180000 the subtraction
    // would wrap around the field and break the comparison. This is
    // unreachable in practice because currentDateInt is always a sane
    // ~20XXXXXX date set by the trusted backend (today's date), never an
    // attacker-supplied small number (T-02-05, accepted risk).
    //
    // Bit width 32: YYYYMMDD's max value is ~10^8 < 2^27, far under
    // GreaterEqThan's n<=252 ceiling; 32 leaves comfortable headroom.
    component ageCheck = GreaterEqThan(32);
    ageCheck.in[0] <== currentDateInt - 18 * 10000;
    ageCheck.in[1] <== attr[2];
    // isOver18 is a public input constrained equal to the computed
    // predicate (see template-level note on output/input signal ordering).
    isOver18 === ageCheck.out;

    // ================= POSTGRAD PREDICATE (CIRC-05) =================
    // Set-membership of attr[3] (programmeLevel) over {4,5,6} (M.Tech, M.Des,
    // PhD). Dual-degree code 3 is EXCLUDED per D-13. Reuses the SAME attr[3]
    // signal that feeds leaf 3 (T-02-01 mitigation).
    component eq4 = IsEqual();
    eq4.in[0] <== attr[3];
    eq4.in[1] <== 4;

    component eq5 = IsEqual();
    eq5.in[0] <== attr[3];
    eq5.in[1] <== 5;

    component eq6 = IsEqual();
    eq6.in[0] <== attr[3];
    eq6.in[1] <== 6;

    // Sum is safe and stays boolean because at most one IsEqual can fire for
    // any given attr[3] value (mutually exclusive equality checks) — cheaper
    // than chaining OR gates. isPostgrad is a public input constrained equal
    // to the computed predicate (see template-level note on output/input
    // signal ordering).
    isPostgrad === eq4.out + eq5.out + eq6.out;

    // ================= NONCE BINDING (REPL-01) =================
    // nonceSq is otherwise unused; it exists solely to force nonce into a
    // real constraint so the compiler cannot optimize it away.
    signal nonceSq;
    nonceSq <== nonce * nonce;
}

component main {public [nonce, currentDateInt, isOver18, isPostgrad, revealedValue, revealMask]} = Identity();
