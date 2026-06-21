---
phase: 09-multisig-registry-governance-e5
plan: 04
subsystem: frontend
tags: [react, ethers, metamask, gnosis-safe, multisig, role-auth, vite]

# Dependency graph
requires:
  - phase: 09-03
    provides: "POST /api/admin/role-login, requireAuth middleware, GET/POST /api/safe/{pending,sign,execute}"
provides:
  - "RoleLoginPage.jsx — per-role official sign-in (acadadmin/registrar/dean), stores token under officialToken"
  - "api.js dual-token interceptor — branches by config.url so officialToken and adminToken never collide"
  - "PendingApprovalsPage.jsx — MetaMask BrowserProvider connect, owner-address match check, polled /safe/pending list, Sign/Execute actions"
  - "PendingTxCard.jsx — per-tx signature-progress pill + separate blue Sign / red Execute buttons"
  - "DashboardPage.jsx read-only Pending Registry Actions card — status text + link only, no inline signing"
affects: [09-05 (live Sepolia verification will exercise this UI end-to-end against a real Safe)]

# Tech tracking
tech-stack:
  added:
    - "ethers ^6.16.0 in privdId_admin/frontend (was missing; pinned to match the major version already used across backend/zkp-backend/zk-proofs/digital-app)"
  patterns:
    - "api.js request interceptor branches by config.url (officialToken for /safe + /admin/role-login, adminToken otherwise, with cross-fallback) instead of introducing a second axios instance"
    - "Role decoded client-side from the officialToken JWT payload (base64 decode of the middle segment) rather than a second backend round-trip, to drive the 'Signing as: {Role}' banner"
    - "MetaMask connect is plain ethers v6 BrowserProvider + eth_requestAccounts, no wagmi/web3modal, matching the project's existing ethers-only convention"

key-files:
  created:
    - privdId_admin/frontend/src/pages/RoleLoginPage.jsx
    - privdId_admin/frontend/src/pages/PendingApprovalsPage.jsx
    - privdId_admin/frontend/src/components/PendingTxCard.jsx
  modified:
    - privdId_admin/frontend/src/services/api.js
    - privdId_admin/frontend/src/App.jsx
    - privdId_admin/frontend/src/index.css
    - privdId_admin/frontend/src/pages/DashboardPage.jsx
    - privdId_admin/frontend/package.json
    - privdId_admin/frontend/package-lock.json

key-decisions:
  - "Sign uses an explicit bg-blue-600 class (not .primary-button) because .primary-button in this codebase is actually bg-zinc-200/text-zinc-950 (light/zinc), not blue, despite the UI-SPEC's color table describing it as the blue accent — the UI-SPEC's hard requirement (Sign=accent blue #3b82f6, Execute=destructive red, never sharing a color) takes precedence over the literal class name, so Sign borrows LoginPage.jsx's existing bg-blue-600 button styling instead."
  - "ethers v6 was not yet a frontend dependency (only present in backend/zkp-backend/zk-proofs/digital-app) — installed ^6.16.0 to match the version ceiling already used elsewhere in the monorepo, verified as a legitimate, already-vetted package before installing (not a new/unknown dependency)."
  - "Role-login JWT decoded client-side (base64 of the payload segment) to derive the 'Signing as: {Role}' banner text, avoiding a second backend call just to learn which role is logged in."

requirements-completed: [GOV-02, GOV-03]

# Metrics
duration: ~20min
completed: 2026-06-21
---

# Phase 09 Plan 04: Per-Role Login, Pending Approvals UI, Dashboard Indicator Summary

**Builds the web-only admin UI for Gnosis Safe 2-of-3 governance: per-role official sign-in, a MetaMask-driven Pending Approvals screen with owner-address validation and separate Sign/Execute actions, and a read-only Dashboard pending-status card — closing the user-facing half of GOV-02/GOV-03.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-06-21
- **Completed:** 2026-06-21
- **Tasks:** 3 (all type="auto", autonomous)
- **Files modified:** 9 (3 created, 6 modified)

