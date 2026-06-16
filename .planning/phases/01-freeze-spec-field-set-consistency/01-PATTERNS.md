# Phase 1: Freeze Spec & Field-Set Consistency — Pattern Map

**Mapped:** 2026-06-16
**Files analyzed:** 9 new/modified files
**Analogs found:** 9 / 9

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `privdId_admin/backend/utils/identityCommitment.js` | utility | transform | `privdId_admin/backend/utils/poseidonHash.js` | exact |
| `privdId_admin/backend/constants/enumCodes.js` | config | — | `privdId_admin/backend/validators/studentValidator.js` (inline enum strings) | partial |
| `privdId_admin/backend/scripts/reseed.js` | utility/script | batch | `zk-proofs/compute_poseidon.js` | role-match |
| `privdId_admin/backend/utils/poseidonHash.js` | utility | transform | self (existing file) | exact — modify in place |
| `privdId_admin/backend/services/studentService.js` | service | CRUD | self (existing file) | exact — modify in place |
| `privdId_admin/backend/services/credentialService.js` | service | request-response | self (existing file) | exact — patch in place |
| `privdId_admin/backend/models/Student.js` | model | CRUD | self (existing file) | exact — extend in place |
| `privdId_admin/backend/controllers/studentController.js` | controller | request-response | self (existing file) | exact — minor update |
| `privdId_admin/backend/validators/studentValidator.js` | utility | transform | self (existing file) | exact — extend in place |

---

## Pattern Assignments

### `privdId_admin/backend/utils/identityCommitment.js` (utility, transform)

**Role:** NEW shared module. Exports `hashToField`, `generateSalt`, `generateSalts`, `computeLeaf`, `computeMerkleRoot`, `CHUNK_COUNTS`. Imported by `studentService.js` and `scripts/reseed.js`. This is the single source of truth that eliminates field-set drift.

**Analog:** `privdId_admin/backend/utils/poseidonHash.js`

**Imports pattern** (poseidonHash.js lines 1–3):
```js
import { buildPoseidon } from "circomlibjs";

let poseidonPromise;
```

**Singleton init pattern** (poseidonHash.js lines 16–22):
```js
async function getPoseidon() {
  if (!poseidonPromise) {
    poseidonPromise = buildPoseidon();
  }
  return poseidonPromise;
}
```
Note: the existing module caches the *Promise*, not the resolved instance. Both patterns work; the new module may cache the resolved instance instead (`if (!poseidonInstance) poseidonInstance = await buildPoseidon(); return poseidonInstance;`) — either is fine as long as it is not re-awaited unnecessarily inside a tight loop.

**Core hash pattern** (poseidonHash.js lines 24–30):
```js
export async function hashPoseidonFields(fields) {
  const poseidon = await getPoseidon();
  const values = fields.map((field) => stringToBigInt(field));
  const hash = poseidon(values);
  return poseidon.F.toString(hash);
}
```
The new `identityCommitment.js` replaces the `fields.map(stringToBigInt)` step with per-attribute encoding (`hashToField` for strings, direct integer conversion for `dob`/`batch`/codes) and replaces the single `poseidon(values)` call with the 8-leaf Merkle construction. `poseidon.F.toString(hash)` is preserved verbatim for every intermediate and final result.

**Named export pattern** (poseidonHash.js line 32):
```js
export { stringToBigInt };
```
The new module uses named exports for every public function and the `CHUNK_COUNTS` constant. No default export — consistent with `poseidonHash.js`.

**BN128 field order constant** (new — not in existing code, must be added):
```js
// BN128 scalar field order — from ffjavascript/src/curves.js (verified)
const BN128_FIELD_ORDER = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
```

**Salt generation pattern** (new — Node built-in `crypto`):
```js
import crypto from "crypto";

export function generateSalt() {
  // 31 bytes = 248 bits, always < BN128 p (2^248 < p is guaranteed)
  return BigInt("0x" + crypto.randomBytes(31).toString("hex")).toString();
}

export function generateSalts(count = 7) {
  return Array.from({ length: count }, generateSalt);
}
```

