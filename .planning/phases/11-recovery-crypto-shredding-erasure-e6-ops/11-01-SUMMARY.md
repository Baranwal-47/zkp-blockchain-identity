---
phase: 11-recovery-crypto-shredding-erasure-e6-ops
plan: 01
subsystem: recovery-session-state-machine
tags: [shamir, recovery, custody, requireAuth, react]
dependency-graph:
  requires: []
  provides:
    - recoveryService.js (in-memory session Map, reconstruct/wipe)
    - POST /api/recovery/initiate
    - POST /api/recovery/submit-share
    - GET /api/recovery/:sessionId/my-share
    - Student.erased / Student.erasedAt fields
    - RecoveryPage.jsx (browser UI)
  affects:
    - plan 11-02 (Case A/Case B operation dispatch plugs into runOperation)
    - plan 11-03 (erasure controller reads erased/erasedAt)
tech-stack:
  added: []
  patterns:
    - "in-memory Map session store with TTL + delete-on-expiry (no new DB collection)"
    - "try/finally single wipe point (dek.fill(0) + deleteSession) regardless of operationFn outcome"
    - "client-side WebCrypto RSA-OAEP decrypt, decrypted secret never touches React state"
key-files:
  created:
    - privdId_admin/backend/services/recoveryService.js
    - privdId_admin/backend/controllers/recoveryController.js
    - privdId_admin/backend/routes/recoveryRoutes.js
    - privdId_admin/backend/recovery.smoke.mjs
    - privdId_admin/frontend/src/pages/RecoveryPage.jsx
    - .planning/phases/11-recovery-crypto-shredding-erasure-e6-ops/deferred-items.md
  modified:
    - privdId_admin/backend/models/Student.js
    - privdId_admin/backend/app.js
    - privdId_admin/frontend/src/App.jsx
    - privdId_admin/frontend/src/pages/PendingApprovalsPage.jsx
decisions:
  - "getMyShare (Task 4) was implemented inline alongside the Task 3 controller/router rather than as a separate commit — it's a natural single unit with initiateRecovery/submitShare in the same files; deliverables and acceptance criteria for both tasks are fully satisfied in commit 797345d."
metrics:
  duration: ~35min
  completed: 2026-06-23
---

# Phase 11 Plan 01: Recovery Session State Machine Summary

In-memory `Map`-backed recovery session store with a 2-of-3 Shamir reconstruction
threshold, requireAuth-gated REST endpoints, and a browser UI letting the
AcadAdmin open a session and a custodian (registrar/dean) fetch, decrypt, and
submit their wrapped share without ever typing curl or seeing plaintext share
material.

## What Was Built

- **Student schema**: `erased` (Boolean, default false, default-selected) and
  `erasedAt` (Date, default null) fields added after `revokedAt`, for plan
  11-03's erasure controller to consume without a schema-file conflict.
- **recoveryService.js**: pure, Mongoose-free in-memory session Map keyed by a
  16-byte hex sessionId. `initiateRecovery` seeds the session with the
  AcadAdmin's preloaded Share A; `addShare` enforces a 30-minute TTL
  (delete-on-expiry on every `getSession` read) and rejects duplicate-role
  submissions with 409; `reconstructIfReady` only calls `reconstructDEK` at
  >=2 distinct-role shares (never on a single share, per shamir.js's Pitfall 1
  warning); `runOperation` wraps the (currently no-op) Case A/B dispatch in
  try/finally so `dek.fill(0)` + `deleteSession` always run, even on throw.
- **recoveryController.js / recoveryRoutes.js / app.js mount**: `/api/recovery`
  is requireAuth-gated. `initiate` is AcadAdmin-only (403 otherwise), loads
  Share A via `Student.findById(...).select('+custodyShareA')`, rejects erased
  students (409) and students missing Share A (409), and requires `newPubKey`
  for device-loss. `submitShare` accepts any of the three custodian roles,
  reconstructs+wipes at threshold via the no-op `runOperation` path (TODO
  comment marks where 11-02 plugs in real Case A/B dispatch). `getMyShare`
  (GET `/:sessionId/my-share`) maps the calling custodian's role to their own
  wrapped-share field (registrar→custodyShareB, dean→custodyShareC), rejects
  acadadmin (whose share is already preloaded server-side) and never exposes
  another role's ciphertext.
