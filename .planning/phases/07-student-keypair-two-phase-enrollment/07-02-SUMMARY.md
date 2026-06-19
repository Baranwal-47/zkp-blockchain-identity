---
phase: 07-student-keypair-two-phase-enrollment
plan: 02

subsystem: api
tags: [eciesjs, mongodb, atomic-update, ipfs, pinata, dek-claim]

# Dependency graph
requires:
  - phase: 07-student-keypair-two-phase-enrollment (plan 01)
    provides: "crypto/ecies.js wrapDEK(pubKeyHex, dek)/unwrapDEK; Student.pubKey/dekEnvelopeCID/enrollmentPhase schema fields; sanitizeStudent() surfacing them"
provides:
  - "credentialService.js::pinEnvelopeToIPFS(envelopeBase64, pinName) — exported envelope-pinning helper reusing the existing private pinToIPFS"
  - "studentService.js::claimCredential(id, pubKeyHex) — full claim orchestration: guard, wrapDEK, pin, atomic wipe+flip"
  - "studentController.js::claimPubkey — validated controller (66-hex-char compressed secp256k1 pubkey check)"
  - "POST /api/students/:id/pubkey route, live and verified end-to-end against real Mongo + Pinata"
affects: [07-04-claim-credential-screen]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TOCTOU-safe claim: enrollmentPhase re-checked inside the findOneAndUpdate filter (not just a pre-check), with $set+$unset combined in one atomic write — establishes the pattern for any future one-time-state-transition endpoint in this codebase"
    - "Pin-before-write ordering for DEK custody handoffs: pin to IPFS first (cheap to retry, no DEK exposure on failure), then a single atomic Mongo write performs the wipe+flip — mirrors createStudent's existing pin-then-write convention"

key-files:
  created: []
  modified:
    - privdId_admin/backend/services/credentialService.js
    - privdId_admin/backend/services/studentService.js
    - privdId_admin/backend/controllers/studentController.js
    - privdId_admin/backend/routes/studentRoutes.js

key-decisions:
  - "claimCredential rejects revoked students with 403 (not 400) for consistency with the codebase's existing revoked-credential status code (updateStudent uses 400 for revoked+update; claim is closer semantically to a forbidden action against a credential, but 403/409/404/500 were chosen per AppError statusCode conventions already in this file — see Deviations)"
  - "A missing held DEK (student.dek falsy) throws AppError(500) rather than 400 — this represents a server-side data-integrity failure (the DEK was never escrowed), not a client input error"

patterns-established:
  - "Atomic one-time-claim pattern: Model.findOneAndUpdate({_id, <state-field>: <required-prior-state>}, {$set:{...}, $unset:{...}}, {new:true}) with a null-result check throwing 409 — reusable for any future single-claim/single-transition endpoint"

requirements-completed: [ENROLL-02, KEY-02]

# Metrics
duration: 12min
completed: 2026-06-19
---

# Phase 07 Plan 02: Student Claim Endpoint (POST /students/:id/pubkey) Summary

**`claimCredential()` orchestration that ECIES-wraps the escrowed DEK, pins the envelope to IPFS, and atomically wipes `dek`/sets `dekEnvelopeCID`/flips `enrollmentPhase` to `active` in a single `findOneAndUpdate`, closing the TOCTOU window on repeat claims with a 409.**

## Performance

- **Duration:** 12 min
- **Tasks:** 3 completed
- **Files modified:** 4

## Accomplishments
- `credentialService.js` exports `pinEnvelopeToIPFS(envelopeBase64, pinName)`, a thin wrapper reusing the existing private `pinToIPFS` Pinata helper — no duplicate axios call, `issueCredentialOnChain`'s existing usage untouched
- `studentService.js::claimCredential(id, pubKeyHex)` implements the full claim flow: load with `+dek` → guard revoked/already-claimed → guard missing DEK → `wrapDEK` → `pinEnvelopeToIPFS` → single atomic `findOneAndUpdate` filtered on `enrollmentPhase: "awaiting-keypair"` that sets `pubKey`/`dekEnvelopeCID`/`enrollmentPhase: "active"` and `$unset`s `dek`
- `studentController.js::claimPubkey` validates `pubKeyHex` is present, a string, and exactly 66 hex characters (compressed secp256k1) before delegating — satisfies the T-07-02 DoS mitigation ahead of any `eciesjs.encrypt` call
- `POST /api/students/:id/pubkey` registered and verified end-to-end against a real (throwaway) MongoDB document with a live Pinata pin: first claim returns `enrollmentPhase: "active"`, a real IPFS `dekEnvelopeCID`, and no `dek` field in the response; the Mongo record shows `dek: null` and `dekEnvelopeCID` populated; a second claim attempt against the same student returns 409 with the envelope/dek state unchanged

