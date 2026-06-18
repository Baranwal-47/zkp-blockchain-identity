/**
 * encoding.test.js — parity vectors for lib/encoding.js::hashToField, anchored
 * against the IDENTITY_SPEC.md section 9 vectors (also used by
 * zk-proofs/test/circuitParity.test.js and 04-01-PLAN.md's <behavior> block).
 */

const assert = require("assert");
const { hashToField, CHUNK_COUNTS } = require("../lib/encoding");

describe("encoding: hashToField parity vectors", function () {
  it('hashToField("Utkarsh Baranwal", 4) matches the frozen oracle vector', async function () {
    const result = await hashToField("Utkarsh Baranwal", CHUNK_COUNTS.name);
    assert.strictEqual(
      result,
      "2689494646062948360487866858549161268023147861439580363715484426041810573382"
    );
  });

  it('hashToField("21BCS027", 2) matches the frozen oracle vector', async function () {
    const result = await hashToField("21BCS027", CHUNK_COUNTS.rollNo);
    assert.strictEqual(
      result,
      "15150160435819557810078120971221321758887516517285291325240673283662695955468"
    );
  });

  it('hashToField("21bcs027@iiitdmj.ac.in", 2) matches the frozen oracle vector', async function () {
    const result = await hashToField("21bcs027@iiitdmj.ac.in", CHUNK_COUNTS.email);
    assert.strictEqual(
      result,
      "6744441775314583329532040559385253235651674879202368422786321712697490882813"
    );
  });
});
