/**
 * credentialCrypto.js — on-device AES-256-GCM credential-blob decrypt.
 *
 * Mirrors privdId_admin/backend/crypto/aesgcm.js::decryptCredential exactly
 * (same blob shape, same validation message) but uses @noble/ciphers instead
 * of Node's `crypto` module, because Node's `crypto` is NOT available in
 * React Native / Hermes (see 08-RESEARCH.md Pitfall 1).
 *
 * Blob shape (frozen, do NOT change): { iv, authTag, ciphertext } — each a
 * separate base64 string. IV is 12 bytes, authTag is 16 bytes, DEK is 32
 * bytes (AES-256).
 *
 * @noble/ciphers' gcm cipher expects the 16-byte auth tag APPENDED to the
 * ciphertext on decrypt (tagLength: 16) — so the on-device decrypt path
 * reconstructs `combined = concat(ciphertext, authTag)` before calling
 * gcm(dek, iv).decrypt(combined), unlike Node's crypto which takes the tag
 * via a separate setAuthTag() call.
 *
 * THREAT MITIGATIONS (per threat_model in 08-02-PLAN.md):
 *   T-08-04: this module never console.logs the dek or the decrypted
 *            plaintext — only a [benchmark] timing line is emitted.
 *   T-08-05: a tampered ciphertext or wrong DEK causes gcm.decrypt to throw
 *            (auth-tag failure); the error is never swallowed here.
 *   T-08-06: Node's crypto.createDecipheriv is NOT used — @noble/ciphers'
 *            pure-JS gcm is RN-safe.
 */

import { gcm } from '@noble/ciphers/aes';

/**
 * decryptCredentialBlob(blob, dek) → object
 *
 * Decrypts a { iv, authTag, ciphertext } blob (each base64) back to the
 * original JSON object using @noble/ciphers' gcm. Throws if the auth tag
 * does not verify (tampering or wrong key) — does NOT swallow the error.
 *
 * @param {{iv: string, authTag: string, ciphertext: string}} blob
 * @param {Buffer|Uint8Array} dek — 32-byte AES-256 key
 * @returns {object} — the original JSON-deserialized plaintext object
 */
export function decryptCredentialBlob(blob, dek) {
  if (
    !blob ||
    typeof blob.iv !== 'string' ||
    typeof blob.authTag !== 'string' ||
    typeof blob.ciphertext !== 'string'
  ) {
    throw new Error('decryptCredentialBlob: blob must have iv, authTag, ciphertext base64 strings');
  }

  const iv = Buffer.from(blob.iv, 'base64');
  const authTag = Buffer.from(blob.authTag, 'base64');
  const ciphertext = Buffer.from(blob.ciphertext, 'base64');

  // @noble/ciphers' gcm decrypt expects the auth tag appended to the
  // ciphertext (tagLength: 16), unlike Node's crypto separate setAuthTag().
  const combined = Buffer.concat([ciphertext, authTag]);

  const t0 = performance.now();
  const plaintext = gcm(dek, iv).decrypt(combined);
  const t1 = performance.now();
  console.log(`[benchmark] decryptCredentialBlob: ${(t1 - t0).toFixed(2)}ms`);

  return JSON.parse(Buffer.from(plaintext).toString('utf8'));
}
