---
phase: 06-encryption-ciphertext-storage
reviewed: 2026-06-19T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - privdId_admin/backend/crypto/aesgcm.js
  - privdId_admin/backend/models/Student.js
  - privdId_admin/backend/services/credentialService.js
  - privdId_admin/backend/services/studentService.js
  - zkp-backend/server.js
  - digital-app/screens/VerifyProof.js
findings:
  critical: 2
  warning: 6
  info: 4
  total: 12
status: issues_found
---

# Phase 6: Code Review Report

**Reviewed:** 2026-06-19
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

The AES-256-GCM module itself (`aesgcm.js`) is well-built: fresh IV per call, correct ordering of `getAuthTag`/`setAuthTag` relative to `final()`, no DEK/plaintext logging, and a defensive constant guard. The behavioral musts the prior verifier checked (DEK excluded from `sanitizeStudent`, DEK reused not rotated on update, ciphertext-only on IPFS) do hold in the code as written.

However, this pass surfaces real defects in the surrounding plumbing: a `Student.dek` schema field with no `select: false` defense-in-depth (single point of failure if any future code path forgets to route through `sanitizeStudent`), a `createStudent` non-blocking failure path that leaves the student record in a state where `merkleRoot`/`salts` are committed but no DEK/ciphertext ever gets attached — meaning the credential is permanently unrecoverable for that student with zero retry path — and a more serious correctness bug in `insertBulkStudents`: the final re-fetch overwrites the in-memory `insertedStudents` objects with documents whose `dek`/`ciphertextCID` may or may not reflect the just-completed per-student anchoring loop, depending on timing, but more importantly the loop's `Student.updateOne` calls run sequentially and are not awaited as a single batch — actually correct on inspection but fragile (see WR-04). The `revokeStudent` and update flows correctly preserve DEK custody. There's also a latent risk: nothing currently prevents the same plaintext DEK from being trivially exfiltrated by anyone with read access to MongoDB (expected per D-01, the locked single-custody interim gap, so not flagged as a new finding) — but no field-level encryption-at-rest or restricted projection exists even for internal helper queries, which is a maintainability/security hardening gap worth flagging.

## Critical Issues

### CR-01: `createStudent` leaves a permanently un-recoverable credential on any anchoring failure, with no retry mechanism

**File:** `privdId_admin/backend/services/studentService.js:152-163`
**Issue:** When `issueCredentialOnChain` throws (Pinata down, RPC failure, gas issue, etc.), the catch block only logs — the student record is left with `dek: null`, `ciphertextCID: null`, `merkleRoot`/`salts` already committed and saved at creation time. There is no admin-facing indicator on the student record itself (no `anchorStatus` / `pending` flag) and no retry endpoint anywhere in the reviewed surface. The only signal is a server log line. Worse: `updateStudent`'s re-issuance path explicitly *requires* `student.dek` to exist (line 274 checks `if (!student.dek)`) and refuses to issue a DEK in that branch — so a student created during an outage can **never** get a credential pinned via the normal lifecycle; the only way to recover is to bypass `updateStudent` and call `createStudent`-equivalent logic again, which doesn't exist as a re-entry point.
**Fix:** At minimum, persist a status field (e.g. `anchorPending: true` / `lastAnchorError`) so operators can identify and manually retry affected students, and provide a re-issue-with-fresh-DEK code path for students whose `dek` is still null (this is the one case where rotation is safe per D-06, since no DEK has ever been issued/wrapped yet).
```js
} catch (err) {
  console.error('[credential] On-chain anchoring failed for', student.rollNo, ':', err.message);
  student.anchorPending = true;
  student.lastAnchorError = err.message;
  await student.save();
}
```

### CR-02: `updateStudent` silently no-ops the re-issuance (and never surfaces failure to the caller) when DEK is missing

**File:** `privdId_admin/backend/services/studentService.js:273-286`
**Issue:** If `student.dek` is null (the CR-01 scenario), `updateStudent` logs to the server console and returns `200 OK` with `sanitizeStudent(student)` exactly as if the update succeeded — the admin UI has no way to know the credential was never re-issued; `ciphertextCID` simply remains stale/null while every other field (name, programme, etc.) updates successfully. This is a silent partial-success that masks a serious state inconsistency: the on-chain Merkle root is updated (line 268, unconditional `student.save()`) but the IPFS ciphertext/CID is not, so a verifier checking on-chain root vs. pinned credential will see a mismatch with no diagnostic surfaced anywhere in the API response.
**Fix:** Include a `warning`/`anchorStatus` field in the returned payload so the frontend can surface this to the admin:
```js
let anchorWarning = null;
try {
  if (!student.dek) {
    anchorWarning = 'Credential metadata updated, but re-issuance skipped: no DEK on file.';
    console.error('[credential] updateStudent: missing DEK for', student.rollNo);
  } else {
    ...
  }
} catch (err) {
  anchorWarning = 'Re-anchoring failed: ' + err.message;
  console.error(...);
}
return { student: sanitizeStudent(student), anchorWarning };
```

