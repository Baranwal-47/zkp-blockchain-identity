/**
 * identityCommitment.js — Single shared module for the PrivdID salted-attribute Merkle commitment.
 *
 * Exports the complete commitment surface used by BOTH the admin issuance path
 * (studentService.js) and the prover-side parity script (scripts/reseed.js).
 * Having one module eliminates field-set drift — the §1.4 failure mode.
 *
 * Frozen spec: 7 committed attributes, depth-3 / 8-leaf Merkle tree.
 * Leaf layout (index = Merkle position):
 *   0:name(hashToField,4)  1:rollNo(hashToField,2)  2:dob(int)  3:programmeLevel(code)
 *   4:discipline(code)     5:batch(int)              6:email(hashToField,2)
 *   7:zero-padding  → Poseidon(2)(0,0)
 *
 * Node combine: Poseidon(2)(left, right), left = lower index. NOT symmetric.
 *
 * All Poseidon calls use circomlibjs@0.1.7 (buildPoseidon, WASM-backed).
 * Constants are verified to match the vendored zk-proofs/circomlib/circuits/poseidon_constants.circom.
 *
 * THREAT MITIGATIONS (per threat_model in 01-02-PLAN.md):
 *   T-01-04: BN128 overflow — hashToField chunks strings to ≤31 bytes each, never raw stringToBigInt
 *   T-01-05: low-entropy leaves — mandatory per-attribute 248-bit salt on every leaf
 *   T-01-06: salt out of field — crypto.randomBytes(31) = 248 bits, always < BN128 order
 *   T-01-07: JS↔circom drift — CHUNK_COUNTS exported for circuit to mirror verbatim
 */

import { buildPoseidon } from "circomlibjs";
import crypto from "crypto";
import { timed } from "./timing.js";

// BN128 scalar field order — verified from ffjavascript/src/curves.js in installed node_modules.
// Any field element produced by this module must be < this value.
const BN128_FIELD_ORDER = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

// Singleton: cache the resolved Poseidon instance so we never re-await inside a tight loop.
let poseidonInstance;
async function getPoseidon() {
  if (!poseidonInstance) {
    poseidonInstance = await buildPoseidon();
  }
  return poseidonInstance;
}

/**
 * CHUNK_COUNTS — frozen per-attribute Poseidon arities.
 *
 * maxChunks doubles as the Poseidon arity for that attribute.
 * The Phase-2 circuit MUST use these exact values for its HashToField(maxChunks) templates.
 * Changing any value here requires a full circuit rebuild + trusted setup redo.
 *
 * Derived from validator byte-length caps (verified in 01-RESEARCH.md):
 *   name  ≤ 120 chars → 4 × 31 = 124 bytes capacity
 *   rollNo ≤ 50 chars → 2 × 31 = 62 bytes capacity
 *   email  enforced ≤ 62 bytes (2 × 31) — Joi max(62) applied at validator layer
 */
export const CHUNK_COUNTS = Object.freeze({ name: 4, rollNo: 2, email: 2 });

/**
 * hashToField(str, maxChunks) → decimal string (in BN128 field)
 *
 * Encodes a string attribute to a single BN128 field element using chunked Poseidon hashing.
 * This is the correct encoding for strings — NOT raw stringToBigInt which overflows BN128 for
 * strings longer than ~31 bytes.
 *
 * Algorithm:
 *   1. UTF-8 encode the string
 *   2. Slice into ≤31-byte chunks
 *   3. Pack each chunk big-endian: for (const b of slice) val = (val << 8n) | BigInt(b)
 *   4. Zero-pad chunk array to maxChunks at the END
 *   5. result = Poseidon(maxChunks)(chunks[0], ..., chunks[maxChunks-1])
 *   6. return poseidon.F.toString(result)  — decimal string, always in-field
 *
 * @param {string|any} str — attribute value; coerced to String; null/undefined → ""
 * @param {number} maxChunks — fixed chunk count for this attribute (= Poseidon arity)
 * @returns {Promise<string>} — decimal string representation of the field element
 */
export async function hashToField(str, maxChunks) {
  const poseidon = await getPoseidon();
  const bytes = Buffer.from(String(str ?? ""), "utf8");
  const chunks = [];

  // Slice UTF-8 bytes into ≤31-byte chunks, pack each big-endian
  for (let i = 0; i < bytes.length; i += 31) {
    const slice = bytes.slice(i, i + 31);
    let val = 0n;
    for (const b of slice) {
      val = (val << 8n) | BigInt(b);
    }
    chunks.push(val);
  }

  // Zero-pad at the END to maxChunks (never truncate — validator ensures input fits)
  while (chunks.length < maxChunks) {
    chunks.push(0n);
  }

  // Compute Poseidon(maxChunks) — arity must match the Phase-2 circuit's HashToField(maxChunks)
  const result = poseidon(chunks.slice(0, maxChunks));
  return poseidon.F.toString(result); // decimal string, in BN128 field
}

/**
 * generateSalt() → decimal string (always < BN128_FIELD_ORDER)
 *
 * Generates one cryptographically random per-attribute salt.
 *
 * Method: crypto.randomBytes(31) → 248 bits.
 * 2^248 < BN128_FIELD_ORDER (2^254 bits), so the result is ALWAYS a valid field element.
 * This avoids the bias introduced by (randomBytes(32) % p).
 *
 * @returns {string} — decimal string representation of a random field element
 */
export function generateSalt() {
  // 31 bytes = 248 bits, always < BN128 p (2^248 < p is verified)
  return BigInt("0x" + crypto.randomBytes(31).toString("hex")).toString();
}

