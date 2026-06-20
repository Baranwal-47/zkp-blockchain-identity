---
phase: 08-daily-access-flow
plan: 01
subsystem: api
tags: [express, mongoose, nonce, ipfs, cid-lookup]

# Dependency graph
requires:
  - phase: 07-keypair-enrollment
    provides: enrollmentPhase state machine (awaiting-keypair -> active), ciphertextCID/dekEnvelopeCID fields on Student
provides:
  - "GET /api/students/credential/:rollNo/blobs — returns ciphertextCID + dekEnvelopeCID for an active student"
  - "15-minute nonce-session TTL (zkp-backend) for the two-phone QR Verify Proof round trip"
affects: [08-02-daily-access-decrypt-and-proof, 08-05-verify-proof]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Route-ordering guard: parametric sub-paths (/credential/:rollNo/blobs) registered before the catch-all /:id to avoid Express route shadowing"
    - "CID-only response shape: controller returns only ciphertextCID/dekEnvelopeCID, never the full sanitized student object, for blob-lookup endpoints"

key-files:
  created: []
  modified:
    - privdId_admin/backend/controllers/studentController.js
    - privdId_admin/backend/routes/studentRoutes.js
    - zkp-backend/lib/nonceStore.js
    - zkp-backend/test/nonceStore.test.js
    - zkp-backend/test/generateProof.test.js

key-decisions:
  - "getCredentialBlobs gates on enrollmentPhase==='active' before checking CID presence, so a not-yet-claimed student gets 403 (has not completed enrollment) rather than a 404 that could be confused with an unknown rollNo"
  - "Nonce TTL is the sole freshness mechanism (no embedded proof timestamp) per RESEARCH.md Open Question 2 — raising TTL_MS from 5 to 15 minutes satisfies D-08 without touching validateAndConsume/used-flag single-use semantics"

patterns-established:
  - "Pattern: lookup-by-business-key (rollNo) routes must be registered ahead of /:id in Express route files — documented inline with a comment at the registration site"

requirements-completed: [ACCESS-01]

# Metrics
duration: 9min
completed: 2026-06-19
---

# Phase 08 Plan 01: Daily-Access Backend Surface Summary

**Added a rollNo-keyed credential-blobs lookup endpoint to the admin backend and widened the zkp-backend nonce-session TTL from 5 to 15 minutes to support a real two-phone QR verification round trip.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-06-19T18:03:00Z (approx, prior to file reads)
- **Completed:** 2026-06-19T18:12:21Z
- **Tasks:** 3 completed
- **Files modified:** 5

## Accomplishments
- `GET /api/students/credential/:rollNo/blobs` returns `{status, ciphertextCID, dekEnvelopeCID}` for an active student, 403 for a non-active student, 404 for unknown rollNo or missing blobs
- Route registered strictly before the existing `/:id` route to avoid Express path-shadowing (Pitfall 5)
- `zkp-backend/lib/nonceStore.js` TTL_MS raised from 5 to 15 minutes (D-08); single-use `validateAndConsume`/`used`-flag logic untouched
- Found and fixed a second TTL-pinned test assertion in `generateProof.test.js` (not listed in the plan's `read_first` scan) — full zkp-backend mocha suite green at 30 passing, 2 pending

## Task Commits

Each task was committed atomically:

1. **Task 1: Add getCredentialBlobs controller + route (ACCESS-01)** - `e976b7a` (feat)
2. **Task 2: Raise nonce TTL to 15 minutes (D-08)** - `31ed52e` (fix)
3. **Task 3: Verify zkp-backend nonce test suite still passes after TTL change** - `f277a5a` (test)

**Plan metadata:** pending (docs: complete plan)

## Files Created/Modified
- `privdId_admin/backend/controllers/studentController.js` - Added `getCredentialBlobs` asyncHandler-wrapped controller; rollNo lookup via `Student.findOne`, active-phase 403 gate, missing-blob 404 gate, CID-only response
- `privdId_admin/backend/routes/studentRoutes.js` - Imported `getCredentialBlobs`, registered `GET /credential/:rollNo/blobs` before `GET /:id` with an inline ordering-requirement comment
- `zkp-backend/lib/nonceStore.js` - `TTL_MS` changed from `5 * 60 * 1000` to `15 * 60 * 1000`; module-header comment updated from "5 minutes" to "15 minutes (D-08)"
- `zkp-backend/test/nonceStore.test.js` - Updated the `expiresAt is issuedAt + N minutes` assertion from 300000ms to 900000ms
- `zkp-backend/test/generateProof.test.js` - Updated the `/session/nonce` integration test's delta-bound assertion from 305000ms to 905000ms (Rule 1 auto-fix: discovered during Task 3's full-suite run, not listed in plan's `read_first`)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Found a second TTL-pinned test assertion outside the plan's read_first scope**
- **Found during:** Task 3 (running `npm test` after the TTL_MS change)
- **Issue:** `zkp-backend/test/generateProof.test.js` line 132 asserted `delta > 0 && delta <= 305000` for the `/session/nonce` route's integration test — a second, independent hardcoding of the old 5-minute TTL that the plan's `read_first` for Task 3 (which only named `nonceStore.test.js`) did not anticipate. Running the full mocha suite (`npm test`, not a targeted single-file run) surfaced the failure.
- **Fix:** Updated the assertion bound from 305000 to 905000 (15 minutes + 5s slack) and the test description from "~5 minutes" to "~15 minutes", matching the same convention used for the `nonceStore.test.js` fix.
- **Files modified:** `zkp-backend/test/generateProof.test.js`
- **Commit:** `f277a5a`

Also fixed inline during Task 1 (not a deviation from plan intent, but worth noting): the verification script's literal-string check for `"/:id"` initially false-positived against the wording of my own inline route-ordering comment (which itself contained the quoted string `"/:id"`). Reworded the comment to avoid the literal pattern while preserving the same explanation; no functional change to route registration order.

## Decisions Made
- enrollmentPhase active-gate takes priority over CID-presence check (403 before 404) so a not-yet-claimed student's lookup attempt is distinguishable from a truly unknown rollNo.
- Nonce-session TTL remains the single freshness mechanism — no new "generatedAt" field added to the proof or circuit, consistent with the circuit-freeze ground rule in CLAUDE.md and RESEARCH.md Open Question 2.

## Known Stubs

None — both deliverables (endpoint + TTL change) are fully wired with no placeholder/mock data paths.

## Self-Check: PASSED
