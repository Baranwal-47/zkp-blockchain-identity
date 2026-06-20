---
phase: 07-student-keypair-two-phase-enrollment
plan: 04

subsystem: mobile
tags: [claim-flow, navigation, enrollment-phase, react-navigation]

# Dependency graph
requires:
  - phase: 07-02-claim-endpoint
    provides: "POST /students/:id/pubkey (wraps DEK, pins envelope, wipes plaintext dek, flips to active)"
  - phase: 07-03-mobile-crypto-foundation
    provides: "utils/keypair.js generateAndStoreKeypair()/getStoredPublicKeyHexForRetry(), RNG polyfill wired and on-device-confirmed working"
provides:
  - "digital-app: ClaimCredentialScreen.js — auto-triggered claim flow (generate keypair on mount, POST pubkey, loading/error/retry states)"
  - "digital-app: App.js Stack.Screen registration (headerLeft:null, gestureEnabled:false — no back-nav mid-claim)"
  - "digital-app: LoginScreen.js D-01 routing branch — awaiting-keypair students redirect into ClaimCredentialScreen before the StudentProfile navigate"
affects: [08-daily-access-flow]

key-files:
  created:
    - digital-app/screens/ClaimCredentialScreen.js
  modified:
    - digital-app/App.js
    - digital-app/screens/LoginScreen.js

key-decisions:
  - "Claim is fully auto-triggered on mount — no confirmation tap required from the student, matching D-01's 'invisible plumbing' framing for the enrollment UX."
  - "Task 3's full on-device end-to-end checkpoint (enroll -> login -> auto-redirect -> claim -> active -> Mongo state -> already-active skip -> error/retry) is explicitly DEFERRED, not skipped. User instruction: batch all remaining human/device verification (this checkpoint + Phase 8's new two-device Verify Proof QR checkpoint) to the end of the next work session, rather than gating phase closure or Phase 8 planning on it now."

requirements-completed: [ENROLL-02, KEY-02 (client half) — code-complete; full device E2E checkpoint deferred per above]

# Metrics
completed: 2026-06-19
---

# Phase 07 Plan 04: ClaimCredentialScreen + Navigation Summary

**Created `ClaimCredentialScreen.js` (auto-triggered keypair generation + claim POST, with loading/error/retry states) and wired it into the navigation graph: registered in `App.js` with back-navigation disabled, and added the D-01 routing branch in `LoginScreen.js` so any `awaiting-keypair` student is redirected into it automatically on login. Tasks 1 and 2 (both code/automated-verify tasks) are complete and committed. Task 3 — the full on-device end-to-end human-verify checkpoint — is deferred to the end of the next session per explicit user instruction, batched with Phase 8's new device checkpoint, rather than blocking phase closure now.**

## Accomplishments
- **Task 1:** `digital-app/screens/ClaimCredentialScreen.js` created. On mount: calls `generateAndStoreKeypair()` (from 07-03), POSTs the resulting pubkey to `/students/:id/pubkey` (from 07-02), shows a loading state ("Securing your credential…") while in flight, an error state ("Couldn't Complete Setup" + "Try Again") on failure with no logout/crash, and navigates to StudentProfile on success.
- **Task 2:** `App.js` — `ClaimCredentialScreen` imported and registered between `LoginScreen` and `StudentProfile` with `headerLeft: null` and `gestureEnabled: false` (mirrors the existing `LoadingScreen` no-back-nav pattern). `LoginScreen.js::handleLogin` — added the D-01 branch: if `data.student.enrollmentPhase === 'awaiting-keypair'`, navigate to `ClaimCredentialScreen` and return before reaching the existing `StudentProfile` navigate; active students fall through unchanged.
- Both tasks' automated verify commands passed (`OK`) per the plan's exact grep/node checks.

## Task Commits

1. **Task 1: Create ClaimCredentialScreen.js** — `cea4204` (feat)
2. **Task 2: Register in App.js + D-01 routing in LoginScreen.js** — `fce0964` (feat)

## Files Created/Modified
- `digital-app/screens/ClaimCredentialScreen.js` - New: auto-triggered claim flow (keygen -> POST pubkey -> loading/error/retry -> navigate)
- `digital-app/App.js` - `ClaimCredentialScreen` registered (no back-nav mid-claim)
- `digital-app/screens/LoginScreen.js` - D-01 branch: `awaiting-keypair` students redirect to `ClaimCredentialScreen` before the StudentProfile navigate

## Issues Encountered

**Task 3 (blocking human-verify checkpoint) — DEFERRED, not run this session.**

Task 3's `<how-to-verify>` requires a live device/Expo Go session against a running backend with a seeded `awaiting-keypair` student: confirm auto-redirect into the claim screen, claim completion, the Mongo record showing `dek` wiped / `dekEnvelopeCID` set / `pubKey` set / `enrollmentPhase: "active"`, an already-active student skipping the claim screen, and the stop-backend/retry error path.

Per explicit user instruction, this checkpoint is deferred to the end of the next work session and will be run together with Phase 8's new Verify Proof two-device QR handshake checkpoint, rather than gating Phase 07's closure or Phase 8's planning/execution now. This is a scheduling decision, not a quality shortcut — none of Task 3's underlying code paths are themselves in question (Tasks 1+2's automated verifies passed, and 07-03's on-device RNG/keypair-generation check has separately already passed).

## Next Phase Readiness
- ClaimCredentialScreen and the D-01 routing branch are in place and code-complete; Phase 8 (Daily Access Flow) can plan/execute without waiting on Task 3.
- **Outstanding before Phase 07 can be marked fully complete in `STATE.md`:** Task 3's device checkpoint, deferred to end-of-session per user instruction (see Issues Encountered).

---
*Phase: 07-student-keypair-two-phase-enrollment*
*Completed: 2026-06-19 (Tasks 1+2 complete; Task 3 device checkpoint deferred to end-of-session, batched with Phase 8's)*

## Self-Check: PARTIAL (by design) — Tasks 1+2 fully verified and committed; Task 3 is a deliberately deferred human-verify checkpoint, not a failure or gap in the code itself.