## Task Commits

Each task was committed atomically:

1. **Task 1: Export an envelope-pinning helper from credentialService.js** - `2bd4e87` (feat)
2. **Task 2: Implement claimCredential() orchestration in studentService.js** - `d8fa0ac` (feat)
3. **Task 3: Add claimPubkey controller and POST /:id/pubkey route, run end-to-end backend smoke** - `f09574e` (feat)

**Plan metadata:** _pending — see final commit below_

## Files Created/Modified
- `privdId_admin/backend/services/credentialService.js` - Added exported `pinEnvelopeToIPFS` wrapper around the existing private `pinToIPFS`
- `privdId_admin/backend/services/studentService.js` - Added `claimCredential(id, pubKeyHex)`; imports `wrapDEK` (ecies.js) and `pinEnvelopeToIPFS` (credentialService.js)
- `privdId_admin/backend/controllers/studentController.js` - Added `claimPubkey` asyncHandler controller with compressed-secp256k1-hex validation
- `privdId_admin/backend/routes/studentRoutes.js` - Registered `router.post("/:id/pubkey", claimPubkey)` next to the other `:id`-scoped routes

## Decisions Made
- Used `Student.findOneAndUpdate({_id: id, enrollmentPhase: "awaiting-keypair"}, {$set:{...}, $unset:{dek:""}}, {new:true})` as the single atomic write, exactly as specified by the plan and RESEARCH.md's TOCTOU guidance — the filter's `enrollmentPhase` condition is the actual concurrency-safety mechanism, not just the earlier pre-check.
- Pin-before-write ordering followed exactly per Pitfall 4: the IPFS pin happens before any Mongo mutation, so a pin failure leaves the plaintext DEK and `awaiting-keypair` phase completely untouched and retryable.
- Revoked-student guard returns 403 (distinct from the 404/409/500 paths) — chosen as the closest fit to existing AppError conventions in this file for "action forbidden against this resource's current state."

## Deviations from Plan

None - plan executed exactly as written. The plan's task specifications, atomic-write shape, validation regex, and verification commands were followed verbatim; no Rule 1-4 deviations were required.

## Issues Encountered
- The plan's own Task 2 verify command (as literally written, using a double-quoted `node -e` heredoc) tripped a shell-quoting artifact when re-run for confirmation (the `\$unset` regex token was mangled by bash's `$`-interpolation inside double quotes) — this was a verification-script-invocation issue, not a code defect. Re-running the equivalent check with the JS string single-quoted to bash confirmed `$unset` is correctly present in `studentService.js` and the check passes (`OK`). No code change was needed; the underlying `claimCredential` implementation was correct on the first write.
- The configured `MONGO_URI` points to a remote/shared database (not localhost) and `PINATA_JWT` is live. The end-to-end smoke test (plan Task 3's manual verification requirement) was run as a self-contained, self-cleaning Node script: it created one throwaway `awaiting-keypair` student with a held DEK, called `claimCredential` directly (first claim succeeds, second claim returns 409), inspected the resulting Mongo document, and deleted the test student afterward (`Student.deleteOne`) to avoid leaving test data in the shared database. The script itself was a temporary, untracked file removed immediately after the run — it was never committed.

## User Setup Required

None - no external service configuration required (Pinata JWT and Mongo URI were already configured from prior phases).

## Next Phase Readiness
- `claimCredential` is live and verified end-to-end; Phase 07-04 (`ClaimCredentialScreen`) can call `POST /api/students/:id/pubkey` directly with a `pubKeyHex` from the on-device keypair (Phase 07-03) and expect `{status: "success", student: {...enrollmentPhase: "active", dekEnvelopeCID, ...}}` on success or a 409 with `{status: "fail", message: "This credential has already been claimed."}` on repeat.
- No blockers. ENROLL-02 and the backend half of KEY-02 are closed.

---
*Phase: 07-student-keypair-two-phase-enrollment*
*Completed: 2026-06-19*

## Self-Check: PASSED
