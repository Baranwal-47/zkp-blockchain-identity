# Phase 2: E1+E2 Circuit Build - Pattern Map

**Mapped:** 2026-06-17
**Files analyzed:** 3 (1 rewritten circuit, 1 new parity-test script, 1 constraint-count log entry)
**Analogs found:** 3 / 3 (no analog has the same data flow — this is a structural rewrite — but strong partial matches exist for every sub-pattern)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `zk-proofs/circuits/identity.circom` | circuit (rewritten) | transform (private attrs → public commitment + predicates) | `zk-proofs/circuits/identity.circom` (current flat version, pre-rewrite) | role-match (same file, same role, old/simpler data flow — structural template, not logic, is reused) |
| `zk-proofs/test/circuitParity.test.js` (new) | test | batch (witness-vector diff against JS oracle) | `privdId_admin/backend/scripts/reseed.js` (assert-equality oracle pattern) + `zk-proofs/test/Registry.js` (mocha/chai test-file convention in this package) | role-match (test role exact; data-flow partial — reseed.js is the closer "JS-oracle parity assert" pattern, Registry.js is the closer "this package's test file shape") |
| Constraint-count log entry (destination TBD by plan, e.g. `docs/current/research/PERFORMANCE_METRICS.md`) | config/log | batch (one-shot recorded metric) | none in zk-proofs; `identityCommitment.js` console.time/timeEnd convention is the closest "measure and record" idiom in this codebase | role-match |

## Pattern Assignments

### `zk-proofs/circuits/identity.circom` (circuit, transform)

**Analog:** `zk-proofs/circuits/identity.circom` (current 28-line flat version — read in full, reproduced below)

**Full current file (lines 1-30) — this IS the file being structurally rewritten, not copied verbatim:**
```circom
pragma circom 2.1.6;

include "poseidon.circom";

// Template for digital identity proof
template Identity() {
    // Private inputs: user attributes as field elements
    signal input name;
    signal input rollNo;
    signal input dob;
    signal input phoneNo;
    signal input branch;

    // Public output: the computed hash of all attributes
    signal output pubHash;

    // Hash the attributes together
    component hasher = Poseidon(5);
    hasher.inputs[0] <== name;
    hasher.inputs[1] <== rollNo;
    hasher.inputs[2] <== dob;
    hasher.inputs[3] <== phoneNo;
    hasher.inputs[4] <== branch;

    // Output the computed hash as public signal
    pubHash <== hasher.out;
}

// Expose the main component
component main = Identity();
```

**What carries forward from this analog (keep these conventions in the rewrite):**
- `pragma circom 2.1.6;` — unchanged, version pinned.
- `include "poseidon.circom";` with **no relative path prefix** — confirmed this bare include resolves correctly today (the old circuit compiles with it), because `hardhat.config.js`'s `circom.inputBasePath: "./circuits"` plus whatever symlink/copy mechanism hardhat-circom uses already exposes `circomlib/circuits/*.circom` as bare-importable. The new file will need `include "comparators.circom";` (for `GreaterEqThan`/`IsEqual`) added the same bare way — confirmed present at `zk-proofs/circomlib/circuits/comparators.circom`.
- Single `template Identity() { ... }` plus a single `component main = Identity();` at file end — same top-level shape; CONTEXT.md's "Claude's Discretion" permits internal helper templates, but the file should still end with this exact one-line `component main = Identity();` pattern.
- `component hasher = Poseidon(5); hasher.inputs[i] <== ...; pubHash <== hasher.out;` is the **exact Poseidon component wiring idiom** to reuse for every `Poseidon(2)` leaf/node hash in the new circuit — same `.inputs[i] <==` / `.out` field names, just instantiated 15 times (7 leaves + 1 zero-pad + 4 level-1 nodes + 2 level-2 nodes + 1 root) with arity 2 instead of once with arity 5.

