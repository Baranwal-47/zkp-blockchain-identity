/**
 * witnessBuilder.test.js — asserts buildWitnessInput produces a circuit
 * witness whose pubHash (public signal [0]) strictly equals
 * identityCommitment.js::computeMerkleRoot for the same attrs+salts
 * (CLAUDE.md ground rule #3: field-set consistency is sacred).
 *
 * Anchored against the section-9 "Utkarsh Baranwal" vector and the
 * WITNESS_IDX mapping from zk-proofs/test/circuitParity.test.js.
 */

const assert = require("assert");
const path = require("path");
const os = require("os");
const fs = require("fs");
const snarkjs = require("snarkjs");

const { buildWitnessInput } = require("../lib/witnessBuilder");

const WASM_PATH = path.join(__dirname, "..", "identity.wasm");

// Witness indices, verified against zk-proofs/test/circuitParity.test.js
// WITNESS_IDX: index 0 is the constant-1 wire; public signals occupy 1..18.
const WITNESS_IDX = {
  pubHash: 1,
};

describe("witnessBuilder: pubHash parity against the JS oracle", function () {
  this.timeout(60000);

  let computeMerkleRoot;
  let tmpDir;
  let wtnsCounter = 0;

  before(async function () {
    const oracle = await import(
      "../../privdId_admin/backend/utils/identityCommitment.js"
    );
    computeMerkleRoot = oracle.computeMerkleRoot;

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "witnessBuilder-"));

    assert.ok(
      fs.existsSync(WASM_PATH),
      `compiled circuit wasm missing at ${WASM_PATH}`
    );
  });

  after(function () {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function calculateWitness(input) {
    const wtnsPath = path.join(tmpDir, `witness-${wtnsCounter++}.wtns`);
    await snarkjs.wtns.calculate(input, WASM_PATH, wtnsPath);
    return snarkjs.wtns.exportJson(wtnsPath);
  }

  // Section-9 "Utkarsh Baranwal" vector, FIXED_SALTS — same as
  // zk-proofs/test/circuitParity.test.js Task 1 case (a).
  const FIXED_SALTS = ["1", "2", "3", "4", "5", "6", "7"];
  const studentAttrs = {
    name: "Utkarsh Baranwal",
    rollNo: "22BCSD01",
    dob: "20041014",
    programmeLevel: "B.Tech",
    discipline: "CSE",
    batch: "2022",
    email: "22bcsd01@iiitdmj.ac.in",
  };
  const NONCE = "1";
  const CURRENT_DATE_INT = "20260617";

  it("buildWitnessInput encodes attrs/salts/predicates correctly with reveal all-false", async function () {
    const input = await buildWitnessInput({
      attrs: studentAttrs,
      salts: FIXED_SALTS,
      reveal: {},
      nonce: NONCE,
      currentDateInt: CURRENT_DATE_INT,
    });

    assert.strictEqual(
      input.attr[0],
      "2689494646062948360487866858549161268023147861439580363715484426041810573382"
    );
    assert.strictEqual(
      input.attr[1],
      "17425832092592319413180526979504767455641968223880575080654107782930034285770"
    );
    assert.strictEqual(input.attr[2], "20041014");
    assert.strictEqual(input.attr[3], "1"); // B.Tech
    assert.strictEqual(input.attr[4], "1"); // CSE
    assert.strictEqual(input.attr[5], "2022");
    assert.strictEqual(
      input.attr[6],
      "16840526011907698207050203546069050573252923154187967909506713386987286094350"
    );
    assert.deepStrictEqual(input.salt, FIXED_SALTS);
    assert.strictEqual(input.isOver18, "1"); // well over 18 by 20260617
    assert.strictEqual(input.isPostgrad, "0"); // B.Tech not in postgrad set
    assert.deepStrictEqual(input.revealedValue, ["0", "0", "0", "0", "0", "0", "0"]);
    assert.deepStrictEqual(input.revealMask, ["0", "0", "0", "0", "0", "0", "0"]);

    // Output key shape exactly matches circuitParity.test.js buildInput.
    assert.deepStrictEqual(Object.keys(input).sort(), [
      "attr",
      "currentDateInt",
      "isOver18",
      "isPostgrad",
      "nonce",
      "revealMask",
      "revealedValue",
      "salt",
    ].sort());

    // Every numeric field must be a string, not a JS number / raw BigInt.
    for (const v of [...input.attr, ...input.salt, input.nonce, input.currentDateInt, input.isOver18, input.isPostgrad, ...input.revealedValue, ...input.revealMask]) {
      assert.strictEqual(typeof v, "string");
    }
  });

  it("witness pubHash === oracle computeMerkleRoot for the same attrs+salts", async function () {
    const input = await buildWitnessInput({
      attrs: studentAttrs,
      salts: FIXED_SALTS,
      reveal: {},
      nonce: NONCE,
      currentDateInt: CURRENT_DATE_INT,
    });

    const jsRoot = await computeMerkleRoot(input.attr, FIXED_SALTS);
    const witness = await calculateWitness(input);
    const circuitPubHash = witness[WITNESS_IDX.pubHash].toString();

    assert.strictEqual(circuitPubHash, jsRoot);
  });

  it("reveal.dob=true binds revealedValue[2]/revealMask[2], all others stay hidden", async function () {
    const input = await buildWitnessInput({
      attrs: studentAttrs,
      salts: FIXED_SALTS,
      reveal: { dob: true },
      nonce: NONCE,
      currentDateInt: CURRENT_DATE_INT,
    });

    assert.strictEqual(input.revealedValue[2], input.attr[2]);
    assert.strictEqual(input.revealMask[2], "1");

    for (let i = 0; i < 7; i++) {
      if (i === 2) continue;
      assert.strictEqual(input.revealedValue[i], "0");
      assert.strictEqual(input.revealMask[i], "0");
    }
  });
});
