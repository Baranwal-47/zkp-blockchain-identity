# Phase 7: Student Keypair & Two-Phase Enrollment - Pattern Map

**Mapped:** 2026-06-19
**Files analyzed:** 9 (5 backend, 4 mobile)
**Analogs found:** 9 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `privdId_admin/backend/crypto/ecies.js` (NEW) | utility/crypto | transform (encrypt/decrypt) | `privdId_admin/backend/crypto/aesgcm.js` | exact |
| `privdId_admin/backend/models/Student.js` (MODIFY — add `pubKey`, `dekEnvelopeCID`, `enrollmentPhase`) | model | CRUD | itself (existing `dek`/`ciphertextCID` fields) | exact |
| `privdId_admin/backend/services/studentService.js` (MODIFY — add `claimCredential()`, set `enrollmentPhase` at creation) | service | CRUD + file-I/O (IPFS pin) | `updateStudent()` / `createStudent()` in same file | exact |
| `privdId_admin/backend/controllers/studentController.js` (MODIFY — add `claimPubkey` handler) | controller | request-response | `loginStudent` / `updateStudentById` in same file | exact |
| `privdId_admin/backend/routes/studentRoutes.js` (MODIFY — add `POST /:id/pubkey`) | route | request-response | existing route registrations (`router.post("/login", ...)`) | exact |
| `digital-app/utils/keypair.js` (NEW) | utility | transform (keygen, no network) | none (greenfield) — modeled on RESEARCH.md verified `eciesjs` API | no analog (see below) |
| `digital-app/screens/ClaimCredentialScreen.js` (NEW) | component/screen | request-response (POST + loading/error states) | `digital-app/screens/LoginScreen.js` | role-match |
| `digital-app/App.js` (MODIFY — register `ClaimCredentialScreen`) | provider/navigation config | event-driven (route registration) | itself (existing `Stack.Screen` blocks) | exact |
| `digital-app/index.js` (MODIFY — add RNG polyfill import) | config/entry-point | — | itself | exact |

## Pattern Assignments

### `privdId_admin/backend/crypto/ecies.js` (utility, transform)

**Analog:** `privdId_admin/backend/crypto/aesgcm.js` (read in full, 119 lines)

**Imports pattern** (aesgcm.js lines 27-28):
```javascript
import crypto from "crypto";
import { timed } from "../utils/timing.js";
```
For `ecies.js`, swap `crypto` for `eciesjs`'s named exports — mirror the same two-import shape:
```javascript
import { encrypt, decrypt } from "eciesjs";
import { timed } from "../utils/timing.js";
```

**Module header / threat-mitigation comment convention** (aesgcm.js lines 1-25): every crypto module in this codebase opens with a doc comment naming the canonical blueprint section, the frozen blob shape, and a `THREAT MITIGATIONS` list referencing `T-0X-XX` IDs from the relevant plan's `threat_model`. `ecies.js` must follow the same convention (cite blueprint §E3.6, and whatever `T-07-XX` IDs the planner assigns for replay/DoS/info-disclosure, matching the three threat patterns already named in RESEARCH.md's Security Domain table).

