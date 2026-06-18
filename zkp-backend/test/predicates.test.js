/**
 * predicates.test.js — behavior cases from 04-01-PLAN.md Task 1 <behavior>.
 */

const assert = require("assert");
const { computeIsOver18, computeIsPostgrad } = require("../lib/predicates");

describe("predicates: computeIsOver18", function () {
  it("returns 1 when well over 18", function () {
    assert.strictEqual(computeIsOver18("20260617", "20040215"), 1);
  });

  it("returns 1 at the exact boundary (inclusive)", function () {
    assert.strictEqual(computeIsOver18("20260617", "20080617"), 1);
  });

  it("returns 0 one day under the boundary", function () {
    assert.strictEqual(computeIsOver18("20260617", "20080618"), 0);
  });
});

describe("predicates: computeIsPostgrad", function () {
  it("returns 1 for M.Tech (4)", function () {
    assert.strictEqual(computeIsPostgrad(4), 1);
  });

  it("returns 1 for M.Des (5)", function () {
    assert.strictEqual(computeIsPostgrad(5), 1);
  });

  it("returns 1 for PhD (6)", function () {
    assert.strictEqual(computeIsPostgrad(6), 1);
  });

  it("returns 0 for B.Tech (1)", function () {
    assert.strictEqual(computeIsPostgrad(1), 0);
  });

  it("returns 0 for Dual (3) — intentionally excluded", function () {
    assert.strictEqual(computeIsPostgrad(3), 0);
  });
});
