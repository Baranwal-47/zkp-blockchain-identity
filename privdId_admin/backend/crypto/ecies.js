/**
 * ecies.js — ECIES DEK wrap/unwrap module (secp256k1).
 *
 * Canonical source: docs/CLAUDE_CODE_BLUEPRINT.md §E3.6 (module location) /
 * §E3.3 (claim-time DEK wrap flow).
 *
 * Wraps/unwraps a 32-byte DEK (Data Encryption Key) to/from a student's
 * on-device secp256k1 keypair using ECIES (eciesjs). The DEK is generated
 * server-side at issuance time (Phase 6, crypto/aesgcm.js::generateDEK) and
 * held in Student.pendingDek (select:false) until the student claims their
 * credential by submitting a public key (Phase 7). wrapDEK is called once at
 * claim time to produce the envelope pinned to IPFS as dekEnvelopeCID;
 * unwrapDEK is the symmetric client-side counterpart (no server-side caller
 * this phase — included for module completeness per the aesgcm.js shape).
 *
 * Envelope shape (frozen, do NOT change): a single base64 string — the raw
 * output of eciesjs's `encrypt()`, which itself concatenates an ephemeral
 * secp256k1 public key + IV + AES-GCM ciphertext + MAC. No additional
 * wrapping/JSON is applied here; the base64 string IS the envelope.
 *
 * THREAT MITIGATIONS (per threat_model in 07-01-PLAN.md):
 *   T-07-01: Replay re-wrap (tampering/elevation) — a forged or replayed
 *            POST /students/:id/pubkey re-wrapping the DEK to an
 *            attacker-controlled pubkey. Mitigated downstream by the
 *            one-time-claim D-06 enrollmentPhase guard enforced in plan
 *            07-02's claimCredential() service function; ecies.js itself is
 *            guard-agnostic and performs no phase checks.
 *   T-07-02: Malformed pubKeyHex DoS — an oversized or malformed pubKeyHex
 *            payload causing a crash or excessive resource use inside
 *            eciesjs.encrypt. Mitigated by synchronous type/length
 *            validation of dek and pubKeyHex BEFORE calling eciesjs.encrypt.
 *   T-07-03: Key material in logs (information disclosure) — the DEK or any
 *            key hex ending up in a backend log, error message, or crash
 *            report. Mitigated by never console.logging the DEK, pubKeyHex,
 *            or privKeyHex anywhere in this module; only the [perf] timing
 *            line (label + elapsed seconds) is logged, via timed().
 */

import { encrypt, decrypt } from "eciesjs";
import { timed } from "../utils/timing.js";

const DEK_LENGTH = 32; // AES-256 DEK size — must match crypto/aesgcm.js::KEY_LENGTH

/**
 * wrapDEK(pubKeyHex, dek) → Promise<string>
 *
 * ECIES-encrypts a 32-byte DEK to a student's secp256k1 compressed public
 * key (hex-encoded). Input validation runs SYNCHRONOUSLY before entering
 * timed() (mirrors aesgcm.js::encryptCredential's length-guard convention).
 *
 * @param {string} pubKeyHex — compressed secp256k1 public key, hex-encoded
 * @param {Buffer} dek — 32-byte AES-256 DEK
 * @returns {Promise<string>} — base64-encoded ECIES envelope
 */
export async function wrapDEK(pubKeyHex, dek) {
  if (!Buffer.isBuffer(dek) || dek.length !== DEK_LENGTH) {
    throw new Error(`wrapDEK: expected a ${DEK_LENGTH}-byte Buffer dek`);
  }
  if (typeof pubKeyHex !== "string" || !pubKeyHex.length) {
    throw new Error("wrapDEK: pubKeyHex must be a non-empty hex string");
  }

  const { out } = await timed("wrapDEK", async () => {
    // eciesjs's encrypt() returns a Uint8Array, NOT a Node Buffer — calling
    // .toString("base64") directly on a bare Uint8Array silently produces a
    // comma-separated decimal string instead of base64 (Rule 1 bug found
    // during Task 1 verification). Wrap explicitly with Buffer.from() first.
    const envelope = Buffer.from(encrypt(pubKeyHex, dek));
    return envelope.toString("base64");
  });

  return out;
}

/**
 * unwrapDEK(privKeyHex, envelopeBase64) → Buffer
 *
 * ECIES-decrypts a base64 envelope back to the original 32-byte DEK using
 * the matching private key (hex-encoded). No server-side caller exists this
 * phase (the backend never holds a student's private key) — this is the
 * symmetric counterpart eciesjs's design implies and the client (Phase 8)
 * will use the equivalent on-device. Synchronous, no timed() wrapper (no
 * caller to instrument yet).
 *
 * Does NOT catch/swallow eciesjs's decrypt() errors — an auth-tag mismatch
 * propagates uncaught to the caller, exactly as aesgcm.js::decryptCredential
 * does for AES-GCM.
 *
 * @param {string} privKeyHex — secp256k1 private key, hex-encoded
 * @param {string} envelopeBase64 — base64-encoded ECIES envelope from wrapDEK
 * @returns {Buffer} — the original 32-byte DEK
 */
export function unwrapDEK(privKeyHex, envelopeBase64) {
  const envelope = Buffer.from(envelopeBase64, "base64");
  // eciesjs's decrypt() returns a Uint8Array, not a Node Buffer (same caveat
  // as encrypt() in wrapDEK above) — wrap explicitly so callers reliably get
  // a Buffer with Buffer's full prototype (Buffer.compare, .toString, etc).
  const dek = Buffer.from(decrypt(privKeyHex, envelope)); // throws on auth failure
  if (dek.length !== DEK_LENGTH) {
    throw new Error(`unwrapDEK: decrypted DEK has unexpected length ${dek.length}`);
  }
  return dek;
}
