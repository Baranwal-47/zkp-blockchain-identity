/**
 * encoding.js — zkp-backend's vendored copy of the canonical hash-to-field and
 * salt-generation logic from privdId_admin/backend/utils/identityCommitment.js.
 *
 * CLAUDE.md ground rule #3 (field-set consistency is sacred): this module's
 * hashToField/CHUNK_COUNTS/generateSalts MUST stay byte-for-byte identical to
 * the admin-backend oracle, or on-chain verification silently fails. The
 * algorithm bodies below are copied verbatim from identityCommitment.js
 * (ESM) into this CommonJS module (zkp-backend is CJS).
 *
 * Source: privdId_admin/backend/utils/identityCommitment.js
 *   - hashToField (lines 75-99)
 *   - generateSalt/generateSalts (lines 111-126)
 *   - BN128_FIELD_ORDER (line 31)
 *
 * Do NOT deep-import ffjavascript for BN128_FIELD_ORDER — its package.json
 * `exports` map does not expose src/curves.js, which throws
 * ERR_PACKAGE_PATH_NOT_EXPORTED on installed Node with exports enforcement
 * (04-RESEARCH.md "Alternatives Considered"). Hardcode the constant instead,
 * exactly as identityCommitment.js itself does.
 */

const { buildPoseidon } = require("circomlibjs");
const crypto = require("crypto");

// BN128 scalar field order — verified from ffjavascript/src/curves.js in
// installed node_modules (same constant as identityCommitment.js line 31).
// Any field element produced by this module must be < this value.
const BN128_FIELD_ORDER =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

// Singleton: cache the resolved Poseidon instance so we never re-await
// inside a tight loop (mirrors identityCommitment.js::getPoseidon()).
let poseidonInstance;
async function getPoseidon() {
  if (!poseidonInstance) {
    poseidonInstance = await buildPoseidon();
  }
  return poseidonInstance;
}

/**
 * CHUNK_COUNTS — frozen per-attribute Poseidon arities.
 * Must stay identical to identityCommitment.js::CHUNK_COUNTS.
 */
const CHUNK_COUNTS = Object.freeze({ name: 4, rollNo: 2, email: 2 });

/**
 * hashToField(str, maxChunks) -> decimal string (in BN128 field)
 *
 * Encodes a string attribute to a single BN128 field element using chunked
 * Poseidon hashing. Copied verbatim from identityCommitment.js::hashToField.
 *
 * @param {string|any} str
 * @param {number} maxChunks
 * @returns {Promise<string>}
 */
async function hashToField(str, maxChunks) {
  const poseidon = await getPoseidon();
  const bytes = Buffer.from(String(str ?? ""), "utf8");
  const chunks = [];

  // Slice UTF-8 bytes into <=31-byte chunks, pack each big-endian
  for (let i = 0; i < bytes.length; i += 31) {
    const slice = bytes.slice(i, i + 31);
    let val = 0n;
    for (const b of slice) {
      val = (val << 8n) | BigInt(b);
    }
    chunks.push(val);
  }

  // Zero-pad at the END to maxChunks (never truncate)
  while (chunks.length < maxChunks) {
    chunks.push(0n);
  }

  const result = poseidon(chunks.slice(0, maxChunks));
  return poseidon.F.toString(result); // decimal string, in BN128 field
}

/**
 * generateSalt() -> decimal string (always < BN128_FIELD_ORDER)
 * Copied verbatim from identityCommitment.js::generateSalt.
 */
function generateSalt() {
  // 31 bytes = 248 bits, always < BN128 p (2^248 < p is verified)
  return BigInt("0x" + crypto.randomBytes(31).toString("hex")).toString();
}

/**
 * generateSalts(count = 7) -> string[]
 * Copied verbatim from identityCommitment.js::generateSalts.
 */
function generateSalts(count = 7) {
  return Array.from({ length: count }, generateSalt);
}

module.exports = {
  hashToField,
  CHUNK_COUNTS,
  generateSalts,
  generateSalt,
  BN128_FIELD_ORDER,
};
