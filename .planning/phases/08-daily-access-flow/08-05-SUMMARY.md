---
phase: 08-daily-access-flow
plan: 05
subsystem: ui
tags: [react-native, expo, qrcode, navigation, two-hop-handshake]
status: partial — Task 3 (blocking human-verify checkpoint) pending

# Dependency graph
requires:
  - phase: 08-daily-access-flow
    provides: "AttributeChecklist, REVEAL_KEY_MAP, buildRevealMap, CHECKLIST_LABELS (Plan 08-04)"
  - phase: 08-daily-access-flow
    provides: "DashboardScreen.js, ViewCredentialsScreen.js (Plan 08-03)"
provides:
  - "VerifyProofScreen.js — two-hop QR challenge/response (D-09)"
  - "App.js wired to the new daily-access screen set; 4 legacy screens deleted"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-hop QR flow detection by payload shape: {nonce,sessionId} = challenge, {proof,publicSignals} = proof response — QRScannerScreen branches on shape rather than a route param"
    - "/verify-onchain called alone (never paired with /verify) to avoid double-consuming a single-use nonce — same nonceStore.validateAndConsume guards both endpoints"

key-files:
  created:
    - digital-app/screens/VerifyProofScreen.js
  modified:
    - digital-app/App.js
    - digital-app/screens/ErrorScreen.js
    - digital-app/screens/ManualQRInput.js
    - digital-app/screens/LoadingScreen.js
    - digital-app/screens/ClaimCredentialScreen.js
    - digital-app/screens/LoginScreen.js
    - digital-app/screens/QRScannerScreen.js
  deleted:
    - digital-app/screens/HomeScreen.js
    - digital-app/screens/StudentProfileScreen.js
    - digital-app/screens/IdentityForm.js
    - digital-app/screens/ShowProof.js
    - digital-app/screens/VerifyProof.js

key-decisions:
  - "LoadingScreen.js is retired (unregistered in App.js, unreachable from any nav call) rather than deleted — its role is fully absorbed by GenerateProofScreen.js's own inline loading state (Plan 08-04). Left in place per the plan's files_modified list, which named it for edit not deletion; a header comment documents the retire rationale and notes it is safe to delete in a future cleanup pass."
  - "VerifyProof.js (the old single-phase screen) was deleted, not just unregistered — once App.js's VerifyProof registration was renamed to VerifyProofScreen and QRScannerScreen's nav target updated, VerifyProof.js had zero remaining references anywhere in the codebase, making it dead code rather than a file the plan asked to keep edited."
  - "ClaimCredentialScreen.js and LoginScreen.js both navigated to the now-deleted 'StudentProfile' screen on success — not flagged in the plan's explicit dangling-reference map, but directly caused by this task's StudentProfileScreen.js deletion (Rule 1 bug fix). Both now navigate to 'DashboardScreen' instead."
  - "QRScannerScreen.js's handleBarcodeScanned previously hardcoded navigate('VerifyProof', {...}) with the old single-phase payload field set. Since VerifyProofScreen.js needs to know which hop a scanned payload belongs to, the scanner now branches on payload shape ({nonce,sessionId} vs {proof,publicSignals}) and forwards scannedChallengePayload or scannedProofPayload accordingly — this scanner is shared by both ManualQRInput.js's legacy paste flow and VerifyProofScreen's own two scan entry points."

requirements-completed: []

# Metrics
duration: pending (partial — Task 3 not yet run)
completed: pending
---

# Phase 8 Plan 05: Verify Proof + App.js Wiring Summary (PARTIAL — Task 3 Pending)

**Two-hop QR challenge/response Verify Proof screen built and the entire app rewired off the legacy IdentityForm/HomeScreen/ShowProof/StudentProfile flow onto the new Dashboard-centric daily-access stack — Task 3's on-device two-phone verification has NOT been run and the plan is not yet complete.**

## Status

