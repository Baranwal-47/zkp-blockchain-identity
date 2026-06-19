---
status: complete
phase: 03-trusted-setup-redeploy
source: [03-01-SUMMARY.md, 03-02-SUMMARY.md]
started: 2026-06-18T03:58:00Z
updated: 2026-06-18T04:10:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Trusted setup ceremony verifies against frozen circuit
expected: snarkjs zkey verify reports "ZKey Ok!" against the frozen 7891-constraint circuit (recorded in CEREMONY_LOG.md)
result: pass

### 2. Groth16Verifier is live and deployed on Sepolia
expected: Sepolia address 0x630955e2E7e795B3075BD35c2bB93ceA7cE5ffc4 has live deployed contract code (visible on a Sepolia block explorer or via eth_getCode)
result: pass

### 3. zkp-backend resolves new artifacts and address, not stale fallbacks
expected: zkp-backend/.env VERIFIER_ADDRESS reads 0x630955e2E7e795B3075BD35c2bB93ceA7cE5ffc4, verification_key.json reports nPublic=19, and a boot of server.js's module-load logic does not fall through to the hardcoded stale fallback addresses
result: pass

## Summary

total: 3
passed: 3
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
