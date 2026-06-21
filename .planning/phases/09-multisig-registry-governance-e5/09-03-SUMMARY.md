---
phase: 09-multisig-registry-governance-e5
plan: 03
subsystem: api
tags: [jwt, auth-middleware, gnosis-safe, multisig, express, mongoose]

# Dependency graph
requires:
  - phase: 09-02
    provides: safeService.js (getPendingTransactions/confirmSignature/executeTransaction), Student.pendingRegistryAction subdocument
provides:
  - "POST /api/admin/role-login — per-role official login (acadadmin/registrar/dean) issuing a role-scoped JWT"
  - "requireAuth middleware — stateless Bearer JWT verification against JWT_SECRET"
  - "GET /api/safe/pending, POST /api/safe/sign, POST /api/safe/execute — requireAuth-gated control surface over safeService"
  - "executePendingTx — closes the D-12 lifecycle by flipping a Student from pendingRegistryAction into terminal issued/revoked state on successful execute"
  - ".env.example documenting all Phase 9 env vars"
affects: [09-04 (Pending Approvals UI consumes /api/safe/* + /api/admin/role-login), 09-05 (live Sepolia verification checks the D-12 terminal-state flip)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-role login is a parameterized clone of the existing single-admin login (role -> env-key map), not a new auth subsystem — same jwt.sign/JWT_SECRET shape"
    - "requireAuth is a router-level guard (router.use(requireAuth)) applied to exactly one route file (safeRoutes.js), not retrofitted onto existing open routes"
    - "Execute is the sole state-transition trigger: pendingRegistryAction is only ever cleared inside executePendingTx, after safeService.executeTransaction resolves"

key-files:
  created:
    - privdId_admin/backend/middleware/requireAuth.js
    - privdId_admin/backend/controllers/safeController.js
    - privdId_admin/backend/routes/safeRoutes.js
    - privdId_admin/backend/.env.example
  modified:
    - privdId_admin/backend/controllers/adminController.js
    - privdId_admin/backend/routes/adminRoutes.js
    - privdId_admin/backend/app.js
    - .gitignore

key-decisions:
  - "Carved a narrow .gitignore exception (!.env.example, !**/.env.example) inside the blanket .env.* secret-exclusion rule — the project had no .env.example anywhere and the existing pattern would have silently dropped this safe-to-track placeholder template."
  - "executePendingTx tolerates a no-match Student lookup silently (e.g. a future acceptAdmin handoff tx from 09-05) rather than throwing, since not every executed Safe tx maps to a Student record."

requirements-completed: [GOV-03, GOV-04]

# Metrics
duration: ~25min
completed: 2026-06-21
---

# Phase 09 Plan 03: Role Login, requireAuth Middleware, and /api/safe Routes Summary

**Adds per-role official login (D-09) and a JWT requireAuth guard gating new `/api/safe/{pending,sign,execute}` routes, with `executePendingTx` closing the D-12 propose→execute lifecycle by flipping a Student's `pendingRegistryAction` into terminal `issued`/`revoked` state.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-06-21
- **Completed:** 2026-06-21
- **Tasks:** 4 (all type="auto", autonomous)
- **Files modified:** 8 (4 created, 3 modified, 1 modified .gitignore deviation)

## Accomplishments
- Added `roleLogin` to `adminController.js`: parameterized clone of the existing `adminLogin`, mapping `acadadmin`/`registrar`/`dean` to their respective env-password keys, issuing a role-scoped JWT. Registered at `POST /api/admin/role-login`.
- Created `middleware/requireAuth.js`: stateless `Authorization: Bearer <jwt>` verification against the same `JWT_SECRET` (with the same `"privid-admin-secret"` fallback) that `adminLogin`/`roleLogin` sign with — no bcrypt, no session store.
- Created `controllers/safeController.js` exposing `getPendingApprovals`, `signPendingTx`, `executePendingTx` over `safeService.js`, with `safeTxHash`/`signerAddress` validated as well-formed hex (regex) before reaching the Safe SDK layer.
- `executePendingTx` completes the D-12 lifecycle: after a successful `safeService.executeTransaction`, it looks up the Student by `pendingRegistryAction.safeTxHash`, and on `type: 'issue'` sets `onChainTxHash`/`onChainBlock`, or on `type: 'revoke'` sets `revoked`/`revokedAt`, clearing `pendingRegistryAction` either way and tolerating a no-match (non-student Safe tx) silently.
- Created `routes/safeRoutes.js` with `router.use(requireAuth)` applied before all three route definitions, mounted at `/api/safe` in `app.js` directly after the `/api/admin` mount and before `notFound`/`errorHandler`. `/api/admin` and `/api/students` deliberately left unguarded (HARD-01 deferred, per plan scope).
- Created `.env.example` (did not exist in the repo before this plan) documenting all 8 new Phase 9 keys plus `JWT_SECRET` and the pre-existing app vars discovered via a full `process.env.*` grep across the backend.

## Task Commits

1. **Task 1: Add roleLogin to adminController + /role-login route** - `8754e5e` (feat)
2. **Task 2: Create requireAuth JWT middleware** - `31b97ff` (feat)
3. **Task 3: safeController.js + safeRoutes.js + app.js mount** - `ce765b8` (feat)
4. **Task 4: Document new env vars in .env.example** - `0eabee8` (docs, includes .gitignore fix)

## Files Created/Modified
- `privdId_admin/backend/controllers/adminController.js` - Added `roleLogin` export (per-role login, D-09)
- `privdId_admin/backend/routes/adminRoutes.js` - Registered `POST /role-login`
- `privdId_admin/backend/middleware/requireAuth.js` - New: Bearer JWT verification middleware
- `privdId_admin/backend/controllers/safeController.js` - New: `getPendingApprovals`/`signPendingTx`/`executePendingTx`, the latter closing D-12
- `privdId_admin/backend/routes/safeRoutes.js` - New: `/pending`, `/sign`, `/execute`, all `requireAuth`-gated
- `privdId_admin/backend/app.js` - Mounted `/api/safe` before `notFound`/`errorHandler`
- `privdId_admin/backend/.env.example` - New: all Phase 9 + pre-existing env vars, placeholders only
- `.gitignore` - Added `!.env.example` / `!**/.env.example` exceptions to the blanket `.env.*` secret rule

## Decisions Made
- `.env.example` did not exist anywhere in the repo prior to this plan; built it from a full `process.env.*` grep across `privdId_admin/backend` (excluding node_modules/tooling noise) rather than guessing keys, to keep existing example keys "preserved" in spirit even though no prior file existed.
- `.gitignore`'s `.env.*` pattern was silently swallowing the new `.env.example` file (a Rule 1 bug relative to this task's required output, not a pre-existing unrelated issue) — fixed with a narrow negation pattern scoped only to `.env.example` filenames, not loosening the secret-exclusion rule for any other `.env.*` variant.
- Kept `executePendingTx`'s non-student-match branch silent (no error) rather than throwing, anticipating 09-05's `acceptAdmin` handoff transaction which also flows through the same Safe execute path but has no corresponding `Student` document.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `.gitignore`'s blanket `.env.*` pattern excluded the new `.env.example`**
- **Found during:** Task 4, immediately after `git add`
- **Issue:** `git add privdId_admin/backend/.env.example` failed with "ignored by .gitignore" — the repo's `.env.*` secret-exclusion glob (intended to stop real `.env` files from being committed) also matches the literal filename `.env.example`, which is a safe-to-track placeholder template required as this task's primary deliverable.
- **Fix:** Added `!.env.example` and `!**/.env.example` negation patterns directly below the `.env.*` line in `.gitignore`, narrowly re-including only files named exactly `.env.example` anywhere in the tree, without loosening protection for any other `.env.*` variant (e.g. `.env.local`, `.env.production` remain ignored).
- **Files modified:** `.gitignore`
- **Verification:** `git check-ignore -v privdId_admin/backend/.env.example` now returns nothing (not ignored) and reports the `!**/.env.example` rule as the matching (re-include) rule when queried with `-v`.
- **Committed in:** `0eabee8`

