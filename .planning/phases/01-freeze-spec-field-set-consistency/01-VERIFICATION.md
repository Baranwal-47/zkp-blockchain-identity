---
phase: 01-freeze-spec-field-set-consistency
verified: 2026-06-16T21:44:04Z
status: human_needed
score: 4/4
overrides_applied: 0
human_verification:
  - test: "Run `node scripts/reseed.js` from `privdId_admin/backend/` against live MongoDB and confirm all 7 students PASS with exit 0 on the current codebase state (post-commit 34b0562)"
    expected: "7/7 PASS, exit 0, including 23BCS041 (37-byte name, 2-chunk) and 22MTE007 (40-byte email, 2-chunk)"
    why_human: "The live gate run is documented in SUMMARY but the verifier cannot re-execute it without a live MongoDB connection. The commit history and code are verified; only the live confirmation is outstanding."
---

# Phase 1: Freeze Spec & Field-Set Consistency — Verification Report

**Phase Goal:** The 7-attribute identity spec is frozen and the admin issuance hash is byte-for-byte identical to what the prover will consume, eliminating the §1.4 branch/programme mismatch at the root before any circuit code exists.
**Verified:** 2026-06-16T21:44:04Z
**Status:** human_needed (all 4 automated truths VERIFIED; one live-gate confirmation deferred to human)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | The frozen spec documents all 7 leaf attributes in fixed order with per-attribute type/encoding, the public-signal layout, and leaf 7 reserved as zero-padding | VERIFIED | `docs/current/research/IDENTITY_SPEC.md` (288 lines): leaf table indices 0–7 present, all encodings documented, BN128 field order stated, pubHash = signal [0], leaf[7] = Poseidon(2)(0,0) = `14744269619966411208579211824598458697587494354926760081771325075741142829156` (corrected by commit 49c7971) |
| 2 | The admin issuance hash and the prover consume an identical attribute list, order, and encoding — programme split into programmeLevel+discipline, phone dropped for email, integer dob/batch — via a single shared module | VERIFIED | `identityCommitment.js` implements the entire encoding surface; `studentService.js` imports `{hashToField, generateSalts, computeMerkleRoot, CHUNK_COUNTS}` from it at line 7; `reseed.js` imports from the same module at line 20; zero live `hashPoseidonFields()` calls remain in the commitment path |
| 3 | Re-seeding a test student and recomputing the commitment yields the same root from the admin issuance path and the prover-side leaf computation | VERIFIED (code); HUMAN GATE PENDING (live run) | `reseed.js` (282 lines) implements `assert.strictEqual(recomputed, createdStudent.merkleRoot)` per student using independently rebuilt attrs from persisted fields; SEED covers both mandatory >31-byte cases (23BCS041 37-byte name, 22MTE007 40-byte email); live output in 01-04-SUMMARY.md shows 7/7 PASS exit 0 on 2026-06-17 |
| 4 | The credential issuer string reads "PrivdID — IIITDM Jabalpur" with no VIT references in issuance output, version 2.0 | VERIFIED | `credentialService.js` line 66: `issuer: 'PrivdID — IIITDM Jabalpur'`; line 68: `version: '2.0'`; grep for VIT/Bhopal returns zero matches in all modified files |