**Chunk counts constant** (frozen with spec — must be exported for circuit planner):
```js
export const CHUNK_COUNTS = { name: 4, rollNo: 2, email: 2 };
```

**Timing instrumentation pattern** (zkp-backend/server.js lines 70–77 — blueprint §10 requires timing for every new crypto op):
```js
// zkp-backend pattern (CJS) — mirror with console.time in ESM:
console.time('ProofGeneration');
// ... crypto op ...
console.timeEnd('ProofGeneration');
```
The new `computeMerkleRoot` export must wrap its body with `console.time('computeMerkleRoot')` / `console.timeEnd('computeMerkleRoot')` so timings are printed on every issuance call.

---

### `privdId_admin/backend/constants/enumCodes.js` (config)

**Role:** NEW frozen mapping module. Exports `PROGRAMME_LEVEL`, `DISCIPLINE`, `POSTGRAD_CODES`. Imported by `studentService.js` (for `buildStudentRecord`) and later by Phase-2 circuit tooling. Append-only after this phase.

**Analog:** `privdId_admin/backend/validators/studentValidator.js` — inline string enum values in Joi; the pattern to follow is the same ESM named-export style.

**Module pattern** (studentValidator.js lines 1–10 — ESM named exports, no default):
```js
import Joi from "joi";

export const studentSchema = Joi.object({
  name: Joi.string().trim().min(2).max(120).required(),
  // ...
});

export function validateStudentPayload(payload) { ... }
```
`enumCodes.js` follows the same file shape: ESM, named `export const`, no default export, no runtime logic — pure constant declarations.

**File naming:** `camelCase.js` per CONVENTIONS.md. Directory: `privdId_admin/backend/constants/` (new directory, consistent with `utils/`, `validators/`, `services/` naming convention of plural noun).

---

### `privdId_admin/backend/scripts/reseed.js` (utility/script, batch)

**Role:** NEW standalone ESM script. Wipes and re-seeds test students under the new commitment. Imports `identityCommitment.js` and `enumCodes.js`. Runs `assert.strictEqual(recomputed, student.merkleRoot)` as the acceptance gate. Not a service — executed directly with `node scripts/reseed.js`.

**Analog:** `zk-proofs/compute_poseidon.js` — standalone script structure; reads/computes and `console.log`s results. Note: `compute_poseidon.js` is CJS (`require`); `reseed.js` must be ESM (`import`) because it lives in `privdId_admin/backend/` which has `"type": "module"`.

**Script structure pattern** (compute_poseidon.js lines 1–34 — adapted to ESM):
```js
// CJS original (do NOT copy require/module.exports into backend):
const circomlib = require('circomlibjs');
async function computePoseidonHash() {
  const poseidon = await circomlib.buildPoseidon();
  // ...
  console.log(F.toString(hash));
}
computePoseidonHash();
```
ESM equivalent pattern for `reseed.js`:
```js
import { ... } from "../utils/identityCommitment.js";
import { ... } from "../constants/enumCodes.js";
import mongoose from "mongoose";
import assert from "assert";
import dotenv from "dotenv";
dotenv.config();

async function main() {
  // connect, wipe, seed, assert, disconnect
}
main().catch(console.error);
```
Top-level async `main()` invoked at the bottom is the standard pattern for ESM scripts in this project (consistent with `server.js` which uses `app.listen` as its entry call).

**Mongoose connection pattern** (db.js — read `process.env.MONGO_URI`, call `mongoose.connect`):
```js
// config/db.js pattern — reuse directly in reseed.js:
import mongoose from "mongoose";
await mongoose.connect(process.env.MONGO_URI);
// ... seed work ...
await mongoose.disconnect();
```

**Root-equality acceptance gate** (from RESEARCH.md §Validation Architecture):
```js
import assert from "assert";
const recomputed = await computeMerkleRoot(attrs, student.salts);
assert.strictEqual(
  recomputed,
  student.merkleRoot,
  "ROOT MISMATCH: issuance and prover-side paths diverged"
);
```
This assertion must be exercised for at least one student whose `name` is >31 bytes and one whose `email` is >31 bytes (the 2-chunk path).

