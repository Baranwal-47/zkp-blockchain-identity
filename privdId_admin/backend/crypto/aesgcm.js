/**
 * aesgcm.js — AES-256-GCM credential encryption module.
 *
 * Canonical source: docs/CLAUDE_CODE_BLUEPRINT.md §E3.1 (blob shape) / §E3.6 (module location).
 *
 * Encrypts/decrypts a JSON-serializable credential object under a 32-byte DEK
 * (Data Encryption Key) using AES-256-GCM authenticated encryption. The DEK is
 * generated server-side at issuance time (Phase 6); Phase 7 ECIES-wraps it to
 * the student's on-device keypair and wipes the plaintext copy.
 *
 * Blob shape (frozen, do NOT change): { iv, authTag, ciphertext } — each a
 * separate base64 string. IV is 12 bytes (GCM-recommended 96-bit), authTag is
 * 16 bytes, key (DEK) is 32 bytes (AES-256).
 *
 * THREAT MITIGATIONS (per threat_model in 06-01-PLAN.md):
 *   T-06-01: IV reuse under a fixed key — iv = crypto.randomBytes(IV_LENGTH) is
 *            generated INSIDE encryptCredential on every call, never hoisted,
 *            cached, or derived. Reusing a (key, IV) pair under GCM leaks
 *            plaintext XOR and forges auth tags.
 *   T-06-03: secret logging — this module logs only the [perf] timing line via
 *            timed(); it never logs the dek, plaintext, or the blob.
 *   T-06-04: ciphertext tampering on public IPFS — the GCM auth tag
 *            (getAuthTag/setAuthTag) detects any ciphertext tampering at
 *            decrypt time (decipher.final() throws).
 */

import crypto from "crypto";
import { timed } from "../utils/timing.js";

const ALGO = "aes-256-gcm"; // AES-256-GCM — authenticated encryption, see blueprint §E3.1
const IV_LENGTH = 12; // GCM-recommended IV size — NOT 16; using 16 here is a common mistake
const KEY_LENGTH = 32; // AES-256 key size

// Sanity-check the module constant matches the literal cipher name used at every
// createCipheriv/createDecipheriv call site below (defensive, fails fast on edit).
if (ALGO !== "aes-256-gcm") {
  throw new Error("aesgcm.js: ALGO constant drifted from aes-256-gcm");
}

/**
 * generateDEK() → Buffer (32 bytes)
 *
 * Generates a cryptographically random Data Encryption Key.
 * Method: crypto.randomBytes(32) — the project's established CSPRNG choice
 * (see identityCommitment.js::generateSalts).
 *
 * @returns {Buffer} — 32-byte random Buffer
 */
export function generateDEK() {
  return crypto.randomBytes(KEY_LENGTH);
}

/**
 * encryptCredential(plaintextObj, dek) → Promise<{iv, authTag, ciphertext}>
 *
 * Encrypts a JSON-serializable object under AES-256-GCM with a fresh random IV.
 * The DEK length is validated BEFORE entering timed() (mirrors computeMerkleRoot's
 * length guard in identityCommitment.js).
 *
 * @param {object} plaintextObj — JSON-serializable credential payload
 * @param {Buffer} dek — 32-byte AES-256 key
 * @returns {Promise<{iv: string, authTag: string, ciphertext: string}>} — base64 fields
 */
export async function encryptCredential(plaintextObj, dek) {
  if (!Buffer.isBuffer(dek) || dek.length !== KEY_LENGTH) {
    throw new Error(`encryptCredential: expected a ${KEY_LENGTH}-byte Buffer dek`);
  }

  const { out } = await timed("encryptCredential", async () => {
    // IV is generated fresh on every call, inside the function — never hoisted/cached.
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv("aes-256-gcm", dek, iv);
    const plaintext = Buffer.from(JSON.stringify(plaintextObj), "utf8");
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag(); // MUST be called after cipher.final()

    return {
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    };
  });

  return out;
}

/**
 * decryptCredential(blob, dek) → object
 *
 * Decrypts a { iv, authTag, ciphertext } blob (each base64) back to the
 * original JSON object. Throws if the auth tag does not verify (tampering or
 * wrong key) — does NOT swallow the error.
 *
 * @param {{iv: string, authTag: string, ciphertext: string}} blob
 * @param {Buffer} dek — 32-byte AES-256 key
 * @returns {object} — the original JSON-deserialized plaintext object
 */
export function decryptCredential(blob, dek) {
  const iv = Buffer.from(blob.iv, "base64");
  const authTag = Buffer.from(blob.authTag, "base64");
  const ciphertext = Buffer.from(blob.ciphertext, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", dek, iv);
  decipher.setAuthTag(authTag); // MUST be called before decipher.final()
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8"));
}
