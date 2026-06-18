/**
 * generateProof.test.js — integration test for the rewritten POST
 * /generate-proof and the new POST /session/nonce route.
 *
 * Anchored against the same section-9 "Utkarsh Baranwal" FIXED_SALTS vector
 * used by zkp-backend/test/witnessBuilder.test.js and
 * zk-proofs/test/circuitParity.test.js, so the oracle parity proof already
 * established at the library layer (plan 04-01) carries through the full
 * HTTP route.
 */

const assert = require("assert");
const request = require("supertest");

const app = require("../server");

describe("POST /generate-proof", function () {
  this.timeout(60000);

  let computeMerkleRoot;

  before(async function () {
    const oracle = await import(
      "../../privdId_admin/backend/utils/identityCommitment.js"
    );
    computeMerkleRoot = oracle.computeMerkleRoot;
  });

  const FIXED_SALTS = ["1", "2", "3", "4", "5", "6", "7"];
  const studentAttrs = {
    name: "Utkarsh Baranwal",
    rollNo: "21BCS027",
    dob: "20040215",
    programmeLevel: "B.Tech",
    discipline: "CSE",
    batch: "2021",
    email: "21bcs027@iiitdmj.ac.in",
  };
  const NONCE = "1";
  const CURRENT_DATE_INT = "20260617";

  it("returns a 19-signal proof whose publicSignals[0] matches the oracle pubHash", async function () {
    const res = await request(app)
      .post("/generate-proof")
      .send({
        attrs: studentAttrs,
        salts: FIXED_SALTS,
        reveal: {},
        nonce: NONCE,
        currentDateInt: CURRENT_DATE_INT,
      });

    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.publicSignals));
    assert.strictEqual(res.body.publicSignals.length, 19);

    // attr[] must be re-derived exactly as buildWitnessInput does, to feed
    // the oracle's computeMerkleRoot for a same-input comparison.
    const { buildWitnessInput } = require("../lib/witnessBuilder");
    const witnessInput = await buildWitnessInput({
      attrs: studentAttrs,
      salts: FIXED_SALTS,
      reveal: {},
      nonce: NONCE,
      currentDateInt: CURRENT_DATE_INT,
    });
    const jsRoot = await computeMerkleRoot(witnessInput.attr, FIXED_SALTS);

    assert.strictEqual(res.body.publicSignals[0], jsRoot);
    assert.deepStrictEqual(res.body.salts, FIXED_SALTS);
    assert.ok(res.body.proof);
  });

  it("generates salts server-side when omitted from the request", async function () {
    const res = await request(app)
      .post("/generate-proof")
      .send({
        attrs: studentAttrs,
        reveal: {},
        nonce: NONCE,
        currentDateInt: CURRENT_DATE_INT,
      });

    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.salts));
    assert.strictEqual(res.body.salts.length, 7);
    assert.strictEqual(res.body.publicSignals.length, 19);
  });

  it("returns HTTP 400 (not 500) on a malformed body missing currentDateInt", async function () {
    const res = await request(app)
      .post("/generate-proof")
      .send({
        attrs: studentAttrs,
        salts: FIXED_SALTS,
        reveal: {},
        nonce: NONCE,
        // currentDateInt intentionally omitted
      });

    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error);
  });

  it("returns HTTP 400 on a malformed body missing attrs", async function () {
    const res = await request(app)
      .post("/generate-proof")
      .send({
        salts: FIXED_SALTS,
        reveal: {},
        nonce: NONCE,
        currentDateInt: CURRENT_DATE_INT,
      });

    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error);
  });
});

describe("POST /session/nonce", function () {
  it("returns a nonce, sessionId, and an expiresAt ~5 minutes in the future", async function () {
    const before = Date.now();
    const res = await request(app).post("/session/nonce").send({});
    const after = Date.now();

    assert.strictEqual(res.status, 200);
    assert.strictEqual(typeof res.body.nonce, "string");
    assert.strictEqual(typeof res.body.sessionId, "string");
    assert.strictEqual(typeof res.body.expiresAt, "number");

    const delta = res.body.expiresAt - before;
    assert.ok(delta > 0 && delta <= 305000, `expected expiresAt-now in (0, 305000], got ${delta}`);
    assert.ok(res.body.expiresAt >= after, "expiresAt should be in the future relative to request end");
  });
});
