---
phase: 06-encryption-ciphertext-storage
plan: 02
subsystem: api
tags: [aes-256-gcm, ipfs, dek-lifecycle, credential-encryption, admin-backend]

# Dependency graph
requires: ["06-01"]
provides:
  - "credentialService.js: buildCredentialJson(student) — single source of truth for the §E3.2 credential JSON shape (frozen 7-attribute leaf order + salts/merkleRoot/issuedAt/issuer/type/version)"
  - "credentialService.js: issueCredentialOnChain(student, dek) — encrypts via encryptCredential before pinning; pins ONLY the {iv,authTag,ciphertext} blob"
  - "studentService.js: DEK generate/reuse policy across createStudent, insertBulkStudents (fresh DEK, D-06), updateStudent (reuse, never rotate, D-04/D-05)"
  - "studentService.js: ciphertextCID persisted at all 3 issuance call sites; dek persisted base64 on first issuance only"
  - "studentService.js: sanitizeStudent() excludes dek (D-02) and returns the renamed ciphertextCID (D-07)"
affects: [phase-07-keypair-enrollment]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "buildCredentialJson() as the sole chokepoint for the §E3.2 JSON shape — all 3 issuance call sites pass through issueCredentialOnChain, which calls it internally, closing the field-set-drift pitfall"
    - "DEK lifecycle: generateDEK() on create/bulk (fresh), Buffer.from(student.dek, 'base64') on update (reuse) — loud console.error on missing DEK instead of silent fallback regeneration"
    - "sanitizeStudent() remains the sole response-shaping allowlist chokepoint; secrets are excluded by omission, not by explicit strip"

key-files:
  created: []
  modified:
    - privdId_admin/backend/services/credentialService.js
    - privdId_admin/backend/services/studentService.js

key-decisions:
  - "issueCredentialOnChain(student, dek) takes the full student doc (not just rollNo/email/merkleRoot) and a caller-supplied dek Buffer — DEK lifecycle ownership stays in studentService.js, not credentialService.js, per the plan's explicit caller-owns-DEK design."
  - "pinToIPFS gained a second pinName param so Pinata metadata can read privid-ciphertext-${rollNo} (the encrypted blob no longer carries a top-level rollNo key to interpolate from)."
  - "updateStudent's missing-DEK case logs loudly and skips re-issuance entirely (inside the try, so the existing catch is bypassed but the non-blocking student.save() from the earlier merkleRoot recompute is unaffected) rather than silently calling generateDEK() as a fallback — closes Pitfall 3 from 06-RESEARCH.md."
  - "Commit-split technique: temporarily reverted the sanitizeStudent rename in the working tree before the Task 2 commit, then reapplied it for the Task 3 commit, to keep the 3 plan tasks as 3 atomic commits despite both modifying the same file."

requirements-completed: [STORE-01, STORE-02]

# Metrics
duration: 18min
completed: 2026-06-19
---

# Phase 6 Plan 2: Wire AES-256-GCM Encryption into the Issuance Flow Summary

**`issueCredentialOnChain` now builds the §E3.2 credential JSON via a shared `buildCredentialJson()` helper, encrypts it with the caller-supplied DEK, and pins only the ciphertext blob; `studentService.js` applies a fresh-on-create/reuse-on-update DEK policy across all 3 issuance call sites and `sanitizeStudent()` excludes `dek` while exposing the renamed `ciphertextCID`.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-06-19T05:00:00Z (approx, continuation of Phase 6 session)
- **Completed:** 2026-06-19T05:18:00Z
- **Tasks:** 3 completed
- **Files modified:** 2

## Accomplishments