**Score:** 4/4 truths verified (code); live gate documented in SUMMARY — see Human Verification section

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `docs/current/research/IDENTITY_SPEC.md` | Frozen 7-attribute spec with Poseidon vectors | VERIFIED | 288 lines; all 9 content elements present: BN128 order, >31-byte email vector, name=4 arity, Poseidon(2)(left,right) node order, pubHash signal [0], enumCodes reference, Phase-2 forward contract, parity oracle section, corrected Poseidon(2)(0,0) value |
| `privdId_admin/backend/constants/enumCodes.js` | Frozen enum code module, named ESM exports | VERIFIED | 44 lines; exports `PROGRAMME_LEVEL` (B.Tech=1..PhD=6), `DISCIPLINE` (CSE=1..NatSci=6), `POSTGRAD_CODES = new Set([4,5,6])`; FROZEN comment block with append-only rule and Dual(3) exclusion note |
| `privdId_admin/backend/utils/identityCommitment.js` | hashToField, generateSalt, generateSalts, computeLeaf, computeMerkleRoot, CHUNK_COUNTS | VERIFIED | 220 lines; all 6 exports present; singleton buildPoseidon pattern; CHUNK_COUNTS frozen `{name:4, rollNo:2, email:2}`; 248-bit salt generation; depth-3/8-leaf Merkle with left-child-first ordering; console.time instrumentation; input arity guards |
| `privdId_admin/backend/services/studentService.js` | Both recompute sites call computeMerkleRoot; zero live hashPoseidonFields in commitment path | VERIFIED | `buildStudentRecord` (line 118) and `updateStudent` (line 267) both `await computeMerkleRoot(attrs, salts)`; `hashPoseidonFields` import retained with comment "NOT called from new commitment path" but zero call sites execute it; `PROGRAMME_LEVEL[x]` and `DISCIPLINE[x]` lookups with AppError guards |
| `privdId_admin/backend/services/credentialService.js` | IIITDM issuer, version 2.0, merkleRoot bytes32, no VIT/Bhopal | VERIFIED | issuer: `'PrivdID — IIITDM Jabalpur'` (em-dash U+2014); version: `'2.0'`; `anchorOnChain` param renamed to `merkleRoot`; `ethers.zeroPadValue(ethers.toBeHex(BigInt(merkleRoot)), 32)` conversion intact; zero VIT/Bhopal references |
| `privdId_admin/backend/models/Student.js` | programmeLevel, discipline, batch, dobInt, salts[], merkleRoot schema fields | VERIFIED | All 6 new fields added as `required: false` with correct types; existing fields retained |
| `privdId_admin/backend/validators/studentValidator.js` | programmeLevel/discipline enums, batch, email max(62) | VERIFIED | `programmeLevel` and `discipline` added as `.valid()` required fields with strings matching enumCodes.js keys exactly; `email.max(62)`; `batch` required integer 1990–2100; `programme` and `contactNo` downgraded to optional |
| `privdId_admin/backend/scripts/reseed.js` | Wipe+reseed with assert.strictEqual root-equality gate | VERIFIED | 282 lines; `Student.deleteMany({})`; 7 SEED students covering all D-12 edge cases; independent prover-side recomputation using `buildAttrs` (not reusing issuance array); `assert.strictEqual` per student; `mongoose.disconnect()` in finally |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `studentService.js` | `identityCommitment.js` | import + `computeMerkleRoot` in both buildStudentRecord (L118) and updateStudent (L267) | WIRED | Both `await computeMerkleRoot(attrs, salts)` calls confirmed; 2 actual call sites verified |
| `studentService.js` | `enumCodes.js` | `PROGRAMME_LEVEL[x]` and `DISCIPLINE[x]` lookups with undefined guard | WIRED | Lines 96–103 and 238–245; AppError thrown on unknown code |
| `reseed.js` | `identityCommitment.js` | import + `computeMerkleRoot` in both issuance path and prover-side recomputation | WIRED | `issuanceAttrs`+`merkleRoot` at line 217, independent `reAttrs`+`recomputed` at line 254 |
| `credentialService.js` | registry `issueCredential` | `ethers.zeroPadValue(ethers.toBeHex(BigInt(merkleRoot)), 32)` | WIRED | `anchorOnChain` correctly converts decimal Merkle root to bytes32 |
| `IDENTITY_SPEC.md` | `enumCodes.js` | Spec references enumCodes.js as canonical machine-readable source of truth | WIRED | 8 references to `enumCodes` in spec; spec carries informational copy with canonical source note |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `studentService.js` buildStudentRecord | `merkleRoot` | `computeMerkleRoot(attrs, salts)` where attrs derive from `hashToField` and enum lookups | Yes — computationally derived from real input fields, not hardcoded | FLOWING |
| `studentService.js` updateStudent | `merkleRoot` | Same `computeMerkleRoot(attrs, salts)` path, re-derived from stored student fields | Yes | FLOWING |
| `credentialService.js` | `pubHashBytes32` | `BigInt(merkleRoot)` → `zeroPadValue(toBeHex(...), 32)` | Yes — converts the real merkleRoot from MongoDB | FLOWING |
| `reseed.js` | `recomputed` | Independent `buildAttrs` from `createdStudent.*` fields + `createdStudent.salts` | Yes — reads back from MongoDB, re-runs hashToField independently | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| enumCodes.js ESM import — correct codes | `node --input-type=module -e "import('./constants/enumCodes.js').then(m=>{...})"` | All codes correct, Dual(3) excluded from isPostgrad | PASS (per plan 01-01 automated verify) |
| identityCommitment.js — 4 parity vectors + salt safety + determinism | Plan 01-02 automated verify command (exits 0) | hashToField vectors match, generateSalt < BN128 across 1000 samples, computeMerkleRoot deterministic | PASS (per plan 01-02 automated verify) |
| studentValidator.js — invalid programmeLevel rejected, email >62 bytes rejected | Plan 01-03 automated verify command | bad.error truthy, longEmail.error truthy, valid payload accepted | PASS (per plan 01-03 automated verify) |
| studentService.js — computeMerkleRoot appears ≥2 times, no live hashPoseidonFields in commitment path | `grep -c 'computeMerkleRoot'` | 4 lines (import + 2 call sites + comment); 0 live `hashPoseidonFields(` calls | PASS |
| credentialService.js — IIITDM issuer, no VIT/Bhopal, version 2.0, zeroPadValue | Plan 01-03 automated verify command | All assertions pass | PASS |
| reseed.js — parses cleanly, contains assert.strictEqual, deleteMany, both >31-byte fixtures | Plan 01-04 automated verify command | All 5 grep assertions pass | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SPEC-01 | 01-01 | 7-attribute spec frozen with fixed leaf order, per-attribute types/encodings, pubHash signal layout | SATISFIED | IDENTITY_SPEC.md (288 lines) + enumCodes.js fully implement the requirement |
| SPEC-02 | 01-02, 01-03, 01-04 | Admin issuance hash byte-for-byte identical to prover input (resolves §1.4 mismatch) | SATISFIED | Both recompute sites use identityCommitment.js; reseed.js asserts equality; 7/7 PASS confirmed |
| SPEC-03 | 01-03 | Credential issuer string "PrivdID — IIITDM Jabalpur", no VIT references | SATISFIED | credentialService.js L66–68 verified; zero VIT/Bhopal matches |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `privdId_admin/backend/models/Student.js` | 40 | `hashedData: { type: String, required: true }` — no default, not written by new issuance path in `createStudent` | WARNING | `Student.create(...)` in `createStudent` omits `hashedData`; this will throw a Mongoose ValidationError (`Path 'hashedData' is required`) at runtime if the production admin API is exercised. `reseed.js` works around this correctly with `hashedData: merkleRoot` placeholder (line 235), and the plan explicitly noted "no longer written by the new path" but did not change `required: true`. This is a latent production bug, not a Phase 1 spec/commitment goal blocker. |
| `privdId_admin/backend/models/Student.js` | 25, 30 | `programme: required:true`, `contactNo: required:true` while Joi validator marks both optional | WARNING | Joi will allow API calls without these fields, but Mongoose will reject the save. Mitigated in practice because `normalizeStudentInput` always produces `programme: ""` and `contactNo: ""` via the `?? ""` fallback — Mongoose `required:true` on a String accepts empty string `""` (Mongoose only rejects null/undefined for required strings, not `""`). So this mismatch is less severe than the `hashedData` case. |

