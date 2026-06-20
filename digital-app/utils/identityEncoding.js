/**
 * identityEncoding.js — on-device re-derivation of a credential's circuit leaf
 * values, used to BIND the plaintext a prover shares (in the proof QR) to the
 * proof's `revealedValue[]` public signals.
 *
 * Why this exists: the verifier must not merely *trust* the plaintext values a
 * prover claims — a cryptographically valid proof says nothing about whether
 * the QR's `revealed` object is honest. The circuit's revealedValue[i] signal
 * is exactly attr[i] (the committed leaf): a Poseidon hash for the string
 * fields (name/rollNo/email) and the raw integer for the numeric/coded fields
 * (dob/programmeLevel/discipline/batch). So the verifier re-derives each
 * revealed field from the shared plaintext and checks it equals the signal.
 *
 * PARITY (sacred — CLAUDE.md ground rule #3): hashToField / CHUNK_COUNTS /
 * PROGRAMME_LEVEL / DISCIPLINE MUST stay identical to
 *   zkp-backend/lib/encoding.js   (hashToField, CHUNK_COUNTS)
 *   zkp-backend/lib/witnessBuilder.js (ATTR_KEYS, PROGRAMME_LEVEL, DISCIPLINE)
 * poseidon-lite is byte-for-byte identical to the backend's circomlibjs
 * buildPoseidon() for these arities (verified against the live backend).
 */

import { poseidon2, poseidon4 } from 'poseidon-lite';

// Frozen leaf-index order — mirrors witnessBuilder.js ATTR_KEYS.
export const ATTR_KEYS = [
  'name',
  'rollNo',
  'dob',
  'programmeLevel',
  'discipline',
  'batch',
  'email',
];

// Public-signal layout (identity.circom, frozen):
// [0] pubHash [1] nonce [2] currentDateInt [3] isOver18 [4] isPostgrad
// [5..11] revealedValue[7] [12..18] revealMask[7]  (both in ATTR_KEYS order).
export const REVEALED_VALUE_OFFSET = 5;

// Frozen per-attribute Poseidon arities — mirrors encoding.js CHUNK_COUNTS.
const CHUNK_COUNTS = { name: 4, rollNo: 2, email: 2 };
const POSEIDON_BY_ARITY = { 2: poseidon2, 4: poseidon4 };

// Vendored from witnessBuilder.js (FROZEN, append-only per D-07).
const PROGRAMME_LEVEL = { 'B.Tech': 1, 'B.Des': 2, Dual: 3, 'M.Tech': 4, 'M.Des': 5, PhD: 6 };
const DISCIPLINE = { CSE: 1, ECE: 2, ME: 3, SmartMfg: 4, Design: 5, NatSci: 6 };

// Chunked Poseidon hash-to-field — verbatim algorithm from encoding.js
// hashToField, returning a BigInt (poseidon-lite's native output).
function hashToField(str, maxChunks) {
  const bytes = Buffer.from(String(str ?? ''), 'utf8');
  const chunks = [];
  for (let i = 0; i < bytes.length; i += 31) {
    let val = 0n;
    for (const b of bytes.slice(i, i + 31)) val = (val << 8n) | BigInt(b);
    chunks.push(val);
  }
  while (chunks.length < maxChunks) chunks.push(0n);
  const fn = POSEIDON_BY_ARITY[maxChunks];
  if (!fn) throw new Error(`identityEncoding: no poseidon for arity ${maxChunks}`);
  return fn(chunks.slice(0, maxChunks));
}

// Re-derive attr[i] (the committed leaf value) from a shared plaintext value.
// Accepts the same display forms the prover ships: dob "YYYY-MM-DD",
// programmeLevel/discipline as either human name or numeric code.
function expectedAttrValue(key, value) {
  switch (key) {
    case 'name':
      return hashToField(value, CHUNK_COUNTS.name);
    case 'rollNo':
      return hashToField(value, CHUNK_COUNTS.rollNo);
    case 'email':
      return hashToField(value, CHUNK_COUNTS.email);
    case 'dob': {
      const stripped = String(value).replace(/[-/]/g, '');
      if (!/^\d{8}$/.test(stripped)) throw new Error('dob');
      return BigInt(stripped);
    }
    case 'programmeLevel':
      return BigInt(PROGRAMME_LEVEL[value] ?? Number(value));
    case 'discipline':
      return BigInt(DISCIPLINE[value] ?? Number(value));
    case 'batch':
      return BigInt(String(value));
    default:
      throw new Error(`identityEncoding: unknown attr key ${key}`);
  }
}

/**
 * verifyRevealedBinding(revealed, publicSignals)
 *   -> { ok: boolean, mismatched: string[] }
 *
 * For every field in the prover's `revealed` plaintext, re-derive its leaf and
 * confirm it equals the proof's revealedValue[] signal at the same index. Any
 * field that fails (or that we can't parse) is a binding failure — the shared
 * value does not match what the proof actually commits to.
 */
export function verifyRevealedBinding(revealed, publicSignals) {
  const mismatched = [];
  for (const [key, value] of Object.entries(revealed || {})) {
    const i = ATTR_KEYS.indexOf(key);
    if (i < 0) {
      mismatched.push(key);
      continue;
    }
    try {
      const expected = expectedAttrValue(key, value);
      const signal = BigInt(publicSignals[REVEALED_VALUE_OFFSET + i]);
      if (expected !== signal) mismatched.push(key);
    } catch {
      mismatched.push(key);
    }
  }
  return { ok: mismatched.length === 0, mismatched };
}