This plan is **NOT complete**. Tasks 1 and 2 (both `type="auto"`) are implemented, verified via automated gate, and committed. Task 3 is `type="checkpoint:human-verify" gate="blocking"` — it requires a physical device (and ideally a second phone for the two-hop QR handshake) and cannot be executed, approximated, or fabricated by this agent. Execution stopped at Task 3 per the plan's own gate and the orchestrator's explicit instruction not to mark this checkpoint complete.

Do not advance Phase 08 / Plan 05 to "complete" in STATE.md or ROADMAP.md until Task 3 is run and the user reports the result.

## Performance

- **Tasks completed:** 2 of 3 (Task 3 pending — blocking checkpoint)
- **Files created:** 1 (VerifyProofScreen.js)
- **Files modified:** 7
- **Files deleted:** 5

## Accomplishments (Tasks 1-2 only)

- `VerifyProofScreen.js` implements both hops behind a fixed "Step N of 2" badge: Step 1 reuses `AttributeChecklist`/`CHECKLIST_LABELS` from `GenerateProofScreen.js` to pick requested fields, then POSTs `/session/nonce` (backend-issued, never client-invented — T-08-13) and renders `{nonce, sessionId, requestedFields}` as a 220px QR (error-correction `M` for the larger Step-2 payload per Pitfall 4)
- Step 2 accepts a scanned or manually-pasted `{proof, publicSignals, sessionId}` payload and runs exactly two backend calls — `/verify-onchain` (cryptographic + nonce check) and `/credential-info` (revocation check) — never `/verify`, preserving the original `VerifyProof.js` lines 17-20 nonce-double-consumption rationale (T-08-14)
- Invalid results map to specific copy: `nonce_expired` → "expired" message, `nonce_mismatch` → "Nonce Mismatch", `nonce_already_used`/`unknown_session`/`invalid_proof` → distinct messages, revoked credential → "This credential has been revoked." — never a bare "invalid"
- Both hops offer "Scan QR" + "Or enter code manually" (D-09 scan-or-manual parity)
- `App.js` now boots to `LoginScreen` (`initialRouteName="LoginScreen"`); registers `DashboardScreen`, `ViewCredentialsScreen`, `GenerateProofScreen`, `VerifyProofScreen`; the 4 legacy imports/registrations (HomeScreen, StudentProfileScreen, IdentityForm, ShowProof) are gone; `LoadingScreen`'s registration is also dropped (see key-decisions)
- All dangling post-deletion navigation references fixed: `ErrorScreen.js`, `ManualQRInput.js`, `ClaimCredentialScreen.js`, `LoginScreen.js` all redirect to `DashboardScreen` instead of deleted screens; `QRScannerScreen.js` and `ManualQRInput.js` target `VerifyProofScreen` (with the new param shape) instead of the deleted `VerifyProof`
- Both task verify gates (automated `node -e` static checks from the plan) passed

## Task Commits

1. **Task 1: Rework VerifyProof.js into the two-hop QR VerifyProofScreen (D-09)** — `8990a28` (feat)
   - Files: `digital-app/screens/VerifyProofScreen.js`
2. **Task 2: App.js wiring + legacy deletion + dangling-reference redirects (D-04)** — `5cc28f8` (feat)
   - Files: `digital-app/App.js`, `digital-app/screens/ErrorScreen.js`, `digital-app/screens/ManualQRInput.js`, `digital-app/screens/LoadingScreen.js`, `digital-app/screens/ClaimCredentialScreen.js`, `digital-app/screens/LoginScreen.js`, `digital-app/screens/QRScannerScreen.js`; deleted `HomeScreen.js`, `StudentProfileScreen.js`, `IdentityForm.js`, `ShowProof.js`, `VerifyProof.js`
3. **Task 3: On-device end-to-end verification** — NOT EXECUTED. Blocking human-verify checkpoint; requires a physical/emulator device and ideally a second phone for the two-hop QR handshake. See "Task 3 — Pending Checkpoint" below for exact steps.

## Files Created/Modified/Deleted