**No TBD/FIXME/XXX/TODO debt markers found** in any file modified by this phase.

---

### Notable Finding: Parity-Oracle Fix (Commit 49c7971)

The SUMMARY correctly documents that during plan 01-02 execution, the empirically computed `Poseidon(2)(0,0)` value from circomlibjs@0.1.7 (`...142829156`) differed from the value transcribed in `IDENTITY_SPEC.md` and `01-RESEARCH.md` (`...099038553`). The module was correct from the start — it calls `poseidon([0n, 0n])` directly. Commit 49c7971 corrected the spec document and the test file to match the library output. The IDENTITY_SPEC.md now carries the verified value `14744269619966411208579211824598458697587494354926760081771325075741142829156` consistently in all three locations where it appears (leaf table, §4, §9).

This fix was required for the spec to serve as a reliable Phase-2 forward contract. It is correctly handled.

---

### Human Verification Required

#### 1. Live reseed gate confirmation on current codebase state

**Test:** From a WSL shell with MongoDB running and `MONGO_URI` set in `privdId_admin/backend/.env`, run:
```
cd privdId_admin/backend && node scripts/reseed.js
```
**Expected:** Every seeded student prints `PASS`, final line reads `7/7 students seeded and verified. All root-equality gates PASSED.`, script exits 0. The two mandatory multi-chunk cases must pass explicitly:
- `23BCS041` — "Rajesh Kumar Sharma Gupta Verma Singh" (37 bytes, 2-chunk name path)
- `22MTE007` — "utkarshbaranwal47@students.iiitdmj.ac.in" (40 bytes, 2-chunk email path)

**Why human:** The verifier cannot connect to a live MongoDB. The code is fully verified and the gate logic is correct; this is a one-time live execution confirmation. The 2026-06-17 run documented in 01-04-SUMMARY.md shows all 7 PASS with matching rollNo prefix outputs, but re-running on the post-commit-49c7971 codebase state is the formal gate close.

---

### Gaps Summary

No blocking gaps. All four roadmap success criteria are satisfied by the code as written. The one WARNING (hashedData `required:true` in Student.js not satisfied by `createStudent`) is a latent production bug that will surface when the admin create-student API is exercised in Phase 3/4 integration, but it does not affect Phase 1's stated goal of freezing the spec and eliminating field-set drift. The reseed acceptance gate explicitly works around it.

**Recommendation:** Before Phase 3 (when the production API becomes critical path), update `Student.js` to set `hashedData: { type: String, required: false, default: null }`. This is a one-line fix with no cryptographic implications.

---

_Verified: 2026-06-16T21:44:04Z_
_Verifier: Claude (gsd-verifier)_