**Vendored circomlib templates to import (read from `zk-proofs/circomlib/circuits/comparators.circom`):**
```circom
// lines 37-40
template IsEqual() {
    signal input in[2];
    signal output out;
```
```circom
// lines 89-92 (the ACTIVE LessThan — ignore the dead commented-out version at lines 62-65)
template LessThan(n) {
    assert(n <= 252);
    signal input in[2];
    signal output out;
```
```circom
// lines 105-108
template LessEqThan(n) {
    signal input in[2];
    signal output out;
```
```circom
// lines 131-134
template GreaterEqThan(n) {
    signal input in[2];
    signal output out;
```
All four take `signal input in[2]` and produce `signal output out` (boolean 0/1) — wire as `component eq = IsEqual(); eq.in[0] <== a; eq.in[1] <== b;` then consume `eq.out`. Same calling convention for `GreaterEqThan(32)`/`LessEqThan(32)` per RESEARCH.md's age-predicate recommendation.

**JS oracle this circuit must match bit-for-bit** — `privdId_admin/backend/utils/identityCommitment.js`:
```javascript
// lines 198-216 — tree topology the circuit's Merkle stage must mirror exactly (left=lower index)
const n01 = poseidon.F.toString(poseidon([BigInt(leafValues[0]), BigInt(leafValues[1])]));
const n23 = poseidon.F.toString(poseidon([BigInt(leafValues[2]), BigInt(leafValues[3])]));
const n45 = poseidon.F.toString(poseidon([BigInt(leafValues[4]), BigInt(leafValues[5])]));
const n67 = poseidon.F.toString(poseidon([BigInt(leafValues[6]), BigInt(leafValues[7])]));
const n0123 = poseidon.F.toString(poseidon([BigInt(n01), BigInt(n23)]));
const n4567 = poseidon.F.toString(poseidon([BigInt(n45), BigInt(n67)]));
const root = poseidon.F.toString(poseidon([BigInt(n0123), BigInt(n4567)]));
```
```javascript
// lines 142-146 — leaf computation the circuit's leaf stage must mirror exactly
export async function computeLeaf(encodedAttr, salt) {
  const poseidon = await getPoseidon();
  const leaf = poseidon([BigInt(encodedAttr), BigInt(salt)]);
  return poseidon.F.toString(leaf);
}
```
```javascript
// lines 194-196 — zero-padding leaf; circuit must produce the identical non-zero constant via
// component zeroPad = Poseidon(2); zeroPad.inputs[0] <== 0; zeroPad.inputs[1] <== 0;
const zeroPadLeaf = poseidon([0n, 0n]);
leafValues.push(poseidon.F.toString(zeroPadLeaf));
```

**Enum-code constants the circuit's `isPostgrad` set-membership must hardcode** — `privdId_admin/backend/constants/enumCodes.js` (lines 22-44):
```javascript
export const PROGRAMME_LEVEL = {
  "B.Tech": 1, "B.Des": 2, "Dual": 3, "M.Tech": 4, "M.Des": 5, "PhD": 6,
};
export const POSTGRAD_CODES = new Set([4, 5, 6]);
```
Circuit must use literal constants `4`, `5`, `6` in three `IsEqual` components compared against `attr[3]`, matching D-13.

**No error-handling / auth / validation pattern applies** — circom has no exception model; constraint failure at witness-generation time is the only "error" surface (covered by the parity test, not by in-circuit code).

---

### `zk-proofs/test/circuitParity.test.js` (new file, test, batch)

**Primary analog — JS-oracle assert-equality idiom:** `privdId_admin/backend/scripts/reseed.js`

