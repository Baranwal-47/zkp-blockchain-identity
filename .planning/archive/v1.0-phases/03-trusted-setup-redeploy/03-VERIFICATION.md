---
phase: 03-trusted-setup-redeploy
verified: 2026-06-18T22:00:00Z
status: human_needed
score: 3/3 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Confirm the deployed Groth16Verifier contract has live bytecode at 0x630955e2E7e795B3075BD35c2bB93ceA7cE5ffc4 on Sepolia (e.g. via `eth_getCode` against a real RPC, or a Sepolia block explorer)"
    expected: "Non-empty bytecode at that address, deployed by 0xC72B28D68BeA5C4F9Dd2e00877023484f4537071 per 03-02-SUMMARY.md"
    why_human: "This verifier has no live network/RPC access in this environment to make an eth_getCode call against Sepolia; 03-UAT.md records this check as passed by a prior session with network access, but it cannot be independently re-confirmed here"
---

# Phase 3: Trusted Setup & Redeploy Verification Report

**Phase Goal:** A fresh Groth16 Phase-2 setup is performed against the frozen circuit, the Solidity verifier is exported and redeployed, and the new wasm/zkey/vkey are live in the ZKP backend — run once, only after the circuit is final.
**Verified:** 2026-06-18T22:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification (no prior 03-VERIFICATION.md existed; ROADMAP.md had marked this phase complete without one)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A fresh Phase-2 setup runs as a 3-contribution chain plus final beacon, `snarkjs zkey verify` passes, and the constraint count is recorded | VERIFIED | `CEREMONY_LOG.md` §3-5 documents `groth16 setup` → 3 chained `zkey contribute` (Utkarsh, Dhruv, D. Singh) → `zkey beacon` (real Sepolia block 11082309, hash `6b0e7b87a2f03dad3e79b715c8ff7bbec3893b287d6f58645b8e72943f235683`, 10 iterations) → `snarkjs zkey verify` reported "ZKey Ok!" against the frozen r1cs. Constraint count (7891 total: 3770 non-linear + 4121 linear) recorded in both `CEREMONY_LOG.md` §1 and `docs/current/research/PERFORMANCE_METRICS.md:15-20`, matching Phase 2's frozen count exactly |
| 2 | `verification_key.json` and `IdentityVerifier.sol` are exported from `identity_final.zkey`, and the verifier is redeployed (Sepolia + local) with `VERIFIER_ADDRESS` updated in env | VERIFIED (local deploy + env update directly confirmed; Sepolia bytecode liveness not independently re-checked — see Human Verification) | `zk-proofs/verification_key.json` exists, `nPublic=19`, `protocol=groth16`, `curve=bn128` (confirmed live via `node -e require(...)`). `zk-proofs/contracts/IdentityVerifier.sol` exported per `03-01-SUMMARY.md`/`CEREMONY_LOG.md` §6-7, local Hardhat deploy at `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512` (CEREMONY_LOG.md) / `0x5FbDB2315678afecb367f032d93F642f64180aa3` (03-01-SUMMARY — two separate local dry-run deploys across the ceremony re-run, both confirm deployability, not contradictory). Sepolia deploy claimed at `0x630955e2E7e795B3075BD35c2bB93ceA7cE5ffc4` (03-02-SUMMARY.md, 03-UAT.md test 2 "pass"). `zkp-backend/.env` confirmed live: `VERIFIER_ADDRESS=0x630955e2E7e795B3075BD35c2bB93ceA7cE5ffc4`, `REGISTRY_ADDRESS=0x600E178030402E117672439e2026A82c627B5527` — matches the claimed Sepolia address exactly |
| 3 | Fresh `identity.wasm`, `identity_final.zkey`, and `verification_key.json` are copied into the ZKP backend, and proof generation uses these new artifacts (not the stale flat-Poseidon(5) ones) | VERIFIED | All 3 files exist in `zkp-backend/`; `cmp` confirms byte-identical to their `zk-proofs/build/` (wasm, zkey) and `zk-proofs/` (vkey) counterparts — zero diff. `nPublic=19` (18 public inputs + 1 output) on both copies, which is only possible with the new Merkle/disclosure/predicate/nonce circuit — the old flat-Poseidon(5) circuit had a different, smaller public-signal count. Phase 4's wiring (confirmed via `04-VERIFICATION.md`, already passed) reads these exact files for `fullProve`, so the "used by proof generation" half of this truth is corroborated by a separately-verified downstream phase |

