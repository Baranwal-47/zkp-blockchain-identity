---
phase: 09-multisig-registry-governance-e5
plan: 02
subsystem: api
tags: [safe-sdk, gnosis-safe, multisig, ethers, mongoose, governance]

# Dependency graph
requires:
  - phase: 09-01
    provides: CredentialRegistry 2-step admin transfer + deploySafe.js (Safe 2-of-3 deployment script that this plan's safeService.js targets via SAFE_ADDRESS)
provides:
  - safeService.js with a generic proposeSafeTransaction(to, data) primitive plus proposeRegistryWrite/confirmSignature/executeTransaction/getPendingTransactions wrappers over @safe-global/protocol-kit + api-kit
  - credentialService.js issueCredentialOnChain/revokeCredentialOnChain redirected from direct ethers.Wallet signing to Safe propose-only calls
  - Student.pendingRegistryAction subdocument ({ safeTxHash, type: 'issue'|'revoke' }) recording the 2-phase propose/execute lifecycle (D-12)
  - studentService.js propose-only handling at all 4 issue/revoke call-sites with DEK persistence preserved
affects: [09-03 (execute-confirmation route, terminal state flip, getPendingTransactions dashboard consumption), 09-04 (signing UI), 09-05 (acceptAdmin handoff script reusing proposeSafeTransaction)]

# Tech tracking
tech-stack:
  added: ["@safe-global/protocol-kit@^7.2.0", "@safe-global/api-kit@^4.2.0", "@safe-global/types-kit@^3.1.0"]
  patterns:
    - "Generic propose primitive (proposeSafeTransaction) with thin domain wrapper (proposeRegistryWrite) delegating to it — single place for Safe.init/createTransaction/apiKit.proposeTransaction logic, reused unmodified by 09-05's acceptAdmin handoff"
    - "Lazy-init singleton for SDK clients that require runtime env config (getApiKit()) — defers construction past module load so import chains never crash the server before env vars are set; throws a clear configuration error on first use instead"
    - "2-phase propose/execute lifecycle: pendingRegistryAction recorded on propose, terminal state (issued/revoked, onChainTxHash/onChainBlock) deferred to a later execute-confirmation step"

key-files:
  created:
    - privdId_admin/backend/services/safeService.js
  modified:
    - privdId_admin/backend/package.json
    - privdId_admin/backend/services/credentialService.js
    - privdId_admin/backend/services/studentService.js
    - privdId_admin/backend/models/Student.js

key-decisions:
  - "SafeApiKit must be lazily constructed (getApiKit()) rather than instantiated at module load, because credentialService.js imports safeService.js at the top level and that import chain is itself imported by studentService.js — an eager throw on missing SAFE_API_KEY would crash the entire backend on boot before any route is reachable."
  - "USE_LOCAL_SIGNERS-gated raw-key signer fallback exists for local Hardhat dev only, hard-disabled when NODE_ENV=production — official Safe owners' keys are MetaMask-relayed, never backend-held (D-01/D-03)."

patterns-established:
  - "Pattern: generic-primitive + thin-domain-wrapper for Safe propose calls — proposeRegistryWrite encodes via ethers.Interface then delegates byte-for-byte to proposeSafeTransaction(to, data); no second propose/sign/api-kit code path exists anywhere in the codebase."
  - "Pattern: lazy-init external SDK client guarded by a clear startup-safe error, used whenever a module is import-chained from server bootstrap but depends on env config that may not be set yet."

requirements-completed: [GOV-02, GOV-03]

# Metrics
duration: ~70min (across context-limit interruption and resume)
completed: 2026-06-21
---

# Phase 09 Plan 02: Safe Multisig Propose/Confirm/Execute Service Summary

**safeService.js wraps @safe-global protocol-kit/api-kit propose-confirm-execute, and credentialService.js's issue/revoke now propose Safe transactions instead of signing registry writes with a stored private key.**

## Performance

- **Duration:** ~70 min (includes a usage-limit interruption mid-Task-3b/cleanup, resumed and completed)
- **Started:** 2026-06-21 (Task 1 checkpoint approval)
- **Completed:** 2026-06-21
- **Tasks:** 4 (Task 1 checkpoint:human-verify, Task 2 auto, Task 3a auto, Task 3b auto) + 1 post-hoc fixup
- **Files modified:** 5 (package.json, safeService.js [new], credentialService.js, studentService.js, models/Student.js)

## Accomplishments
- Built `safeService.js`: a single generic `proposeSafeTransaction(to, data, externalSigner)` primitive (Safe.init -> createTransaction -> getTransactionHash -> signTransaction -> apiKit.proposeTransaction) plus four wrappers (`proposeRegistryWrite`, `confirmSignature`, `executeTransaction`, `getPendingTransactions`) that all funnel through it or `getApiKit()` — no duplicated propose logic.
- Redirected `credentialService.js`'s exported `issueCredentialOnChain`/`revokeCredentialOnChain` off direct `ethers.Wallet` + `registry.issueCredential/revokeCredential` writes and onto `proposeRegistryWrite`; both now return `{ ..., safeTxHash, status: 'pending' }` instead of `{ txHash, blockNumber }`.
- Added `Student.pendingRegistryAction` subdocument (`{ safeTxHash, type: 'issue'|'revoke' }`) and wired all 4 studentService call-sites (createStudent, bulk insert, re-issue, revoke) to record it on propose while deferring terminal `onChainTxHash`/`onChainBlock`/`revoked` state to the execute-confirmation step built in plan 09-03.
- Preserved DEK persistence at every issue site exactly as before (createStudent's `student.dek` assignment, the bulk `Student.updateOne` `dek:` field, and the reused-not-rotated DEK in the re-issue path) — closing the same risk class as the prior live 22BCSD01 null-DEK bug.
- Fixed a lazy-init bug in `getApiKit()` discovered post-resume: `SafeApiKit` requires `apiKey` (else it targets the official `api.safe.global` and throws), and two stray unmigrated `apiKit` references (in `executeTransaction` and `getPendingTransactions`) would have thrown `ReferenceError` at first call — both fixed and verified by a clean module import.

## Task Commits

1. **Task 1: Install Safe SDK packages (legitimacy gate)** - `1123801` (chore)
2. **Task 2: Create safeService.js + redirect credentialService.js** - `a055e53` (feat)
3. **Task 3a: pendingRegistryAction on Student model + issue-path handling** - `d2145e3` (feat)
4. **Task 3b: revoke-path propose-only handling** - `6f216dd` (feat)
5. **Post-resume fixup: lazy-init SafeApiKit boot-crash fix** - `416247e` (fix)

**Plan metadata:** (this commit, after STATE.md/ROADMAP.md update)

## Files Created/Modified
- `privdId_admin/backend/services/safeService.js` - New: generic proposeSafeTransaction primitive + proposeRegistryWrite/confirmSignature/executeTransaction/getPendingTransactions wrappers; lazy-init SafeApiKit client
- `privdId_admin/backend/services/credentialService.js` - issueCredentialOnChain/revokeCredentialOnChain restructured to pin/encode-then-propose via proposeRegistryWrite instead of direct PRIVATE_KEY signing
- `privdId_admin/backend/services/studentService.js` - All 4 issue/revoke call-sites record pendingRegistryAction on propose, terminal state deferred, DEK persistence preserved
- `privdId_admin/backend/models/Student.js` - Added pendingRegistryAction subdocument field
- `privdId_admin/backend/package.json` - Added @safe-global/protocol-kit, @safe-global/api-kit, @safe-global/types-kit

## Decisions Made
- SafeApiKit construction deferred to first use (`getApiKit()`) rather than module load, because the import chain (server.js -> studentService.js -> credentialService.js -> safeService.js) means an eager throw on missing `SAFE_API_KEY` would prevent the backend from booting at all, including for routes unrelated to issue/revoke. Discovered as a Rule 3 blocking-issue fix during the post-resume verification pass, not specified explicitly in the plan's interface notes.
- Kept the USE_LOCAL_SIGNERS raw-key fallback strictly gated to non-production for local Hardhat dev, per D-01/D-03 — no change from plan intent, just confirmed correct at verification time.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Lazy-initialized SafeApiKit to prevent server boot crash**
- **Found during:** Post-resume verification pass (after Task 3b), before Task 4
- **Issue:** `safeService.js` originally instantiated `const apiKit = new SafeApiKit({ chainId })` eagerly at module load. SafeApiKit v4.2.0 requires an `apiKey` (it otherwise targets the official `api.safe.global` Transaction Service) — without `SAFE_API_KEY` set, this would throw on import. Because `credentialService.js` imports `safeService.js` at the top level, and `studentService.js` imports `credentialService.js` at the top level, and `server.js` imports `studentService.js`'s call chain at boot, the eager throw would crash the entire backend before any route became reachable.
- **Fix:** Wrapped construction in a `getApiKit()` function with a `_apiKit` singleton cache, called lazily on first use inside each function (`proposeSafeTransaction`, `confirmSignature`, `executeTransaction`, `getPendingTransactions`). Throws a clear, actionable configuration error (`SAFE_API_KEY is not configured...`) only when a Safe-dependent function is actually invoked, not at import time.
- **Files modified:** privdId_admin/backend/services/safeService.js
- **Verification:** `node --check` clean; dynamic `import()` of safeService.js, credentialService.js, studentService.js, and models/Student.js all succeed with no SAFE_API_KEY/SAFE_ADDRESS set in `.env`; full `node server.js` boot completes and logs "API server running on port 5000" with no errors.
- **Committed in:** `416247e`

**2. [Rule 1 - Bug] Fixed two stray unmigrated `apiKit` references**
- **Found during:** Same pass as above, while reading safeService.js to apply the lazy-init fix
- **Issue:** `executeTransaction` and `getPendingTransactions` still referenced the old eager `apiKit` module-level binding (3 call sites) instead of the new `getApiKit()` accessor — these would have thrown `ReferenceError: apiKit is not defined` the first time either function was actually called, even after the lazy-init fix was applied to the propose/confirm paths.
- **Fix:** Replaced all 3 remaining `apiKit.*` calls with `getApiKit().*`.
- **Files modified:** privdId_admin/backend/services/safeService.js
- **Verification:** `grep -n "apiKit\." services/safeService.js` shows only `getApiKit().` call sites remaining; no bare `apiKit.` references.
- **Committed in:** `416247e`

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug) — both in the same post-resume fixup commit
**Impact on plan:** Both fixes were necessary for the backend to boot at all and for the Safe wrappers to function on first real call. No scope creep — purely correctness fixes to code this plan introduced.

## Issues Encountered
- Execution was interrupted mid-Task-3b/cleanup by a provider usage limit; resumed in a fresh session. Re-verified git state (4 prior commits all present and intact) before proceeding, per continuation_handling protocol — no rework needed, only the in-progress uncommitted safeService.js edit needed finishing.

## User Setup Required

None yet for this plan specifically — `SAFE_ADDRESS`, `SAFE_API_KEY`, `SAFE_CHAIN_ID` env vars are referenced by safeService.js but intentionally not yet set in `.env`. These depend on plan 09-01's `deploySafe.js` having been run against a target network and a Safe Transaction Service API key being obtained (https://developer.safe.global), which is appropriately deferred — the code fails loudly with an actionable error if these functions are called before configuration rather than silently no-op-ing.

## Next Phase Readiness
- `safeService.js`'s `proposeSafeTransaction` generic primitive is ready for 09-05's acceptAdmin-handoff script to reuse directly, as designed.
- `pendingRegistryAction` is recorded at all 4 call-sites; 09-03 can now build the execute-confirmation route (calling `executeTransaction`/`confirmSignature` and flipping terminal `issued`/`revoked` + `onChainTxHash`/`onChainBlock` state) and the `getPendingTransactions`-backed dashboard indicator (09-04).
- No blockers carried forward. `SAFE_ADDRESS`/`SAFE_API_KEY` configuration is a 09-03/09-04 deployment-time concern, not a code blocker.

---
*Phase: 09-multisig-registry-governance-e5*
*Completed: 2026-06-21*

## Self-Check: PASSED

All claimed files found on disk (safeService.js, credentialService.js, studentService.js, models/Student.js, package.json, this SUMMARY.md). All 5 claimed commits (1123801, a055e53, d2145e3, 6f216dd, 416247e) verified present in git log.
