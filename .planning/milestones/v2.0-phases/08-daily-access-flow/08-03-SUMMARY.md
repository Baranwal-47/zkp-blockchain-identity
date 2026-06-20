---
phase: 08-daily-access-flow
plan: 03
subsystem: ui
tags: [react-native, expo, dashboard, decrypt-pipeline, ipfs, blockchain-status]

# Dependency graph
requires:
  - phase: 08-daily-access-flow
    provides: "GET /api/students/credential/:rollNo/blobs (Plan 08-01)"
  - phase: 08-daily-access-flow
    provides: "unwrapDEK + decryptCredentialBlob on-device crypto utils (Plan 08-02)"
provides:
  - "DashboardScreen.js — 3-button navigation hub (View Credentials / Generate Proof / Verify Proof) with institution + issued-count status summary"
  - "ViewCredentialsScreen.js — first full end-to-end exercise of fetch -> unwrap DEK -> decrypt -> display, plus a live on-chain Blockchain Status badge (D-05)"
affects: [08-04-generate-proof, 08-05-verify-proof-and-app-wiring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Blockchain-status check isolated in its own try/catch separate from the decrypt pipeline's try/catch, so a /credential-info network blip degrades to 'Unable to verify' without blanking the already-decrypted credential (T-08-08)"
    - "Single-tenant institution name treated as a hardcoded constant (no per-institution model exists) — issued-count derived from the student's own ciphertextCID presence, not a backend aggregate"

key-files:
  created:
    - digital-app/screens/DashboardScreen.js
    - digital-app/screens/ViewCredentialsScreen.js
  modified: []

key-decisions:
  - "Dashboard's 'institution + issued-credentials count' status line uses a hardcoded INSTITUTION_NAME constant ('IIITDM Jabalpur') and a per-student issuedCount derived from ciphertextCID presence (0 or 1) — there is no per-institution model or aggregate issued-count endpoint in this codebase, and building one was out of this plan's scope (no <files_modified> backend entry, no architectural-change signal in the plan)."
  - "rollNo is read from route.params.student.rollNo (the object LoginScreen/StudentProfile already pass through navigation) rather than fetched separately, avoiding a redundant network call on Dashboard mount."

patterns-established:
  - "Pattern: on-chain status checks that supplement (not gate) a successful on-device decrypt must live in their own try/catch with a neutral fallback state, never the same try/catch as the decrypt pipeline."

requirements-completed: [ACCESS-02]

# Metrics
duration: 14min
completed: 2026-06-19
---

# Phase 8 Plan 03: Dashboard + View Credentials Summary

**3-button Dashboard hub plus the first end-to-end exercise of the daily-access decrypt pipeline (fetch blobs -> IPFS gateway -> unwrapDEK -> decryptCredentialBlob -> display) with a live on-chain Blockchain Status badge that degrades gracefully on network failure.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-06-19T18:15:00Z (approx, prior to file reads)
- **Completed:** 2026-06-19T18:29:38Z
- **Tasks:** 2 completed
- **Files modified:** 2 (both created)

## Accomplishments
- `DashboardScreen.js` renders exactly 3 full-width buttons (View Credentials / Generate Proof / Verify Proof) stacked with the LoginScreen `loginButton`/`loginButtonText` style, plus a muted institution+issued-count summary line, forwarding `rollNo` to the two screens that need it
- `ViewCredentialsScreen.js` auto-fires on mount and runs the full fetch -> unwrap -> decrypt -> display pipeline against Plan 08-01's `/credential/:rollNo/blobs` endpoint and Plan 08-02's `unwrapDEK`/`decryptCredentialBlob` utils
- Live Blockchain Status badge (D-05) calls zkp-backend's `/credential-info` with the decrypted credential's `merkleRoot`, mapping `found && !revoked` -> Verified (green), `found && revoked` -> Revoked (red), and any throw/network failure on this call ONLY -> "Unable to verify" (muted gray) — isolated from the decrypt pipeline's error path so a status-check blip never blanks the credential (T-08-08)
- Error+retry path (loading/error/ready state machine) mirrors `ClaimCredentialScreen.js` verbatim
- No `console.log` of the DEK or decrypted plaintext anywhere in either file (T-08-07)

## Task Commits

Each task was committed atomically:

1. **Task 1: DashboardScreen — 3-button hub + status summary** - `d944477` (feat)
2. **Task 2: ViewCredentialsScreen — fetch + on-device decrypt + display + live Blockchain Status** - `db090e5` (feat)

**Plan metadata:** pending (docs: complete plan)

## Files Created/Modified
- `digital-app/screens/DashboardScreen.js` - 3-button nav hub; `INSTITUTION_NAME` constant + `issuedCount` derived from `student.ciphertextCID`; navigates to `ViewCredentialsScreen`/`GenerateProofScreen` with `{ rollNo }` and `VerifyProofScreen` with no params
- `digital-app/screens/ViewCredentialsScreen.js` - `loading`/`error`/`ready` state machine; `loadCredential()` does steps 1-4 (fetch blobs, fetch both IPFS objects in parallel, `unwrapDEK`, `decryptCredentialBlob`) inside one try/catch, then fires `checkBlockchainStatus(merkleRoot)` separately (its own try/catch) for the D-05 badge; renders name/rollNo/programmeLevel/status plus the Blockchain Status badge

## Decisions Made
- Institution name and issued-count are derived client-side from data already in hand (no new backend endpoint), since the plan's `files_modified` list only named the two screen files and adding a new aggregate-count endpoint would have been an undeclared architectural addition (Rule 4 territory) for a single line of muted status copy. The institution is hardcoded because PrivdID is single-tenant (IIITDM Jabalpur only, per CLAUDE.md) — there is no institution model to query.
- IPFS gateway base (`https://gateway.pinata.cloud/ipfs/`) was matched from `zkp-backend/server.js`'s existing `ipfsUrl` construction (`/credential-info` response), since `environment.js` does not export a gateway base and no prior digital-app code fetches from IPFS directly — this is the first plan to do so.
- `BACKEND_URL` (not `ADMIN_BACKEND_URL`) is the zkp-backend base, confirmed by `VerifyProof.js`'s existing `/credential-info`/`/verify-onchain` calls using that exact import.

## Deviations from Plan

None — plan executed exactly as written for both tasks. The institution/issued-count derivation (documented above under Decisions Made) was an interpretation of unspecified-but-required UI copy, not a deviation from any explicit plan instruction — the plan's `<action>` text for Task 1 explicitly left the institution/count data source open ("read how rollNo arrives... do not hardcode" applied only to rollNo, not institution/count).

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Known Stubs

None. `DashboardScreen.js`'s `issuedCount` is a real derived value (0 or 1 based on actual `ciphertextCID` presence on the student object passed through navigation), not a hardcoded placeholder — it correctly reflects whether this specific student's credential has been issued. `INSTITUTION_NAME` is a real (if hardcoded) value, not a "coming soon"/TODO placeholder, and is documented above as an intentional single-tenant simplification.

## Next Phase Readiness
- Both screens are implemented and statically verified but not yet reachable in the app — navigation registration (`App.js`) and legacy-screen deletion are explicitly deferred to Plan 08-05 per this plan's `<objective>` ("Navigation registration + legacy-screen deletion happens in Plan 08-05's single App.js pass to keep App.js single-owner").
- Live device verification of the full View Credentials pipeline against a real seeded active student (the `<verification>` section's stated scope) is also deferred to Plan 08-05's batched device checkpoint, once App.js wiring makes these screens reachable.
- `ViewCredentialsScreen.js` is ready for Plan 08-04 (Generate Proof) to reference for its own fetch/decrypt needs if applicable.

---
*Phase: 08-daily-access-flow*
*Completed: 2026-06-19*

## Self-Check: PASSED

- FOUND: digital-app/screens/DashboardScreen.js
- FOUND: digital-app/screens/ViewCredentialsScreen.js
- FOUND: .planning/phases/08-daily-access-flow/08-03-SUMMARY.md
- FOUND: commit d944477
- FOUND: commit db090e5