---

### `privdId_admin/backend/utils/poseidonHash.js` (utility, transform) — MODIFY

**Role:** RETAIN existing file. `hashPoseidonFields` and `stringToBigInt` stay for any legacy callers. No changes needed to the file itself in Phase 1 — the new commitment path bypasses it by importing `identityCommitment.js` directly. Add a comment marking `hashPoseidonFields` as deprecated for new commitment use.

**Current file** (lines 1–32 — full file, already read):
```js
import { buildPoseidon } from "circomlibjs";

let poseidonPromise;

function stringToBigInt(value) {
  const text = String(value ?? "");
  if (!text.length) { return 0n; }
  const hex = Buffer.from(text, "utf8").toString("hex");
  return BigInt(`0x${hex}`);
}

async function getPoseidon() {
  if (!poseidonPromise) { poseidonPromise = buildPoseidon(); }
  return poseidonPromise;
}

export async function hashPoseidonFields(fields) {
  const poseidon = await getPoseidon();
  const values = fields.map((field) => stringToBigInt(field));
  const hash = poseidon(values);
  return poseidon.F.toString(hash);
}

export { stringToBigInt };
```
The only required edit is a deprecation comment above `hashPoseidonFields`. `stringToBigInt` remains exported for any non-commitment use (e.g., reading integers from DB display, legacy debug). It must NOT be called from the new `identityCommitment.js` for string commitment — `hashToField` replaces it there.

---

### `privdId_admin/backend/services/studentService.js` (service, CRUD) — REFACTOR

**Role:** Primary refactor target. `buildStudentRecord` (lines 66–85) and `updateStudent` (lines 166–208) are both replaced to call `computeMerkleRoot` from `identityCommitment.js`. `normalizeStudentInput` (lines 23–32) is extended to pass through `programmeLevel`, `discipline`, `batch`, `email` (already present), and `dobInt`.

**Imports pattern** (lines 1–6 — extend, do not remove existing):
```js
import AppError from "../utils/appError.js";
import Student from "../models/Student.js";
import { hashPoseidonFields } from "../utils/poseidonHash.js";  // keep for legacy; new code does NOT call this
import { generateTemporaryPassword } from "../utils/password.js";
import { sendCredentialsEmail } from "./emailService.js";
import { issueCredentialOnChain, revokeCredentialOnChain } from "./credentialService.js";
```
Add after existing imports:
```js
import { hashToField, generateSalts, computeMerkleRoot, CHUNK_COUNTS } from "../utils/identityCommitment.js";
import { PROGRAMME_LEVEL, DISCIPLINE } from "../constants/enumCodes.js";
```

**`normalizeStudentInput` — current pattern** (lines 23–32):
```js
export function normalizeStudentInput(studentPayload) {
  return {
    name: String(studentPayload.name ?? "").trim(),
    email: String(studentPayload.email ?? "").trim().toLowerCase(),
    rollNo: String(studentPayload.rollNo ?? "").trim(),
    programme: String(studentPayload.programme ?? "").trim(),
    contactNo: String(studentPayload.contactNo ?? "").trim(),
    dob: String(studentPayload.dob ?? "").trim(),
  };
}
```
Extend to add new fields (retain `programme` and `contactNo` as non-committed operational fields; add `programmeLevel`, `discipline`, `batch`, `dobInt`):
```js
export function normalizeStudentInput(studentPayload) {
  // parse YYYY-MM-DD → YYYYMMDD integer for commitment; keep dob string for display
  const dobStr = String(studentPayload.dob ?? "").trim();
  const dobInt = dobStr ? parseInt(dobStr.replace(/-/g, ""), 10) : null;
  return {
    name: String(studentPayload.name ?? "").trim(),
    email: String(studentPayload.email ?? "").trim().toLowerCase(),
    rollNo: String(studentPayload.rollNo ?? "").trim(),
    programme: String(studentPayload.programme ?? "").trim(),       // retained display
    programmeLevel: String(studentPayload.programmeLevel ?? "").trim(),
    discipline: String(studentPayload.discipline ?? "").trim(),
    batch: Number(studentPayload.batch) || null,
    contactNo: String(studentPayload.contactNo ?? "").trim(),       // retained display
    dob: dobStr,                                                    // display string
    dobInt,                                                         // YYYYMMDD integer for commitment
  };
}
```