## Warnings

### WR-01: `Student.dek` has no schema-level access control (`select: false`), relying entirely on every call site remembering to use `sanitizeStudent`

**File:** `privdId_admin/backend/models/Student.js:59-62`
**Issue:** The DEK field is a plain schema field with no `select: false`. Every `Student.find()` / `Student.findById()` call across the codebase pulls the plaintext DEK into memory by default, and the only thing preventing leakage via the API is that every controller path happens to funnel through `sanitizeStudent()`. This is a single point of failure — one new route, one debug `res.json(student)`, or one future contributor unaware of D-02 leaks the DEK in plaintext over HTTP. Defense-in-depth costs nothing here.
**Fix:**
```js
dek: {
  type: String,
  default: null,
  select: false, // never returned unless explicitly .select('+dek')'d — D-02 hard requirement
},
```
Note this requires call sites that legitimately need the DEK (`updateStudent`, future Phase 7 ECIES-wrap) to explicitly `.select('+dek')`.

### WR-02: `insertBulkStudents` makes the DEK/ciphertext anchoring failure mode the same as CR-01, multiplied across the whole batch

**File:** `privdId_admin/backend/services/studentService.js:189-201`
**Issue:** Same unrecoverable-on-failure pattern as CR-01 but in a loop — a transient Pinata/RPC blip partway through a 200-row bulk import silently leaves an unknown subset of students with no DEK/CID, and the per-row catch means the loop keeps going without backoff, potentially hammering Pinata/RPC repeatedly during an outage (e.g., 200 consecutive failed `axios.post` calls each carrying its own timeout). There is no batch-level summary returned (`insertBulkStudents` returns only `insertedStudents`, no counts of how many anchoring calls failed).
**Fix:** Track and return per-row anchor results so the caller can report "issued 180/200, 20 pending" instead of silently appearing fully successful.

### WR-03: `buildCredentialJson` is missing `programme` and `contactNo`/`dob` fields that exist on `Student` but doesn't validate `student.salts.length === 7` before pinning

**File:** `privdId_admin/backend/services/credentialService.js:61-77`
**Issue:** This is intentional per the 7-attribute spec (only frozen leaf attrs + salts go in), so the omission itself is correct. However, there's no guard that `student.salts` actually has length 7 and `student.merkleRoot` is non-null before building/encrypting/pinning. If `issueCredentialOnChain` is ever called on a student record that was saved with `salts: []` (e.g., a future code path that creates a Student without going through `buildStudentRecord`, or a `dobInt`/programmeLevel mismatch causing partial save), the function happily encrypts and pins a credential blob with `salts: []` / `merkleRoot: null`, which would silently produce a permanently-unverifiable credential CID with no error raised anywhere.
**Fix:**
```js
export function buildCredentialJson(student) {
  if (!Array.isArray(student.salts) || student.salts.length !== 7) {
    throw new Error(`buildCredentialJson: expected 7 salts, got ${student.salts?.length}`);
  }
  if (!student.merkleRoot) {
    throw new Error('buildCredentialJson: merkleRoot is missing');
  }
  return { ... };
}
```

### WR-04: `insertBulkStudents` re-fetches all inserted students from the DB after the anchoring loop instead of using the already-anchored in-memory documents, creating an unnecessary inconsistency window

