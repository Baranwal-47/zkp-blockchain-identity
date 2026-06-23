---
phase: 11-recovery-crypto-shredding-erasure-e6-ops
plan: 02
subsystem: recovery
tags: [shamir, ecies, recovery, react, react-native, express, mongo]

# Dependency graph
requires:
  - phase: 11-01
    provides: "in-memory recovery session state machine (initiateRecovery/getSession/addShare/reconstructIfReady/runOperation)"
provides:
  - "reissueWithDEK(studentId, attributeUpdates, dek) — Case A re-issuance taking the DEK as a parameter"
  - "performDeviceLoss / performCredentialMod operation functions dispatched from submitShare"
  - "either-order device-loss completion gate (shares + student pubkey, whichever arrives last triggers reconstruction)"
  - "POST /api/recovery/:sessionId/student-pubkey — unauthenticated, student-facing"
  - "GET /api/recovery/status/:studentId (student, unauthenticated) and GET /api/recovery/status (admin, bulk)"
  - "EditStudentPage transparently opens a credential-mod recovery session on the existing 409"
  - "Dashboard status pills per student row (Pending custodian approval / Waiting for student pubkey / Waiting for custodian shares)"
  - "Mobile RecoverDeviceScreen reusing keypair.js generateAndStoreKeypair/getStoredPublicKeyHexForRetry"
affects: [11-03-erasure, e6-recovery-demo]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Either-order completion gate: reconstructIfReady() only reconstructs the DEK once BOTH conditions hold (2-of-3 shares AND, for device-loss, student pubkey present) — never reconstructs early and holds the DEK waiting on the other condition"
    - "Transparent error-to-flow redirection: a 409 from an existing endpoint (updateStudent) is caught client-side and silently redirected into a different flow (recovery initiate) instead of being surfaced as an error"
    - "Bulk status endpoint over N-per-row polling: one GET /api/recovery/status returns all open sessions keyed by studentId for dashboard pills"

key-files:
  created:
    - digital-app/screens/RecoverDeviceScreen.js
  modified:
    - privdId_admin/backend/services/recoveryService.js
    - privdId_admin/backend/controllers/recoveryController.js
    - privdId_admin/backend/routes/recoveryRoutes.js
    - privdId_admin/frontend/src/pages/RecoveryPage.jsx
    - privdId_admin/frontend/src/pages/EditStudentPage.jsx
    - privdId_admin/frontend/src/pages/DashboardPage.jsx
    - privdId_admin/frontend/src/components/StudentsTable.jsx
    - digital-app/screens/LoginScreen.js
    - digital-app/App.js
    - privdId_admin/backend/recovery.smoke.mjs

key-decisions:
  - "Case A (credential-mod) is no longer admin-selectable via a dropdown on /recovery — it is triggered transparently from the existing Edit-flow 409, matching the real-world trigger (an admin tries to edit a student who has already claimed their credential)"
  - "Case B (device-loss) no longer takes a manual pubkey input from the admin — the student generates their own keypair on-device via the mobile app and submits only the public key, matching the real custodial/student role split"
  - "Device-loss completion is either-order: custodian shares and the student's new pubkey can arrive in any sequence; the DEK is reconstructed only at the exact moment both are present, preserving the original short-exposure-window guarantee"
  - "Minimal plumbing for student session discovery: the mobile app looks up its own open session by studentId (GET /api/recovery/status/:studentId, unauthenticated) right after login, rather than adding a new field to the login response"
  - "Bulk dashboard status (GET /api/recovery/status) returns all open sessions in one call instead of one request per student row"

requirements-completed: [REC-02, REC-03]

# Metrics
duration: ~75min
completed: 2026-06-23
---

# Phase 11 Plan 02: Recovery Operation Wiring + Architecture-Driven UX Redesign Summary

**Case A/B recovery operations wired into the session-completion path, then the admin-facing UX for both was rejected and redesigned mid-plan to match the real custodial/student roles: Case A now triggers transparently from the Edit flow's existing 409, and Case B's device key is now student-generated via a new mobile screen instead of admin-typed, with either-order completion (shares/pubkey, whichever lands last) gating DEK reconstruction.**

## Performance

- **Duration:** ~75 min (this session; plan started in a prior session — first 4 tasks were already committed)
- **Completed:** 2026-06-23
- **Tasks:** 4 original plan tasks (done in prior session) + this session's redesign work across 6 commits
- **Files modified:** 10 (1 created, 9 modified)

