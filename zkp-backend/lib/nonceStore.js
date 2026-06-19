/**
 * nonceStore.js — in-memory verifier-nonce lifecycle store (REPL-03 issue +
 * verify-time enforcement half).
 *
 * Backs `POST /session/nonce` (issue) and the verify-time enforcement path
 * (validateAndConsume): a sessionId-keyed Map holding {nonce, issuedAt,
 * expiresAt, used}. TTL = 15 minutes (D-08), one-time-use enforced via `used`.
 *
 * Nonce generation mirrors identityCommitment.js::generateSalt() /
 * zkp-backend/lib/encoding.js::generateSalt() — crypto.randomBytes(31) =
 * 248 bits, always < BN128_FIELD_ORDER (2^254-ish), avoiding modulo bias
 * (04-RESEARCH.md "Alternatives Considered" / Pattern 5).
 *
 * KNOWN PROTOTYPE LIMITATION (T-04-03, accepted disposition, RESEARCH
 * Pitfall 5): this Map grows unboundedly — every issued nonce that is never
 * presented to validateAndConsume stays in memory forever (lazy expiry only
 * evicts on access, not proactively). Acceptable for this milestone's
 * single-instance, low-traffic prototype scope; a periodic sweep
 * (`setInterval` deleting `expiresAt < Date.now()` entries) is a deferred
 * v2 hardening item, not a blocking concern here.
 */

const crypto = require("crypto");

// BN128 scalar field order — same constant as lib/encoding.js /
// identityCommitment.js. Exported so callers/tests can assert nonce range.
const BN128_FIELD_ORDER =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

const TTL_MS = 15 * 60 * 1000; // 15 minutes (D-08), in milliseconds (Date.now() unit — Pitfall 4)

// sessionId -> { nonce, issuedAt, expiresAt, used }
const store = new Map();

/**
 * issueNonce() -> { nonce, sessionId, expiresAt }
 *
 * expiresAt is epoch milliseconds (same unit as Date.now()), documented here
 * and at the /session/nonce route so callers don't misinterpret units.
 */
function issueNonce() {
  const sessionId = crypto.randomUUID();
  // 31 bytes = 248 bits, always < BN128 field order (identical technique to
  // identityCommitment.js::generateSalt() — see module header).
  const nonce = BigInt("0x" + crypto.randomBytes(31).toString("hex")).toString();
  const issuedAt = Date.now();
  const expiresAt = issuedAt + TTL_MS;
  store.set(sessionId, { nonce, issuedAt, expiresAt, used: false });
  return { nonce, sessionId, expiresAt };
}

/**
 * validateAndConsume(sessionId, presentedNonce) -> { ok: boolean, reason?: string }
 *
 * reasons: "unknown_session" | "nonce_already_used" | "nonce_expired" | "nonce_mismatch"
 * Checked in that order. Expiry is always evaluated against the server's
 * own Date.now() — never trust a client-suppliable timestamp.
 * On success, marks the entry used (one-time-use) before returning {ok:true}.
 */
function validateAndConsume(sessionId, presentedNonce) {
  const entry = store.get(sessionId);
  if (!entry) return { ok: false, reason: "unknown_session" };
  if (entry.used) return { ok: false, reason: "nonce_already_used" };
  if (Date.now() > entry.expiresAt) return { ok: false, reason: "nonce_expired" };
  if (entry.nonce !== presentedNonce) return { ok: false, reason: "nonce_mismatch" };
  entry.used = true;
  return { ok: true };
}

module.exports = {
  issueNonce,
  validateAndConsume,
  BN128_FIELD_ORDER,
  // exposed for test injection of expired entries
  _store: store,
};
