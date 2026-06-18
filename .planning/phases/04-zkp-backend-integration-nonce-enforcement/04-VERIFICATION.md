---
phase: 04-zkp-backend-integration-nonce-enforcement
verified: 2026-06-18T17:15:00Z
status: human_needed
score: 7/7 must-haves verified
overrides_applied: 0
human_verification:
  - test: "POST /verify-onchain returns {valid:true} for a freshly generated proof against the live Sepolia Groth16Verifier, and POST /credential-info resolves found:true for a pubHash registered under the new 7-attribute circuit scheme"
    expected: "Both on-chain calls succeed against a real Sepolia RPC endpoint and a credential issued/registered under the rebuilt circuit"
    why_human: "Requires a live BLOCKCHAIN_RPC_URL (not the placeholder /demo Alchemy URL in this worktree's .env) and a credential actually registered on-chain under the new 7-attribute commitment scheme; the local test suite gates and cleanly skips these 2 of 32 tests for exactly this reason (TEST_FIXTURE_REGISTERED_ONCHAIN env flag), and they cannot be exercised without network/chain access this verifier does not have"
---

# Phase 4: ZKP Backend Integration & Nonce Enforcement Verification Report

**Phase Goal:** The ZKP backend accepts the new proof input shape, returns publicSignals in the frozen §3 order, verifies proofs both off-chain and on-chain, and enforces the full session-nonce lifecycle (issue → match → freshness → one-time use).
**Verified:** 2026-06-18T17:15:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Witness builder produces pubHash matching `identityCommitment.js::computeMerkleRoot` for identical attrs+salts | VERIFIED | `zkp-backend/lib/witnessBuilder.js` + `test/witnessBuilder.test.js` "witness pubHash === oracle computeMerkleRoot" — ran live (`npm test`), passed against real `identity.wasm` |
| 2 | isOver18/isPostgrad computed server-side, never trusted from caller | VERIFIED | `lib/predicates.js` exports pure functions; `witnessBuilder.js` calls `computeIsOver18(currentDateInt, dobInt)`/`computeIsPostgrad(programmeLevelCode)` internally — no route or builder param accepts these values from request body (confirmed by reading `server.js` `/generate-proof` body destructure: only `attrs, reveal, nonce, currentDateInt, salts`) |
| 3 | Old `stringToBigInt` encoding removed from the new code path | VERIFIED | `grep -rn stringToBigInt zkp-backend/` (excluding node_modules) returns zero matches across lib/, server.js, test/ |
| 4 | `POST /generate-proof` accepts new shape, returns `{proof, publicSignals}` with publicSignals in frozen §3 order (19 signals) | VERIFIED | `server.js:72-119`; live test run confirms `publicSignals.length === 19` and `publicSignals[0] === computeMerkleRoot(...)` (generateProof.test.js, executed) |
| 5 | `POST /session/nonce` issues random field element < BN128 order, sessionId, 5-min TTL | VERIFIED | `lib/nonceStore.js::issueNonce` — `crypto.randomBytes(31)` (248 bits, always < field order), `expiresAt = issuedAt + 300000`; test asserts range and TTL math; route at `server.js:124-127` |
| 6 | Both `/verify` and `/verify-onchain` return `valid:true` for a fresh proof; `/credential-info` resolves via `publicSignals[0]` as pubHash | PARTIALLY VERIFIED (off-chain proven; on-chain gated) | Off-chain `/verify`: live-tested, passes. `/verify-onchain` and `/credential-info`: code reviewed and structurally correct (pA/pB-swap/pC unchanged, `getCredentialByHash` lookup unchanged from working Phase 3 baseline per 04-03-SUMMARY/04-REVIEW), but the 2 on-chain tests in `verifyFlow.test.js` skip in this environment (placeholder `/demo` RPC URL, no live Sepolia access) — routed to human verification |
| 7 | Verify-time enforcement rejects nonce mismatch/expired/already-used as HTTP 200 `{valid:false,reason}`, consumed only on first successful use | VERIFIED | Live test run: all 4 lifecycle steps (fresh→valid:true, replay→nonce_already_used, cross-session→nonce_mismatch, expired→nonce_expired) pass; tampered-proof test proves nonce is NOT burned by an invalid proof (`server.js:140-150`, proof-then-nonce check order) |