**Core pattern — length-guard BEFORE `timed()`** (aesgcm.js lines 64-85, `encryptCredential`):
```javascript
export async function encryptCredential(plaintextObj, dek) {
  if (!Buffer.isBuffer(dek) || dek.length !== KEY_LENGTH) {
    throw new Error(`encryptCredential: expected a ${KEY_LENGTH}-byte Buffer dek`);
  }

  const { out } = await timed("encryptCredential", async () => {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv("aes-256-gcm", dek, iv);
    const plaintext = Buffer.from(JSON.stringify(plaintextObj), "utf8");
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag(); // MUST be called after cipher.final()
    return { iv: iv.toString("base64"), authTag: authTag.toString("base64"), ciphertext: ciphertext.toString("base64") };
  });

  return out;
}
```
`wrapDEK`/`unwrapDEK` must follow this exact shape: validate inputs synchronously first (Buffer type/length, non-empty hex string), THEN enter `timed(label, async () => {...})`, return `out` directly — never alter the wrapped/unwrapped return shape inside the `timed()` call. RESEARCH.md's Pattern 1 code example already instantiates this for `ecies.js` verbatim — use it as the literal starting point:
```javascript
import { encrypt, decrypt } from "eciesjs";
import { timed } from "../utils/timing.js";

const DEK_LENGTH = 32;

export async function wrapDEK(pubKeyHex, dek) {
  if (!Buffer.isBuffer(dek) || dek.length !== DEK_LENGTH) {
    throw new Error(`wrapDEK: expected a ${DEK_LENGTH}-byte Buffer dek`);
  }
  if (typeof pubKeyHex !== "string" || !pubKeyHex.length) {
    throw new Error("wrapDEK: pubKeyHex must be a non-empty hex string");
  }

  const { out } = await timed("wrapDEK", async () => {
    const envelope = encrypt(pubKeyHex, dek); // returns Buffer
    return envelope.toString("base64");
  });

  return out;
}

export function unwrapDEK(privKeyHex, envelopeBase64) {
  const envelope = Buffer.from(envelopeBase64, "base64");
  const dek = decrypt(privKeyHex, envelope); // returns Buffer, throws on auth failure
  if (dek.length !== DEK_LENGTH) {
    throw new Error(`unwrapDEK: decrypted DEK has unexpected length ${dek.length}`);
  }
  return dek;
}
```

**Error handling pattern:** Neither `aesgcm.js` function catches/swallows errors — `decryptCredential` lets `decipher.final()` throw on auth-tag mismatch, uncaught, so the caller's `asyncHandler`/error middleware handles it. `wrapDEK`/`unwrapDEK` must do the same: never wrap `eciesjs`'s `encrypt`/`decrypt` calls in a try/catch that swallows the error.

---

### `privdId_admin/backend/models/Student.js` (model, CRUD)

**Analog:** itself — existing `dek`/`ciphertextCID` field block (lines 55-63)