**`buildStudentRecord` — current pattern** (lines 66–85 — REPLACE the hash block):
```js
// CURRENT (lines 72–78) — DELETE:
const hashedData = await hashPoseidonFields([
  normalizedStudent.name,
  normalizedStudent.rollNo,
  normalizedStudent.dob,
  normalizePhone(normalizedStudent.contactNo),
  normalizedStudent.programme,
]);
return { ...normalizedStudent, hashedData, password: temporaryPassword };
```
Replacement:
```js
// NEW — 7-attribute salted Merkle commitment:
const salts = generateSalts(7);
const attrs = [
  await hashToField(normalizedStudent.name, CHUNK_COUNTS.name),        // leaf 0
  await hashToField(normalizedStudent.rollNo, CHUNK_COUNTS.rollNo),    // leaf 1
  String(normalizedStudent.dobInt),                                     // leaf 2 — YYYYMMDD int
  String(PROGRAMME_LEVEL[normalizedStudent.programmeLevel]),           // leaf 3 — code
  String(DISCIPLINE[normalizedStudent.discipline]),                     // leaf 4 — code
  String(normalizedStudent.batch),                                      // leaf 5 — year int
  await hashToField(normalizedStudent.email, CHUNK_COUNTS.email),      // leaf 6
];
const merkleRoot = await computeMerkleRoot(attrs, salts);
return { ...normalizedStudent, merkleRoot, salts, password: temporaryPassword };
```

**`updateStudent` — current hash block** (lines 181–187 — REPLACE identically to buildStudentRecord):
```js
// CURRENT (lines 181–187) — DELETE:
student.hashedData = await hashPoseidonFields([
  student.name, student.rollNo, student.dob,
  normalizePhone(student.contactNo), student.programme,
]);
```
Replacement follows the same attrs/salts pattern as `buildStudentRecord`. The `updateStudent` allowed-fields list (line 171) must also be extended:
```js
// CURRENT (line 171):
const allowedFields = ["name", "programme", "contactNo", "dob"];
// EXTEND TO:
const allowedFields = ["name", "programmeLevel", "discipline", "batch", "contactNo", "dob", "programme"];
```

**Non-blocking credential anchoring pattern** (lines 102–116 — KEEP exactly, only update the object passed to `issueCredentialOnChain`):
```js
// CURRENT call site (lines 104–109):
const { cid, txHash, blockNumber } = await issueCredentialOnChain({
  rollNo: student.rollNo,
  programme: student.programme,
  email: student.email,
  hashedData: student.hashedData,
});
// UPDATE to:
const { cid, txHash, blockNumber } = await issueCredentialOnChain({
  rollNo: student.rollNo,
  email: student.email,
  merkleRoot: student.merkleRoot,
});
```

**Error throwing pattern** (lines 68–70 — copy verbatim for new validations):
```js
if (!normalizedStudent.dob) {
  throw new AppError("Date of Birth is required to issue a credential.", 400);
}
```
Add analogous guards for `programmeLevel`, `discipline`, `batch` — same shape: `if (!x) throw new AppError("...", 400)`.

---

### `privdId_admin/backend/services/credentialService.js` (service, request-response) — PATCH

**Role:** Two-line patch: issuer string (line 67) and version (line 68). The `anchorOnChain` function accepts `hashedData` as its third parameter (line 40) — rename parameter to `merkleRoot` throughout this file to match the new field name, but the `ethers.zeroPadValue` conversion is unchanged.

