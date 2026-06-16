---
phase: 01-freeze-spec-field-set-consistency
plan: "03"
subsystem: admin-issuance
tags: [commitment, schema, validator, branding, merkle, SPEC-02, SPEC-03]
dependency_graph:
  requires: ["01-01", "01-02"]
  provides: ["admin-issuance-7attr", "student-schema-v2", "validator-v2", "credential-v2"]
  affects: ["01-04"]
tech_stack:
  added: []
  patterns:
    - "7-attribute salted Merkle commitment in issuance path"
    - "Enum code lookup with AppError guard on unknown values"
    - "dobInt integer parsing from YYYY-MM-DD display string"
    - "Shared commitment module import (identityCommitment.js) at both recompute sites"
key_files:
  created: []
  modified:
    - privdId_admin/backend/models/Student.js
    - privdId_admin/backend/validators/studentValidator.js
    - privdId_admin/backend/services/studentService.js
    - privdId_admin/backend/services/credentialService.js
decisions:
  - "D-03: dobInt stored as YYYYMMDD integer alongside dob display string"
  - "D-04: email ≤62-byte cap enforced at Joi layer (max(62)); enforces maxChunks=2 contract"
  - "D-05: programme and contactNo retained as optional display/operational fields"
  - "D-08: salts[] array stored on Student document (MongoDB interim store)"
  - "D-10: 7 salts generated via generateSalts(7) from identityCommitment.js"
  - "D-11: issuer string 'PrivdID — IIITDM Jabalpur' (em-dash U+2014); version 2.0"
metrics:
  duration_seconds: 252
  completed_date: "2026-06-17"
  tasks_completed: 3
  files_modified: 4
---

# Phase 01 Plan 03: Admin Issuance Refactor — 7-Attribute Merkle Commitment Summary

**One-liner:** Admin issuance path migrated from flat Poseidon(5) hash to 7-attribute salted Merkle root computed by the shared `identityCommitment.js` module, with IIITDM branding and version 2.0.

---

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend Student schema and Joi validator | 64aebf6 | models/Student.js, validators/studentValidator.js |
| 2 | Refactor both hash-recompute sites to shared commitment module | d05c358 | services/studentService.js |
| 3 | Branding cleanup and merkleRoot anchoring in credentialService | 4ffd4a6 | services/credentialService.js |

---

## What Was Built

### Task 1 — Student schema + validator

`Student.js` gained six new fields (all `required: false` for backward compat):
- `programmeLevel` (String) — committed as leaf 3 enum code
- `discipline` (String) — committed as leaf 4 enum code
- `batch` (Number) — committed as leaf 5 year integer
- `dobInt` (Number) — committed as leaf 2 YYYYMMDD integer
- `salts` ([String]) — 7 decimal string salts in leaf-index order
- `merkleRoot` (String) — decimal Merkle root = pubHash

Existing fields retained: `programme` (optional legacy display), `contactNo` (optional operational), `dob` (String display), `hashedData` (present but no longer written by new path).

`studentValidator.js` changes:
- `email` capped at `max(62)` — enforces the `maxChunks=2` contract at input (T-01-11)
- `programmeLevel` added as required with `.valid()` matching enumCodes.js keys exactly
- `discipline` added as required with `.valid()` matching enumCodes.js keys exactly
- `batch` added as required integer (1990–2100)
- `programme` downgraded to optional
- `contactNo` downgraded to optional

### Task 2 — studentService.js dual-site refactor

**Imports added:** `hashToField`, `generateSalts`, `computeMerkleRoot`, `CHUNK_COUNTS` from `identityCommitment.js`; `PROGRAMME_LEVEL`, `DISCIPLINE` from `enumCodes.js`.

**`normalizeStudentInput`:** Extended to parse `dobInt` from `dob` display string and pass through `programmeLevel`, `discipline`, `batch`. The `programme` and `contactNo` fields are retained as non-committed display/operational fields.