**Field pattern to mirror** (lines 55-63):
```javascript
ciphertextCID: {
  type: String,
  default: null,
},
dek: {
  type: String,
  default: null,
  select: false, // never returned unless explicitly .select('+dek')'d — D-02 hard requirement
},
```
New fields per blueprint §E3.6 / CONTEXT.md discretion note — flat fields directly on `Student`, following this exact `{ type, default }` shape:
```javascript
pubKey: {
  type: String,
  default: null,
},
dekEnvelopeCID: {
  type: String,
  default: null,
},
enrollmentPhase: {
  type: String,
  enum: ["awaiting-keypair", "active", "revoked"],
  default: "awaiting-keypair",
},
```
`pubKey` does NOT need `select: false` (it's intentionally public — KEY-02 sends only the pubkey to the backend, and the backend may return it). Only `dek` (already existing) needs `select: false`; `dekEnvelopeCID` is also safe to return since it's just a CID pointer, not key material — mirror `ciphertextCID`'s shape exactly.

---

### `privdId_admin/backend/services/studentService.js` (service, CRUD + file-I/O)

**Analog:** `updateStudent()` (lines 235-324) for the select('+dek')-then-mutate-then-save pattern; `createStudent()` (lines 132-176) for the IPFS-pin-then-Mongo-write ordering; `sanitizeStudent()` (lines 44-66) for the response allowlist discipline.

**select('+dek') pattern to mirror** (line 238):
```javascript
const student = await Student.findById(id).select('+dek');
if (!student) throw new AppError("Student not found.", 404);
if (student.revoked) throw new AppError("Cannot update a revoked credential.", 400);
```
`claimCredential(id, pubKeyHex)` must use the identical `.select('+dek')` call (since `dek` has `select: false`), and add the D-06 guard immediately after the existence/revoked checks:
```javascript
if (student.enrollmentPhase !== "awaiting-keypair") {
  throw new AppError("This credential has already been claimed.", 409);
}
```

**Atomic guard-then-mutate ordering (TOCTOU close per RESEARCH.md Known Threat Patterns):** Per RESEARCH.md, prefer `findOneAndUpdate` with `enrollmentPhase: "awaiting-keypair"` in the query filter for the FINAL state-flip write, not a read-then-save. The existing codebase's `revokeStudent()` (lines 326-344) shows a similar guard-then-mutate-then-save shape (check `student.revoked` before mutating, single `save()` at the end) — reuse that ordering, but harden the final write per RESEARCH.md's atomicity note (Pitfall 4): pin to IPFS FIRST (cheap to retry), then a SINGLE update that sets `dekEnvelopeCID`, unsets `dek`, and flips `enrollmentPhase` together.

**IPFS pin then Mongo write ordering to mirror** (`createStudent()` lines 156-171):
```javascript
try {
  const dek = generateDEK();
  const { cid, txHash, blockNumber } = await issueCredentialOnChain(student, dek);
  student.dek = dek.toString('base64');
  student.ciphertextCID = cid;
  student.onChainTxHash = txHash;
  student.onChainBlock = blockNumber;
  student.anchorPending = false;
  student.lastAnchorError = null;
  await student.save();
} catch (err) {
  console.error('[credential] On-chain anchoring failed for', student.rollNo, ':', err.message);
  student.anchorPending = true;
  student.lastAnchorError = err.message;
  await student.save();
}
```
`claimCredential` should mirror this try/catch-and-persist-partial-failure-state shape: pin the envelope to IPFS, THEN in one mutation set `dekEnvelopeCID`, `dek = null` (or `$unset`), `enrollmentPhase = "active"`, then `save()`.

**`sanitizeStudent()` allowlist discipline to extend** (lines 44-66, esp. the comment at lines 58-60):
```javascript
export function sanitizeStudent(student) {
  return {
    id: student._id.toString(),
    name: student.name,
    email: student.email,
    rollNo: student.rollNo,
    programme: student.programme,
    contactNo: student.contactNo,
    dob: student.dob,
    hashedData: student.hashedData,
    emailSent: student.emailSent,
    emailSentAt: student.emailSentAt,
    createdAt: student.createdAt,
    ciphertextCID: student.ciphertextCID ?? null,
    // NOTE (D-02): the per-student plaintext encryption key is intentionally
    // excluded from this allowlist — it must never leave the backend via any
    // API response. Do NOT "helpfully" add it back to this object.
    onChainTxHash: student.onChainTxHash ?? null,
    onChainBlock: student.onChainBlock ?? null,
    revoked: student.revoked ?? false,
    revokedAt: student.revokedAt ?? null,
  };
}
```
Add `enrollmentPhase: student.enrollmentPhase ?? "awaiting-keypair"` and `pubKey: student.pubKey ?? null` and `dekEnvelopeCID: student.dekEnvelopeCID ?? null` to this allowlist (all safe to expose). Keep the explicit "never add `dek` back" comment as-is — do not touch it.

**Reuse for IPFS pinning:** `credentialService.js::pinToIPFS(credential, pinName)` (lines 18-33) is generic over any JSON-serializable content + a pin name string — call it directly for the `dekEnvelopeCID` pin (envelope is a base64 string wrapped in a small JSON object, or pin the raw base64 string as `pinataContent`), no new pinning code needed:
```javascript
async function pinToIPFS(credential, pinName) {
  const response = await axios.post(
    'https://api.pinata.cloud/pinning/pinJSONToIPFS',
    {
      pinataContent: credential,
      pinataMetadata: { name: `privid-ciphertext-${pinName}` },
    },
    { headers: { Authorization: `Bearer ${process.env.PINATA_JWT}`, 'Content-Type': 'application/json' } }
  );
  return response.data.IpfsHash;
}
```
Note: `pinToIPFS` is NOT exported from `credentialService.js` today (it's a private function used only by `issueCredentialOnChain`). The planner must either export it or add a thin exported wrapper (e.g. `pinEnvelopeToIPFS(envelopeBase64, rollNo)`) — flag this as a required small modification to `credentialService.js`, not just a "call existing function" reuse.

---

### `privdId_admin/backend/controllers/studentController.js` (controller, request-response)

**Analog:** `loginStudent` (lines 216-237) for the validate-then-401/403-then-success shape; `updateStudentById` (lines 246-259) for the service-delegate-then-respond shape.

**Imports pattern** (lines 1-20):
```javascript
import multer from "multer";
import AppError from "../utils/appError.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validateStudentPayload } from "../validators/studentValidator.js";
import { parseStudentsFromWorkbook } from "../utils/excelParser.js";
import {
  buildBulkStudents, createStudent, findDuplicateStudent, insertBulkStudents,
  listStudents, normalizeStudentInput, sanitizeStudent, sendEmailsForStudents,
  updateStudent, revokeStudent,
} from "../services/studentService.js";
import Student from "../models/Student.js";
import Joi from "joi";
```
Add `claimCredential` to the `studentService.js` import list for the new `claimPubkey` handler.

**Core request-response + guard pattern to mirror** (`loginStudent`, lines 216-237):
```javascript
export const loginStudent = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new AppError("Email and password are required.", 400);
  }

  const student = await Student.findOne({ email: String(email).toLowerCase().trim() });

  if (!student || student.password !== String(password)) {
    throw new AppError("Invalid email or password.", 401);
  }

  if (student.revoked) {
    throw new AppError("This credential has been revoked. Please contact your institution.", 403);
  }

  res.json({
    status: "success",
    student: sanitizeStudent(student),
  });
});
```
`claimPubkey` should follow this exact shape — input guard, then delegate to the service (which holds the D-06 enrollmentPhase check + DEK wrap + IPFS pin + atomic save), then respond:
```javascript
export const claimPubkey = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { pubKeyHex } = req.body;

  if (!pubKeyHex || typeof pubKeyHex !== "string") {
    throw new AppError("pubKeyHex is required.", 400);
  }

  const result = await claimCredential(id, pubKeyHex);

  res.json({
    status: "success",
    student: result.student,
  });
});
```
Note the AppError statusCode convention used elsewhere in this controller: 400 for missing/malformed input, 401 for auth failure, 403 for revoked, 404 for not-found (`getStudentById` line 242), 409 for duplicate/conflict (`addStudent` line 90). Per D-06, the "already claimed" rejection should use 409 (`AppError("This credential has already been claimed.", 409)`), consistent with `addStudent`'s existing 409 usage for the duplicate-student case.

**Login response must add `enrollmentPhase` (D-01 requirement):** `sanitizeStudent(student)` already returns the full allowlisted object — once `enrollmentPhase` is added to `sanitizeStudent` (see studentService.js section above), `loginStudent`'s existing `res.json({ status: "success", student: sanitizeStudent(student) })` automatically carries it. No change needed to `loginStudent` itself beyond the `sanitizeStudent` allowlist update.

---

### `privdId_admin/backend/routes/studentRoutes.js` (route, request-response)

**Analog:** itself — existing route table (full file, 17 lines)

**Full existing pattern:**
```javascript
import express from "express";
import { addStudent, bulkAddStudents, getStudents, getStudentById, loginStudent, sendStudentEmails, updateStudentById, revokeStudentById, uploadMiddleware, uploadStudents } from "../controllers/studentController.js";

const router = express.Router();

router.post("/login", loginStudent);
router.get("/", getStudents);
router.post("/", addStudent);
router.post("/bulk", bulkAddStudents);
router.post("/upload", uploadMiddleware, uploadStudents);
router.post("/send-email", sendStudentEmails);
router.get("/:id", getStudentById);
router.put("/:id", updateStudentById);
router.delete("/:id", revokeStudentById);

export default router;
```
Add `claimPubkey` to the import list and a new route line, placed alongside the other `:id`-scoped routes:
```javascript
router.post("/:id/pubkey", claimPubkey);
```
Insert it near `router.get("/:id", ...)` / `router.put("/:id", ...)` / `router.delete("/:id", ...)` (lines 13-15) for readability — route ordering in this file is otherwise unordered/flat, no middleware chain to worry about (no auth middleware exists on any student route currently, consistent with the codebase-wide unauthenticated-CRUD gap noted in RESEARCH.md's V4 Access Control row).

---

### `digital-app/screens/ClaimCredentialScreen.js` (component/screen, request-response)

**Analog:** `digital-app/screens/LoginScreen.js` (full file read, 237 lines) for the fetch-with-loading-state-and-Alert-on-error shape; `digital-app/screens/StudentProfileScreen.js` (lines 39-65) for `useFocusEffect`-driven server-state refresh as a secondary reference (not the primary pattern, since D-01 fires on mount, not on focus).

**Imports pattern** (LoginScreen.js lines 1-14):
```javascript
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, ScrollView, ActivityIndicator,
} from 'react-native';
import { ADMIN_BACKEND_URL } from '../environment';
```
`ClaimCredentialScreen` additionally needs `useEffect` (to fire keygen+POST on mount per D-01) and the new `digital-app/utils/keypair.js` module:
```javascript
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { ADMIN_BACKEND_URL } from '../environment';
import { generateAndStoreKeypair, getStoredPublicKeyHexForRetry } from '../utils/keypair';
```

**Loading-state + try/catch/finally fetch pattern to mirror** (LoginScreen.js lines 22-51):
```javascript
const handleLogin = async () => {
  if (!email.trim() || !password.trim()) {
    Alert.alert('Missing Fields', 'Please enter your email and password.');
    return;
  }

  setLoading(true);
  try {
    const response = await fetch(`${ADMIN_BACKEND_URL}/api/students/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password: password.trim() }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Login failed');
    }

    navigation.navigate('StudentProfile', { student: data.student });
  } catch (error) {
    Alert.alert('Login Failed', error.message || 'Invalid credentials. Please try again.');
  } finally {
    setLoading(false);
  }
};
```
`ClaimCredentialScreen`'s claim function must follow the identical `setLoading(true)` → try → `fetch` → `response.ok` check → `finally setLoading(false)` shape, but per D-03 the error path must NOT use a one-shot `Alert.alert` — it must set an error state that renders an inline "Try again" button on the same screen (no `navigation.navigate` away on failure, no logout). Per D-02, keygen + SecureStore write happens BEFORE the POST, and any retry calls `getStoredPublicKeyHexForRetry()` instead of `generateAndStoreKeypair()`:
```javascript
const [status, setStatus] = useState('loading'); // 'loading' | 'error'
const [errorMessage, setErrorMessage] = useState(null);
const [hasGeneratedKey, setHasGeneratedKey] = useState(false);