**Credential JSON build — current pattern** (lines 60–70):
```js
export async function issueCredentialOnChain(student) {
  const credential = {
    rollNo: student.rollNo,
    programme: student.programme,
    email: student.email,
    hashedData: student.hashedData,
    issuedAt: new Date().toISOString(),
    issuer: 'PrivdID — VIT Bhopal University',   // LINE 67 — PATCH
    type: 'StudentIdentityCredential',
    version: '1.0',                               // LINE 68 — PATCH
  };
```
Patched version:
```js
export async function issueCredentialOnChain(student) {
  const credential = {
    rollNo: student.rollNo,
    email: student.email,
    merkleRoot: student.merkleRoot,
    issuedAt: new Date().toISOString(),
    issuer: 'PrivdID — IIITDM Jabalpur',
    type: 'StudentIdentityCredential',
    version: '2.0',
  };
```

**bytes32 conversion — current pattern** (line 40 — KEEP UNCHANGED):
```js
const pubHashBytes32 = ethers.zeroPadValue(ethers.toBeHex(BigInt(hashedData)), 32);
```
Rename variable/parameter from `hashedData` to `merkleRoot` but the ethers call is identical:
```js
const pubHashBytes32 = ethers.zeroPadValue(ethers.toBeHex(BigInt(merkleRoot)), 32);
```

**ESM __dirname pattern** (lines 7–8 — KEEP UNCHANGED, reference for new files):
```js
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
```

---

### `privdId_admin/backend/models/Student.js` (model, CRUD) — EXTEND

**Role:** Add six new fields to `studentSchema`. Retain existing fields — none are dropped from the schema (even deprecated ones stay as optional for legacy display).

**Schema field pattern** (lines 3–78 — existing fields as reference for new field shape):
```js
// String, required, trim — pattern for programmeLevel and discipline:
name: { type: String, required: true, trim: true },

// String, not required, trim — pattern for dob (keep as-is):
dob: { type: String, required: false, trim: true },

// String, required (will replace hashedData role) — pattern for merkleRoot:
hashedData: { type: String, required: true },

// Array with default — pattern for salts[]:
// (no exact existing analog — closest is Boolean with default false)
emailSent: { type: Boolean, default: false },
```

New fields to add inside `studentSchema` (after existing fields, before closing brace):
```js
programmeLevel: { type: String, required: false, trim: true },
discipline:     { type: String, required: false, trim: true },
batch:          { type: Number, required: false, default: null },
dobInt:         { type: Number, required: false, default: null },
salts:          { type: [String], required: false, default: [] },
merkleRoot:     { type: String, required: false, default: null },
```
`required: false` on all new fields preserves backward compatibility for any existing (pre-wipe) records. After `reseed.js` runs and wipes all test data this is moot, but the schema stays lenient.

**Model export pattern** (lines 80–82 — KEEP UNCHANGED):
```js
const Student = mongoose.model("Student", studentSchema);
export default Student;
```

---

### `privdId_admin/backend/controllers/studentController.js` (controller, request-response) — MINOR UPDATE

**Role:** The controller calls `normalizeStudentInput` and `validateStudentPayload` — it does not compute the commitment directly. The main changes are: (1) `sanitizeStudent` in `studentService.js` must be extended to include new fields in its output; (2) the `allowedFields` list in `updateStudentById` flows through `updateStudent` in the service, so controller changes are minimal.

**`asyncHandler` wrapper pattern** (lines 68–75 — copy for any new handler):
```js
export const getStudents = asyncHandler(async (_req, res) => {
  const students = await listStudents();
  res.json({
    status: "success",
    count: students.length,
    students,
  });
});
```

