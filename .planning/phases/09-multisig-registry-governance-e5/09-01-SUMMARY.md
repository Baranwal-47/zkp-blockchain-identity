---
phase: 09-multisig-registry-governance-e5
plan: 01
subsystem: infra
tags: [solidity, hardhat, gnosis-safe, protocol-kit, access-control]

# Dependency graph
requires: []
provides:
  - "CredentialRegistry.sol 2-step admin transfer (pendingAdmin/transferAdmin/acceptAdmin + events)"
  - "Hardhat test coverage for admin-transfer access control and post-handoff onlyAdmin gating"
  - "deploySafe.js script (authored, not yet exercised — depends on protocol-kit install in 09-02)"
affects: [09-02, 09-03, 09-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "2-step ownership transfer (Ownable2Step-style) added directly to existing admin/onlyAdmin var instead of importing OpenZeppelin"
    - "CJS Hardhat scripts use dynamic `await import(...)` to consume ESM-only npm packages (protocol-kit v7)"

key-files:
  created:
    - zk-proofs/scripts/deploySafe.js
  modified:
    - zk-proofs/contracts/CredentialRegistry.sol
    - zk-proofs/test/Registry.js

key-decisions:
  - "Hand-wrote transferAdmin/acceptAdmin against the existing admin var rather than importing OZ Ownable2Step, keeping the diff to 2 functions + 1 storage var + 2 events"
  - "deploySafe.js authored now per plan's explicit allowance, even though @safe-global/protocol-kit isn't installed until plan 09-02 — script will fail on import until then, documented in its header comment"

patterns-established:
  - "AdminTransferStarted/AdminTransferred events mirror existing CredentialIssued/CredentialRevoked indexed-param style"

requirements-completed: [GOV-01, GOV-04]

# Metrics
duration: 15min
completed: 2026-06-21
---

# Phase 09 Plan 01: Registry 2-Step Admin Transfer + Local Safe Deploy Script Summary

**Added `pendingAdmin`/`transferAdmin`/`acceptAdmin` to `CredentialRegistry.sol` (6-line diff, zero changes to issue/revoke/constructor/onlyAdmin) plus a Hardhat-deterministic-account-based `deploySafe.js` for local 2-of-3 Safe deployment and registry handoff.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 3 completed
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- `CredentialRegistry.sol` now supports a typo-proof 2-step admin handoff: `transferAdmin(newAdmin)` (onlyAdmin-gated) sets `pendingAdmin`; `acceptAdmin()` requires `msg.sender == pendingAdmin` to complete the swap
- 6 new Hardhat tests cover the full access-control surface: deployer-is-admin, transfer sets pendingAdmin without changing admin, non-admin transfer reverts, non-pendingAdmin accept reverts, accept flips/zeroes correctly, and — critically — the old admin's `issueCredential` reverts post-handoff while the new admin succeeds
- `deploySafe.js` authored: CJS Hardhat script using protocol-kit v7's `Safe.init({ predictedSafe })` + `createSafeDeploymentTransaction()` API, 3 Hardhat deterministic accounts as owners/threshold 2, deployer EOA kept separate from owners, calls `registry.transferAdmin(safeAddress)`, zero api-kit/EthersAdapter usage

## Task Commits

Each task was committed atomically:

1. **Task 1: Add 2-step admin transfer to CredentialRegistry.sol** - `63c0500` (feat)
2. **Task 2: Hardhat tests for 2-step transfer and onlyAdmin gating** - `2deb04d` (test)
3. **Task 3: deploySafe.js — local Safe 2-of-3 deploy + registry admin handoff** - `460bdd8` (feat)

## Files Created/Modified
- `zk-proofs/contracts/CredentialRegistry.sol` - Added `pendingAdmin` storage var, `transferAdmin`/`acceptAdmin` functions, `AdminTransferStarted`/`AdminTransferred` events
- `zk-proofs/test/Registry.js` - Added "Admin transfer" describe block (6 tests) covering 2-step transfer access control and post-handoff onlyAdmin gating
- `zk-proofs/scripts/deploySafe.js` (new) - CJS script deploying a 3-owner/threshold-2 Safe via protocol-kit and calling `registry.transferAdmin(safeAddress)`

## Decisions Made
- Followed RESEARCH.md/PATTERNS.md verbatim for the contract addition — hand-rolled 2-function diff instead of importing OpenZeppelin `Ownable2Step` (smaller diff, doesn't rename `admin`→`owner()`, no constructor change)
- `deploySafe.js` was authored in this plan per its explicit task description even though its runtime dependency (`@safe-global/protocol-kit`) installs in plan 09-02 — confirmed via `ls zk-proofs/node_modules/@safe-global` that the package is genuinely absent right now, so the script cannot be executed yet; this is expected per the plan, not a defect, and is documented in the script's header comment

## Deviations from Plan

None - plan executed exactly as written. Task 1's contract code and Task 2's test code match the exact patterns specified in `09-PATTERNS.md` and the plan's `<action>` blocks.

## TDD Gate Compliance

Task 1 was marked `tdd="true"` but the plan structured it as a standalone contract-addition task, with the full test suite arriving as a separate Task 2. The commit order is therefore `feat` (63c0500) before `test` (2deb04d) — RED did not precede GREEN as a strict TDD cycle would require. This matches the plan's literal task sequencing (Task 1: contract, Task 2: tests) and both tasks' acceptance criteria were independently satisfied and verified (compile clean, 9/9 tests green), but it does not satisfy the strict RED→GREEN gate ordering defined in the TDD execution flow. Flagging here per the TDD Gate Compliance requirement rather than silently passing.

## Issues Encountered

None. `npx hardhat compile` succeeded on first attempt after the contract edit; all 9 Hardhat tests (3 pre-existing gas-cost tests + 6 new admin-transfer tests) passed on first run with no debugging needed.

## User Setup Required

None - no external service configuration required. `deploySafe.js` requires `@safe-global/protocol-kit` to be installed (plan 09-02) before it can be executed; that is a planned future step, not a setup gap in this plan.

## Next Phase Readiness

- `CredentialRegistry.sol`'s 2-step transfer is compiled, tested, and ready for plan 09-02's `safeService.js` backend work and plan 09-05's Sepolia deployment
- `deploySafe.js` is authored and statically verified (syntax, predictedSafe/threshold/transferAdmin presence, absence of api-kit/EthersAdapter) but NOT yet runtime-exercised — first real exercise requires plan 09-02's `npm install @safe-global/protocol-kit @safe-global/api-kit @safe-global/types-kit` in `zk-proofs` (the install task targets `privdId_admin/backend` per RESEARCH.md, but `zk-proofs/scripts/deploySafe.js` also needs `protocol-kit` in `zk-proofs/node_modules` — flag this for plan 09-02/09-05 to confirm the install also covers `zk-proofs`, since RESEARCH.md's "Installation" section only lists the backend path)
- No blockers for proceeding to plan 09-02 (backend `safeService.js`)

---
*Phase: 09-multisig-registry-governance-e5*
*Completed: 2026-06-21*

## Self-Check: PASSED