const attemptClaim = async () => {
  setStatus('loading');
  try {
    const pubKeyHex = hasGeneratedKey
      ? await getStoredPublicKeyHexForRetry()
      : (await generateAndStoreKeypair()).pubKeyHex;
    setHasGeneratedKey(true);

    const response = await fetch(`${ADMIN_BACKEND_URL}/api/students/${student.id}/pubkey`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pubKeyHex }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Claim failed');

    navigation.navigate('StudentProfile', { student: data.student });
  } catch (error) {
    setErrorMessage(error.message || 'Something went wrong. Please try again.');
    setStatus('error');
  }
};

useEffect(() => { attemptClaim(); }, []); // D-01: fire on mount, no confirmation tap
```

**Visual style to mirror** (LoginScreen.js styles, lines 125-237): white rounded-card (`borderRadius: 16`, `padding: 24`, subtle shadow) on `#f8fafc` background, `ActivityIndicator` (not a custom spinner) for loading, `#3b82f6` for primary action buttons, `#1e293b`/`#64748b` for title/subtitle text colors. Reuse this style palette verbatim for `ClaimCredentialScreen`'s loading and error states (per CONTEXT.md's "follow existing screen visual patterns" discretion note and per 07-UI-SPEC.md, already approved-pending).

---

### `digital-app/App.js` (navigation config)