## Deviation from Original Plan

**This is a significant deviation from 11-02-PLAN.md as written, made at the user's explicit request after they reviewed the actual architecture diagrams against the UI built in the plan's Task 4.**

The original plan (Task 4) built a `RecoveryPage.jsx` with:
- An `AcadAdminInitiatePanel` with a "Recovery type" dropdown (device-loss vs credential-mod)
- For device-loss: a manual text input where the admin types the student's new public key hex
- For credential-mod: a "New batch year" input, opened via the same dropdown-driven form

**Why this was rejected:** the user pointed out this does not match the real custodial/student architecture:
1. **Case A (credential-mod)** in the real system is triggered when an admin tries to *edit* an already-claimed student and gets blocked (the existing `updateStudent()` 409 — "Re-issuance requires Phase 11 custodian 2-of-3 Shamir reconstruction"). Forcing the admin to separately navigate to `/recovery`, pick "credential-mod" from a dropdown, and **re-type the same field changes** they just typed in the Edit form is redundant and doesn't match how the trigger actually occurs.
2. **Case B (device-loss)** in the real system cannot have the admin typing the student's new public key — the admin has no way of knowing it. The *student* generates a fresh keypair on their own device (exactly as they do during the original Phase 7 claim flow) and that new public key must come from the student's device, not an admin text box.

**Corrected design implemented this session:**

1. **Case A — removed from RecoveryPage, triggered from Edit flow.** `EditStudentPage.jsx`'s `handleSubmit` now catches the specific 409 from `PUT /students/:id` and transparently calls `POST /api/recovery/initiate` with `{ studentId, operationType: "credential-mod", attributeUpdates: formData }` — the same payload the Edit form was already submitting. The modal closes immediately (fire-and-check-later, per user decision — not blocking on completion). The "Recovery type" dropdown, the manual-pubkey input, and the "New batch year" input are all removed from `AcadAdminInitiatePanel` in `RecoveryPage.jsx`, which is now device-loss-only for admin-initiated sessions. `CustodianSubmitPanel` (and its credential-mod success-message branch) is unchanged — custodians still need to see the outcome regardless of how the session was opened.

2. **Case B — admin no longer enters a pubkey; student supplies it via mobile app.** `POST /api/recovery/initiate` for `device-loss` no longer requires `newPubKey` — a session can be created with `newPubKey: null`. A new endpoint, `POST /api/recovery/:sessionId/student-pubkey` (unauthenticated, student-facing — registered before the `requireAuth` gate in `recoveryRoutes.js`, mirroring the existing `claimPubkey` pattern), lets the student submit their new pubkey later. The mobile app's new `RecoverDeviceScreen.js` reuses `generateAndStoreKeypair()`/`getStoredPublicKeyHexForRetry()` from `utils/keypair.js` (the exact same on-device keypair generation as the original `ClaimCredentialScreen`) and posts only the public key. `LoginScreen.js` checks `GET /api/recovery/status/:studentId` right after a successful login and routes to `RecoverDeviceScreen` instead of `DashboardScreen` if an open device-loss session without a submitted pubkey is found.

3. **Either-order completion.** Per user decision, custodian shares and the student's pubkey can arrive in either order. `reconstructIfReady()` in `recoveryService.js` now gates DEK reconstruction on BOTH the 2-of-3 share threshold AND (for device-loss) `session.newPubKey` being present — it returns `{ ready: false, waitingOnPubKey: true }` if shares hit threshold but the pubkey hasn't arrived, and only reconstructs the DEK at the exact moment both conditions hold. This preserves the original short-plaintext-exposure-window guarantee: the DEK is never reconstructed and left sitting in memory waiting for the other condition. `submitShare` (shares-then-pubkey ordering) and the new `submitRecoveryPubKey` controller (pubkey-then-shares ordering) both call the same `reconstructIfReady` + `runOperation` path, so completion fires correctly from whichever side completes the gate last.

4. **Status visibility.** A new bulk endpoint `GET /api/recovery/status` (admin-gated) and `listOpenSessionsByStudent()` in `recoveryService.js` let the Dashboard render a status pill per student row in one request: "Pending custodian approval" (credential-mod open), "Recovery initiated — waiting for student pubkey" / "Waiting for custodian shares" / "Recovery in progress" (device-loss, depending on which half is still missing). Manual refresh on page load only, per user decision — no polling/websockets needed for a demo.

