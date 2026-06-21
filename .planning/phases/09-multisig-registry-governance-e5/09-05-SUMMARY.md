---
phase: 09-multisig-registry-governance-e5
plan: 05
subsystem: scripts
tags: [gnosis-safe, multisig, sepolia, ethers, governance, human-action-checkpoint]

# Dependency graph
requires:
  - phase: 09-01
    provides: "CredentialRegistry 2-step admin transfer (transferAdmin/acceptAdmin) + deploySafe.js (Safe 2-of-3 deployment script, reused unmodified for the Sepolia deploy)"
  - phase: 09-02
    provides: "safeService.js proposeSafeTransaction(to, data) generic primitive, reused byte-for-byte by proposeAcceptAdmin.js"
  - phase: 09-04
    provides: "Pending Approvals UI (RoleLoginPage, PendingApprovalsPage, PendingTxCard) — the live verification target for Task 4, not yet exercised against a real Safe"
provides:
  - "generateSafeOwners.js — generates 3 fresh throwaway owner keypairs (AcadAdmin/Registrar/Dean) for Sepolia, stdout-only, no key material written to disk"
  - "proposeAcceptAdmin.js — encodes acceptAdmin() and proposes it via safeService.proposeSafeTransaction so the registry admin handoff enters the Safe Tx Service queue"
affects: []
# This plan has NOT yet produced: a deployed Sepolia Safe, a completed admin
# handoff, or a verified live propose->sign->execute cycle. Those require
# human-controlled resources (funded accounts, RPC, API key, MetaMask) and
# are deferred at the Task 3 checkpoint below — see "Plan Status" section.

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "generateSafeOwners.js mirrors deployRegistry.js's CJS Hardhat-script shape (require, console.log conventions) for consistency with the rest of zk-proofs/scripts/"
    - "proposeAcceptAdmin.js mirrors credentialService.js/safeService.js's ESM dotenv + registryArtifact ABI-loading pattern; delegates 100% of propose logic to safeService.proposeSafeTransaction (no duplicated Safe.init/createTransaction/apiKit code)"

key-files:
  created:
    - zk-proofs/scripts/generateSafeOwners.js
    - privdId_admin/backend/scripts/proposeAcceptAdmin.js
  modified: []

key-decisions:
  - "privdId_admin/backend/.env.example already contained all required Sepolia/Safe placeholders (SAFE_ADDRESS, SAFE_OWNER_ACADADMIN/REGISTRAR/DEAN, SAFE_API_KEY, SAFE_CHAIN_ID) from plan 09-01/09-02/09-03 work — no edit was needed to satisfy the plan's files_modified list; verified by reading the file rather than blindly appending duplicate keys."

requirements-completed: []
# GOV-04's Sepolia half is NOT complete — only the autonomous script-authoring
# tasks (Task 1, Task 2) are done. Live deployment/handoff/verification
# (Tasks 3-4) require human-controlled resources documented in the checkpoint
# below and have not been performed.

# Metrics
duration: ~15min (autonomous portion only; Tasks 3-4 pending human action)
completed: 2026-06-21 (partial — stopped at Task 3 checkpoint)
---

# Phase 09 Plan 05: Sepolia Safe Deployment & Live Multisig Handoff Summary

**Authored and verified the two autonomous scripts this plan requires (generateSafeOwners.js, proposeAcceptAdmin.js); stopped at the first task requiring real Sepolia ETH, an RPC URL, a Safe Transaction Service API key, and live MetaMask interaction — none of which are available to an autonomous executor.**

## Plan Status: PARTIAL — STOPPED AT HUMAN-ACTION CHECKPOINT

This plan has 4 tasks. Tasks 1 and 2 (`type="auto"`) are complete, verified, and committed. Task 3 is `type="checkpoint:human-action"` and Task 4 is `type="checkpoint:human-verify"` — both require resources and actions an autonomous agent cannot produce:

