/**
 * shamir.js — Shamir 2-of-3 DEK split/reconstruct module.
 *
 * Canonical source: docs/CLAUDE_CODE_BLUEPRINT.md §E6 (threshold custody) /
 * blueprint §15 (locked decisions: 2-of-3, custodians = AcadAdmin/Registrar/Dean).
 *
 * Splits/reconstructs a 32-byte DEK using Shamir's Secret Sharing (secrets.js-grempe).
 * Share A is held by AcadAdmin (plaintext), Share B is RSA-OAEP wrapped to the
 * Registrar's public key, Share C to the Dean's public key — see crypto/rsaShare.js.
 * Any 2 of 3 shares reconstruct the DEK; a single share reveals nothing.
 *
 * THREAT MITIGATIONS (per threat_model in 10-01-PLAN.md):
 *   T-10-01: DEK/share logging — this module NEVER console.logs the DEK or any
 *            share; only the [perf] timing line from timed() is emitted.
 *   T-10-02: hand-rolled SSS math — the finite-field polynomial interpolation is
 *            handled entirely by the audited secrets.js-grempe library (grempe/
 *            secrets.js, ~decade-old, 238K downloads/mo, zero runtime deps).
 *            Never implement GF(256) by hand.
 *
 * WARNING (RESEARCH Pitfall 1): secrets.combine() on a SINGLE share does NOT
 * throw — it silently returns garbage. Never rely on an exception to detect
 * insufficient shares; enforce the minimum share count before calling combine.
 */

import secrets from "secrets.js-grempe";
import { timed } from "../utils/timing.js";

const DEK_LENGTH = 32; // must match crypto/aesgcm.js::KEY_LENGTH
const THRESHOLD = 2;   // any 2-of-3 reconstruct the DEK (E6 locked decision)
const TOTAL_SHARES = 3;

/**
 * splitDEK(dek) → Promise<[string, string, string]>
 *
 * Splits a 32-byte DEK into 3 hex-string Shamir shares (2-of-3 threshold).
 * Returns [shareA, shareB, shareC] — each a ~99-char hex string.
 *
 * @param {Buffer} dek — 32-byte AES-256 DEK
 * @returns {Promise<[string, string, string]>}
 */
export async function splitDEK(dek) {
  if (!Buffer.isBuffer(dek) || dek.length !== DEK_LENGTH) {
    throw new Error(`splitDEK: expected a ${DEK_LENGTH}-byte Buffer dek`);
  }

  const { out } = await timed("splitDEK", async () => {
    return secrets.share(dek.toString("hex"), TOTAL_SHARES, THRESHOLD);
  });

  return out; // [A, B, C]
}

/**
 * reconstructDEK(shares) → Promise<Buffer<32>>
 *
 * Reconstructs the original DEK from any 2 (or all 3) of the Shamir shares.
 * Throws if the result does not decode to exactly 32 bytes (catches wrong or
 * insufficient shares — see Pitfall 1 WARNING above for the single-share case).
 *
 * @param {string[]} shares — array of >= 2 hex-string shares
 * @returns {Promise<Buffer>} — the original 32-byte DEK
 */
export async function reconstructDEK(shares) {
  if (!Array.isArray(shares) || shares.length < THRESHOLD) {
    throw new Error(`reconstructDEK: expected at least ${THRESHOLD} shares`);
  }

  const { out } = await timed("reconstructDEK", async () => {
    const hex = secrets.combine(shares);
    const buf = Buffer.from(hex, "hex");
    if (buf.length !== DEK_LENGTH) {
      throw new Error(
        `reconstructDEK: reconstructed buffer has unexpected length ${buf.length} (expected ${DEK_LENGTH})`
      );
    }
    return buf;
  });

  return out;
}
