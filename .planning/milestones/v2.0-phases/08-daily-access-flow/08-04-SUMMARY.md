---
phase: 08-daily-access-flow
plan: 04
subsystem: ui
tags: [react-native, expo, zk-proof, selective-disclosure, qrcode, decrypt-pipeline]

# Dependency graph
requires:
  - phase: 08-daily-access-flow
    provides: "GET /api/students/credential/:rollNo/blobs (Plan 08-01)"
  - phase: 08-daily-access-flow
    provides: "unwrapDEK + decryptCredentialBlob on-device crypto utils (Plan 08-02)"
provides:
  - "GenerateProofScreen.js — attribute checklist (consent) + manual nonce field + /generate-proof call + result QR"
  - "REVEAL_KEY_MAP, buildRevealMap, AttributeChecklist — exported for Plan 08-05's Verify-Proof Step 1/Step 2 reuse"
affects: [08-05-verify-proof-and-app-wiring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Checkbox-label-to-circuit-reveal-key mapping centralized in one exported REVEAL_KEY_MAP constant, consumed via buildRevealMap(checkedLabels) -> reveal{} booleans"
    - "Display-only checklist items (no circuit reveal key) represented as an empty array in REVEAL_KEY_MAP, distinguishing UI affordances from circuit-enforced disclosure"

key-files:
  created:
    - digital-app/screens/GenerateProofScreen.js
  modified: []

key-decisions:
  - "Task 1 checkpoint (Q1) resolved as map-a, pre-approved by user before execution: Name->name, Degree Program->programmeLevel, Graduation Year->batch, Full Credential->all 7 circuit keys true. Enrollment Status is NOT a circuit reveal key — it sets no reveal{} boolean and is satisfied out-of-band by the existing /credential-info found&&!revoked check (same mechanism ViewCredentialsScreen already uses for its D-05 Blockchain Status badge)."
  - "AttributeChecklist rendered as a standalone exported function component (not inlined) specifically so Plan 08-05's Verify-Proof Step 1 (challenge-out) can import and reuse it verbatim, per the plan's must_haves key_links requirement."
  - "Result view and form view are two render branches of the same component (no separate screen/route) — consistent with D-11's no-persistence model; result state is purely local React state, discarded on navigation away."

patterns-established:
  - "Pattern: circuit-reveal mapping lives in one named, exported constant (REVEAL_KEY_MAP) rather than inline conditionals scattered through the submit handler — any future checklist UI changes only touch this one table."

requirements-completed: [ACCESS-02]

# Metrics
duration: 12min
completed: 2026-06-19
---

# Phase 8 Plan 04: Generate Proof Screen Summary

**Built the Generate Proof screen — selective-disclosure checklist (the checklist IS consent, D-10) + manual verifier challenge nonce field, wired to the exact unmodified zkp-backend /generate-proof contract (dobInt->dob remap, explicit salts passthrough), rendering the resulting proof as a 220px QR with a 15-minute expiry notice and no persistence.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-06-19T18:35:00Z (approx, prior to file reads)
- **Completed:** 2026-06-19T18:47:00Z
- **Tasks:** 2 (Task 1 checkpoint pre-resolved by user as map-a; Task 2 executed)
- **Files modified:** 1 (created)

## Accomplishments
- `REVEAL_KEY_MAP` implements the Task-1 checkpoint decision (map-a) exactly: `Name->[name]`, `Degree Program->[programmeLevel]`, `Graduation Year->[batch]`, `Full Credential->[all 7 keys]`, `Enrollment Status->[]` (no circuit reveal key — display-gate only, satisfied by the existing `/credential-info` non-revocation check)
- `buildRevealMap(checkedLabels)` and `AttributeChecklist` exported as named exports specifically for Plan 08-05's Verify-Proof Step 1/Step 2 reuse, per the plan's `key_links` requirement
- 44px-minimum-height checklist rows with ☑/☐ glyph + label, `#3b82f6` fill when checked, matching `08-UI-SPEC.md`'s interaction contract exactly
- "Verifier Challenge Code" manual nonce `TextInput` (placeholder "Paste the code from your verifier", `autoCapitalize="none"`, `autoCorrect={false}`) matching the `LoginScreen.js` input style verbatim
- Submit handler performs the full pipeline: fetch blobs (Plan 08-01 endpoint) -> fetch both IPFS objects -> `unwrapDEK` -> `decryptCredentialBlob` (Plan 08-02 utils) -> build exact `/generate-proof` request body
- Request construction follows RESEARCH.md Pattern 4 exactly: `attrs.dob = cred.dobInt` (Pitfall 3 remap), `salts: cred.salts` explicit passthrough (Pitfall 2 — never omitted), `reveal` from `buildRevealMap`, manually-entered `nonce`, `currentDateInt` as `YYYYMMDD`
- Incoming verifier QR request support: `route.params.requestedFields` + `fromVerifierRequest` pre-check matching checklist labels (still editable), with the muted note "Requested by verifier — review before sharing" shown above the checklist
- Result view ("Proof Ready" heading, share-this-QR body copy, 220px QR via `react-native-qrcode-svg` with `backgroundColor="#ffffff"`, info-box "This proof is valid for 15 minutes after generation." in `#eff6ff`/`#1e40af`) renders as a second branch of the same component — no Proof-ID, no URL, no persistence (D-02/D-11)
- Validation: zero attributes checked shows inline "Select at least one attribute to generate a proof." without leaving the form
- Failure path shows "Couldn't generate proof. Check your challenge code and try again." with a "Try Again" button that resets to the form
- No `console.log` anywhere in the file — DEK, private key, and decrypted plaintext credential are never logged (T-08-04/T-08-07)

## Task Commits

1. **Task 1: Decide checkbox-to-reveal-key mapping (Q1)** — Resolved pre-execution by the user as **map-a** (per the orchestrator's checkpoint_resolution instructions). No code change; the decision is implemented directly in Task 2's `REVEAL_KEY_MAP`.
2. **Task 2: GenerateProofScreen — checklist + nonce + /generate-proof + result QR** - `637fc04` (feat)

**Plan metadata:** pending (this commit)

## Files Created/Modified
- `digital-app/screens/GenerateProofScreen.js` - `REVEAL_KEY_MAP` (map-a), `buildRevealMap`, `AttributeChecklist` (all exported), default-exported `GenerateProofScreen` component with the full fetch -> unwrap -> decrypt -> generate-proof -> QR-result flow

## Decisions Made
- Task 1's checkpoint was already resolved by the user (map-a) per explicit orchestrator instruction before this execution began — no re-prompt was issued. The decision is recorded here as the authoritative implementation record: "Enrollment Status" is a UI-only affordance with zero circuit-reveal effect, distinct from the other four checklist items which each map to one or more real `reveal{}` booleans.
- The result view and the input/checklist view are rendered as two conditional branches inside the same default-exported component, rather than a separate route/screen, since there is no persisted Proof-ID to navigate to and D-11 requires no new backend/navigation state — keeps the no-persistence guarantee structurally obvious (result lives in local `useState`, gone on unmount).
- `AttributeChecklist` accepts a generic `note` prop (rather than hardcoding the "Requested by verifier" copy inside the component) so Plan 08-05's Verify-Proof Step 1 can reuse it with its own contextual note text if needed, without forking the component.

## Deviations from Plan

None — plan executed exactly as written. Task 1's checkpoint was resolved by explicit pre-approval (map-a) per the orchestrator's `checkpoint_resolution` instructions, consistent with the plan's own recommended option; Task 2 was implemented per the `<action>` spec verbatim, including the exact request-construction shape, exports, and copy from `08-UI-SPEC.md`.

## Issues Encountered
None.

## User Setup Required
None — no external service configuration required. Live device verification against a running zkp-backend/admin-backend is deferred to Plan 08-05's batched device checkpoint, consistent with `08-03-SUMMARY.md`'s precedent.

## Known Stubs

None. Every value rendered or transmitted is real: the checklist drives a real `reveal{}` map consumed by the live `/generate-proof` request; the result QR encodes the actual `proof`/`publicSignals` returned by that call. No placeholder/mock data path exists in this file.

## Threat Flags

None beyond what the plan's own `<threat_model>` already covers (T-08-10, T-08-11, T-08-12, T-08-SC) — no new network endpoint, auth path, or schema change was introduced; this screen only calls existing, unmodified endpoints (`/credential/:rollNo/blobs`, `/generate-proof`) already covered by Plan 08-01/08-RESEARCH.md's trust-boundary analysis.

## Next Phase Readiness
- `REVEAL_KEY_MAP`, `buildRevealMap`, and `AttributeChecklist` are ready for Plan 08-05's Verify-Proof Step 1 (challenge-out checklist) and Step 2 (prove-back) to import directly.
- `GenerateProofScreen` is implemented and statically verified but not yet reachable in the app — navigation registration (`App.js`) happens in Plan 08-05's single `App.js` pass, per `08-RESEARCH.md`'s recommended project structure and `08-03-SUMMARY.md`'s established precedent of deferring all navigation wiring to that plan.
- Live end-to-end device verification of the full decrypt -> generate-proof -> on-chain `/verify-onchain` success pipeline is part of Plan 08-05's batched device checkpoint (per this plan's own `<verification>` section).

---
*Phase: 08-daily-access-flow*
*Completed: 2026-06-19*

## Self-Check: PASSED

- FOUND: digital-app/screens/GenerateProofScreen.js
- FOUND: .planning/phases/08-daily-access-flow/08-04-SUMMARY.md
- FOUND: commit 637fc04
