/**
 * verifyFlow.test.js — end-to-end nonce-lifecycle coverage for POST /verify
 * (and /verify-onchain when RPC is reachable), proving match + freshness +
 * one-time-use enforcement (REPL-03 enforcement half, BACK-02, BACK-03).
 *
 * Anchored against the same section-9 "Utkarsh Baranwal" FIXED_SALTS vector
 * used by generateProof.test.js / witnessBuilder.test.js, so a single real
 * proof generated against a live nonce drives every off-chain assertion
 * without requiring a live chain.
 */

const assert = require("assert");
const request = require("supertest");

const app = require("../server");
const { _store } = require("../lib/nonceStore");

describe("POST /verify — nonce lifecycle enforcement", function () {
  this.timeout(60000);

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
  const CURRENT_DATE_INT = "20260617";

  async function issueSession() {
    const res = await request(app).post("/session/nonce").send({});
    assert.strictEqual(res.status, 200);
    return res.body; // { nonce, sessionId, expiresAt }
  }

  async function generateProofForNonce(nonce) {
    const res = await request(app)
      .post("/generate-proof")
      .send({
        attrs: studentAttrs,
        salts: FIXED_SALTS,
        reveal: {},
        nonce,
        currentDateInt: CURRENT_DATE_INT,
      });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    return res.body; // { proof, publicSignals, salts }
  }

  it("step 1-3: fresh proof + fresh nonce -> {valid:true}, and publicSignals carries the nonce at index 1", async function () {
    const { nonce, sessionId } = await issueSession();
    const { proof, publicSignals } = await generateProofForNonce(nonce);

    assert.strictEqual(publicSignals.length, 19);
    assert.strictEqual(publicSignals[1], nonce);

    const verifyRes = await request(app)
      .post("/verify")
      .send({ proof, publicSignals, sessionId });

    assert.strictEqual(verifyRes.status, 200);
    assert.deepStrictEqual(verifyRes.body, { valid: true });
  });

  it("step 4: replaying the same proof+sessionId again -> {valid:false, reason:'nonce_already_used'}", async function () {
    const { nonce, sessionId } = await issueSession();
    const { proof, publicSignals } = await generateProofForNonce(nonce);

    const first = await request(app)
      .post("/verify")
      .send({ proof, publicSignals, sessionId });
    assert.deepStrictEqual(first.body, { valid: true });

    const replay = await request(app)
      .post("/verify")
      .send({ proof, publicSignals, sessionId });

    assert.strictEqual(replay.status, 200);
    assert.deepStrictEqual(replay.body, { valid: false, reason: "nonce_already_used" });
  });

  it("step 5: presenting a different session's sessionId with a mismatched nonce -> {valid:false, reason:'nonce_mismatch'}", async function () {
    const { nonce, sessionId } = await issueSession();
    const { proof, publicSignals } = await generateProofForNonce(nonce);

    // A second, unrelated session — its nonce does not match the proof's
    // embedded nonce, so presenting its sessionId against this proof
    // triggers nonce_mismatch (not unknown_session, since the session
    // itself is real and unconsumed).
    const otherSession = await issueSession();

    const res = await request(app)
      .post("/verify")
      .send({ proof, publicSignals, sessionId: otherSession.sessionId });

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, { valid: false, reason: "nonce_mismatch" });
  });

  it("step 6: an expired nonce entry -> {valid:false, reason:'nonce_expired'}", async function () {
    const { nonce, sessionId } = await issueSession();
    const { proof, publicSignals } = await generateProofForNonce(nonce);

    // Force the stored entry to be expired (server-clock simulation per
    // RESEARCH Pitfall 4 — we mutate the *stored* expiresAt, never a
    // client-suppliable timestamp).
    const entry = _store.get(sessionId);
    entry.expiresAt = Date.now() - 1000;

    const res = await request(app)
      .post("/verify")
      .send({ proof, publicSignals, sessionId });

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, { valid: false, reason: "nonce_expired" });
  });

  it("step 7: a tampered/invalid proof with a valid fresh nonce -> {valid:false, reason:'invalid_proof'} and does NOT consume the nonce", async function () {
    const { nonce, sessionId } = await issueSession();
    const { proof, publicSignals } = await generateProofForNonce(nonce);

    // Tamper with the proof so the cryptographic check fails while keeping
    // publicSignals (and therefore the nonce) intact.
    const tamperedProof = JSON.parse(JSON.stringify(proof));
    tamperedProof.pi_a[0] = "1";

    const badRes = await request(app)
      .post("/verify")
      .send({ proof: tamperedProof, publicSignals, sessionId });

    assert.strictEqual(badRes.status, 200);
    assert.deepStrictEqual(badRes.body, { valid: false, reason: "invalid_proof" });

    // The nonce must still be unconsumed: a subsequent valid proof against
    // the SAME session/nonce should still succeed (threat T-04-08 — a bad
    // proof must not be able to grief/burn a session's nonce).
    const goodRes = await request(app)
      .post("/verify")
      .send({ proof, publicSignals, sessionId });

    assert.strictEqual(goodRes.status, 200);
    assert.deepStrictEqual(goodRes.body, { valid: true });
  });

  describe("on-chain checks (gated on RPC availability)", function () {
    // RPC reachability alone doesn't mean the fixture identity below is
    // registered under the *current* circuit's commitment scheme — the
    // live registry may only hold pre-rebuild (old field-set) credentials
    // for this identity. Require an explicit opt-in so this suite stays
    // green by default and only asserts found:true when the caller knows
    // the fixture has actually been (re-)issued on-chain under the new
    // 7-attribute Merkle scheme.
    const rpcConfigured = Boolean(process.env.BLOCKCHAIN_RPC_URL) &&
      !process.env.BLOCKCHAIN_RPC_URL.includes("/demo") &&
      process.env.TEST_FIXTURE_REGISTERED_ONCHAIN === "true";

    before(function () {
      if (!rpcConfigured) {
        console.log("  (skipping on-chain assertions: no live BLOCKCHAIN_RPC_URL, or fixture not confirmed registered under the new scheme — set TEST_FIXTURE_REGISTERED_ONCHAIN=true to enable)");
      }
    });

    it("POST /verify-onchain returns {valid:true} for a fresh proof+nonce", async function () {
      if (!rpcConfigured) return this.skip();

      const { nonce, sessionId } = await issueSession();
      const { proof, publicSignals } = await generateProofForNonce(nonce);

      const res = await request(app)
        .post("/verify-onchain")
        .send({ proof, publicSignals, sessionId });

      assert.strictEqual(res.status, 200);
      assert.deepStrictEqual(res.body, { valid: true });
    });

    it("POST /credential-info resolves found:true for a registered pubHash", async function () {
      if (!rpcConfigured) return this.skip();

      const { nonce } = await issueSession();
      const { publicSignals } = await generateProofForNonce(nonce);

      const res = await request(app)
        .post("/credential-info")
        .send({ pubHash: publicSignals[0] });

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.found, true);
    });
  });
});
