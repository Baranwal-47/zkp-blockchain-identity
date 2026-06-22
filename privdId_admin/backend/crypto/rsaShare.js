/**
 * rsaShare.js — RSA-2048-OAEP-SHA256 Shamir share wrap/unwrap module.
 *
 * Canonical source: docs/CLAUDE_CODE_BLUEPRINT.md §E6 (D-04: RSA-2048-OAEP for
 * share wrapping; D-05: backend holds only custodian PUBLIC keys).
 *
 * Wraps a plaintext Shamir share (hex string) to a custodian's RSA-2048 public
 * key producing base64 ciphertext; unwrap is the symmetric counterpart used
 * client-side during Phase 11 reconstruction. Uses Node's built-in `crypto` only
 * (no node-forge, no jose — RESEARCH "Don't Hand-Roll" / OAEP ceiling verified).
 *
 * A secrets.js-grempe share is ~99 chars (well under the 190-byte RSA-2048-OAEP
 * plaintext ceiling), so there is no chunking or hybrid encryption needed here.
 *
 * THREAT MITIGATIONS (per threat_model in 10-01-PLAN.md):
 *   T-10-03: RSA padding weakness — uses RSA_PKCS1_OAEP_PADDING + oaepHash:"sha256"
 *            (OAEP-SHA256). Raw textbook RSA or PKCS1v1.5 padding is never used.
 *            2048-bit modulus is enforced at key-registration time (custodianService.js).
 */

import crypto from "crypto";
import { timed } from "../utils/timing.js";

/**
 * wrapShare(publicKeyPem, shareHexString) → Promise<string>
 *
 * RSA-OAEP-SHA256 encrypts a Shamir share hex string to a custodian's public key.
 * Server-callable (used in the hot issuance path by studentService.js), so it is
 * wrapped in timed() per CLAUDE.md ground rule 5.
 *
 * @param {string} publicKeyPem — RSA-2048 SPKI public key PEM
 * @param {string} shareHexString — plaintext Shamir share (~99-char hex string)
 * @returns {Promise<string>} — base64-encoded RSA-OAEP ciphertext
 */
export async function wrapShare(publicKeyPem, shareHexString) {
  if (typeof publicKeyPem !== "string" || !publicKeyPem.length) {
    throw new Error("wrapShare: publicKeyPem must be a non-empty string");
  }
  if (typeof shareHexString !== "string" || !shareHexString.length) {
    throw new Error("wrapShare: shareHexString must be a non-empty string");
  }

  const { out } = await timed("wrapShare", async () => {
    return crypto
      .publicEncrypt(
        {
          key: publicKeyPem,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: "sha256",
        },
        Buffer.from(shareHexString, "utf8")
      )
      .toString("base64");
  });

  return out;
}

/**
 * unwrapShare(privateKeyPem, wrappedBase64) → string
 *
 * RSA-OAEP-SHA256 decrypts a wrapped share back to the original hex string.
 *
 * NO server-side caller (D-09/D-10: the admin process NEVER holds a custodian
 * private key — this function exists for Phase 11's client-side recovery page
 * and for smoke-test round-trip verification only). Synchronous and intentionally
 * UNTIMED (no server caller to instrument, mirrors ecies.js::unwrapDEK convention).
 *
 * @param {string} privateKeyPem — RSA-2048 PKCS8 private key PEM
 * @param {string} wrappedBase64 — base64 ciphertext from wrapShare
 * @returns {string} — the original Shamir share hex string
 */
export function unwrapShare(privateKeyPem, wrappedBase64) {
  return crypto
    .privateDecrypt(
      {
        key: privateKeyPem,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      Buffer.from(wrappedBase64, "base64")
    )
    .toString("utf8");
}