- Real Sepolia ETH in 4 wallets (1 deployer EOA + 3 fresh owner accounts)
- A live Sepolia RPC URL (`SEPOLIA_RPC_URL`)
- A Safe Transaction Service API key (`SAFE_API_KEY`, from https://developer.safe.global)
- Live browser-based MetaMask interaction (importing 3 private keys, connecting wallet, signing 2 Safe transactions, clicking Execute)

No fabricated or assumed verification was performed for Tasks 3-4. This SUMMARY documents only what was actually built and verified.

## Performance

- **Duration:** ~15 min (Tasks 1-2 only)
- **Started:** 2026-06-21
- **Stopped:** 2026-06-21, at Task 3 (human-action checkpoint)
- **Tasks:** 2 of 4 complete (Task 1 auto, Task 2 auto); Task 3 (human-action) and Task 4 (human-verify) not started
- **Files modified:** 2 (both new files; no existing files needed changes — `.env.example` already had the required placeholders from 09-01/09-02/09-03)

## Accomplishments

- `zk-proofs/scripts/generateSafeOwners.js`: CJS Hardhat-style script using `ethers.Wallet.createRandom()` to mint 3 fresh throwaway keypairs (AcadAdmin / Asst. Registrar / Dean), per D-02. Prints each role's address (formatted for both backend `SAFE_OWNER_*` and frontend `VITE_SAFE_OWNER_*` env vars) and private key (for one-time MetaMask import) to stdout only — no `fs.writeFileSync` of key material anywhere, with an explicit no-commit warning banner. Smoke-tested by running it directly; output format confirmed correct, no file artifacts left behind.
- `privdId_admin/backend/scripts/proposeAcceptAdmin.js`: ESM script matching the backend's existing dotenv + `registryArtifact` ABI-loading convention (same pattern as `credentialService.js`/`safeService.js`). Encodes `acceptAdmin()` via `new ethers.Interface(registryArtifact.abi).encodeFunctionData('acceptAdmin', [])`, then delegates entirely to `safeService.proposeSafeTransaction(REGISTRY_ADDRESS, data)` — no duplicated `Safe.init`/`createTransaction`/`apiKit.proposeTransaction` logic (verified by grep; the only textual match is an explanatory code comment, not executable logic). Fails loudly with actionable errors if `REGISTRY_ADDRESS` or `SAFE_ADDRESS` are unset.
- Verified `privdId_admin/backend/.env.example` already carries every placeholder this plan's `files_modified` list anticipated needing (`SAFE_ADDRESS`, `SAFE_OWNER_ACADADMIN/REGISTRAR/DEAN`, `SAFE_API_KEY`, `SAFE_CHAIN_ID`, `SEPOLIA_RPC_URL`) from prior 09-0x plans — no edit needed, avoiding duplicate/conflicting placeholder keys.

## Task Commits

1. **Task 1: generateSafeOwners.js — 3 fresh throwaway keypairs** - `a47380c` (feat)
2. **Task 2: proposeAcceptAdmin.js — encode + propose the registry admin handoff** - `903b28a` (feat)

Tasks 3 and 4 are not committed — they are human-action/human-verify checkpoints with no code to commit.

## Files Created/Modified

- `zk-proofs/scripts/generateSafeOwners.js` — New: generates 3 fresh Sepolia owner keypairs, stdout-only
- `privdId_admin/backend/scripts/proposeAcceptAdmin.js` — New: encodes + proposes the `acceptAdmin()` handoff via `safeService.proposeSafeTransaction`

## Decisions Made

- No edit to `privdId_admin/backend/.env.example` was made despite it being listed in the plan's `files_modified` — it already contains every Sepolia/Safe placeholder this plan needs (confirmed by reading the file), carried forward from plans 09-01/09-02/09-03. Editing it further would have either duplicated keys or required removing/restructuring existing correct placeholders for no functional gain.

## Deviations from Plan

None — Tasks 1 and 2 executed exactly as specified, no auto-fixes required.

## Known Stubs

None in the code delivered — both scripts are fully functional, not stubs. The "stub" in this plan is the unexecuted live deployment itself (Tasks 3-4), which is a deliberate checkpoint stop, not a code shortcut.

## CHECKPOINT REACHED (recorded for continuation)

**Type:** human-action
**Blocked by:** Task 3 requires real Sepolia-network resources an autonomous agent does not have:
1. **3 funded MetaMask accounts** — the operator must run `cd zk-proofs && node scripts/generateSafeOwners.js`, import each of the 3 printed private keys into MetaMask (Import Account), and fund each with Sepolia test ETH from a faucet.
2. **A funded deployer EOA** — the existing wallet behind `PRIVATE_KEY` in `privdId_admin/backend/.env` (and used by `zk-proofs` hardhat config) must also hold Sepolia test ETH, and must NOT be one of the 3 new owner addresses (D-03).
3. **`SEPOLIA_RPC_URL`** — must point at a live Sepolia RPC endpoint (e.g. Infura/Alchemy). RESEARCH confirmed Safe Transaction Service for Sepolia chain ID 11155111 is live, but an actual RPC URL value is operator-supplied infrastructure, not something this agent can provision.
4. **`SAFE_API_KEY`** — a Safe Transaction Service API key from https://developer.safe.global, required by `safeService.js`'s `getApiKit()` lazy-init (it throws without one).
5. **Live browser MetaMask interaction** — connecting a wallet, producing real ECDSA signatures over a Safe EIP-712 transaction hash, and clicking Execute cannot be scripted by this agent; D-01 explicitly requires officials' signatures be MetaMask-relayed, never backend-held.

**What remains (Tasks 3 and 4, unexecuted):**
- Task 3: generate owners, fund 4 Sepolia accounts (1 deployer + 3 owners), import keys to MetaMask, write addresses into backend `.env` (`SAFE_OWNER_ACADADMIN/REGISTRAR/DEAN`) and frontend `.env` (`VITE_SAFE_OWNER_*`).
- Task 4: `cd zk-proofs && npx hardhat run scripts/deploySafe.js --network sepolia` (with the 3 fresh owners, threshold 2) → copy `SAFE_ADDRESS` into both env files → `cd privdId_admin/backend && node scripts/proposeAcceptAdmin.js` → sign the resulting handoff tx with 2 of 3 owner MetaMask accounts in the Pending Approvals UI → Execute → confirm `registry.admin() == SAFE_ADDRESS` → issue/revoke a test student through the same propose→2-sign→execute cycle → confirm Execute does not auto-fire (D-06) → confirm direct deployer-EOA issue/revoke reverts (GOV-02 negative check).

**Resume-signal:** Once the operator has completed Task 3's setup (3 owner addresses funded + in MetaMask + in env, deployer funded and confirmed not an owner), resume with: `"owners ready"` plus the 3 owner addresses — or describe any blocker (faucet unavailable, RPC URL not yet obtained, etc.).

## User Setup Required

Per the plan's `user_setup` frontmatter, the operator must, before Task 4 can proceed:
1. Provide a live `SEPOLIA_RPC_URL` in `privdId_admin/backend/.env` (and in `zk-proofs/hardhat.config.js`'s sepolia network block, if not already wired there from 09-01).
2. Obtain a `SAFE_API_KEY` from https://developer.safe.global and set it in `privdId_admin/backend/.env`.
3. Run `generateSafeOwners.js`, import the 3 keys into MetaMask, fund all 4 accounts (deployer + 3 owners) via a Sepolia faucet.
4. Confirm the deployer EOA is distinct from all 3 owner addresses.

## Next Phase Readiness

- `generateSafeOwners.js` and `proposeAcceptAdmin.js` are both complete, verified (`node --check` clean, pattern greps pass), and ready to run the moment the operator supplies the Sepolia resources above.
- This is the final plan of Phase 9 (multisig-registry-governance-e5). Phase 9 CANNOT be marked fully complete until Tasks 3-4 are executed and verified live on Sepolia — GOV-04's Sepolia half and the live D-11 manual-signing verification remain open.
- No code blockers. The remaining blocker is purely operator-side resource provisioning (funded testnet wallets, RPC URL, API key) and live browser interaction.

---
*Phase: 09-multisig-registry-governance-e5*
*Status: PARTIAL — stopped at Task 3 human-action checkpoint, 2026-06-21*

## Self-Check: PASSED

- `zk-proofs/scripts/generateSafeOwners.js` — FOUND on disk
- `privdId_admin/backend/scripts/proposeAcceptAdmin.js` — FOUND on disk
- Commit `a47380c` — FOUND in `git log --oneline --all`
- Commit `903b28a` — FOUND in `git log --oneline --all`