## Accomplishments
- Fixed the flagged token-collision conflict (T-09-14): `api.js`'s single request interceptor now branches on `config.url` — requests to `/safe/*` or `/admin/role-login` read `officialToken`, everything else reads `adminToken` (each falls back to the other if its primary key is absent), so the new role-login auth never silently overwrites or is overwritten by the existing single-admin auth.
- `RoleLoginPage.jsx`: 3-button role selector (Academic Admin / Assistant Registrar / Dean) above a password field, heading "Official sign-in", CTA "Continue" (44px min touch target), inline "Select your role first." validation (not a toast), `POST /admin/role-login`, stores the token under `officialToken`, navigates to `/pending-approvals`.
- `App.jsx`: added `RequireOfficialAuth` (checks `officialToken`), registered `/official-login` (outside any auth wrapper, mirroring `/login`) and `/pending-approvals` (gated by the new guard).
- `PendingApprovalsPage.jsx`: persistent "Signing as: {Role}" banner (role decoded client-side from the `officialToken` JWT); MetaMask connect via `ethers.BrowserProvider(window.ethereum)` + `eth_requestAccounts`; case-insensitive comparison of the connected address against `VITE_SAFE_OWNER_{ROLE}` env vars, rendering the exact destructive mismatch banner and blocking signing on mismatch (T-09-15); polls `GET /safe/pending` every 10s; empty state "No pending approvals." + explanatory body; Sign posts to `/safe/sign` with a MetaMask-produced signature, Execute is gated behind `window.confirm` with the exact UI-SPEC copy and never auto-fires from the sign path (T-09-16).
- `PendingTxCard.jsx`: per-tx card with amber "Awaiting N more signature(s)" / emerald "Ready to execute — 2 of 2 signed" pill, a blue Sign button (replaced by static emerald "Signed" text once this official has signed) and a red `.destructive-button` Execute button (44px min height, disabled until `signedCount >= threshold`).
- `index.css`: added the one new utility class the plan allows — `.destructive-button` (`bg-red-600 hover:bg-red-500`), mirroring `.primary-button`'s shape exactly.
- `DashboardPage.jsx`: added a read-only "Pending Registry Actions" `.panel-soft` card fetching `GET /safe/pending` in a sibling `useEffect`; renders the exact per-item line `"{Issue/Revoke} requested for {rollNo}, awaiting {N} more signature{s}"`, "No pending registry actions." empty state, and a `<Link>` to `/pending-approvals` labeled "View and sign in Pending Approvals." — no Sign/Execute controls present (D-07 boundary).
- Installed `ethers ^6.16.0` into `privdId_admin/frontend` (previously missing from this one service despite being present in 4 other services in the monorepo at the same major version) to support the BrowserProvider wallet-connect flow.

## Task Commits

1. **Task 1: api.js dual-token interceptor + RoleLoginPage + App.jsx routing** - `6bd6e2c` (feat)
2. **Task 2: PendingApprovalsPage + PendingTxCard + MetaMask + .destructive-button** - `9c1f400` (feat)
3. **Task 3: Dashboard read-only Pending Registry Actions card** - `b525005` (feat)

## Files Created/Modified
- `privdId_admin/frontend/src/services/api.js` - Dual-token request interceptor (officialToken vs adminToken, branched by route)
- `privdId_admin/frontend/src/pages/RoleLoginPage.jsx` - New: per-role official sign-in
- `privdId_admin/frontend/src/App.jsx` - New `RequireOfficialAuth` guard, `/official-login` + `/pending-approvals` routes
- `privdId_admin/frontend/src/pages/PendingApprovalsPage.jsx` - New: MetaMask connect, owner-match check, pending-tx list, Sign/Execute
- `privdId_admin/frontend/src/components/PendingTxCard.jsx` - New: per-tx card with signature progress + Sign/Execute
- `privdId_admin/frontend/src/index.css` - New `.destructive-button` utility class
- `privdId_admin/frontend/src/pages/DashboardPage.jsx` - Read-only "Pending Registry Actions" card
- `privdId_admin/frontend/package.json` / `package-lock.json` - Added `ethers ^6.16.0`

## Decisions Made
- Sign button uses explicit `bg-blue-600`/`hover:bg-blue-500` Tailwind classes rather than the literal `.primary-button` class, because `.primary-button` in this codebase's `index.css` is `bg-zinc-200`/`text-zinc-950` (light/zinc), not blue — the UI-SPEC's hard color-separation requirement (Sign=accent blue, Execute=destructive red, must never share a color) takes precedence over the class-name-level instruction in the plan's acceptance criteria. `LoginPage.jsx`'s own submit button already uses this same `bg-blue-600` pattern, so this stays consistent with existing shipped code.
- `ethers` was confirmed as an already-vetted, legitimate dependency before installing — it is present at `^6.x` in `zk-proofs`, `privdId_admin/backend`, `zkp-backend`, and `digital-app` package.json files; installing `^6.16.0` into the frontend only fills a gap in this one service, it is not a new/unverified package.
- Role label for the "Signing as: {Role}" banner is derived by base64-decoding the `officialToken` JWT payload client-side (`role` claim, same claim `roleLogin` signs server-side per 09-03), avoiding an extra backend round-trip.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] `ethers` package missing from frontend, required by App.jsx's import chain**
- **Found during:** Task 1 verification (vite build failed: PendingApprovalsPage import unresolved, and once created, `ethers` was an unresolved import)
- **Issue:** The UI-SPEC and plan both specify `ethers` v6 `BrowserProvider` for MetaMask connection, but `privdId_admin/frontend/package.json` had no `ethers` dependency.
- **Fix:** Verified `ethers ^6.x` is already used at the same major version in `zk-proofs`, `privdId_admin/backend`, `zkp-backend`, and `digital-app` (4 other services in the monorepo) before installing — confirming legitimacy per the package-install safety check — then ran `npm install ethers@^6.16.0` in `privdId_admin/frontend`.
- **Files modified:** `privdId_admin/frontend/package.json`, `privdId_admin/frontend/package-lock.json`
- **Verification:** `npx vite build` succeeds with no unresolved-import errors.
- **Committed in:** `9c1f400`