**`buildStudentRecord`:** Old `hashPoseidonFields([name, rollNo, dob, phone, programme])` replaced with:
- Input guards for all 4 commitment attributes
- Enum code lookup with `AppError` on undefined code (T-01-09)
- 7-element `attrs` array in frozen leaf order per IDENTITY_SPEC §1
- `computeMerkleRoot(attrs, salts)` call
- Returns `{ ...normalizedStudent, merkleRoot, salts, password }` (no `hashedData`)

**`createStudent`:** Persists `programmeLevel`, `discipline`, `batch`, `dobInt`, `salts`, `merkleRoot`; passes `{rollNo, email, merkleRoot}` to `issueCredentialOnChain`.

**`insertBulkStudents`:** Updated `issueCredentialOnChain` call to pass `merkleRoot`.

**`updateStudent`:** Second recompute site migrated (T-01-08). `allowedFields` extended to include `programmeLevel`, `discipline`, `batch`. Re-parses `dobInt` from stored `dob` string. Same `attrs`/`salts`/`computeMerkleRoot` sequence as `buildStudentRecord`. Sets `student.salts` and `student.merkleRoot`. Passes `{rollNo, email, merkleRoot}` to `issueCredentialOnChain`.

Zero live `hashPoseidonFields()` calls remain in the commitment path.

### Task 3 — credentialService.js branding + merkleRoot anchoring

- `issueCredentialOnChain`: credential object drops `programme` and `hashedData`; adds `merkleRoot`; issuer changed to `'PrivdID — IIITDM Jabalpur'` (em-dash U+2014); version `'1.0'` → `'2.0'`
- `anchorOnChain`: parameter `hashedData` renamed to `merkleRoot`; `ethers.zeroPadValue(ethers.toBeHex(BigInt(merkleRoot)), 32)` conversion unchanged
- Zero VIT or Bhopal references remain in the file

---

## Deviations from Plan

### Auto-fixed Issues

None.

### Minor adjustments

**`updateStudent` — batch field type coercion:** The `allowedFields.forEach` loop applied `String(payload[field]).trim()` to all fields including `batch`. Since `batch` is a Number on the schema, an extra coerce step was added after the loop: `if (payload.batch !== undefined) student.batch = Number(payload.batch) || null`. This prevents a string "2022" being stored where a number is expected. This is a correctness fix aligned with Rule 2.

---

## Threat Mitigations Implemented

| Threat | Status |
|--------|--------|
| T-01-08: updateStudent left on old flat-Poseidon(5) path | Mitigated — both recompute sites call `computeMerkleRoot`; 4 references in file, 0 live `hashPoseidonFields()` calls |
| T-01-09: wrong enum code committed (lookup miss) | Mitigated — `PROGRAMME_LEVEL[x]` and `DISCIPLINE[x]` checked for `undefined`; throws `AppError 400` on miss |
| T-01-10: stale VIT issuer string | Mitigated — issuer is exactly `'PrivdID — IIITDM Jabalpur'`; grep confirms 0 VIT/Bhopal references |
| T-01-11: email >62 bytes silently truncated | Mitigated — Joi `email.max(62)` rejects oversized emails at input before they reach the service |

---

## Known Stubs

None. All data paths are wired. `hashedData` field remains on the schema for legacy display but is no longer written by the new issuance path — this is intentional and documented (plan 04 wipe-and-reseed will remove old records).

---

## Threat Flags

None. No new network endpoints or auth paths introduced.

---

## Self-Check: PASSED

Files exist:
- `privdId_admin/backend/models/Student.js` — FOUND (contains merkleRoot, dobInt)
- `privdId_admin/backend/validators/studentValidator.js` — FOUND (contains programmeLevel enum)
- `privdId_admin/backend/services/studentService.js` — FOUND (computeMerkleRoot x4, 0 live hashPoseidonFields calls)
- `privdId_admin/backend/services/credentialService.js` — FOUND (IIITDM Jabalpur issuer, version 2.0)

Commits exist:
- 64aebf6 — Task 1 (schema + validator)
- d05c358 — Task 2 (studentService dual-site refactor)
- 4ffd4a6 — Task 3 (credentialService branding)