## Accomplishments
- Case A (credential-mod) is now triggered exactly where it occurs in practice — an admin's Edit attempt on an already-claimed student — with zero redundant re-entry of the same field changes
- Case B (device-loss) admin UI has no manual pubkey input at all; the trust boundary now matches reality (only the student's own device produces that key)
- Backend either-order completion gate is unit-tested for both orderings (shares-then-pubkey, pubkey-then-shares) and for the "shares ready but pubkey missing" intermediate state
- Mobile app has a working, reused-pattern recovery-keypair-claim screen wired into the post-login routing decision
- Dashboard now surfaces live-ish recovery status per row without any new polling infrastructure
- Erasure (11-03 / crypto shredding) was explicitly left untouched, as instructed

## Task Commits

Original plan tasks (completed in a prior session, prior to this redesign):
1. **Task 1: reissueWithDEK** - `04f6e07` (feat)
2. **Task 2: Case A/B operation dispatch** - `4a93b24` (feat)
3. **Task 3: recovery-ops.smoke.mjs** - `b3a49d4` (test)
4. **Task 4: RecoveryPage result panel + Recover link** - `35437db` (feat)

This session's redesign work:
5. **Backend either-order completion gate + student-pubkey endpoint** - `ba18a18` (feat)
6. **Case A Edit-flow 409 wiring + dashboard status pills** - `af8eca5` (feat)
7. **RecoveryPage device-loss-only UI** - `f50d496` (feat)
8. **Mobile RecoverDeviceScreen + LoginScreen routing** - `5777002` (feat)
9. **Smoke test coverage for either-order completion** - `d027be4` (test)

**Plan metadata:** (this commit) `docs: complete 11-02 plan`

## Files Created/Modified

- `privdId_admin/backend/services/recoveryService.js` - added `findOpenSessionForStudent`, `listOpenSessionsByStudent`, `submitStudentPubKey`; reworked `reconstructIfReady` to gate on both shares AND (for device-loss) student pubkey, in either order
- `privdId_admin/backend/controllers/recoveryController.js` - `initiateRecovery` no longer requires `newPubKey` for device-loss; added `getRecoveryStatusForStudent`, `listRecoveryStatuses`, `submitRecoveryPubKey`
- `privdId_admin/backend/routes/recoveryRoutes.js` - split routes so `/:sessionId/student-pubkey` and `/status/:studentId` are unauthenticated (student-facing), while `/initiate`, `/submit-share`, `/status` (bulk) stay admin/custodian-gated
- `privdId_admin/frontend/src/pages/EditStudentPage.jsx` - catches the existing 409 from `updateStudent` and transparently opens a credential-mod recovery session with the same form payload
- `privdId_admin/frontend/src/pages/RecoveryPage.jsx` - `AcadAdminInitiatePanel` is now device-loss-only (dropdown, manual pubkey input, and batch-year input removed); custodian pending message distinguishes "waiting on a share" vs "waiting on the student's new device key"
- `privdId_admin/frontend/src/pages/DashboardPage.jsx` - loads bulk recovery statuses, passes them to `StudentsTable`
- `privdId_admin/frontend/src/components/StudentsTable.jsx` - renders a "Recovery" status pill column per row
- `digital-app/screens/RecoverDeviceScreen.js` (new) - student-driven device-loss claim screen reusing `keypair.js`
- `digital-app/screens/LoginScreen.js` - checks for an open device-loss session post-login and routes accordingly
- `digital-app/App.js` - registers `RecoverDeviceScreen` in the navigator
- `privdId_admin/backend/recovery.smoke.mjs` - 4 new assertions covering both completion orderings and the new status-lookup functions

## Known Stubs

None — all new endpoints and screens are wired end-to-end against real backend logic. No mock data paths were introduced.

## Threat Flags

| Flag | File | Description |
|------|------|--------------|
| threat_flag: new-unauthenticated-endpoint | privdId_admin/backend/routes/recoveryRoutes.js | `POST /:sessionId/student-pubkey` and `GET /status/:studentId` are deliberately unauthenticated (student-facing, mirrors the existing `claimPubkey`/`loginStudent` trust model) — a sessionId or studentId leak lets an attacker submit a pubkey into someone else's recovery session or read its status. Mitigated the same way the original claim flow is: sessionId is a 16-byte random hex (not guessable), session TTL is 30 minutes, and submitting a pubkey twice is rejected (409). This matches the existing risk acceptance for `claimPubkey` rather than introducing a new posture. |

## Self-Check: PASSED

Verified file existence and commit hashes below.
