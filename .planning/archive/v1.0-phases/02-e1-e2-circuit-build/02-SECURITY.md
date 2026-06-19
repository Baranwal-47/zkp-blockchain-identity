---
phase: 02
slug: e1-e2-circuit-build
status: verified
threats_open: 0
asvs_level: 1
created: 2026-06-17
---

# Phase 02 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| prover (private witness) -> public signals | A malicious prover controls all private inputs (attr[], salt[]) and can attempt to publish predicates/disclosures inconsistent with the committed root | identity attributes, predicates, Merkle root |
| build toolchain -> compiled artifacts | The circom2 compiler + vendored circomlib produce the r1cs/wasm that Phase 3 trusts irreversibly (DESIGN-ONCE) | compiled circuit artifacts |
| compiled circuit -> Phase 3 trusted setup | The frozen r1cs/wasm is consumed irreversibly by the ceremony; an undetected encoding/ordering bug survives into the deployed verifier | r1cs/wasm artifacts |
| circuit witness -> verifier (nonce binding) | A captured proof could be replayed against a different verifier challenge if nonce were not bound | proof, nonce |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-02-01 | Tampering | dob/programmeLevel double-supply | mitigate | `attr[2]`/`attr[3]` signals reused for both leaf hash and predicate inputs (identity.circom:84,89,162) — a prover cannot commit one DOB/level and prove a predicate on another | closed |
| T-02-02 | Information disclosure | revealedValue[i] leaking a hidden attr | mitigate | `(1 - revealMask[i]) * revealedValue[i] === 0` (identity.circom:157) forces hidden values to publish as 0 | closed |
| T-02-03 | Spoofing / Replay | nonce optimized out of constraint system | mitigate | `nonceSq <== nonce * nonce` (identity.circom:237) forces nonce into a real constraint; witness-level nonce-rejection test passes (circuitParity.test.js) | closed |
| T-02-04 | Tampering | wrong zero-pad leaf value via transcription error | mitigate | leaf 7 computed via actual `Poseidon(2)(0,0)` component, not a hardcoded constant (identity.circom:134-142) | closed |
| T-02-05 | Information disclosure | field underflow in currentDateInt - 180000 | accept | currentDateInt set by trusted backend to a real ~20XXXXXX date; underflow unreachable in practice. Range-checked via `Num2Bits(32)` added during code-review fix (CR-01, commit a6c716e), further reducing residual risk | accepted |
| T-02-SC | Tampering | npm/circom toolchain installs | accept | No new packages installed in either plan; circom2/snarkjs/circomlib/chai/mocha/hardhat already vendored/present | accepted |
| T-02-06 | Tampering | chunking/ordering bug survives into irreversible Phase-3 setup | mitigate | Witness-level parity gate (D-14) against all IDENTITY_SPEC.md section 9 vectors incl. both mandatory multi-chunk cases — 13/13 tests pass, blocks freeze until circuit root == JS oracle root | closed |
| T-02-07 | Spoofing / Replay | captured proof replayed against a different nonce | mitigate | Witness-level nonce-binding test (REPL-02) + WR-03 fix (commit 7740a11) strengthened to prove the constraint is load-bearing, not just an echoed value; full groth16.verify nonce-swap deferred to Phase 4 where the zkey exists | closed |
| T-02-08 | Repudiation | circuit silently edited after freeze, invalidating the ceremony | mitigate | Explicit "CIRCUIT FROZEN" sign-off recorded in 02-02-SUMMARY.md after all parity + nonce tests passed | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

**Note:** Code review (02-REVIEW.md) found and fixed one additional soundness gap not in the original plan-time register — CR-01: missing range-check on `attr[2]`/`currentDateInt` before `GreaterEqThan(32)`, which could allow an out-of-range forged DOB to fake `isOver18=1`. Fixed via `Num2Bits(32)` range checks (commit a6c716e) before this security audit ran; folded into T-02-05's mitigation evidence above since it's the same code region.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-02-01 | T-02-05 | currentDateInt is backend-controlled, not prover-controlled; underflow path is unreachable given real-world date values, and now additionally range-checked | Phase 2 plan author | 2026-06-17 |
| AR-02-02 | T-02-SC | No new dependencies introduced in Phase 2; all toolchain packages pre-existing and vendored | Phase 2 plan author | 2026-06-17 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-06-17 | 8 | 8 | 0 | Claude (orchestrator, evidence-based verification against identity.circom + circuitParity.test.js + SUMMARY.md) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter
