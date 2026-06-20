---
phase: 07-student-keypair-two-phase-enrollment
plan: 01

subsystem: api
tags: [eciesjs, secp256k1, mongoose, encryption, dek-wrapping]

# Dependency graph
requires:
  - phase: 06-encryption-ciphertext-storage
    provides: "crypto/aesgcm.js conventions (timed() instrumentation, length-guard-before-timed pattern), Student.dek (select:false) + ciphertextCID fields, DEK custody lifecycle in studentService.js"
provides:
  - "crypto/ecies.js — wrapDEK(pubKeyHex, dek) / unwrapDEK(privKeyHex, envelopeBase64), verified round-trip over a real eciesjs keypair"
  - "Student.pubKey, Student.dekEnvelopeCID, Student.enrollmentPhase schema fields (enum awaiting-keypair|active|revoked, default awaiting-keypair)"
  - "sanitizeStudent() now surfaces enrollmentPhase/pubKey/dekEnvelopeCID while still excluding dek"
affects: [07-02-claim-endpoint, 07-03-mobile-keypair, 07-04-claim-screen]

# Tech tracking
tech-stack:
  added: ["eciesjs@^0.5.0 (privdId_admin/backend)"]
  patterns:
    - "Crypto module convention: sync input validation BEFORE timed() wrapper, base64 string boundaries, never log key material — established in aesgcm.js, now also in ecies.js"
    - "eciesjs encrypt()/decrypt() return Uint8Array, not Node Buffer — always wrap with Buffer.from() before calling .toString('base64') or returning to a caller expecting Buffer semantics"

key-files:
  created:
    - privdId_admin/backend/crypto/ecies.js
  modified:
    - privdId_admin/backend/models/Student.js
    - privdId_admin/backend/services/studentService.js
    - privdId_admin/backend/package.json
    - privdId_admin/backend/package-lock.json

key-decisions:
  - "Installed eciesjs@^0.5.0 exactly as planned (pure-JS @noble/curves line) after re-verifying npm dist-tags (latest=0.5.0, v0.3-latest=0.3.21) immediately before install"
  - "unwrapDEK has no server-side caller this phase but is included per the plan's symmetric-module-shape requirement, for Phase 8's client-side equivalent to reference"

patterns-established:
  - "Always Buffer.from() eciesjs's encrypt()/decrypt() output before .toString('base64') or returning — a Uint8Array's bare .toString('base64') is NOT base64, it silently produces a comma-separated decimal string"

requirements-completed: [ENROLL-01]

# Metrics
duration: 5min
completed: 2026-06-19
---

# Phase 07 Plan 01: ECIES Crypto Foundation + Two-Phase Enrollment Schema Summary

**New `crypto/ecies.js` module (wrapDEK/unwrapDEK, eciesjs@0.5.0) plus `pubKey`/`dekEnvelopeCID`/`enrollmentPhase` Student schema fields, closing ENROLL-01 (new students default to `awaiting-keypair`).**

## Performance

- **Duration:** 5 min
- **Started:** 2026-06-19T09:00:34Z
- **Completed:** 2026-06-19T09:05:08Z
- **Tasks:** 2 completed
- **Files modified:** 5 (1 created, 4 modified)

## Accomplishments
- `crypto/ecies.js` created, mirroring `aesgcm.js` conventions exactly: doc-comment header citing blueprint §E3.6, THREAT MITIGATIONS block (T-07-01/02/03), sync guards before `timed()`, base64 boundaries, zero key-material logging
- `wrapDEK`/`unwrapDEK` verified to round-trip a 32-byte DEK byte-for-byte over a real `eciesjs` keypair (stress-tested 30x with random DEK content, 0 failures)
- `Student` schema gains `pubKey` (public), `dekEnvelopeCID` (mirrors `ciphertextCID`), and `enrollmentPhase` (enum, default `"awaiting-keypair"`) — every newly created student now lands in `awaiting-keypair` automatically, satisfying ENROLL-01
- `sanitizeStudent()` allowlist extended with all three new fields; the existing "never add dek back" comment and `dek`'s `select: false` are untouched

## Task Commits

Each task was committed atomically:

1. **Task 1: Create crypto/ecies.js DEK wrap/unwrap module** - `9a0b62b` (feat)
2. **Task 2: Add pubKey/dekEnvelopeCID/enrollmentPhase schema fields and extend sanitizeStudent** - `bdfc40e` (feat)

**Plan metadata:** _pending — see final commit below_

## Files Created/Modified
- `privdId_admin/backend/crypto/ecies.js` - New ECIES DEK wrap/unwrap module (wrapDEK/unwrapDEK), mirrors aesgcm.js conventions
- `privdId_admin/backend/models/Student.js` - Added pubKey/dekEnvelopeCID/enrollmentPhase fields
- `privdId_admin/backend/services/studentService.js` - sanitizeStudent() now returns the three new fields
- `privdId_admin/backend/package.json` / `package-lock.json` - added `eciesjs@^0.5.0`

## Decisions Made
- Re-verified `eciesjs`'s npm dist-tags (`latest` → 0.5.0, `v0.3-latest` → 0.3.21) immediately before running `npm install`, confirming the research's Package Legitimacy Audit finding still held at execution time — installed `^0.5.0` as specified, never the native-binding 0.3.x line.
- `unwrapDEK` was implemented as specified even though it has no caller this phase (server never holds a student's private key) — it exists for module-shape completeness and as a documented reference for Phase 8's on-device client equivalent.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] eciesjs returns Uint8Array, not Buffer — base64 encoding silently corrupted without explicit wrapping**
- **Found during:** Task 1 verification (the plan's own `node` smoke-test command)
- **Issue:** `eciesjs@0.5.0`'s `encrypt()` and `decrypt()` functions return a plain `Uint8Array`, not a Node `Buffer`. The plan's reference code (`07-RESEARCH.md` Pattern 1, `07-PATTERNS.md` lines 60-90) calls `envelope.toString("base64")` directly on the `encrypt()` return value. On a bare `Uint8Array`, `.toString("base64")` does NOT produce base64 — it falls through to `Array.prototype.toString`-like behavior, producing a comma-separated decimal string (e.g. `"4,121,188,192,..."`). Re-parsing that "envelope" with `Buffer.from(str, "base64")` on the unwrap side produced a different byte length than the original envelope, causing `eciesjs`'s internal `@noble/curves` point-parsing to throw `bad point: got length 65, expected compressed=33 or uncompressed=65` — a 100% reproducible round-trip failure, confirmed by isolating direct `encrypt`/`decrypt` calls (0/50 failures) versus the wrapper as originally written (30/30 failures).
- **Fix:** Wrapped both `encrypt()`'s and `decrypt()`'s return values with `Buffer.from(...)` before any `.toString("base64")` call or before returning to the caller, with an inline comment explaining the gotcha for future readers.
- **Files modified:** `privdId_admin/backend/crypto/ecies.js`
- **Verification:** Re-ran the plan's exact verify command (round-trip + short-DEK guard) — passes (`OK`). Additionally stress-tested 30 iterations with random DEK content and fresh keypairs each time — 0 failures.
- **Committed in:** `9a0b62b` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug)
**Impact on plan:** Necessary for correctness — without this fix, every `wrapDEK`/`unwrapDEK` round-trip would fail deterministically, blocking ENROLL-02's claim flow in plan 07-02 before it could even be attempted. No scope creep; the fix is contained entirely within `ecies.js`'s two exported functions.

## Issues Encountered
- The plan's own verbatim reference code (`07-RESEARCH.md` and `07-PATTERNS.md`) carried the same Uint8Array/Buffer gap — this is a documentation-vs-library-version mismatch (the reference code was written/verified against `eciesjs`'s API shape conceptually, but the actual 0.5.0 return type wasn't checked at the Buffer-vs-Uint8Array level during research). Resolved via Rule 1 auto-fix; no plan changes needed since the fix is internal to the new module and doesn't change its public contract.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `wrapDEK` is ready for plan 07-02's `claimCredential()` orchestration to call directly.
- `enrollmentPhase` default of `"awaiting-keypair"` is live for all newly created students — `createStudent()`/`insertBulkStudents()` were not modified (per plan instruction) since the schema default already satisfies ENROLL-01 without any code change in the creation path.
- No blockers. Plan 07-02 (claim endpoint: controller + route + studentService.claimCredential) can proceed immediately using `wrapDEK` as its primitive.

---
*Phase: 07-student-keypair-two-phase-enrollment*
*Completed: 2026-06-19*

## Self-Check: PASSED