**Analog:** itself — existing `Stack.Screen` registration block (lines 75-84)

**Pattern to mirror:**
```javascript
<Stack.Screen
  name="LoginScreen"
  component={LoginScreen}
  options={{ title: 'Student Login' }}
/>
<Stack.Screen
  name="StudentProfile"
  component={StudentProfileScreen}
  options={{ title: 'Your Identity' }}
/>
```
Add `ClaimCredentialScreen` between these two (logically: login → claim → profile), with `headerLeft: null` and `gestureEnabled: false` (mirroring the `LoadingScreen` registration at lines 100-107) since D-03 says don't let the user navigate back mid-claim:
```javascript
<Stack.Screen
  name="ClaimCredentialScreen"
  component={ClaimCredentialScreen}
  options={{ title: 'Claiming Credential', headerLeft: null, gestureEnabled: false }}
/>
```
Also add the import line alongside the other screen imports (line 7 area): `import ClaimCredentialScreen from './screens/ClaimCredentialScreen';`

---

### `digital-app/index.js` (entry-point config)

**Analog:** itself (full file, 8 lines) — RESEARCH.md Pattern 3 specifies the exact required modification.

**Current file:**
```javascript
import { registerRootComponent } from 'expo';
import App from './App';
registerRootComponent(App);
```
**Required modification (mandatory per RESEARCH.md, not optional):**
```javascript
import 'react-native-get-random-values'; // MUST be first — before any eciesjs/ethers import
import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
```