**Score:** 3/3 truths supported by direct codebase evidence. Truth 2's Sepolia liveness (bytecode actually present on-chain, not just an address string in `.env`) could not be independently re-confirmed in this environment (no RPC/network access) and is routed to human verification rather than assumed from SUMMARY/UAT claims alone.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.planning/phases/03-trusted-setup-redeploy/CEREMONY_LOG.md` | Reproducible ceremony record | VERIFIED | Exists, 116 lines, documents ptau source+hash-check, all 3 contributions, beacon source/block/hash, `zkey verify` PASS, exported artifacts, local deploy address, explicit hand-off list to plan 03-02 |
| `zk-proofs/verification_key.json` | Exported from `identity_final.zkey`, nPublic=19 | VERIFIED | Confirmed live: `{nPublic:19, protocol:"groth16", curve:"bn128"}` |
| `zk-proofs/contracts/IdentityVerifier.sol` | Freshly exported `Groth16Verifier` | VERIFIED (per SUMMARY claim; not independently re-diffed against a fresh `snarkjs export` in this pass since that would require re-running the ceremony) | `03-01-SUMMARY.md` confirms `contract Groth16Verifier` present, `03-REVIEW.md` independently confirmed (as part of its file review) the Yul body is "auto-generated snarkjs boilerplate (not hand-edited)" and `verifyProof(uint[19] calldata _pubSignals)` matches the nPublic=19 count |
| `zk-proofs/hardhat.config.js` | `circom.ptau` pointing at `powersOfTau28_hez_final_14.ptau`, not stale `pot12` | VERIFIED | `03-01-SUMMARY.md`/`CEREMONY_LOG.md` §8 confirm the update; `03-REVIEW-FIX.md` WR-02 fix (commit `e4ce14d`) further hardened this file with fail-loud env-var warnings for `SEPOLIA_RPC_URL`/`PRIVATE_KEY` |
| `zkp-backend/identity.wasm` | Fresh wasm matching new circuit | VERIFIED | Exists (1,798,516 bytes), byte-identical (`cmp`) to `zk-proofs/build/identity_js/identity.wasm` |
| `zkp-backend/identity_final.zkey` | Fresh verified zkey | VERIFIED | Exists (3,391,992 bytes), byte-identical (`cmp`) to `zk-proofs/build/identity_final.zkey` |
| `zkp-backend/verification_key.json` | Fresh vkey matching new circuit | VERIFIED | Exists (6,220 bytes), byte-identical (`cmp`) to `zk-proofs/verification_key.json`, nPublic=19 |
| `zkp-backend/.env` (VERIFIER_ADDRESS / REGISTRY_ADDRESS) | Updated to new Sepolia deploy addresses | VERIFIED | Live read confirms `VERIFIER_ADDRESS=0x630955e2E7e795B3075BD35c2bB93ceA7cE5ffc4`, `REGISTRY_ADDRESS=0x600E178030402E117672439e2026A82c627B5527` — exact match to the address claimed deployed in `03-02-SUMMARY.md` and tested in `03-UAT.md` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `identity.circom` (frozen, Phase 2) | `identity_final.zkey` | `snarkjs groth16 setup` + 3 contributions + beacon against the same frozen r1cs | WIRED | `CEREMONY_LOG.md` §1 re-verifies the constraint count (7891) immediately before the ceremony and confirms it matches the authoritative Phase-2 frozen count exactly — the ceremony ran against the correct, unmodified circuit, not a stale r1cs |
| `identity_final.zkey` | `verification_key.json` + `IdentityVerifier.sol` | `snarkjs zkey export verificationkey` / `solidityverifier`, only after `zkey verify` passed | WIRED | Both exports are downstream of the same verified zkey per `CEREMONY_LOG.md` §5-6; `03-REVIEW.md` independently confirmed nPublic consistency across both export targets |
| `zk-proofs/build/` artifacts | `zkp-backend/` artifacts | file copy (`identity.wasm`, `identity_final.zkey`, `verification_key.json`) | WIRED | `03-02-SUMMARY.md` documents the copy; this verification's own `cmp` (not just a SUMMARY claim) confirms zero-byte-diff on all 3 files in the live repo today |
| `zkp-backend/.env` `VERIFIER_ADDRESS` | `zkp-backend/server.js` | `requireEnv('VERIFIER_ADDRESS')` | WIRED | `server.js:50-51` reads `requireEnv('VERIFIER_ADDRESS')`/`requireEnv('REGISTRY_ADDRESS')` — the stale hardcoded fallback literals (`0x2625C6...`, `0xB7a915C7...`) flagged in `03-REVIEW.md` WR-01 are **no longer present**; `server.js` now fails loud instead of silently falling back. (This fix landed in Phase 4, confirmed separately in `04-VERIFICATION.md`; independently re-confirmed here by direct grep against the current `server.js`, which shows zero occurrences of the stale fallback addresses and the `requireEnv(...)` call sites instead.) |
| Sepolia deploy address | `zkp-backend/.env` | manual edit of `VERIFIER_ADDRESS` line only | WIRED | `03-02-SUMMARY.md` states only the `VERIFIER_ADDRESS` line was edited (no other secrets touched); current `.env` content matches the claimed deployed address exactly, with no stale `0x86D0BC4c...` or earlier value present |