**Imports pattern** (lines 20-25):
```javascript
import { hashToField, generateSalts, computeMerkleRoot, CHUNK_COUNTS } from "../utils/identityCommitment.js";
import { PROGRAMME_LEVEL, DISCIPLINE } from "../constants/enumCodes.js";
import Student from "../models/Student.js";
import mongoose from "mongoose";
import assert from "assert";
import dotenv from "dotenv";
```
For the new parity test, the equivalent import set (per RESEARCH.md §3's "use snarkjs JS API directly, zero new deps" decision) is: `snarkjs` (for `wtns.calculate` / witness export), the compiled `identity_js/witness_calculator.js` or wasm path under `zk-proofs/build/`, and — across the package boundary — `privdId_admin/backend/utils/identityCommitment.js` (`computeLeaf`/`computeMerkleRoot`) as the oracle to diff against. Note: `identityCommitment.js` is an ESM module (`export async function ...`) in a different package (`privdId_admin/backend`) than `zk-proofs` — the plan must decide whether to `import` cross-package (relative path reach-through) or duplicate the minimal oracle logic inline in the test; CONTEXT.md leaves this to discretion but flag the cross-package import as the lower-duplication option if `zk-proofs`'s `package.json` is also `"type": "module"`-compatible.

**Assert-equality oracle pattern to copy** (`reseed.js` conceptual idiom — the spec's actual assertion lives further down in the file past what was read, but the imported `assert` module plus the spec's explicit requirement establish the pattern):
```javascript
// IDENTITY_SPEC.md §9 (lines 257): "The re-seed script ... MUST assert that running the
// implemented hashToField and computeMerkleRoot functions against these exact input strings
// produces the exact decimal strings above."
// → pattern: assert.strictEqual(actualComputedValue, expectedDecimalStringFromSpec)
```
Apply the same `assert.strictEqual(circuitPubHash, jsComputedRoot)` idiom per IDENTITY_SPEC.md §9 vector (5 single-chunk + 2 mandatory multi-chunk cases), per D-14.

**Secondary analog — this package's test-file shape:** `zk-proofs/test/Registry.js` (full file read, 49 lines)
```javascript
// lines 1-11 — mocha/chai describe/before structure used by every test file in zk-proofs/test/
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CredentialRegistry Gas Costs", function () {
  let registry;

  before(async function () {
    const Registry = await ethers.getContractFactory("CredentialRegistry");
    registry = await Registry.deploy();
    await registry.waitForDeployment();
  });
```
```javascript
// lines 13-23 — it(...) block pattern: arrange → act → console.log measurement → expect assertion
it("Should report gas cost for issuing a new credential", async function () {
  const tx = await registry.issueCredential(...);
  const receipt = await tx.wait();
  console.log(`\nGas used for issueCredential (new): ${receipt.gasUsed.toString()}`);
  expect(receipt.gasUsed).to.be.gt(0);
});
```
**Caveat:** `Registry.js` uses CommonJS `require(...)` + Mocha `describe`/`it`/`before`, run via `npx hardhat test`. The new `circuitParity.test.js` should follow this same `describe`/`it` shape (consistent with the existing `zk-proofs/test/` directory and its `hardhat test` runner) but will need `assert.strictEqual` (or `chai`'s `expect(...).to.equal(...)`) for each of the 7 IDENTITY_SPEC.md §9 vectors instead of gas-cost `expect(...).to.be.gt(0)` checks. If `identityCommitment.js`'s ESM imports don't resolve cleanly under `zk-proofs`'s CommonJS-style test runner, the plan should note this as an integration risk to resolve explicitly (e.g., dynamic `import()` inside an `async function`, or duplicating just the `computeLeaf`/`computeMerkleRoot` logic locally — both are viable, pick one explicitly rather than discovering it mid-implementation).

**No auth/validation pattern applies** (test file, not a request-handling file).

---

### Constraint-count recording (log entry, batch)

No direct in-repo analog for "append a measured metric to a markdown doc," but the closest idiom in spirit is `identityCommitment.js`'s `console.time`/`console.timeEnd` measurement discipline (lines 183, 217):
```javascript
console.time("computeMerkleRoot");
// ... computation ...
console.timeEnd("computeMerkleRoot");
```
This establishes the project's "measure everything, print/record concretely" convention (per CLAUDE.md ground rule 5: "Measure everything — every new crypto op prints seconds"). For the constraint count, the equivalent is: run `npx snarkjs r1cs info build/identity.r1cs`, capture the `nConstraints` line from its stdout, and append it as a dated entry — following the same "concrete recorded number, not a vague note" discipline — to whichever destination the plan picks (RESEARCH.md §4 risk 7 suggests `docs/current/research/PERFORMANCE_METRICS.md`).

---

## Shared Patterns

### Poseidon component wiring (applies to every leaf/node hash in the circuit)
**Source:** `zk-proofs/circuits/identity.circom` lines 18-23 (current file)
```circom
component hasher = Poseidon(5);
hasher.inputs[0] <== name;
hasher.inputs[1] <== rollNo;
...
pubHash <== hasher.out;
```
**Apply to:** every `Poseidon(2)` instantiation in the rewritten circuit (7 leaves, 1 zero-pad, 4 level-1 nodes, 2 level-2 nodes, 1 root) — same `.inputs[i] <==` / `.out` idiom, arity changed from 5 to 2.

### Left-child-first Merkle combine (asymmetric Poseidon(2) ordering)
**Source:** `privdId_admin/backend/utils/identityCommitment.js` lines 198-216
**Apply to:** every internal-node `Poseidon(2)` component in the circuit — the lower-index leaf/node is ALWAYS `inputs[0]`, never `inputs[1]`. This is the single most important correctness invariant per IDENTITY_SPEC.md §4 and the JS reference already encodes it correctly — the circuit must replicate the exact same pairing (`leaf0,leaf1 → n01`; `leaf2,leaf3 → n23`; etc.) in the same left/right argument order.

### Bare circomlib include resolution
**Source:** `zk-proofs/circuits/identity.circom` line 3 (`include "poseidon.circom";`), confirmed working via the existing compiled `zk-proofs/build/identity.r1cs`/`.sym`
**Apply to:** the new `include "comparators.circom";` statement needed for `GreaterEqThan`/`IsEqual` — same bare-path resolution mechanism (hardhat-circom's `inputBasePath: "./circuits"` config in `zk-proofs/hardhat.config.js` lines 9-15), no relative `../circomlib/circuits/` prefix needed.

### Assert-equality parity-check idiom
**Source:** `privdId_admin/backend/scripts/reseed.js` (import of `assert` at line 24) + IDENTITY_SPEC.md §9 requirement text (line 257)
**Apply to:** `zk-proofs/test/circuitParity.test.js` — every one of the 7 IDENTITY_SPEC.md §9 vectors gets an `assert.strictEqual(witnessPubHash, expectedDecimalString)` (or chai equivalent), with the 2 multi-chunk vectors (37-byte name, 40-byte email) marked as mandatory per D-14.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| Selective-disclosure binding constraints (`revealMask[i]`/`revealedValue[i]`) | circuit sub-pattern | transform | No existing circuit in this repo does conditional/selective disclosure — the old flat circuit reveals nothing selectively (single opaque hash). RESEARCH.md §1 already supplies the exact constraint forms (`revealMask_i * (revealMask_i - 1) === 0`, `revealMask_i * (revealedValue_i - attr_i) === 0`, optionally `(1 - revealMask_i) * revealedValue_i === 0`) — use those directly, there is no codebase analog to extract instead. |
| Nonce-binding constraint (`nonceSq <== nonce * nonce`) | circuit sub-pattern | event-driven (replay-binding) | No existing circuit or contract in this repo binds a nonce into a ZK constraint system (the registry contract's nonce/replay handling, if any, is a different mechanism at the Solidity layer, not circom). RESEARCH.md §1 supplies the exact one-line pattern; no in-repo analog exists. |

## Metadata

**Analog search scope:** `zk-proofs/circuits/`, `zk-proofs/circomlib/circuits/`, `zk-proofs/test/`, `zk-proofs/hardhat.config.js`, `zk-proofs/package.json`, `privdId_admin/backend/utils/identityCommitment.js`, `privdId_admin/backend/constants/enumCodes.js`, `privdId_admin/backend/scripts/reseed.js`, `docs/current/research/IDENTITY_SPEC.md` §1/§7/§9/§10
**Files scanned:** 9 read in full or targeted range; 1 directory listing (`zk-proofs/circomlib/circuits/`)
**Pattern extraction date:** 2026-06-17