**File:** `privdId_admin/backend/services/studentService.js:190-204`
**Issue:** The loop calls `Student.updateOne(...)` (bypassing the in-memory `student` document's local state), then a separate `Student.find({ _id: { $in: ... } })` re-fetches everything at the end. This is functionally correct (the `updateOne` writes are committed before the final find), but it means two full round-trips to MongoDB beyond what's needed, and any document that fails its `updateOne` (e.g., validation error not caught by the broad `try/catch` around `issueCredentialOnChain` only — note `Student.updateOne` is *inside* the try, so it is covered) silently reflects pre-anchoring state in the final response with no per-row error detail (compounds WR-02).
**Fix:** Build the response directly from the loop's per-iteration results rather than re-querying, and surface per-row success/failure explicitly.

### WR-05: `decryptCredential` and `encryptCredential` accept untyped/unvalidated `blob` and `dek` (decrypt side has no DEK length validation, unlike encrypt side)

**File:** `privdId_admin/backend/crypto/aesgcm.js:98-107`
**Issue:** `encryptCredential` validates `dek` is a 32-byte Buffer before proceeding (line 65-67), but `decryptCredential` performs no equivalent validation on `dek`, nor on `blob.iv`/`blob.authTag`/`blob.ciphertext` being present/well-formed strings. Calling `decryptCredential({}, dek)` will throw a fairly opaque `TypeError` (`Buffer.from(undefined, 'base64')` actually returns an empty buffer in Node, not a throw — so a malformed blob with missing fields will silently produce empty IV/authTag buffers, then fail later inside `createDecipheriv` or `setAuthTag` with a confusing low-level crypto error rather than a clear validation message).
**Fix:**
```js
export function decryptCredential(blob, dek) {
  if (!Buffer.isBuffer(dek) || dek.length !== KEY_LENGTH) {
    throw new Error(`decryptCredential: expected a ${KEY_LENGTH}-byte Buffer dek`);
  }
  if (!blob || typeof blob.iv !== 'string' || typeof blob.authTag !== 'string' || typeof blob.ciphertext !== 'string') {
    throw new Error('decryptCredential: blob must have iv, authTag, ciphertext base64 strings');
  }
  ...
}
```

### WR-06: `zkp-backend/server.js` `/credential-info` exposes the raw `ciphertextCID` and a public IPFS gateway URL to any caller with a valid `pubHash`, with no rate limiting or access control

**File:** `zkp-backend/server.js:207-235`
**Issue:** This is largely pre-existing behavior (the route existed before Phase 6, just renamed `ipfsCID`→`ciphertextCID`), but worth flagging in the context of this phase: `pubHash` is derived from circuit public signals and is not secret-equivalent in any documented threat model here, so this is a soft finding, not a regression. However, since the CID now points to *encrypted* ciphertext (post-Phase-6), exposing it to anyone is intentionally lower-risk than before — but the route still has no rate limiting, so an attacker could enumerate plausible `pubHash` values to map roll numbers to ciphertext CIDs at will. Out of scope to fix in this phase but should be tracked.
**Fix:** Consider rate-limiting `/credential-info` in a later phase; not a Phase 6 regression.

## Info

### IN-01: `aesgcm.js` JSDoc claims `decryptCredential` "Throws if the auth tag does not verify... does NOT swallow the error" — true, but no caller in the reviewed files actually calls `decryptCredential` yet

**File:** `privdId_admin/backend/crypto/aesgcm.js:88-107`
**Issue:** `decryptCredential` is exported but has zero call sites across the 6 reviewed files (Phase 7 will presumably add the first caller). This is expected for this phase's scope (decrypt happens client-side per CLAUDE.md ground rule 4), but worth noting it is currently dead code from the backend's perspective — verify Phase 7's plan actually wires this into the on-device flow and doesn't duplicate the logic in React Native.
**Fix:** No action needed now; flag for Phase 7 verification that this exact function (or an RN-compatible equivalent) is what gets used.

### IN-02: Magic string `'PrivdID — IIITDM Jabalpur'` and version `'2.0'` are hardcoded inline in `buildCredentialJson` rather than as named constants

**File:** `privdId_admin/backend/services/credentialService.js:73-75`
**Issue:** Minor maintainability nit — if the issuer string or version needs to change (e.g., on a future schema bump), it's buried inline rather than being a single named constant importable from a shared location (especially relevant since `version` likely needs to stay in sync with whatever Phase 7/8 client-side code expects).
**Fix:**
```js
const CREDENTIAL_ISSUER = 'PrivdID — IIITDM Jabalpur';
const CREDENTIAL_VERSION = '2.0';
```

### IN-03: `Student.password` is stored and compared in plaintext (`student.password !== String(password)`) — pre-existing, out of Phase 6 scope, but adjacent to the DEK custody discussion

**File:** `privdId_admin/backend/controllers/studentController.js:223`
**Issue:** Not a Phase 6 regression (this predates the phase), but worth a single mention since this review explicitly covers `Student` model changes: the model now carries two plaintext secrets (`password` and `dek`). Neither has `select: false`. Raising once here for visibility; not counted as a phase-introduced defect.
**Fix:** Out of scope for Phase 6 — tracked separately.

### IN-04: `credentialService.js` duplicate provider/wallet/registry construction across `anchorOnChain` and `revokeCredentialOnChain` (and now `issueCredentialOnChain` calling into `anchorOnChain`)

**File:** `privdId_admin/backend/services/credentialService.js:35-47`
**Issue:** `anchorOnChain` and `revokeCredentialOnChain` independently re-construct `JsonRpcProvider`/`Wallet`/`Contract` instances on every call rather than sharing a module-level singleton. Not a Phase 6 regression (pattern predates this phase and wasn't touched), but flagged since `issueCredentialOnChain` (which Phase 6 did modify) is the caller of `anchorOnChain` and inherits this cost on every issuance.
**Fix:** Out of scope to fix here; consider hoisting provider/wallet/contract construction to module scope in a later cleanup phase.

---

_Reviewed: 2026-06-19_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
