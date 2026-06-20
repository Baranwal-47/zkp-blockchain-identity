/**
 * dek.js — on-device ECIES DEK-unwrap.
 *
 * Mirrors privdId_admin/backend/crypto/ecies.js::unwrapDEK exactly (same
 * envelope shape, same Buffer.from() wrap, same length check) but reads the
 * private key from the device's SecureStore instead of taking it as a
 * function argument — the private key never leaves the device (CLAUDE.md
 * ground rule 4).
 *
 * Envelope shape: the caller fetches { dekEnvelope: "<base64>" } from IPFS
 * (Pinata's pinJSONToIPFS wraps all pins as JSON) and passes the base64
 * string here. The base64 itself is the raw output of eciesjs's `encrypt()`
 * (ephemeral pubkey + IV + AES-GCM ciphertext + MAC).
 *
 * THREAT MITIGATIONS (per threat_model in 08-02-PLAN.md):
 *   T-08-04: this module never console.logs privKeyHex or the dek — only a
 *            [benchmark] timing line is emitted.
 *   T-08-05: a tampered envelope or wrong private key causes eciesjs's
 *            decrypt() to throw (auth failure); the error is never
 *            swallowed here.
 */

import { decrypt } from 'eciesjs';
import * as SecureStore from 'expo-secure-store';

// Storage key for the on-device secp256k1 private key — MUST be identical to
// digital-app/utils/keypair.js line 6. Do not invent a new key.
const PRIVATE_KEY_STORAGE_KEY = 'privid_student_privkey';

/**
 * unwrapDEK(envelopeBase64) → Promise<Buffer>
 *
 * Reads the student's private key from SecureStore and ECIES-decrypts a
 * base64 envelope back to the original 32-byte DEK.
 *
 * Does NOT catch/swallow eciesjs's decrypt() errors — an auth-tag mismatch
 * propagates uncaught to the caller, matching the server-side original's
 * discipline.
 *
 * @param {string} envelopeBase64 — base64-encoded ECIES envelope
 * @returns {Promise<Buffer>} — the original 32-byte DEK
 */
export async function unwrapDEK(envelopeBase64) {
  const privKeyHex = await SecureStore.getItemAsync(PRIVATE_KEY_STORAGE_KEY);
  if (!privKeyHex) {
    throw new Error('unwrapDEK: no stored private key found');
  }

  const envelope = Buffer.from(envelopeBase64, 'base64');

  const t0 = performance.now();
  // eciesjs's decrypt() returns a Uint8Array, not a Node Buffer — wrap
  // explicitly so callers reliably get a Buffer (Phase-7 Rule-1 fix).
  const dek = Buffer.from(decrypt(privKeyHex, envelope)); // throws on auth failure
  const t1 = performance.now();
  console.log(`[benchmark] unwrapDEK: ${(t1 - t0).toFixed(2)}ms`);

  if (dek.length !== 32) {
    throw new Error(`unwrapDEK: decrypted DEK has unexpected length ${dek.length}`);
  }

  return dek;
}