- `credentialService.js` no longer constructs or pins any plaintext credential object — `issueCredentialOnChain(student, dek)` builds the frozen 7-attribute §E3.2 JSON via `buildCredentialJson()`, encrypts it with `encryptCredential()` (Plan 01's AES-256-GCM module), and pins only the resulting `{iv, authTag, ciphertext}` blob under Pinata metadata name `privid-ciphertext-${rollNo}` (STORE-01, STORE-02).
- `createStudent()` and `insertBulkStudents()` generate a fresh DEK per student via `generateDEK()` (D-06) and persist it base64-encoded to `student.dek`, alongside the renamed `ciphertextCID`.
- `updateStudent()` reuses the existing `student.dek` (decoded from base64) and never reassigns it — a missing DEK is handled with a loud `console.error` and skipped re-issuance, not a silent fresh-DEK fallback (D-04/D-05, closes Pitfall 3).
- `sanitizeStudent()`'s allowlist now returns `ciphertextCID` (renamed from `ipfsCID`, D-07/D-08 — completes the repo-wide rename alongside Plan 01's schema rename and Plan 03's zkp-backend/digital-app renames) and permanently excludes `dek` by omission, annotated with a comment warning future maintainers not to add it back (D-02).
- Zero `ipfsCID` references remain anywhere in `privdId_admin/backend` (confirmed via repo-wide grep across `services` and `models`); combined with Plan 03's renames, zero `ipfsCID` references remain in the entire repo (`privdId_admin/backend`, `zkp-backend`, `digital-app`).

## Task Commits

Each task was committed atomically:

1. **Task 1: Add buildCredentialJson() + encrypt-before-pin in credentialService.js** - `ef6e0f2` (feat)
2. **Task 2: Apply DEK generate/reuse policy across 3 call sites** - `5e3476a` (feat)
3. **Task 3: Exclude dek from sanitizeStudent and rename ipfsCID to ciphertextCID** - `977e81c` (fix)

## Files Created/Modified

- `privdId_admin/backend/services/credentialService.js` — Added `import { encryptCredential } from '../crypto/aesgcm.js'`; added exported `buildCredentialJson(student)` returning the frozen-order §E3.2 object; `issueCredentialOnChain(student, dek)` signature change (was `(student)`) — builds JSON, encrypts, pins only the blob; `pinToIPFS(credential, pinName)` gained the `pinName` param for Pinata metadata naming (`privid-ciphertext-${pinName}`); deleted the old inline plaintext credential object construction.
- `privdId_admin/backend/services/studentService.js` — Added `import { generateDEK } from '../crypto/aesgcm.js'`; `createStudent` and `insertBulkStudents` generate a fresh DEK per student and persist `dek` + `ciphertextCID`; `updateStudent` reuses `student.dek`, persists only `ciphertextCID`, fails loudly on missing DEK; `sanitizeStudent` allowlist renamed `ipfsCID` → `ciphertextCID` and gained a comment documenting the intentional `dek` exclusion.

## Decisions Made

See `key-decisions` in frontmatter. Notably: `issueCredentialOnChain` takes the full student document (not a trimmed `{rollNo, email, merkleRoot}` object) since `buildCredentialJson` needs `name`, `dobInt`, `programmeLevel`, `discipline`, `batch`, and `salts` too — all already present on the Mongoose doc at every call site (verified by reading `buildStudentRecord`/`Student.create`/`insertMany` — no new source fields were needed).

## Deviations from Plan

None — plan executed exactly as written. One process-level deviation (not a code deviation): to keep the plan's 3 tasks as 3 atomic git commits despite both Task 2 and Task 3 touching `studentService.js`, the sanitizeStudent rename was temporarily reverted in the working tree before the Task 2 commit and reapplied immediately after for the Task 3 commit. No functional code was affected; `node --check` passed at every intermediate state.

## Issues Encountered

- The Task 3 automated `<verify>` command initially failed because the inline comment I added to document the `dek` exclusion (`// NOTE: \`dek\` is intentionally excluded...`) itself contained the literal substring `dek` twice, tripping the `awk '/export function sanitizeStudent/,/^}/' | grep -c "dek"` check (which greps the literal function body for the word, comments included, to confirm no `dek` key was added back). Resolved by rewording the comment to describe "the per-student plaintext encryption key" instead of using the literal field name — the comment's intent (warn future maintainers) is preserved without tripping the grep that enforces D-02.

## Threat Flags

None — all threat-model mitigations (T-06-05 through T-06-09, T-06-SC) were implemented exactly as specified in the plan's `<threat_model>`; no new security-relevant surface was introduced beyond what the plan already anticipated.

## Next Phase Readiness

- Phase 6 is now fully complete: Plan 01 (crypto module + schema), Plan 02 (this plan — issuance wiring), and Plan 03 (zkp-backend/digital-app renames) are all done.
- Phase 7 (keypair + enrollment) can now build on: `Student.dek` (plaintext base64, single-custody interim gap, accepted) and `Student.ciphertextCID` (pointing at the encrypted blob on IPFS) — Phase 7's job is to ECIES-wrap the DEK to the student's on-device keypair and wipe the plaintext copy (D-03).
- No blockers.

---
*Phase: 06-encryption-ciphertext-storage*
*Completed: 2026-06-19*

## Self-Check: PASSED

- FOUND: privdId_admin/backend/services/credentialService.js
- FOUND: privdId_admin/backend/services/studentService.js
- FOUND: .planning/phases/06-encryption-ciphertext-storage/06-02-SUMMARY.md
- FOUND commit: ef6e0f2 (Task 1)
- FOUND commit: 5e3476a (Task 2)
- FOUND commit: 977e81c (Task 3)