- `digital-app/screens/VerifyProofScreen.js` (created) — two-hop QR challenge/response screen
- `digital-app/App.js` (modified) — new screen registrations, LoginScreen as initial route, legacy screens removed
- `digital-app/screens/ErrorScreen.js` (modified) — retry/start-over now target `DashboardScreen`
- `digital-app/screens/ManualQRInput.js` (modified) — dashboard redirect + `VerifyProofScreen` nav target with new param shape
- `digital-app/screens/LoadingScreen.js` (modified) — retired via header comment, left in place undeleted
- `digital-app/screens/ClaimCredentialScreen.js` (modified) — `StudentProfile` → `DashboardScreen` (Rule 1 fix)
- `digital-app/screens/LoginScreen.js` (modified) — `StudentProfile` → `DashboardScreen` (Rule 1 fix)
- `digital-app/screens/QRScannerScreen.js` (modified) — branches on scanned payload shape, routes into `VerifyProofScreen`'s two hops
- `digital-app/screens/HomeScreen.js`, `StudentProfileScreen.js`, `IdentityForm.js`, `ShowProof.js` (deleted, D-04)
- `digital-app/screens/VerifyProof.js` (deleted — superseded by `VerifyProofScreen.js`, zero remaining references after Task 2)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ClaimCredentialScreen.js and LoginScreen.js dangling 'StudentProfile' navigation**
- **Found during:** Task 2
- **Issue:** Both screens called `navigation.navigate('StudentProfile', ...)` on success. The plan's explicit dangling-reference map (RESEARCH.md "Runtime State Inventory") did not list these two call sites, but `StudentProfileScreen.js` is deleted in this same task, so both calls would have thrown/silently failed at runtime.
- **Fix:** Both now navigate to `'DashboardScreen'` instead.
- **Files modified:** `digital-app/screens/ClaimCredentialScreen.js`, `digital-app/screens/LoginScreen.js`
- **Commit:** `5cc28f8`

**2. [Rule 1 - Bug] QRScannerScreen.js and ManualQRInput.js dangling 'VerifyProof' navigation**
- **Found during:** Task 2
- **Issue:** Both screens navigated to `'VerifyProof'` with the old single-phase payload field set (`proof`, `publicSignals`, `sessionId`, `revealedDetails`, `privacySettings`, `generatedAt`, `proofType`). Since `VerifyProof.js` is deleted and `VerifyProofScreen.js` expects either a challenge or proof-response payload shape (not the old flat field set), this was a blocking dangling reference under Rule 3.
- **Fix:** `QRScannerScreen.js` now branches on payload shape (`{nonce,sessionId}` → `scannedChallengePayload`, `{proof,publicSignals}` → `scannedProofPayload`) and navigates to `'VerifyProofScreen'`. `ManualQRInput.js`'s paste-flow does the same for the proof-response shape.
- **Files modified:** `digital-app/screens/QRScannerScreen.js`, `digital-app/screens/ManualQRInput.js`
- **Commit:** `5cc28f8`

No other deviations. Task 1 was implemented per the `<action>` spec verbatim (hop badge, backend-issued nonce, `/verify-onchain`+`/credential-info` only, specific invalid reasons, scan-or-manual parity, no `IdentityForm` reference).

## Issues Encountered

None blocking. See key-decisions above for the LoadingScreen keep-(unregistered)-vs-delete judgment call, resolved as "retire but don't delete" per the plan's `files_modified` scope.

## User Setup Required

**Task 3 requires the user to run the on-device verification described below.** No other external service configuration is needed beyond what prior plans (08-01 through 08-04) already required (admin-backend + zkp-backend running with a valid `.env`, at least one student seeded under the new encrypted flow).

## Known Stubs

None. Every value `VerifyProofScreen.js` renders or transmits is real: the Step 1 nonce comes from a live `/session/nonce` call, the Step 2 verification result comes from live `/verify-onchain` + `/credential-info` calls. No placeholder/mock data path exists in this file.

## Threat Flags