**Score:** 7/7 truths supported by codebase evidence (truth 6's on-chain half requires human/live-network verification, not a code gap)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `zkp-backend/lib/encoding.js` | hashToField/CHUNK_COUNTS/generateSalts byte-identical to oracle | VERIFIED | Exists, exports match, `stringToBigInt` absent, BN128_FIELD_ORDER literal present |
| `zkp-backend/lib/predicates.js` | computeIsOver18/computeIsPostgrad | VERIFIED | Exists; inclusive boundary logic matches circuit's GreaterEqThan; 8 boundary tests pass |
| `zkp-backend/lib/witnessBuilder.js` | buildWitnessInput full snarkjs input construction | VERIFIED | Exists; frozen leaf order, server-derived predicates, decimal-string normalization confirmed by reading source and live test |
| `zkp-backend/lib/nonceStore.js` | issueNonce + validateAndConsume, TTL + one-time-use | VERIFIED | Exists; Map-based store, 4 reason codes, used-flag semantics confirmed by reading source and live test |
| `zkp-backend/server.js` | Rewritten /generate-proof, new /session/nonce, nonce-enforced /verify+/verify-onchain, fail-loud env config | VERIFIED | All routes read and confirmed wired (`buildWitnessInput`, `issueNonce`, `validateAndConsume` all called); `requireEnv()` replaces stale hardcoded fallback addresses (grep confirms 0 occurrences) |
| `zkp-backend/test/{encoding,predicates,witnessBuilder,nonceStore,generateProof,verifyFlow}.test.js` | Full coverage of above | VERIFIED | All 6 files exist; full suite executed live: **30 passing, 2 pending** (on-chain gated, clean skip) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `witnessBuilder.js` | `encoding.js` | `hashToField(...)` | WIRED | `require("./encoding")`, called 3x for name/rollNo/email |
| `witnessBuilder.js` | `predicates.js` | `computeIsOver18/computeIsPostgrad` | WIRED | `require("./predicates")`, both called inside `buildWitnessInput` |
| `server.js` | `witnessBuilder.js` | `buildWitnessInput` in `/generate-proof` | WIRED | `require('./lib/witnessBuilder')`, called at `server.js:103` |
| `server.js` | `nonceStore.js` | `issueNonce` in `/session/nonce`, `validateAndConsume` in `/verify` + `/verify-onchain` | WIRED | `require('./lib/nonceStore')`; `issueNonce()` at line 125, `validateAndConsume` at lines 147 and 194 |
| `server.js (/verify, /verify-onchain)` | nonce check order | proof verified before nonce consumed | WIRED | Both routes check `isValid` (crypto) first, return early on failure without touching `validateAndConsume` — confirmed by reading source and by the live "tampered proof does not consume nonce" test passing |
| `server.js (/credential-info)` | `CredentialRegistry.getCredentialByHash` | bytes32(pubHash) lookup | WIRED (structurally; on-chain call itself not exercised live) | `ethers.zeroPadValue(ethers.toBeHex(BigInt(pubHash)),32)` unchanged from working Phase 3 baseline per review; route reads `pubHash` from body as documented (caller is expected to pass `publicSignals[0]`) |

### Data-Flow Trace (Level 4)

Not applicable in the UI-rendering sense — this phase is backend-only (Express routes + crypto libs), not a rendering component. Data flow was traced directly via live test execution: `/session/nonce` → real nonce → `/generate-proof` → real witness/proof → `/verify` → real `groth16.verify` + `validateAndConsume` against the actually-issued nonce. All steps produce live, non-stubbed values (no hardcoded `[]`/`{}`/static returns found in any route).

### Behavioral Spot-Checks / Probe Execution

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full phase test suite | `cd zkp-backend && npm test` | 30 passing, 2 pending (clean skip, RPC-gated) | PASS |
| stringToBigInt fully removed | `grep -rn stringToBigInt zkp-backend/ (excl. node_modules)` | 0 matches | PASS |
| Stale hardcoded fallback addresses removed | `grep -rn "0x2625C6..\|0xB7a915C7.." zkp-backend/` | 0 matches | PASS |
| Debt markers (TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER) | `grep -rn` across lib/, server.js, test/ | 0 matches | PASS |
| Required env vars enforced fail-loud | Read `server.js:41-51` (`requireEnv` for VERIFIER_ADDRESS/REGISTRY_ADDRESS/BLOCKCHAIN_RPC_URL) | Throws Error naming missing var | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| BACK-01 | 04-01, 04-02 | `/generate-proof` new input shape, returns `{proof, publicSignals}` frozen §3 order | SATISFIED | Live test: 19-signal output, pubHash parity proven against real wasm |
| BACK-02 | 04-03 | `/verify` and `/verify-onchain` both return true for fresh proof | PARTIALLY SATISFIED — off-chain proven live; on-chain code-reviewed/structurally correct but not live-exercised (no Sepolia RPC in this env) | Routed to human verification |
| BACK-03 | 04-03 | `/credential-info` treats pubHash as Merkle root, resolves via registry | SATISFIED (code-level; live on-chain resolution not exercised) | Route unchanged from Phase 3 working baseline per review; logic confirmed correct by reading source |
| REPL-03 | 04-02, 04-03 | Nonce issue + verify-time match/freshness/one-time-use enforcement | SATISFIED | Live test: all 4 lifecycle outcomes (valid, already_used, mismatch, expired) proven; nonce not consumed on invalid proof |

No orphaned requirements: all 4 IDs declared across the 3 plans (`BACK-01`, `BACK-02`, `BACK-03`, `REPL-03`) match exactly the 4 IDs mapped to Phase 4 in REQUIREMENTS.md's traceability table.

### Anti-Patterns Found

None blocking. Code review (`04-REVIEW.md`) found 2 critical issues:

- **CR-01** (`/generate-proof` accepts unauthenticated/unverified attrs, proofs not bound to a real issued credential): this is a genuine trust-boundary gap in the implementation — confirmed still present in `server.js` (no registry lookup before `fullProve`). The task instructions for this verification explicitly designate CR-01 as an "accepted locked decision," so it is not scored as a blocking gap here, but it is **not actually fixed or formally documented as an accepted limitation anywhere in the codebase** (unlike the nonceStore unbounded-growth limitation, which has an in-code comment). This is flagged for visibility, not as a phase-failing gap, per the explicit instruction override.
- **CR-02** (PII logged to stdout on every `/generate-proof` call): confirmed FIXED — `server.js:73` now logs only `{hasAttrs, hasSalts}` booleans, not the raw request body.

Warnings (WR-01, WR-02, WR-03) and Info items (IN-01, IN-02) from the review are minor robustness/defensive-coding notes, not goal-blocking.

### Human Verification Required

### 1. On-chain verify + credential-info against a live Sepolia RPC

**Test:** Set a real `BLOCKCHAIN_RPC_URL` (live Alchemy/Infura Sepolia endpoint) and a credential actually registered under the new 7-attribute circuit scheme, then run `cd zkp-backend && TEST_FIXTURE_REGISTERED_ONCHAIN=true npm test` (or manually `curl` `/verify-onchain` and `/credential-info` against a freshly generated proof/pubHash).
**Expected:** `/verify-onchain` returns `{valid:true}` for a fresh proof+nonce; `/credential-info` returns `{found:true, ...}` for the registered pubHash.
**Why human:** This worktree's `.env` uses a placeholder `/demo` Alchemy URL with no live network access; the 2 corresponding tests in `verifyFlow.test.js` are explicitly gated and skip cleanly for this reason. The on-chain code path (pA/pB-swap/pC formatting, `getCredentialByHash` call) was reviewed and is structurally identical to the working Phase 3 baseline, but BACK-02's on-chain half and BACK-03 have not been exercised against a live chain in this verification pass.

### Gaps Summary

No code-level gaps block the phase goal. All library/route/test artifacts exist, are substantive (not stubs), are wired correctly, and the full local test suite (30/32 tests, excluding 2 cleanly-skipped on-chain tests) was executed live during this verification and passed — confirming the SUMMARY.md claims rather than just trusting them. The only open item is environment-dependent: on-chain verification of `/verify-onchain` and `/credential-info` requires a live Sepolia RPC and a registered fixture neither of which is available to this verifier, so that slice of BACK-02/BACK-03 is routed to human verification rather than marked failed (the code itself is unchanged from a previously-working baseline and was reviewed for correctness).

CR-01 (no binding between `/generate-proof` and a real issued credential) remains structurally present in the code and was not fixed in this phase; it is excluded from gap scoring only because the verification task explicitly instructed treating it as an accepted locked decision. This should be tracked as an explicit, documented risk acceptance (e.g., in CLAUDE.md or a phase ADR) rather than left implicit, since the codebase itself carries no record of this decision outside the review/verification artifacts.

---

_Verified: 2026-06-18T17:15:00Z_
_Verifier: Claude (gsd-verifier)_