/**
 * generateSalts(count = 7) → string[]
 *
 * Generates `count` independent salts (one per committed attribute leaf, in leaf-index order).
 * Default = 7 (one per real committed attribute; leaf[7] uses salt = 0).
 *
 * @param {number} count — number of salts to generate (default 7)
 * @returns {string[]} — array of decimal string salts
 */
export function generateSalts(count = 7) {
  return Array.from({ length: count }, generateSalt);
}

/**
 * computeLeaf(encodedAttr, salt) → decimal string
 *
 * Computes the committed value of a single Merkle leaf:
 *   leaf = Poseidon(2)(encodedAttr, salt)
 *
 * Used for both real leaves (hashToField result or integer code) and the zero-padding leaf
 * (encodedAttr=0, salt=0 → Poseidon(2)(0n, 0n) = "14744269619966411208...").
 *
 * @param {bigint|string|number} encodedAttr — field element (hashToField result, integer, or 0)
 * @param {bigint|string|number} salt — field element < BN128_FIELD_ORDER (or 0 for zero-pad leaf)
 * @returns {Promise<string>} — decimal string
 */
export async function computeLeaf(encodedAttr, salt) {
  const poseidon = await getPoseidon();
  const leaf = poseidon([BigInt(encodedAttr), BigInt(salt)]);
  return poseidon.F.toString(leaf); // decimal string
}

/**
 * computeMerkleRoot(attrs, salts) → decimal string
 *
 * Builds the depth-3 / 8-leaf Poseidon Merkle tree and returns the root (= pubHash / merkleRoot).
 *
 * Leaf layout (indices = Merkle positions, frozen per D-09):
 *   leaf[0] = computeLeaf(attrs[0], salts[0])  — name (hashToField result)
 *   leaf[1] = computeLeaf(attrs[1], salts[1])  — rollNo (hashToField result)
 *   leaf[2] = computeLeaf(attrs[2], salts[2])  — dob YYYYMMDD integer string
 *   leaf[3] = computeLeaf(attrs[3], salts[3])  — programmeLevel code string
 *   leaf[4] = computeLeaf(attrs[4], salts[4])  — discipline code string
 *   leaf[5] = computeLeaf(attrs[5], salts[5])  — batch year integer string
 *   leaf[6] = computeLeaf(attrs[6], salts[6])  — email (hashToField result)
 *   leaf[7] = computeLeaf(0, 0)               — zero-padding (Poseidon(2)(0,0))
 *
 * Tree topology (bottom-up, left-child-first — MUST match the Phase-2 circom):
 *   Level 1: n01 = P(leaf[0], leaf[1])   n23 = P(leaf[2], leaf[3])
 *            n45 = P(leaf[4], leaf[5])   n67 = P(leaf[6], leaf[7])
 *   Level 2: n0123 = P(n01, n23)         n4567 = P(n45, n67)
 *   Root:    P(n0123, n4567)
 *
 * Timing: wrapped in timed('computeMerkleRoot', ...) (./timing.js), which prints
 * elapsed seconds as `[perf] computeMerkleRoot: {s.sss} s` per blueprint §10.1.
 *
 * @param {string[]} attrs — 7 encoded leaf attribute values (indices 0..6 in frozen order)
 * @param {string[]} salts — at least 7 salt decimal strings (indices 0..6; salt[7] = 0 used internally)
 * @returns {Promise<string>} — decimal string Merkle root (= merkleRoot = pubHash)
 */
export async function computeMerkleRoot(attrs, salts) {
  if (attrs.length !== 7) {
    throw new Error(`computeMerkleRoot: expected 7 attrs, got ${attrs.length}`);
  }
  if (salts.length < 7) {
    throw new Error(`computeMerkleRoot: expected at least 7 salts, got ${salts.length}`);
  }

  const { out: root } = await timed("computeMerkleRoot", async () => {
    const poseidon = await getPoseidon();

    // --- Level 0: compute 8 leaves ---
    // leaves 0..6: real attributes with their salts
    const leafValues = [];
    for (let i = 0; i < 7; i++) {
      const lv = poseidon([BigInt(attrs[i]), BigInt(salts[i])]);
      leafValues.push(poseidon.F.toString(lv));
    }
    // leaf 7: zero-padding — Poseidon(2)(0, 0)
    const zeroPadLeaf = poseidon([0n, 0n]);
    leafValues.push(poseidon.F.toString(zeroPadLeaf));

    // --- Level 1: 4 parent nodes, left-child-first order ---
    // n01 = Poseidon(2)(leaf[0], leaf[1])
    const n01 = poseidon.F.toString(poseidon([BigInt(leafValues[0]), BigInt(leafValues[1])]));
    // n23 = Poseidon(2)(leaf[2], leaf[3])
    const n23 = poseidon.F.toString(poseidon([BigInt(leafValues[2]), BigInt(leafValues[3])]));
    // n45 = Poseidon(2)(leaf[4], leaf[5])
    const n45 = poseidon.F.toString(poseidon([BigInt(leafValues[4]), BigInt(leafValues[5])]));
    // n67 = Poseidon(2)(leaf[6], leaf[7])
    const n67 = poseidon.F.toString(poseidon([BigInt(leafValues[6]), BigInt(leafValues[7])]));

    // --- Level 2: 2 parent nodes ---
    // n0123 = Poseidon(2)(n01, n23)
    const n0123 = poseidon.F.toString(poseidon([BigInt(n01), BigInt(n23)]));
    // n4567 = Poseidon(2)(n45, n67)
    const n4567 = poseidon.F.toString(poseidon([BigInt(n45), BigInt(n67)]));

    // --- Root ---
    const root = poseidon.F.toString(poseidon([BigInt(n0123), BigInt(n4567)]));

    return root;
  });

  return root;
}
