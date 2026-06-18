/**
 * witnessBuilder.js — constructs the full snarkjs circuit input object for
 * identity.circom from a raw student attribute set.
 *
 * This is the parity-critical heart of Phase 4 (CLAUDE.md ground rule #3):
 * buildWitnessInput's attr[] encoding MUST produce the identical leaf values
 * that privdId_admin/backend/utils/identityCommitment.js::computeMerkleRoot
 * produces for the same attrs+salts, or the resulting proof's pubHash will
 * never match the on-chain-registered commitment.
 *
 * Frozen leaf order (Merkle leaf index = array index), per
 * identityCommitment.js and 04-01-PLAN.md <interfaces>:
 *   0: name          hashToField(name, CHUNK_COUNTS.name)     maxChunks=4
 *   1: rollNo        hashToField(rollNo, CHUNK_COUNTS.rollNo)  maxChunks=2
 *   2: dob           dobInt (YYYYMMDD integer string)
 *   3: programmeLevel  PROGRAMME_LEVEL[name] integer code string
 *   4: discipline       DISCIPLINE[name] integer code string
 *   5: batch           batch year integer string
 *   6: email          hashToField(email, CHUNK_COUNTS.email)    maxChunks=2
 *
 * `reveal` is name-keyed (NOT leaf-index-keyed) for caller ergonomics:
 *   { name, rollNo, dob, programmeLevel, discipline, batch, email } -> boolean
 * Internally mapped to the same 0..6 leaf-index order as attr[]/salt[].
 *
 * isOver18/isPostgrad are NEVER accepted as caller input here — they are
 * always derived server-side via lib/predicates.js from the real dob /
 * programmeLevel feeding attr[2]/attr[3] in this SAME call (T-04-01).
 */

const { hashToField, CHUNK_COUNTS } = require("./encoding");
const { computeIsOver18, computeIsPostgrad } = require("./predicates");

// Frozen leaf-index key order — mirrors identityCommitment.js's leaf layout
// comment and the reveal object's name-keyed shape documented above.
const ATTR_KEYS = [
  "name",
  "rollNo",
  "dob",
  "programmeLevel",
  "discipline",
  "batch",
  "email",
];

// Vendored from privdId_admin/backend/constants/enumCodes.js (FROZEN,
// append-only per D-07 — see that file's header comment). Duplicated here
// rather than cross-imported because enumCodes.js is a plain ESM object
// literal with no async/runtime dependency, so vendoring keeps
// witnessBuilder.js fully synchronous-importable as CommonJS.
const PROGRAMME_LEVEL = {
  "B.Tech": 1,
  "B.Des": 2,
  "Dual": 3,
  "M.Tech": 4,
  "M.Des": 5,
  "PhD": 6,
};

const DISCIPLINE = {
  "CSE": 1,
  "ECE": 2,
  "ME": 3,
  "SmartMfg": 4,
  "Design": 5,
  "NatSci": 6,
};

/**
 * Resolve a programmeLevel/discipline value to its frozen integer code.
 * Accepts either the human-readable name (looked up in `table`) or an
 * already-numeric code (validated against the table's value set).
 */
function resolveCode(value, table, label) {
  if (value !== null && value !== undefined && Object.prototype.hasOwnProperty.call(table, value)) {
    return table[value];
  }
  const numeric = Number(value);
  if (!Number.isNaN(numeric) && Object.values(table).includes(numeric)) {
    return numeric;
  }
  throw new Error(`witnessBuilder: unknown ${label} code/name: ${JSON.stringify(value)}`);
}

/**
 * Normalize a dob value (display "YYYY-MM-DD" string, or already-integer
 * dobInt as string/number) to a YYYYMMDD integer string.
 */
function resolveDobInt(dob) {
  if (dob === null || dob === undefined) {
    throw new Error("witnessBuilder: dob is required");
  }
  const str = String(dob);
  // Strip dashes/slashes: "2004-02-15" -> "20040215"
  const stripped = str.replace(/[-/]/g, "");
  if (!/^\d{8}$/.test(stripped)) {
    throw new Error(`witnessBuilder: dob must resolve to an 8-digit YYYYMMDD value, got: ${JSON.stringify(dob)}`);
  }
  return stripped;
}

/**
 * buildWitnessInput({ attrs, salts, reveal, nonce, currentDateInt })
 *
 * @param {object} params
 * @param {object} params.attrs — { name, rollNo, dob, programmeLevel, discipline, batch, email }
 * @param {string[]} params.salts — 7 decimal-string salts, leaf-index order
 * @param {object} [params.reveal] — name-keyed booleans, default all-false
 * @param {string|number|bigint} params.nonce
 * @param {string|number} params.currentDateInt — "YYYYMMDD"
 * @returns {Promise<object>} circuit input: { attr, salt, nonce, currentDateInt,
 *   isOver18, isPostgrad, revealedValue, revealMask } — every value a decimal string
 */
async function buildWitnessInput({ attrs, salts, reveal = {}, nonce, currentDateInt }) {
  if (!attrs) throw new Error("witnessBuilder: attrs is required");
  if (!Array.isArray(salts) || salts.length !== 7) {
    throw new Error(`witnessBuilder: expected 7 salts, got ${Array.isArray(salts) ? salts.length : typeof salts}`);
  }
  if (nonce === undefined || nonce === null) {
    throw new Error("witnessBuilder: nonce is required");
  }
  if (currentDateInt === undefined || currentDateInt === null) {
    throw new Error("witnessBuilder: currentDateInt is required");
  }

  const dobInt = resolveDobInt(attrs.dob);
  const programmeLevelCode = resolveCode(attrs.programmeLevel, PROGRAMME_LEVEL, "programmeLevel");
  const disciplineCode = resolveCode(attrs.discipline, DISCIPLINE, "discipline");
  const batchStr = String(attrs.batch ?? "");
  if (!/^\d+$/.test(batchStr)) {
    throw new Error(`witnessBuilder: batch must be an integer string, got: ${JSON.stringify(attrs.batch)}`);
  }

  // Frozen leaf-index order: name, rollNo, dob, programmeLevel, discipline, batch, email
  const attr = [
    await hashToField(attrs.name, CHUNK_COUNTS.name),
    await hashToField(attrs.rollNo, CHUNK_COUNTS.rollNo),
    dobInt,
    String(programmeLevelCode),
    String(disciplineCode),
    batchStr,
    await hashToField(attrs.email, CHUNK_COUNTS.email),
  ];

  const salt = salts.map((s) => String(s));

  const isOver18 = computeIsOver18(currentDateInt, dobInt);
  const isPostgrad = computeIsPostgrad(programmeLevelCode);

  const revealedValue = ATTR_KEYS.map((key, i) => (reveal[key] ? attr[i] : "0"));
  const revealMask = ATTR_KEYS.map((key) => (reveal[key] ? "1" : "0"));

  return {
    attr,
    salt,
    nonce: String(nonce),
    currentDateInt: String(currentDateInt),
    isOver18: String(isOver18),
    isPostgrad: String(isPostgrad),
    revealedValue,
    revealMask,
  };
}

module.exports = {
  buildWitnessInput,
  ATTR_KEYS,
};