**Validation → normalize → service call pipeline** (lines 78–99 — the canonical 3-step pattern):
```js
export const addStudent = asyncHandler(async (req, res) => {
  // 1. Validate
  const { error, value } = validateStudentPayload(req.body);
  if (error) { throw new AppError("Validation failed", 400, error.details); }

  // 2. Normalize
  const normalizedValue = normalizeStudentInput(value);

  // 3. Duplicate check + service call
  const duplicate = await findDuplicateStudent(normalizedValue);
  if (duplicate) { throw new AppError("...", 409); }
  const result = await createStudent(normalizedValue);

  res.status(201).json({ status: "success", message: "...", student: result.student });
});
```
No structural change to this pipeline. The new fields (`programmeLevel`, `discipline`, `batch`) flow through automatically once `validateStudentPayload` and `normalizeStudentInput` are extended.

**`AppError` throw pattern** (from appError.js + usage throughout controller):
```js
throw new AppError("Validation failed", 400, error.details);   // with details
throw new AppError("Student not found.", 404);                  // simple 404
throw new AppError("...", 409);                                 // conflict
```

---

### `privdId_admin/backend/validators/studentValidator.js` (utility, transform) — EXTEND

**Role:** Add `programmeLevel`, `discipline`, `batch`, `email` byte-length cap to `studentSchema`. Remove `programme` as required (mark optional or drop). Remove `contactNo` as required from the commitment perspective (it stays in schema as optional operational field).

**Current schema pattern** (lines 3–10):
```js
export const studentSchema = Joi.object({
  name:      Joi.string().trim().min(2).max(120).required(),
  email:     Joi.string().trim().email().required(),
  rollNo:    Joi.string().trim().min(1).max(50).required(),
  programme: Joi.string().trim().min(2).max(120).required(),
  contactNo: Joi.string().trim().min(5).max(20).required(),
  dob:       Joi.string().trim().allow("").optional(),
});
```

Extended schema (preserve all existing fields; add new required fields; add email byte cap):
```js
export const studentSchema = Joi.object({
  name:           Joi.string().trim().min(2).max(120).required(),
  email:          Joi.string().trim().email().max(62).required(),   // max(62) enforces 2-chunk contract
  rollNo:         Joi.string().trim().min(1).max(50).required(),
  programme:      Joi.string().trim().min(2).max(120).optional(),  // no longer committed; optional
  programmeLevel: Joi.string().valid("B.Tech","B.Des","Dual","M.Tech","M.Des","PhD").required(),
  discipline:     Joi.string().valid("CSE","ECE","ME","SmartMfg","Design","NatSci").required(),
  batch:          Joi.number().integer().min(1990).max(2100).required(),
  contactNo:      Joi.string().trim().min(5).max(20).optional(),   // operational; not committed
  dob:            Joi.string().trim().allow("").optional(),
});
```

**`validateStudentPayload` function — KEEP UNCHANGED** (lines 12–16):
```js
export function validateStudentPayload(payload) {
  return studentSchema.validate(payload, {
    abortEarly: false,
    stripUnknown: true,
  });
}
```

---

## Shared Patterns

### Error Throwing
**Source:** `privdId_admin/backend/utils/appError.js` (all 10 lines)
**Apply to:** All new functions in `identityCommitment.js`, `enumCodes.js` lookups in `studentService.js`, `reseed.js`

```js
// appError.js — the full class:
export default class AppError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
    this.details = details;
    this.isOperational = true;
  }
}
```
Usage: `throw new AppError("programmeLevel is required.", 400)` for any missing/invalid commitment input. For enum lookup failure: `throw new AppError(\`Unknown programmeLevel: "${level}"\`, 400)`.

### Async Pattern (ESM backend)
**Source:** `privdId_admin/backend/middleware/asyncHandler.js` + all controller handlers
**Apply to:** All controller handlers; service functions are `async` but not wrapped (they throw, caught by `asyncHandler` at the controller layer)

```js
// Service functions: plain async, throw AppError on error
export async function buildStudentRecord(payload) {
  // ...
  if (!condition) throw new AppError("...", 400);
  // ...
}

// Controller handlers: wrapped with asyncHandler — never add try/catch here
export const addStudent = asyncHandler(async (req, res) => {
  // throws propagate to errorHandler middleware automatically
});
```

### ESM Import Path Convention
**Source:** All files in `privdId_admin/backend/`
**Apply to:** `identityCommitment.js`, `enumCodes.js`, `reseed.js`

