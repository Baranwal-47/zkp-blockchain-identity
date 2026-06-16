/**
 * TDD RED phase test for identityCommitment.js
 *
 * Tests all verified vectors from 01-RESEARCH.md parity oracle.
 * Run with: node scripts/identityCommitment.test.mjs
 *
 * Expected behavior (from frozen spec):
 *   - hashToField("Utkarsh Baranwal", 4)    === "2689494646062948360487866858549161268023147861439580363715484426041810573382"
 *   - hashToField("Rajesh Kumar Sharma Gupta Verma Singh", 4) === "8788477441821112447812609039840608362124692723989989797277498722759269778947"  (37 bytes, 2 chunks)
 *   - hashToField("21BCS027", 2)             === "15150160435819557810078120971221321758887516517285291325240673283662695955468"
 *   - hashToField("utkarshbaranwal47@students.iiitdmj.ac.in", 2) === "15157798813008110916508472488358427390626844432052365640772174362044533657556"  (40 bytes, 2 chunks)
 *   - computeLeaf(0, 0)                      === "14744269619966411208579211824598458697587494354926760081771325075741142829156"
 *   - generateSalt() always < BN128 field order (1000 samples)
 *   - computeMerkleRoot is deterministic
 *   - CHUNK_COUNTS === { name: 4, rollNo: 2, email: 2 }
 */

import assert from "assert";

// The module under test — will fail on import until GREEN phase
const m = await import("../utils/identityCommitment.js");

const BN128_FIELD_ORDER = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL: ${name}`);
    console.log(`        ${err.message}`);
    failed++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL: ${name}`);
    console.log(`        ${err.message}`);
    failed++;
  }
}

console.log("\n=== identityCommitment.js TDD Tests ===\n");

// --- Export surface ---
console.log("-- Module exports --");
test("exports hashToField", () => assert.strictEqual(typeof m.hashToField, "function"));
test("exports generateSalt", () => assert.strictEqual(typeof m.generateSalt, "function"));
test("exports generateSalts", () => assert.strictEqual(typeof m.generateSalts, "function"));
test("exports computeLeaf", () => assert.strictEqual(typeof m.computeLeaf, "function"));
test("exports computeMerkleRoot", () => assert.strictEqual(typeof m.computeMerkleRoot, "function"));
test("exports CHUNK_COUNTS", () => assert.deepStrictEqual(m.CHUNK_COUNTS, { name: 4, rollNo: 2, email: 2 }));

// --- hashToField parity vectors ---
console.log("\n-- hashToField parity vectors --");
await asyncTest("hashToField('Utkarsh Baranwal', 4) matches research vector", async () => {
  const result = await m.hashToField("Utkarsh Baranwal", 4);
  assert.strictEqual(
    result,
    "2689494646062948360487866858549161268023147861439580363715484426041810573382",
    `Got: ${result}`
  );
});

await asyncTest("hashToField('Rajesh Kumar Sharma Gupta Verma Singh', 4) — 37 bytes, 2 chunks", async () => {
  const result = await m.hashToField("Rajesh Kumar Sharma Gupta Verma Singh", 4);
  assert.strictEqual(
    result,
    "8788477441821112447812609039840608362124692723989989797277498722759269778947",
    `Got: ${result}`
  );
});

await asyncTest("hashToField('21BCS027', 2) matches research vector", async () => {
  const result = await m.hashToField("21BCS027", 2);
  assert.strictEqual(
    result,
    "15150160435819557810078120971221321758887516517285291325240673283662695955468",
    `Got: ${result}`
  );
});

await asyncTest("hashToField('utkarshbaranwal47@students.iiitdmj.ac.in', 2) — 40 bytes, 2 chunks", async () => {
  const result = await m.hashToField("utkarshbaranwal47@students.iiitdmj.ac.in", 2);
  assert.strictEqual(
    result,
    "15157798813008110916508472488358427390626844432052365640772174362044533657556",
    `Got: ${result}`
  );
});

// --- computeLeaf zero-pad vector ---
console.log("\n-- computeLeaf --");
await asyncTest("computeLeaf(0, 0) === Poseidon(2)(0,0) — verified zero-pad leaf", async () => {
  const result = await m.computeLeaf(0, 0);
  // Value verified by running against circomlibjs@0.1.7 installed in privdId_admin/backend/
  // Note: research doc had a transcription error; this is the actual library output.
  assert.strictEqual(
    result,
    "14744269619966411208579211824598458697587494354926760081771325075741142829156",
    `Got: ${result}`
  );
});

// --- generateSalt field safety ---
console.log("\n-- generateSalt field safety (1000 samples) --");
test("generateSalt() returns decimal string", () => {
  const s = m.generateSalt();
  assert.strictEqual(typeof s, "string", `Expected string, got ${typeof s}`);
  assert.ok(/^\d+$/.test(s), `Expected all-digits string, got: ${s}`);
});

test("generateSalt() always < BN128_FIELD_ORDER (1000 iterations)", () => {
  for (let i = 0; i < 1000; i++) {
    const s = m.generateSalt();
    const v = BigInt(s);
    if (v >= BN128_FIELD_ORDER) {
      throw new Error(`Salt ${s} >= BN128_FIELD_ORDER at iteration ${i}`);
    }
  }
});

// --- generateSalts ---
console.log("\n-- generateSalts --");
test("generateSalts() returns array of 7 decimal strings by default", () => {
  const salts = m.generateSalts();
  assert.strictEqual(salts.length, 7);
  for (const s of salts) {
    assert.strictEqual(typeof s, "string");
    assert.ok(/^\d+$/.test(s), `Expected all-digits string: ${s}`);
  }
});

test("generateSalts(3) returns array of length 3", () => {
  const salts = m.generateSalts(3);
  assert.strictEqual(salts.length, 3);
});

// --- computeMerkleRoot determinism ---
console.log("\n-- computeMerkleRoot determinism --");
await asyncTest("computeMerkleRoot is deterministic for fixed inputs", async () => {
  const attrs = ["1", "2", "3", "4", "5", "6", "7"];
  const salts = ["11", "22", "33", "44", "55", "66", "77"];
  const r1 = await m.computeMerkleRoot(attrs, salts);
  const r2 = await m.computeMerkleRoot(attrs, salts);
  assert.strictEqual(r1, r2, `computeMerkleRoot not deterministic: ${r1} !== ${r2}`);
  assert.ok(/^\d+$/.test(r1), `Root should be all-digits decimal string: ${r1}`);
});

await asyncTest("computeMerkleRoot returns a decimal string in BN128 field", async () => {
  const attrs = ["1", "2", "3", "4", "5", "6", "7"];
  const salts = ["11", "22", "33", "44", "55", "66", "77"];
  const root = await m.computeMerkleRoot(attrs, salts);
  assert.ok(BigInt(root) < BN128_FIELD_ORDER, `Root ${root} >= BN128 field order`);
});

// --- Summary ---
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);

if (failed > 0) {
  process.exit(1);
}