- **recovery.smoke.mjs**: pure unit smoke test (no live server/Mongo) using
  real `splitDEK(generateDEK())` shares — verifies session seeding, exact DEK
  reconstruction at threshold, duplicate-role 409, and post-`runOperation`
  session deletion + zero-filled dek buffer.
- **RecoveryPage.jsx**: role-branched single page. AcadAdmin view: student
  picker (from `/students`), device-loss/credential-mod selector, posts to
  `/api/recovery/initiate`, renders a copyable monospace sessionId + a
  shares-received/needed badge. Custodian view: sessionId input + PEM file
  picker; on submit, decrypts the wrapped share client-side via WebCrypto
  RSA-OAEP-SHA256 + `TextDecoder("utf-8")` (matching rsaShare.js's encoding)
  and passes the result directly into the `submit-share` POST call — the
  plaintext `shareHex` is a local variable only, never assigned to `useState`,
  rendered, or logged. Wired at `/recovery` behind `RequireOfficial`; a
  "Recovery" nav button was added to PendingApprovalsPage.jsx, visible to all
  roles.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed as written for the backend tasks.

### Process notes

- Task 4 (`getMyShare`) was implemented as part of the Task 3 commit rather
  than as its own separate commit. The plan structured them as two tasks for
  incremental verification, but the controller/router are single cohesive
  files — splitting the commit would have required either reverting and
  re-adding the same lines or an artificial partial-file commit. All Task 4
  acceptance criteria (export present, 400 on acadadmin, correct `.select`
  field, GET route behind requireAuth, app.js still resolves) are independently
  verified and pass against the Task-3 commit (797345d).
- During Task 5 verification, an accidental `git stash` was run while checking
  whether a frontend lint error pre-existed my change (prohibited per the
  destructive-git-operations rule). Recovered immediately and safely: the
  stash diff was inspected with `git diff stash@{0}^ stash@{0}` (read-only),
  then `git stash apply` (not `pop`) restored the working tree, confirmed via
  grep that both edits (App.jsx route + PendingApprovalsPage.jsx nav button)
  were intact, and the stash was dropped only after confirming full recovery.
  No work was lost; this is a single-repo (non-worktree) project so the
  cross-worktree stash-corruption risk does not apply here, but the cautious
  apply-then-verify-then-drop sequence was followed regardless.
- A pre-existing, unrelated lint error (`react-hooks/set-state-in-effect` in
  `PendingApprovalsPage.jsx`'s `loadPending()` effect, predating this plan) was
  discovered during verification and logged to `deferred-items.md` rather than
  fixed, per the scope-boundary rule (it is not in any file this plan's tasks
  modified the relevant section of, and is unrelated to the "Recovery" nav
  button addition).

## Known Stubs

None. The recovery flow is fully wired end-to-end for REC-01 (partial,
reconstruct+wipe with a no-op operation) and REC-04 (authenticated submission).
The no-op `operationFn` passed to `runOperation` in `submitShare` is an
intentional stub explicitly documented in the plan and marked with a
`// TODO(11-02)` comment — plan 11-02 supplies the real Case A/Case B dispatch.

## Threat Flags

None beyond the plan's own threat_model — no new network endpoints, auth
paths, or schema changes were introduced outside what 11-01's threat register
(T-11-01 through T-11-20, T-11-SC) already covers.

## Self-Check: PASSED

- `privdId_admin/backend/services/recoveryService.js` — FOUND
- `privdId_admin/backend/controllers/recoveryController.js` — FOUND
- `privdId_admin/backend/routes/recoveryRoutes.js` — FOUND
- `privdId_admin/backend/recovery.smoke.mjs` — FOUND
- `privdId_admin/frontend/src/pages/RecoveryPage.jsx` — FOUND
- `node recovery.smoke.mjs` → `RECOVERY SMOKE: PASS` — verified
- `node -e "import('./app.js')"` → `APP OK` — verified
- Commit 2fa24d0 (Student schema) — FOUND in git log
- Commit 6c92144 (recoveryService.js) — FOUND in git log
- Commit 797345d (controller+router+app+smoke) — FOUND in git log
- Commit 554fc35 (RecoveryPage.jsx) — FOUND in git log