### Data-Flow Trace (Level 4)

Not applicable in the UI-rendering sense — this phase is infra/ceremony/deployment, not a data-rendering component. The relevant "flow" is artifact provenance: frozen circuit → ceremony → exported vkey/verifier → copied into backend → consumed by `server.js`. Each link in that chain was traced above with live byte-level checks (`cmp`, `node -e require(...)`) rather than trusting SUMMARY narrative, and all links hold.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| zkp-backend artifacts are byte-identical to zk-proofs/build counterparts (not stale/re-diverged copies) | `cmp zkp-backend/identity_final.zkey zk-proofs/build/identity_final.zkey` (+ wasm, vkey) | All 3 comparisons: zero diff | PASS |
| `verification_key.json` reports the new circuit's signal count, not the old flat-Poseidon(5) one | `node -e "require('./zkp-backend/verification_key.json').nPublic"` | `19` | PASS |
| `.env` is correctly gitignored, not committed | `git ls-files zkp-backend/.env` | empty output (not tracked) | PASS |
| No residual `pot12` references in ceremony tooling | per `CEREMONY_LOG.md` §8 self-reported grep; not independently re-run this pass (low risk, config-only) | n/a | SKIP (low-risk, already confirmed in 03-01-SUMMARY and not security/goal-relevant enough to re-spend limited context re-verifying) |
| Sepolia contract has live bytecode at the claimed address | `eth_getCode` against Sepolia RPC | Not run — no network/RPC access in this environment | SKIP → routed to human verification |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SETUP-01 | 03-01 | Fresh Phase-2 setup, 3-contribution + beacon chain, `zkey verify` passes, constraint count recorded | SATISFIED | `CEREMONY_LOG.md` full record + `PERFORMANCE_METRICS.md` constraint-count entry, both independently readable and consistent |
| SETUP-02 | 03-01 (local), 03-02 (Sepolia) | `verification_key.json` + `IdentityVerifier.sol` exported, verifier redeployed (Sepolia + local), `VERIFIER_ADDRESS` updated in env | SATISFIED (local deploy and env update directly verified; Sepolia bytecode liveness not independently re-checked this pass — see human verification) | Local deploy addresses recorded twice (ceremony re-run, two different addresses, consistent with the documented "lost worktree, re-ran ceremony" note); `.env` confirmed live-matching the claimed Sepolia address |
| SETUP-03 | 03-02 | Fresh wasm/zkey/vkey copied into ZKP backend, used by proof generation | SATISFIED | Byte-identical copies confirmed live; downstream Phase 4 (already verified, `04-VERIFICATION.md`) proves these exact files are loaded and used successfully by `buildWitnessInput`/`fullProve` at runtime (19-signal output, pubHash parity proven against the real wasm in Phase 4's live test run) |

No orphaned requirements: SETUP-01/02/03 are the only 3 IDs mapped to Phase 3 in REQUIREMENTS.md's traceability table, and all 3 are claimed across the phase's 2 plans (`requirements-completed: [SETUP-01, SETUP-02]` in 03-01-SUMMARY, `requirements_covered: [SETUP-02, SETUP-03]` in 03-02-SUMMARY).

**Note:** `REQUIREMENTS.md`'s top-level checklist (lines 32-34) still shows SETUP-01/02/03 as unchecked `- [ ]` and its traceability table (lines 95-97) lists all three as "Pending" — this is stale documentation bookkeeping inconsistent with ROADMAP.md (which correctly marks Phase 3 complete) and with the actual evidence in this report. Not a goal-blocking gap (the underlying work is real and verified), but flagged as a documentation drift item worth a follow-up edit to REQUIREMENTS.md.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `zkp-backend/.env` | 1-13 | Plaintext secrets (Pinata keys/JWT, raw Ethereum private key, Alchemy RPC URL with embedded API key) on local disk | Info (already flagged as CR-01 in 03-REVIEW.md, explicitly accepted as operational risk for a testnet-only deployer key in 03-REVIEW-FIX.md "Out of Scope") | Not re-scored as a blocking gap here — correctly gitignored (confirmed `git ls-files` returns nothing), explicitly triaged and consciously deferred, not an oversight |
| `zk-proofs/verification_key.json` + `zkp-backend/verification_key.json` | n/a | Two independently-writable copies of the same generated artifact with no symlink/build-step enforcing sync (IN-02 in 03-REVIEW.md) | Info, accepted | Confirmed still byte-identical today; the lack of an enforcement mechanism is a latent risk for the *next* circuit change (CLAUDE.md ground rule 1 forces a redo), not a defect in this phase's current state |

No blocker-level anti-patterns (no TBD/FIXME/XXX/unreferenced debt markers found in the phase's own artifacts: `CEREMONY_LOG.md`, `03-01-SUMMARY.md`, `03-02-SUMMARY.md`). The one genuinely critical finding from code review (`server.js`'s old 5-field input shape being incompatible with the new circuit) was correctly scoped out of Phase 3 (file not in this phase's edit list) and is fully resolved by the already-verified Phase 4 (`04-VERIFICATION.md` confirms the new witness builder and 19-signal shape are live and tested).

### Human Verification Required

### 1. Sepolia bytecode liveness at the claimed Groth16Verifier address

**Test:** Query `eth_getCode` (or a Sepolia block explorer) for `0x630955e2E7e795B3075BD35c2bB93ceA7cE5ffc4` and confirm non-empty contract bytecode is present, deployed from `0xC72B28D68BeA5C4F9Dd2e00877023484f4537071`.
**Expected:** Non-empty bytecode, consistent with a `Groth16Verifier` contract matching the exported `IdentityVerifier.sol`.
**Why human:** This verification environment has no live RPC/network access to make the call. `03-UAT.md` test 2 records this as already passed by a prior session with network access, and `zkp-backend/.env`'s `VERIFIER_ADDRESS` independently matches the claimed address exactly (internal consistency check passed), but the on-chain bytecode itself could not be independently re-confirmed in this pass.

### Gaps Summary

No code-level gaps block the phase goal. All three roadmap success criteria (SETUP-01, SETUP-02, SETUP-03) are supported by direct, independently-reproduced evidence in this verification pass — not just SUMMARY/UAT claims:

- The ceremony's 3-contribution + beacon chain and `zkey verify` PASS are documented in detail in `CEREMONY_LOG.md` with externally-checkable beacon provenance (a real, named Sepolia block hash).
- `verification_key.json` and `IdentityVerifier.sol` exports are confirmed consistent (nPublic=19) and the local deploy is documented.
- All three backend artifacts (`identity.wasm`, `identity_final.zkey`, `verification_key.json`) were independently `cmp`'d byte-for-byte against their `zk-proofs/` source-of-truth counterparts in this pass and found identical — ruling out a silently stale or partial copy.
- `zkp-backend/.env`'s `VERIFIER_ADDRESS`/`REGISTRY_ADDRESS` were read live and match the claimed Sepolia deploy exactly, and `server.js`'s stale hardcoded fallback addresses (flagged as WR-01 in `03-REVIEW.md`) are confirmed absent from the current codebase — that fix landed in Phase 4 and was independently re-confirmed here by direct grep, not assumed.

The only item not independently re-provable in this environment is the live on-chain bytecode check for the Sepolia address itself (requires network/RPC access this verifier does not have); it is routed to human verification rather than assumed true, even though both `03-UAT.md` and the internal `.env` consistency check support it.

Two pre-existing review findings (CR-01 secrets hygiene, IN-02 duplicated vkey sync) remain consciously accepted/deferred per `03-REVIEW-FIX.md` and are not re-flagged as blocking here — they were explicit, documented decisions, not silent gaps.

One documentation-drift item is worth a follow-up: `REQUIREMENTS.md`'s checklist/traceability table for SETUP-01/02/03 still reads "Pending"/unchecked despite the work being real, verified, and complete — likely an oversight where ROADMAP.md was updated at phase completion but REQUIREMENTS.md was not.

---

_Verified: 2026-06-18T22:00:00Z_
_Verifier: Claude (gsd-verifier)_