```js
// All relative imports MUST include .js extension:
import { hashToField, CHUNK_COUNTS } from "../utils/identityCommitment.js";
import { PROGRAMME_LEVEL, DISCIPLINE } from "../constants/enumCodes.js";
import AppError from "../utils/appError.js";
```

### Poseidon F.toString() Output Convention
**Source:** `privdId_admin/backend/utils/poseidonHash.js` line 29
**Apply to:** `identityCommitment.js` — every Poseidon call result

```js
// Always use poseidon.F.toString(result) to get a decimal string.
// Never use .toString() on the raw result object — it is a Montgomery-form array.
return poseidon.F.toString(hash);
```

### bytes32 Conversion (unchanged)
**Source:** `privdId_admin/backend/services/credentialService.js` line 40
**Apply to:** `credentialService.js` (rename param only)

```js
const pubHashBytes32 = ethers.zeroPadValue(ethers.toBeHex(BigInt(merkleRoot)), 32);
```

### Non-Blocking Credential Anchoring
**Source:** `privdId_admin/backend/services/studentService.js` lines 102–116
**Apply to:** `createStudent`, `updateStudent`, `insertBulkStudents` — all three call `issueCredentialOnChain` inside try/catch. The student record is saved to MongoDB BEFORE the try block; on-chain failure logs but does not abort.

```js
try {
  const { cid, txHash, blockNumber } = await issueCredentialOnChain({ ... });
  student.ipfsCID = cid;
  student.onChainTxHash = txHash;
  student.onChainBlock = blockNumber;
  await student.save();
} catch (err) {
  console.error('[credential] On-chain anchoring failed for', student.rollNo, ':', err.message);
}
```

### Timing Instrumentation
**Source:** `zkp-backend/server.js` lines 70–77
**Apply to:** `identityCommitment.js` → `computeMerkleRoot` function body

```js
// Wrap the full Merkle computation:
console.time('computeMerkleRoot');
// ... computation ...
console.timeEnd('computeMerkleRoot');
```
Blueprint §10: every new crypto op must print seconds. `console.time`/`timeEnd` prints ms; acceptable for Phase 1.

---

## No Analog Found

No files in this phase are completely novel — all have analogs or are modifications of existing files.

| File | Note |
|---|---|
| `privdId_admin/backend/constants/enumCodes.js` | Closest analog is the inline Joi `.valid()` strings in `studentValidator.js`. No existing standalone constants module exists in the backend. The file itself is trivial (3 export const declarations). |

---

## Metadata

**Analog search scope:** `privdId_admin/backend/` (all subdirectories), `zkp-backend/server.js` lines 1–80, `zk-proofs/compute_poseidon.js`
**Files read:** 9 source files
**Pattern extraction date:** 2026-06-16

**Key integration constraint:** `identityCommitment.js` must be importable by both `privdId_admin/backend/services/studentService.js` (ESM) and `privdId_admin/backend/scripts/reseed.js` (ESM). It must NOT be imported by `zkp-backend/server.js` (CJS) in Phase 1 — the prover-side test is the standalone `reseed.js` script, not the live prover endpoint (Phase 4).

**Duplicate stringToBigInt note:** `zkp-backend/server.js` lines 23–30 contains an identical copy of `stringToBigInt`. RESEARCH.md recommends removing it in Phase 1 even though the prover endpoint is not being refactored. If the planner includes this as a task, the removal is safe — `zkp-backend/server.js` does not call `stringToBigInt` from any other module; it only uses it locally within the `/generate-proof` handler. Removing the function while leaving the handler body intact would break the handler — the correct action is to leave the function in place and add a comment marking it deprecated, or leave it entirely unchanged (since Phase 4 will replace the whole handler). **Recommended: leave `zkp-backend/server.js` entirely untouched in Phase 1** — the drift vector is eliminated structurally by having both paths import the shared module, not by deleting the old copy from a file that is out of Phase 1 scope.
