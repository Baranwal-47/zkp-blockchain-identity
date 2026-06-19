/**
 * nonceStore.test.js — lifecycle coverage for lib/nonceStore.js:
 * issue range, unknown-session, mismatch, one-time-use, expiry.
 */

const assert = require("assert");
const {
  issueNonce,
  validateAndConsume,
  BN128_FIELD_ORDER,
  _store,
} = require("../lib/nonceStore");

describe("nonceStore", function () {
  it("issueNonce returns a nonce that is a positive field element < BN128 order", function () {
    const { nonce, sessionId, expiresAt } = issueNonce();
    const n = BigInt(nonce);
    assert.ok(n > 0n, "nonce must be > 0");
    assert.ok(n < BN128_FIELD_ORDER, "nonce must be < BN128_FIELD_ORDER");
    assert.strictEqual(typeof sessionId, "string");
    assert.ok(sessionId.length > 0);
    assert.strictEqual(typeof expiresAt, "number");
  });

  it("expiresAt is issuedAt + 15 minutes (900000 ms)", function () {
    const before = Date.now();
    const { sessionId, expiresAt } = issueNonce();
    const entry = _store.get(sessionId);
    assert.strictEqual(expiresAt, entry.issuedAt + 900000);
    assert.ok(entry.issuedAt >= before);
  });

  it("validateAndConsume(unknownSessionId, anyNonce) -> unknown_session", function () {
    const result = validateAndConsume("not-a-real-session-id", "12345");
    assert.deepStrictEqual(result, { ok: false, reason: "unknown_session" });
  });

  it("validateAndConsume(sid, wrongNonce) -> nonce_mismatch", function () {
    const { sessionId } = issueNonce();
    const result = validateAndConsume(sessionId, "0");
    assert.deepStrictEqual(result, { ok: false, reason: "nonce_mismatch" });
  });

  it("validateAndConsume(sid, correctNonce) -> ok:true, then second call -> nonce_already_used", function () {
    const { nonce, sessionId } = issueNonce();
    const first = validateAndConsume(sessionId, nonce);
    assert.deepStrictEqual(first, { ok: true });

    const second = validateAndConsume(sessionId, nonce);
    assert.deepStrictEqual(second, { ok: false, reason: "nonce_already_used" });
  });

  it("an expired entry returns nonce_expired", function () {
    const { nonce, sessionId } = issueNonce();
    // Inject an expired expiresAt directly into the store (server clock
    // simulation per RESEARCH Pitfall 4 — never trust client timestamps;
    // here we control the *stored* server-side value, not a client field).
    const entry = _store.get(sessionId);
    entry.expiresAt = Date.now() - 1000;

    const result = validateAndConsume(sessionId, nonce);
    assert.deepStrictEqual(result, { ok: false, reason: "nonce_expired" });
  });
});
