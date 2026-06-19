---
phase: 03-trusted-setup-redeploy
fixed_at: 2026-06-18T03:51:58Z
review_path: .planning/phases/03-trusted-setup-redeploy/03-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 3: Code Review Fix Report

**Fixed at:** 2026-06-18T03:51:58Z
**Source review:** .planning/phases/03-trusted-setup-redeploy/03-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 2 (explicit subset requested: WR-02, WR-03)
- Fixed: 2
- Skipped: 0

This run was scoped to an explicit subset of two Warning findings. The remaining four findings
from 03-REVIEW.md (CR-01, WR-01, IN-01, IN-02) were deliberately excluded from this run's scope
per orchestrator instruction and are NOT reflected in the counts above — see "Out of Scope"
below for why each was excluded.

## Fixed Issues

### WR-02: `hardhat.config.js` does not validate `SEPOLIA_RPC_URL` / `PRIVATE_KEY` before constructing the network config

**Files modified:** `zk-proofs/hardhat.config.js`
**Commit:** e4ce14d
**Applied fix:** Destructured `SEPOLIA_RPC_URL` and `PRIVATE_KEY` from `process.env` at module
load time, added a `console.warn` when either is missing, and changed the `sepolia` network
config to use `SEPOLIA_RPC_URL || ""` for `url` and a conditional `PRIVATE_KEY ? [\`0x${PRIVATE_KEY}\`] : []`
for `accounts`. This converts the previous opaque "0xundefined" / generic network-config error
into a clear, loud warning naming the missing env vars, while keeping the config object
well-formed (empty string / empty array) so hardhat itself doesn't crash on require.

### WR-03: `circuitParity.test.js` duplicate ESM import instead of reusing the `before()`-cached oracle reference

**Files modified:** `zk-proofs/test/circuitParity.test.js`
**Commit:** 70d4e86
**Applied fix:** Added a `computeLeaf` outer `let` binding alongside the existing
`computeMerkleRoot`, hoisted `computeLeaf = oracle.computeLeaf` into the existing `before()` hook
(reusing the oracle reference already imported there), and replaced the duplicate
`await import("../../privdId_admin/backend/utils/identityCommitment.js")` + `oracle.computeLeaf(0, 0)`
in the "zero-padding leaf sanity" test with a direct call to the cached `computeLeaf(0, 0)`. The
relative import path to `identityCommitment.js` now appears exactly once in the file.

## Out of Scope (not attempted this run)

The following findings from 03-REVIEW.md were explicitly excluded from this run's scope per
orchestrator instruction and were not touched:

- **CR-01** (`zkp-backend/.env` contains live-looking secrets) — accepted operational risk for a
  testnet-only deployer key, not a code-level fix; deferred to a future secrets-management pass.
- **WR-01** (stale verifier/registry fallback addresses in `server.js`) — `server.js` is being
  rewritten in Phase 4 with a new input shape; fixing the fallback now would be wasted effort
  ahead of that rewrite.
- **IN-01** (missing ceremony-duration timing in `PERFORMANCE_METRICS.md`) — belongs to Phase 5's
  benchmarking scope.
- **IN-02** (duplicated `verification_key.json` with no enforced sync) — accepted architectural
  tradeoff for now; no build-step enforcement requested at this time.

---

_Fixed: 2026-06-18T03:51:58Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
