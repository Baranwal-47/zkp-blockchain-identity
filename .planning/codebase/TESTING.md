# Testing

## Overview

Test coverage across the project is **very low**. Only the `zk-proofs` service has meaningful tests (gas cost measurements for the registry contract). All other services have no test files. There is no CI/CD pipeline.

---

## Service: digital-app

**Framework:** None
**Tests:** None
**Test script:** Not defined
**Coverage:** None

---

## Service: privdId_admin/frontend

**Framework:** None
**Tests:** None
**Test script:** Not defined
**Coverage:** None

---

## Service: privdId_admin/backend

**Framework:** None
**Tests:** None
**Test script:** Not defined
**Coverage:** None

---

## Service: zkp-backend

**Framework:** None (performance measurement only)
**Tests:** No test files
**Test script:** `exit 1` (explicitly fails)
**Coverage:** None

Performance measurement uses `console.time` / `console.timeEnd` — not a test framework.

---

## Service: zk-proofs (Hardhat)

**Framework:** Hardhat + Chai + Mocha
**Test files:**
- `test/Lock.js` — Hardhat scaffold boilerplate; not project-specific
- `test/Registry.js` — Gas cost measurements for `CredentialRegistry.sol`

**Patterns used:**
- `loadFixture` for test setup
- `before()` setup hooks
- Chai matchers: `revertedWith`, `changeEtherBalances`, `emit`

**What's tested:**
- `CredentialRegistry.sol` — basic gas cost scenarios

**What's NOT tested:**
- `IdentityVerifier.sol` — no tests
- Circom ZK circuit (`identity.circom`) — no circuit tests
- Proof generation / verification flow end-to-end

**Coverage:** Low — registry gas costs only

---

## CI/CD

**Status:** None
- No `.github/` directory at repo root
- No GitHub Actions workflows
- No other CI configuration (CircleCI, GitLab CI, etc.)

---

## Test Gaps Summary

| Service | Has Tests | Coverage |
|---------|-----------|----------|
| digital-app | No | None |
| privdId_admin/frontend | No | None |
| privdId_admin/backend | No | None |
| zkp-backend | No | None |
| zk-proofs contracts | Partial | Gas costs only |
| ZK circuit | No | None |
| CI/CD pipeline | No | — |
