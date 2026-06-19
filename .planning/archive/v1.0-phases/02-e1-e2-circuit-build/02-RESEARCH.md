# Phase 2 Research: E1+E2 Circuit Build

**Researched:** 2026-06-17
**Goal:** Equip the planner with everything needed to plan a single-pass rewrite of `zk-proofs/circuits/identity.circom` that is correct on the first freeze (DESIGN-ONCE — no do-overs after Phase 3's trusted setup).

---

## 1. Exact target: what the new circuit must compute

Source of truth: `docs/current/research/IDENTITY_SPEC.md` (frozen) + `docs/CLAUDE_CODE_BLUEPRINT.md` §3/§4.1/§4.2 + `.planning/phases/02-e1-e2-circuit-build/02-CONTEXT.md` (D-13, D-14).

### Inputs (private unless noted)
- `attr[7]` — private. Index meaning (frozen, never reorder):
  - `attr[0]` = name → hash-to-field, Poseidon(4) arity
  - `attr[1]` = rollNo → hash-to-field, Poseidon(2) arity
  - `attr[2]` = dob → integer YYYYMMDD (e.g. 20040215) — **bound to isOver18**
  - `attr[3]` = programmeLevel → integer enum code 1–6 — **bound to isPostgrad**
  - `attr[4]` = discipline → integer enum code 1–6
  - `attr[5]` = batch → integer 4-digit year
  - `attr[6]` = email → hash-to-field, Poseidon(2) arity
- `salt[7]` — private, one per attribute (248-bit field elements, but circuit treats them as opaque field elements — no range check needed in-circuit since they're private and only used as Poseidon inputs)
- `nonce` — **public**, forced into a constraint (REPL-01)
- `currentDateInt` — **public**, YYYYMMDD integer, compared against `attr[2]`
- `revealMask[7]` — **public** (per spec layout, signals [12..18]), boolean
- `revealedValue[7]` — **public** (signals [5..11])

Important: the spec's "hash-to-field" step (chunking a UTF-8 string into ≤31-byte big-endian chunks, then `Poseidon(maxChunks)`) happens **off-circuit in JS** (`identityCommitment.js`/admin backend) before the prover ever runs. The circuit does NOT re-derive the hash-to-field value from raw string bytes — it receives the already-hashed field element as `attr[0]`, `attr[1]`, `attr[6]` directly (this matches how the OLD circuit took `name`/`rollNo` as opaque field-element inputs, just hashed differently now). **Confirm this in planning**: nothing in IDENTITY_SPEC.md §10 or the blueprint says the circuit re-implements UTF-8 chunking; the parity test (D-14) exists precisely because the string→field reduction happens twice in two languages (JS for issuance, JS again for prover input prep) and only the leaf/Merkle math happens in both JS and circom. The circuit's job starts at `leaf_i = Poseidon(2)(attr_i, salt_i)`.

### Outputs / public signals (frozen order, blueprint §3 — do not deviate)
```
[0]      pubHash (= merkleRoot)
[1]      nonce
[2]      currentDateInt
[3]      isOver18
[4]      isPostgrad
[5..11]  revealedValue[7]
[12..18] revealMask[7]
```
In circom, public signal order is determined by the **order signals are declared** in the `main` component's input/output list combined with how `circom` emits `.sym`/public signal ordering — plan must verify actual emitted order via `snarkjs r1cs info` / inspecting the `.sym` file, since circom's public signal ordering follows declaration order of `signal input`/`signal output` on the main template, not an arbitrary array. The safest implementation pattern: declare outputs in exactly this order in the main `Identity()` template (`pubHash` first, then declare `nonce`/`currentDateInt` as public inputs in this order, etc.) — **the plan should explicitly verify the compiled signal order matches §3 before relying on positional indexing downstream (Phase 4 depends on this).**

### Merkle construction (CIRC-01)
```
leaf_i = Poseidon(2)(attr_i, salt_i)   for i = 0..6
leaf_7 = Poseidon(2)(0, 0)              constant, = 14744269619966411208579211824598458697587494354926760081771325075741142829156
n01 = Poseidon(2)(leaf_0, leaf_1)
n23 = Poseidon(2)(leaf_2, leaf_3)
n45 = Poseidon(2)(leaf_4, leaf_5)
n67 = Poseidon(2)(leaf_6, leaf_7)
n0123 = Poseidon(2)(n01, n23)
n4567 = Poseidon(2)(n45, n67)
pubHash = Poseidon(2)(n0123, n4567)
```
Poseidon(2) is asymmetric — left argument MUST be the lower-index child at every level, matching `identityCommitment.js::computeMerkleRoot` exactly (already verified correct there). leaf_7 must be wired as the **actual Poseidon(2)(0,0) circuit output**, not a hardcoded constant signal, OR a hardcoded constant is fine as long as it's literally produced via `component zeroPad = Poseidon(2); zeroPad.inputs[0] <== 0; zeroPad.inputs[1] <== 0;` — either is constraint-equivalent; hardcoding the decimal constant directly also works since it's a fixed public constant, but using the component keeps the parity check self-evidently correct and avoids a copy-paste digit error in a 77-digit constant.

### Selective disclosure (CIRC-03)
For each i in 0..6:
```
revealMask[i] * (revealMask[i] - 1) === 0        // boolean constraint
revealMask[i] * (revealedValue[i] - attr[i]) === 0   // conditional equality
```
This does NOT by itself prevent a hidden attribute's value from leaking via `revealedValue[i]` when `revealMask[i]=0` — the prover (off-circuit, in the witness-generation step) must set `revealedValue[i] = 0` whenever `revealMask[i] = 0` for the "hidden attribute never appears in publicSignals" success criterion to hold in practice, since the constraint `revealMask_i * (revealedValue_i - attr_i) === 0` is satisfied by ANY `revealedValue[i]` when `revealMask[i]=0` (multiplying by 0 is always 0 regardless of the second factor). **This is a witness-construction discipline, not an additional constraint** — flag this for the plan: either (a) trust the off-circuit witness builder to zero out unrevealed values (cheapest, matches what the spec literally asks for), or (b) add a stronger constraint `(1 - revealMask[i]) * revealedValue[i] === 0` which forces `revealedValue[i] = 0` whenever hidden — **(b) is recommended** since it makes the "never appears" guarantee circuit-enforced rather than convention-based, costs 7 more multiplication constraints, and the spec's CIRC-03 wording ("a hidden attribute never appears in publicSignals") reads as a hard circuit guarantee, not a client convention. The plan should decide explicitly between (a) and (b); cost difference is negligible (~7 constraints).

### Age predicate (CIRC-04)
```
isOver18 = (currentDateInt - 10000*18) >= dobInt   roughly, but YYYYMMDD arithmetic doesn't subtract cleanly across month/day boundaries
```
**Key risk for the plan to address explicitly:** YYYYMMDD integer subtraction is NOT equivalent to calendar date subtraction (e.g., `20240301 - 180000 = 20060301` is fine arithmetically as a magnitude comparison only if done correctly — actually the simple trick that works for "at least N years old" using YYYYMMDD ints is: `isOver18 = dobInt <= (currentDateInt - 18*10000)`. This works correctly as an integer comparison because subtracting `18*10000` from `currentDateInt` shifts the year down by 18 while leaving month/day digits unchanged (since `10000 = 1_00_00`, i.e. shifts only the year digits when currentDateInt is decomposed as `YYYY*10000 + MMDD`). E.g. currentDateInt=20260617 → minus 180000 → 20080617; comparing dobInt <= 20080617 correctly captures "born on or before 2008-06-17" = "turns/turned 18 on or before today." This is the standard YYYYMMDD age-threshold trick and is exact as long as MMDD is a valid 4-digit month-day fragment (00 01–12 31), which it always is per the spec's date encoding. The plan should use circomlib's `LessEqThan(n)` (or `GreaterEqThan`) with `n` sized to cover an 8-digit number: `n=32` is safe (max YYYYMMDD ≈ 99999999 < 2^27, but use n=32 or n=64 for headroom and clarity; circomlib's `LessThan`/`GreaterEqThan` assert `n <= 252` so any reasonable choice works — recommend n=32 to keep constraint count low while leaving margin).
```
isOver18 <== GreaterEqThan(32)([currentDateInt - 18*10000, dobInt])  // i.e. dobInt <= currentDateInt - 180000
```
caveat noted above: **circom subtraction underflows in the field, not in integers** — if `currentDateInt < 180000` the subtraction wraps around the BN128 field (a huge number), which would break the comparison. This can't realistically happen (currentDateInt is always ~20XXXXXX, far larger than 180000) but the plan should note this is safe only because `currentDateInt` is a sane real-world date, not attacker-fully-controlled in a way that could underflow — it IS a public input set by the verifier/backend, but the backend always sets it to "today," so this isn't an attacker-controlled risk vector in practice. Document this assumption in the plan.

`dobInt` must be **the same private signal wired as `attr[2]`** (the spec's "dobInt bound to leaf attr 2" — i.e., don't introduce a second free `dobInt` private input; reuse `attr[2]` directly in both the leaf-hash and the age comparison so a malicious prover can't supply two different DOBs for the commitment vs. the predicate).

### Postgrad predicate (CIRC-05)
Set membership of `attr[3]` (programmeLevel) over `{4, 5, 6}` (D-13 confirms — Dual/3 excluded). Circom pattern (no native "in set" primitive in circomlib used here — IsEqual is the building block):
```
component eq4 = IsEqual(); eq4.in[0] <== attr[3]; eq4.in[1] <== 4;
component eq5 = IsEqual(); eq5.in[0] <== attr[3]; eq5.in[1] <== 5;
component eq6 = IsEqual(); eq6.in[0] <== attr[3]; eq6.in[1] <== 6;
isPostgrad <== eq4.out + eq5.out - eq4.out*eq5.out ... // OR-combine 3 booleans
```
Since the three equality checks are mutually exclusive (attr[3] can only equal one specific value), a simple **sum** `isPostgrad <== eq4.out + eq5.out + eq6.out` is safe and stays boolean (0 or 1) without needing OR-gate logic, because at most one of the three `IsEqual` outputs can be 1 for any given `attr[3]`. This is simpler/cheaper than chaining circomlib's `OR()` gates and is the recommended pattern. `attr[3]` must be the same signal wired into `leaf_3`'s hash (same reuse principle as dobInt).

### Nonce binding (REPL-01/REPL-02)
```
signal nonceSq;
nonceSq <== nonce * nonce;
```
`nonce` declared as a public input on the main component. The multiplication forces the compiler to retain the signal in the constraint system (an otherwise-unused public input could in principle be optimized away by some compilers/builders, though circom 2.1.6's default behavior already keeps all declared public inputs — this is defensive/explicit per the spec's own wording "so the compiler cannot optimize it away"). `nonceSq` does not need to be used anywhere else; it exists purely to create a real constraint referencing `nonce`. REPL-02 ("proof for nonce A rejected against nonce B") is a property of Groth16's public-input binding, not something extra to build in-circuit — it's automatically true once `nonce` is a public signal that participates in at least one constraint; the plan's verification step for this success criterion is an **integration-style test** (generate proof with nonce A, call `groth16.verify` with publicSignals where nonce is swapped to B, assert `false`), not additional circuit code.

---

## 2. Existing circuit + repo conventions (read as reference, not reused as-is)

- **Current circuit** `zk-proofs/circuits/identity.circom` (28 lines): flat `Poseidon(5)` over `[name, rollNo, dob, phoneNo, branch]`, single `pragma circom 2.1.6`, single `include "poseidon.circom"` (relative — resolves via hardhat-circom's `inputBasePath: ./circuits`, which must also expose `../circomlib/circuits` on the include path; confirm via the working old build that this resolution works, since the old circuit's `include "poseidon.circom"` with no relative path prefix succeeded — meaning hardhat-circom or some node_modules symlink already makes `circomlib/circuits/*.circom` importable bare. **Plan should verify this resolution mechanism explicitly** (check for a symlink/copy of `circomlib` inside `zk-proofs/circuits/` or hardhat-circom's include-path config) before assuming `include "comparators.circom"` and `include "bitify.circom"` will resolve the same way for the new templates.
- Single `main` component pattern: `component main = Identity();` — keep this pattern; only one template needed at top level, though internal helper templates (LeafHash, etc.) are encouraged per CONTEXT.md "Claude's Discretion."
- There is a **stale compiled artifact** at `zk-proofs/build/identity.r1cs` + `.sym` + `identity_js/` dated before Phase 1 (old flat Poseidon(5) circuit) — these are now invalid and will be overwritten when the new circuit compiles; no migration needed, just recompile.
- `zk-proofs/build/pot12_final.ptau` (referenced in `hardhat.config.js`'s `circom.ptau` field) **does not exist in the repo** — it must be downloaded (e.g. from the Hermez/iden3 ptau ceremony files, `https://github.com/iden3/snarkjs#7-prepare-phase-2`) before Phase 3's trusted setup can run. This is a Phase 3 concern, not Phase 2's, but the plan should note it since "compile + count constraints" (blueprint §4.2's first two steps, which ARE in Phase 2 scope) does not need the ptau — only `r1cs`/`wasm`/`sym` generation does, which is ptau-independent. Verify the circuit compiles and constraint count is captured via `npx hardhat circom` (or raw `circom`) + `npx snarkjs r1cs info build/identity.r1cs` without needing the ptau file at all.

### Toolchain confirmed present (`zk-proofs/package.json`)
- `circom2` (0.2.22, via npm package, JS-wrapped circom compiler) and `circom` both present in `node_modules` — `hardhat-circom` (v3.3.2) drives compilation via `npx hardhat circom`.
- `@solarity/hardhat-zkit` (^0.5.17) also present — CONTEXT.md flags this as an alternative tool for the parity/test step; "pick whichever integrates most simply" is left to plan/implementation discretion. Given hardhat-circom is the existing/working pipeline (old circuit already compiles with it, evidenced by the existing `build/identity.r1cs`), the lower-risk choice is to **keep using hardhat-circom for compilation** and use raw `circom_tester` (or manually drive `snarkjs wtns calculate` against the compiled `_js/generate_witness.js` + wasm) for the witness-level parity test, rather than introducing hardhat-zkit's separate compilation pipeline in the same phase. Plan should make this choice explicit rather than leaving both tools "available."
- `snarkjs` 0.7.5, `circomlibjs` 0.1.7, `ethers` 6.15.0 all present and version-aligned with what `identityCommitment.js` already uses.

### Vendored circomlib templates confirmed on disk (`zk-proofs/circomlib/circuits/`)
- `poseidon.circom` — `Poseidon(nInputs)` template, used today for `Poseidon(5)`; same template supports `Poseidon(2)` and `Poseidon(4)` (arity is a template parameter, already proven to work for the chunked hash-to-field's `Poseidon(4)`/`Poseidon(2)` calls in the JS reference — same template family, just instantiated with different arities in circom).
- `comparators.circom` — has the *active* `LessThan(n)` (the commented-out version is dead/legacy, ignore it), plus `LessEqThan`, `GreaterThan`, `GreaterEqThan`, `IsZero`, `IsEqual`. `LessThan(n)` asserts `n <= 252`; implementation costs `Num2Bits(n+1)` internally — meaningful per-comparison constraint cost (~n+1 constraints plus the bit-decomposition), worth recording in the constraint count but not a blocker.
- `bitify.circom` — `Num2Bits(n)` available if any explicit bit-decomposition/range-check is needed beyond what `LessThan`/`GreaterEqThan` already do internally; likely not needed directly by the plan's own code since the comparator templates handle bit decomposition internally.
- `gates.circom` — `AND`/`OR`/`XOR`/`NOT`/`MultiAND` available if the plan prefers explicit OR-gates for the postgrad set-membership instead of the sum trick described above (either works; sum is cheaper).

---

## 3. Build/test pipeline — concrete commands for the plan

From `docs/CLAUDE_CODE_BLUEPRINT.md` §4.2 (Phase 2 only needs the first two commands; everything from `groth16 setup` onward is Phase 3):
```bash
# Phase 2 scope — compile + count constraints
npx hardhat circom                                   # or: circom circuits/identity.circom --r1cs --wasm --sym -o build/
npx snarkjs r1cs info build/identity.r1cs             # record nConstraints
```
```bash
# Phase 3 scope — NOT this phase, listed for context only
npx snarkjs groth16 setup build/identity.r1cs build/pot12_final.ptau build/identity_0000.zkey
npx snarkjs zkey contribute ... (x3 contributions + beacon)
npx snarkjs zkey verify ...
npx snarkjs zkey export verificationkey ...
npx snarkjs zkey export solidityverifier ...
```

### Witness-level parity test (D-14, this phase's acceptance gate)
No witness generation needs a zkey/proof — only `r1cs`+`wasm` are needed. Recommended approach (lowest new-dependency risk, given hardhat-circom is already the compile path):
1. Compile circuit → get `build/identity_js/generate_witness.js` + `build/identity_js/identity.wasm`.
2. For each IDENTITY_SPEC.md §9 vector (the 5 single-chunk + 2 multi-chunk hashToField outputs, plus the raw `Poseidon(2)(1,2)` and `Poseidon(2)(0,0)` sanity vectors), build an `input.json` with the corresponding `attr[]`/`salt[]` values (using fixed/test salts so the witness's leaf values are reproducible) and run `snarkjs wtns calculate identity.wasm input.json witness.wtns`, then extract the `pubHash` output signal from the witness (via `snarkjs wtns export json` or by inspecting the `.sym`-mapped signal) and diff it against the merkleRoot computed by `identityCommitment.js::computeMerkleRoot` for the same attrs/salts.
3. The two **multi-chunk vectors are mandatory** per D-14 (37-byte name with maxChunks=4 producing a 2-chunk Poseidon(4) result; 40-byte email with maxChunks=2 producing a 2-chunk Poseidon(2) result) — these exercise the path where `identityCommitment.js`'s chunking logic and the circuit's Merkle-leaf hashing must agree on the **pre-hashed field element value**, not on chunking itself (recall: per Section 1 above, the circuit receives `attr[i]` as an already-hash-to-field'd value — so the "parity" being tested is really "does the circuit's `Poseidon(2)(attr_i, salt_i)` leaf hash and subsequent Merkle combine match the JS module's `computeLeaf`/`computeMerkleRoot` for the same already-encoded attr values," which is a more modest but still essential check, since IDENTITY_SPEC.md §9's vectors are pre-computed `hashToField(...)` outputs to be fed as `attr[i]` inputs to both sides).
4. Implementation choice for the harness: a plain Mocha/Node script under `zk-proofs/test/` driving `snarkjs.wtns.calculate` programmatically (via the `snarkjs` npm API, not just CLI) is simplest and avoids adding `circom_tester` or `hardhat-zkit` as a second toolchain just for this one test. `circom_tester` is also a valid option if already a transitive dependency, but is not currently declared in `zk-proofs/package.json` — adding it is a new dependency; using `snarkjs`'s JS API directly is zero-new-dependency and recommended.

---

## 4. Risks / decisions the plan must make explicit

1. **Public signal ordering** — circom emits public signals in component-declaration order; the plan must specify the exact `signal input`/`signal output` declaration sequence in the main template and verify (via `.sym` file inspection or `r1cs info`) that the emitted order is `[pubHash, nonce, currentDateInt, isOver18, isPostgrad, revealedValue[0..6], revealMask[0..6]]` before calling this phase done — this is foundational for Phase 3's verifier and Phase 4's backend, both downstream consumers.
2. **Selective-disclosure leak guarantee strength** — choose between witness-discipline-only (`revealMask_i * (revealedValue_i - attr_i) === 0` alone) vs. the stronger circuit-enforced zeroing (`(1 - revealMask_i) * revealedValue_i === 0` additionally) per the analysis in Section 1. Recommend the stronger version since CIRC-03's wording implies a hard guarantee.
3. **Age-threshold integer arithmetic correctness** — confirm the YYYYMMDD subtraction trick (`dobInt <= currentDateInt - 180000`) is what's intended and document why it's exact (digit-group shift, not calendar subtraction) — this is subtle enough that a reviewer could otherwise flag it as a bug.
4. **Comparator bit-width `n`** — pick `n=32` (or similar) for `LessThan`/`GreaterEqThan` on YYYYMMDD-range integers; document the choice and headroom rationale (max value ≈ 10^8 ≈ 2^26.6, well under any reasonable `n`, and `circomlib`'s built-in `assert(n<=252)` is the only hard ceiling).
5. **Zero-padding leaf implementation** — component-computed `Poseidon(2)(0,0)` vs. hardcoded 77-digit decimal constant; either is correct, component form is safer against transcription error and should be preferred.
6. **Toolchain for the parity test** — use `snarkjs`'s JS API directly (zero new deps) rather than introducing `circom_tester` or switching to `hardhat-zkit`'s separate pipeline, since hardhat-circom is the proven existing compile path (old circuit already builds with it).
7. **Constraint-count recording location** — CONTEXT.md leaves this to discretion; suggest appending a dated entry to `docs/current/research/PERFORMANCE_METRICS.md` (Phase 5 owns full benchmarking, but a raw `nConstraints` line captured now satisfies this phase's exit needs and gives Phase 5 a starting data point).
8. **`pot12_final.ptau` absence** — not a Phase 2 blocker (compile+count doesn't need it) but the plan should flag it as a known Phase 3 prerequisite so it doesn't surprise that phase's planning.

---

## 5. File-level summary for planning

| File | Role in this phase |
|---|---|
| `zk-proofs/circuits/identity.circom` | **Rewritten** — the deliverable |
| `zk-proofs/circomlib/circuits/poseidon.circom` | Included, reused (Poseidon(2) for leaves/nodes; arity param) |
| `zk-proofs/circomlib/circuits/comparators.circom` | Included, reused (`LessThan`/`GreaterEqThan`/`IsEqual` for predicates) |
| `zk-proofs/circomlib/circuits/bitify.circom` | Available if needed; likely unused directly |
| `zk-proofs/circomlib/circuits/gates.circom` | Available if needed; likely unused (sum trick preferred over OR gates) |
| `zk-proofs/hardhat.config.js` | Unchanged — `circom.circuits: [{name:"identity"}]` already points at the right file |
| `privdId_admin/backend/utils/identityCommitment.js` | **Read-only reference** — the JS oracle for the parity test (D-14); not modified this phase |
| `privdId_admin/backend/constants/enumCodes.js` | **Read-only reference** — circuit's `{4,5,6}` set-membership constants must mirror `POSTGRAD_CODES` |
| `docs/current/research/IDENTITY_SPEC.md` | **Read-only reference** — full leaf layout, §9 parity vectors, §10 forward contract |
| `docs/CLAUDE_CODE_BLUEPRINT.md` §3/§4.1/§4.2 | **Read-only reference** — public signal order, build commands |
| `zk-proofs/build/identity.r1cs`, `.sym`, `identity_js/` | Stale (pre-Phase-1) artifacts — will be regenerated, no migration needed |
| `zk-proofs/build/pot12_final.ptau` | **Missing** — not needed this phase; flag for Phase 3 |
| New: a parity-test script (e.g. `zk-proofs/test/circuitParity.test.js` or similar) | New file this phase must create per D-14 |
| `docs/current/research/PERFORMANCE_METRICS.md` (or wherever decided) | Constraint-count recording destination (discretion item) |

---

## RESEARCH COMPLETE