None beyond what the plan's own `<threat_model>` already covers (T-08-13 through T-08-16, T-08-SC) — no new network endpoint, auth path, or schema change was introduced; this plan only edits/registers/deletes screens and calls existing, unmodified zkp-backend endpoints.

## Task 3 — Pending Checkpoint (NOT executed)

**This section documents what is awaiting the user. It does not represent completed work.**

### What was built (for this checkpoint to verify)

The complete daily-access flow is now wired end-to-end: admin-backend blobs endpoint (08-01), on-device crypto utils (08-02), Dashboard + View Credentials (08-03), Generate Proof (08-04), and Verify Proof two-hop QR + App.js wiring (this plan, Tasks 1-2). This checkpoint also batches the deferred Phase 07-04 Task 3 (claim-flow device verify) per STATE.md's "Pending Todos" note.

### How to verify

Prerequisites: admin-backend + zkp-backend running with a valid `.env` (`BLOCKCHAIN_RPC_URL` / `VERIFIER_ADDRESS` / `REGISTRY_ADDRESS` set); at least one student seeded and ENCRYPTED under the new flow (wipe+re-seed, no v1.0 migration per STATE.md); a physical device or emulator with the app running; ideally a SECOND phone for the two-hop QR scan.

1. (Deferred 07-04 Task 3) Enroll → first login → auto-redirect → "Setup Secure Credential Access" → claim → record flips to `enrollmentPhase:"active"` in Mongo; re-login on an already-active account skips the claim; an induced error shows the retry path.
2. App boots to LoginScreen; after login you land on the Dashboard showing exactly 3 buttons + the institution/issued-count line.
3. View Credentials: shows "Decrypting your credential…" then the decrypted name/rollNo/program/status and a live "Blockchain Status: Verified" (green) — confirm it reflects the real on-chain state (revoke a test student to see "Revoked"; kill RPC to see "Unable to verify" without the credential blanking).
4. Generate Proof: select attributes (consent = checklist), paste a nonce, Generate → "Proof Ready" with a scannable QR + "valid for 15 minutes" notice. Confirm the proof passes `/verify-onchain` (Verify Proof step below) — i.e. the new encrypted-storage pipeline produces an on-chain-valid proof (proves Pitfall 2 salts handling is correct).
5. Verify Proof two-hop (use the second phone): Step 1 create challenge → QR. Step 2 on the prover phone scan/enter the challenge, Generate Proof bound to it, show the proof QR; back on the verifier scan/enter it → "Proof Valid" (green) with detail rows. Test manual entry on both hops too (D-09 parity). Test an expired proof (>15 min) → "expired" reason; a mismatched nonce → "Nonce Mismatch".
6. Confirm no legacy screen is reachable and no crash/dangling-nav occurs navigating Back from any new screen.

### Resume signal

Type "approved" if the full enroll→claim→dashboard→view→generate→two-hop-verify flow works on-device, or describe the failures (which step, which screen, observed vs expected).

## Next Phase Readiness

Not applicable — this plan is not complete. Once Task 3 is approved by the user, this SUMMARY should be updated (or superseded) to reflect full plan completion, STATE.md should advance past Plan 5 of 5, and ROADMAP.md's plan-progress for Phase 08 should be updated to complete.

---
*Phase: 08-daily-access-flow*
*Status: PARTIAL — Task 3 pending human verification*

## Self-Check: PASSED

- FOUND: digital-app/screens/VerifyProofScreen.js
- FOUND: digital-app/App.js
- MISSING (expected, deleted by design): digital-app/screens/HomeScreen.js
- MISSING (expected, deleted by design): digital-app/screens/StudentProfileScreen.js
- MISSING (expected, deleted by design): digital-app/screens/IdentityForm.js
- MISSING (expected, deleted by design): digital-app/screens/ShowProof.js
- MISSING (expected, deleted by design): digital-app/screens/VerifyProof.js
- FOUND: commit 8990a28
- FOUND: commit 5cc28f8
