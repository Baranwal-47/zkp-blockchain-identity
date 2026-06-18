---
phase: 04-zkp-backend-integration-nonce-enforcement
plan: 03
subsystem: zkp-backend
tags: [express, snarkjs, ethers, nonce, replay-protection, groth16, supertest]

# Dependency graph
requires:
  - phase: 04-zkp-backend-integration-nonce-enforcement (plan 02)
    provides: "POST /generate-proof (19-signal publicSignals), POST /session/nonce, zkp-backend/lib/nonceStore.js::validateAndConsume"
provides:
  - "POST /verify — nonce-enforced (match + freshness + one-time-use), HTTP 200 {valid,reason} uniform shape"
  - "POST /verify-onchain — same nonce-enforcement contract as /verify, pA/pB-swap/pC formatting unchanged"
  - "server.js fail-loud env config: VERIFIER_ADDRESS/REGISTRY_ADDRESS/BLOCKCHAIN_RPC_URL throw at startup if unset"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Nonce consumed only after the cryptographic proof verifies (check order: proof first, then validateAndConsume) — a tampered/invalid proof never burns a session's nonce (threat T-04-08)."
    - "Uniform 200 {valid:false, reason} response shape across both proof-invalid and nonce-invalid outcomes, never 4xx, so callers branch on `reason` not status code (decision #2)."
    - "requireEnv() helper replaces hardcoded fallback contract addresses — throws a clear startup Error naming the missing var instead of silently resolving to a dead/stale address (threat T-04-09)."

key-files:
  created:
    - zkp-backend/test/verifyFlow.test.js
  modified:
    - zkp-backend/server.js

key-decisions:
  - "/credential-info reviewed against the 19-signal circuit and found already correct (publicSignals[0] pubHash -> ethers.zeroPadValue(toBeHex(BigInt(pubHash)),32) -> getCredentialByHash) — no functional change made, per plan instruction to leave correct code untouched."
  - "BLOCKCHAIN_RPC_URL is now required (no hardcoded Alchemy key fallback) alongside VERIFIER_ADDRESS/REGISTRY_ADDRESS, since the prior fallback embedded a live API key in source (out-of-scope-but-adjacent hardening, consistent with the anti-pattern the plan called out for the two contract addresses)."
  - "verifyFlow.test.js gates /verify-onchain and /credential-info behind a live (non-/demo) BLOCKCHAIN_RPC_URL check so the suite stays green without network access while still covering BACK-02/BACK-03 on-chain when a real RPC is configured."

requirements-completed: [BACK-02, BACK-03, REPL-03]

# Metrics
duration: ~35min
completed: 2026-06-18
---

# Phase 4 Plan 3: Verify-Side Nonce Enforcement + Hardened Config Summary

**Wired `validateAndConsume` into both `/verify` and `/verify-onchain` so a captured proof+nonce can be consumed exactly once and only after the cryptographic proof checks out, removed the stale hardcoded verifier/registry/RPC fallback addresses in favor of fail-loud env validation, and proved the full match/freshness/one-time-use/non-griefing lifecycle end-to-end against a real Groth16 proof.**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-06-18
- **Tasks:** 2 completed
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- Extended `POST /verify` to accept `sessionId` and enforce nonce match/freshness/one-time-use via `validateAndConsume(sessionId, publicSignals[1])`, checked only after the off-chain `snarkjs.groth16.verify` result is `true` — so a bad proof returns `{valid:false, reason:"invalid_proof"}` without burning the session's nonce (threat T-04-08)
- Applied the identical nonce-enforcement contract to `POST /verify-onchain` (same `{valid:false, reason}` 200 shape, same proof-then-nonce check order), plus a length-19 `publicSignals` guard before the on-chain `verifyProof` view call; the pA/pB-swap/pC formatting (RESEARCH Pattern 4) was left untouched
- Confirmed `POST /credential-info` is already correct for the rebuilt circuit — `publicSignals[0]` as the Merkle-root `pubHash` feeding `getCredentialByHash` was unchanged from plan 02, no bug found
- Replaced the three hardcoded fallback values (`VERIFIER_ADDRESS`, `REGISTRY_ADDRESS`, and the Alchemy-key-bearing `BLOCKCHAIN_RPC_URL` default) with a `requireEnv()` helper that throws a clear startup `Error` naming the missing variable — confirmed via `grep -c` that both stale addresses (`0x2625C6...`, `0xB7a915C7...`) are gone from `server.js`
- Wrote `zkp-backend/test/verifyFlow.test.js`: 5 always-run tests (fresh proof+nonce -> valid:true; replay -> nonce_already_used; cross-session nonce -> nonce_mismatch; forced-expired entry -> nonce_expired; tampered proof -> invalid_proof AND proves the nonce survives for a subsequent valid retry) plus 2 RPC-gated tests for `/verify-onchain` and `/credential-info` that skip cleanly when no live `BLOCKCHAIN_RPC_URL` is configured
- Full suite: **30 passing, 2 pending** (the 2 pending are the RPC-gated on-chain tests, skipped because this environment's `.env` uses a placeholder `/demo` Alchemy URL)

## Task Commits

Each task was committed atomically:

1. **Task 1: Nonce-enforced /verify + harden config + confirm credential-info** - `ec2f1b1` (feat)
2. **Task 2: End-to-end nonce-lifecycle verify test** - `0077437` (test)

**Plan metadata:** this SUMMARY committed separately (worktree mode — STATE.md/ROADMAP.md updates deferred to orchestrator)

## Files Created/Modified

- `zkp-backend/server.js` - `/verify` and `/verify-onchain` now accept `sessionId`, enforce `validateAndConsume` post-proof-check, return uniform 200 `{valid, reason?}`; stale hardcoded `verifierAddress`/`registryAddress`/`rpcUrl` fallbacks replaced with `requireEnv()` fail-loud validation
- `zkp-backend/test/verifyFlow.test.js` - 7 tests (5 always-run + 2 RPC-gated) covering the full nonce lifecycle and the non-griefing guarantee

**Not modified:** `zkp-backend/lib/nonceStore.js`, `lib/witnessBuilder.js`, `lib/encoding.js` (consumed as-is from plans 01/02); `/credential-info` route body (reviewed, confirmed correct, untouched).

## Decisions Made

- Check order in both verify routes is proof-first, nonce-second — deliberate, per decision #2 and threat T-04-08, so an attacker cannot grief a session by submitting a garbage proof to burn its nonce.
- `/credential-info` required no code change; the plan explicitly permitted "leave as-is and note so" if the read revealed no bug, which was the case here.
- Extended the fail-loud `requireEnv()` treatment to `BLOCKCHAIN_RPC_URL` (not just the two contract addresses named in the plan) because its prior fallback also hardcoded a live Alchemy API key in source — the same anti-pattern class the plan flagged, applied consistently.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - missing critical functionality] BLOCKCHAIN_RPC_URL also had a hardcoded fallback with an embedded API key**
- **Found during:** Task 1 (reading server.js lines 38-40 per `<read_first>`)
- **Issue:** The plan named only `VERIFIER_ADDRESS`/`REGISTRY_ADDRESS` as stale fallbacks to remove, but `rpcUrl` had the same anti-pattern — a hardcoded Alchemy RPC URL with a live API key baked into source, silently used if `BLOCKCHAIN_RPC_URL` was unset.
- **Fix:** Routed `rpcUrl` through the same `requireEnv()` fail-loud helper as the two contract addresses (plan explicitly permitted this: "Leave the rpcUrl handling as-is unless it also carries a stale secret-bearing fallback, in which case require it from env too").
- **Files modified:** `zkp-backend/server.js`
- **Commit:** `ec2f1b1`