---

**Total deviations:** 1 auto-fixed (Rule 1 bug, blocking the task's required output file)
**Impact on plan:** None on scope — the fix only unblocks committing the plan's own deliverable file; no other `.gitignore` behavior changed.

## Issues Encountered
None beyond the `.gitignore` deviation above.

## User Setup Required

Per the plan's `user_setup` frontmatter, the following are operator-configured values for `.env` (NOT committed — `.env.example` only documents placeholders):
- `ACADADMIN_PASSWORD`, `REGISTRAR_PASSWORD`, `DEAN_PASSWORD` — operator-chosen passwords for the three role logins.
- `SAFE_ADDRESS` — output of `deploySafe.js` (09-01 local / 09-05 Sepolia).
- `SAFE_OWNER_ACADADMIN`, `SAFE_OWNER_REGISTRAR`, `SAFE_OWNER_DEAN` — addresses of each official's Safe owner keypair (used client-side in plan 09-04's owner-address match check, not enforced server-side in this plan).

None of these block further code work — they are deployment-time configuration the operator will set when standing up a real environment (09-05).

## Next Phase Readiness
- Plan 09-04 (Pending Approvals UI) can now call `POST /api/admin/role-login`, and `GET/POST /api/safe/{pending,sign,execute}` with a `Bearer` token from that login.
- Plan 09-05's live Sepolia verification can exercise `executePendingTx`'s D-12 terminal-state flip end-to-end once `SAFE_ADDRESS`/`SAFE_API_KEY` are configured against a real Safe and `deploySafe.js` has run.
- No blockers carried forward.

---
*Phase: 09-multisig-registry-governance-e5*
*Completed: 2026-06-21*

## Self-Check: PASSED

All claimed files found on disk:
- privdId_admin/backend/middleware/requireAuth.js — FOUND
- privdId_admin/backend/controllers/safeController.js — FOUND
- privdId_admin/backend/routes/safeRoutes.js — FOUND
- privdId_admin/backend/.env.example — FOUND
- privdId_admin/backend/controllers/adminController.js (roleLogin) — FOUND
- privdId_admin/backend/routes/adminRoutes.js (/role-login) — FOUND
- privdId_admin/backend/app.js (/api/safe mount) — FOUND

All 4 claimed commits (8754e5e, 31b97ff, ce765b8, 0eabee8) verified present in `git log --oneline -5`.

`node -e "import('./app.js')"` boot-import check passed with no errors after all changes.