**2. [Rule 1 - Color-spec adherence] Sign button uses explicit blue classes instead of `.primary-button`**
- **Found during:** Task 2, while building PendingTxCard.jsx
- **Issue:** The plan's action text says "a Sign button (.primary-button blue)" but `.primary-button` in the live `index.css` is zinc/light-colored, not blue — following the literal class name would violate the UI-SPEC's explicit Sign=blue/Execute=red, never-share-a-color requirement.
- **Fix:** Used inline Tailwind classes matching `bg-blue-600 hover:bg-blue-500` (the same blue already used by `LoginPage.jsx`'s submit button and the UI-SPEC's `#3b82f6` accent token) instead of `.primary-button`.
- **Files modified:** `privdId_admin/frontend/src/components/PendingTxCard.jsx`, `privdId_admin/frontend/src/pages/PendingApprovalsPage.jsx` (Connect Wallet button, same treatment)
- **Verification:** Sign button and Connect Wallet button render blue; Execute button renders red via `.destructive-button`; the two never share a class.
- **Committed in:** `9c1f400`

---

**Total deviations:** 2 auto-fixed (1 Rule 3 blocking dependency install, verified legitimate before installing; 1 Rule 1 adherence to the UI-SPEC's color contract over a literal class-name instruction)
**Impact on plan:** None on scope — both fixes were necessary to satisfy the plan's own acceptance criteria (build success, color separation) and introduced no new colors/sizes/spacing beyond what the UI-SPEC already allows.

## Issues Encountered
None beyond the two deviations above.

## Known Stubs
None — all UI surfaces are wired to real `/api/safe/*` and `/api/admin/role-login` endpoints from 09-03; no hardcoded/mock data paths.

## User Setup Required

Per the plan's `user_setup` frontmatter (empty) — no new operator action required by this plan specifically. However, this UI depends on the following env vars being set for the owner-address match check (D-09) to function at runtime, carried forward from 09-03's `user_setup`:
- `VITE_SAFE_OWNER_ACADADMIN`, `VITE_SAFE_OWNER_REGISTRAR`, `VITE_SAFE_OWNER_DEAN` (frontend `.env`) — must match the corresponding `SAFE_OWNER_*` addresses configured in the backend `.env` (09-03's `user_setup`). Until set, `PendingApprovalsPage.jsx` will treat every connected wallet as a mismatch (since `expectedOwner` will be `undefined` and the comparison will not match), which is the safe failure mode (blocks signing rather than allowing it).

None of these block further code work — they are deployment-time configuration the operator sets when standing up a real environment (09-05).

## Next Phase Readiness
- Plan 09-05's live Sepolia verification can now exercise the full UI flow end-to-end: official role-login → MetaMask connect → owner-address match → Sign → Execute, against a real deployed Safe, once `SAFE_ADDRESS`/`SAFE_OWNER_*`/`VITE_SAFE_OWNER_*` are configured for the live environment.
- No blockers carried forward.

---
*Phase: 09-multisig-registry-governance-e5*
*Completed: 2026-06-21*

## Self-Check: PASSED

All claimed files found on disk:
- privdId_admin/frontend/src/pages/RoleLoginPage.jsx — FOUND
- privdId_admin/frontend/src/pages/PendingApprovalsPage.jsx — FOUND
- privdId_admin/frontend/src/components/PendingTxCard.jsx — FOUND
- privdId_admin/frontend/src/services/api.js — FOUND
- privdId_admin/frontend/src/App.jsx — FOUND
- privdId_admin/frontend/src/index.css — FOUND
- privdId_admin/frontend/src/pages/DashboardPage.jsx — FOUND

All 3 claimed commits (6bd6e2c, 9c1f400, b525005) verified present in `git log --oneline --all`.

`npx vite build` passed with no errors after all changes (final build re-run during Task 3 verification).