### Environment-only actions (not deviations, no plan/code change)

- Ran `npm install` in `zkp-backend/`, `privdId_admin/backend/`, and `zk-proofs/` — fresh worktree checkout has gitignored `node_modules/` (expected, per environment_note).
- Ran `npx hardhat compile` in `zk-proofs/` to regenerate the gitignored `artifacts/` directory required by `server.js` at module load.
- Created a local (gitignored) `zkp-backend/.env` with `VERIFIER_ADDRESS=0x630955e2E7e795B3075BD35c2bB93ceA7cE5ffc4`, `REGISTRY_ADDRESS=0x600E178030402E117672439e2026A82c627B5527` (the addresses recorded as the live Sepolia deploy in `03-REVIEW.md`), and a placeholder `BLOCKCHAIN_RPC_URL=.../v2/demo` — needed because `.env` is gitignored and this fresh worktree had none, and `server.js` now throws at module load without these three vars set. The placeholder RPC URL means the on-chain-gated tests skip in this environment rather than hit a real Alchemy endpoint; this is intentional isolation, not a missing credential.

## Issues Encountered

None blocking. All acceptance criteria verified directly:
- `grep -c "0x2625C6fDBEDcCD572836FfbFA391D2C25de7ae26\|0xB7a915C78C546A1082CB66bA294fAFee52E4EB07" zkp-backend/server.js` → 0
- `node -e "require('./server.js')"` loads cleanly with the local `.env` populated
- `/verify` and `/verify-onchain` both accept `sessionId` and call `validateAndConsume`
- Nonce failures return HTTP 200 with `{valid:false, reason}` (verified via supertest assertions, not 4xx)
- Tampered-proof test explicitly proves the nonce is NOT consumed by a bad proof (subsequent valid retry against the same session still returns `valid:true`)
- Full suite: 30 passing, 2 pending (RPC-gated, skip cleanly)

## User Setup Required

To exercise the 2 RPC-gated on-chain tests (`/verify-onchain`, `/credential-info`), set a real `BLOCKCHAIN_RPC_URL` (e.g. a live Alchemy/Infura Sepolia endpoint) in `zkp-backend/.env` and re-run `npm test`. Not required for the off-chain nonce-lifecycle coverage, which is the bulk of this plan's verification surface and runs fully offline.

## Next Phase Readiness

- BACK-02 (both verify paths return valid:true for a fresh proof+nonce), BACK-03 (`/credential-info` resolves via `publicSignals[0]` pubHash), and the enforcement half of REPL-03 (match + freshness + one-time-use, non-griefing) are all implemented and tested.
- This closes plan 04-03, the final plan of Wave 3 / Phase 04. No blockers for phase close-out.

---
*Phase: 04-zkp-backend-integration-nonce-enforcement*
*Completed: 2026-06-18*