## Shared Patterns

### Error class / status-code convention
**Source:** `privdId_admin/backend/utils/appError.js` (full file)
```javascript
export default class AppError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.name = "AppError";
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
    this.details = details;
    this.isOperational = true;
  }
}
```
**Apply to:** `claimPubkey` controller and `claimCredential` service — all thrown errors must be `AppError` instances with an explicit statusCode (400 missing input, 404 not-found, 409 already-claimed per D-06), never a bare `Error` or `throw new Error(...)` on the backend.

### Async route wrapper
**Source:** `privdId_admin/backend/middleware/asyncHandler.js` (full file)
```javascript
export function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}
```
**Apply to:** every new controller export (`claimPubkey`) must be wrapped in `asyncHandler(async (req, res) => {...})`, exactly like every existing export in `studentController.js`.

### Crypto module instrumentation
**Source:** `privdId_admin/backend/utils/timing.js` (full file, 23 lines)
```javascript
export async function timed(label, fn) {
  const t0 = performance.now();
  const out = await fn();
  const seconds = (performance.now() - t0) / 1000;
  console.log(`[perf] ${label}: ${seconds.toFixed(3)} s`);
  return { out, seconds };
}
```
**Apply to:** `wrapDEK` in `crypto/ecies.js` must call `await timed("wrapDEK", async () => {...})`, per CLAUDE.md ground rule 5 ("measure everything"). `unwrapDEK` (client-side counterpart, not used server-side this phase) does not need this — it has no caller in Phase 7's backend scope.

### sanitizeStudent allowlist discipline
**Source:** `privdId_admin/backend/services/studentService.js` lines 44-66
**Apply to:** any new field added to `Student` (`pubKey`, `dekEnvelopeCID`, `enrollmentPhase`) must be explicitly added to this allowlist function to be visible in any API response; `dek` must NEVER be added, per the existing inline comment at lines 58-60 — preserve that comment verbatim.

### Screen visual style (white card / blue primary / ActivityIndicator)
**Source:** `digital-app/screens/LoginScreen.js` styles (lines 125-237)
**Apply to:** `ClaimCredentialScreen`'s loading and error UI states.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `digital-app/utils/keypair.js` | utility | transform (keygen, SecureStore I/O) | No existing on-device crypto/keystore module exists anywhere in `digital-app` — `ethers` is a dependency but unused in any screen (confirmed via RESEARCH.md source read of `package.json`/screens). This is genuinely greenfield; use RESEARCH.md's Pattern 2 code example verbatim as the starting point rather than an in-repo analog. |

## Metadata

**Analog search scope:** `privdId_admin/backend/{crypto,models,services,controllers,routes,utils,middleware}`, `digital-app/{screens,.}` — directed by graphify BFS traversal from `Student`/`studentRoutes.js`/`studentController.js` nodes, cross-checked against direct grep for `loginStudent`.
**Files read in full:** `aesgcm.js`, `Student.js`, `studentService.js`, `appError.js`, `asyncHandler.js`, `timing.js`, `credentialService.js`, `LoginScreen.js`, `StudentProfileScreen.js`, `App.js`, `index.js`, `package.json` (digital-app); `studentController.js` and `studentRoutes.js` read via targeted offset/limit ranges (controller is 289 lines, sectioned: lines 1-110 and 210-289).
**Pattern extraction date:** 2026-06-19
