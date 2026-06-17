# Phase 2: E1+E2 Circuit Build - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-17
**Phase:** 2-E1+E2 Circuit Build
**Areas discussed:** Dual-degree postgrad status, Parity-test rigor

---

## Dual-degree postgrad status

| Option | Description | Selected |
|--------|-------------|----------|
| Dual excluded (current spec) | isPostgrad = {4,5,6} = M.Tech, M.Des, PhD only. Matches the spec as currently frozen — no doc change needed. | ✓ |
| Dual included | isPostgrad = {3,4,5,6}. Requires updating IDENTITY_SPEC.md §5/§9 POSTGRAD_CODES before the circuit is written. | |
| I don't know — ask Dr. Singh / registrar | Defer the circuit build until confirmed externally. | |

**User's choice:** Dual excluded (current spec)
**Notes:** Resolves the IDENTITY_SPEC.md §9 open question raised in Phase 1; confirms the existing frozen `{4,5,6}` set rather than changing it.

---

## Parity-test rigor

| Option | Description | Selected |
|--------|-------------|----------|
| Witness test against all Phase-1 vectors (recommended) | Feed the exact attr/salt inputs behind IDENTITY_SPEC.md §9's vectors into the compiled circuit and assert the output root matches byte-for-byte, including the multi-chunk email/name cases. | ✓ |
| Spot-check manually | Compile and eyeball a witness for one or two cases. Faster, riskier. | |
| Trust the JS module, skip circuit-side parity test | No automated cross-check. Fastest but riskiest given DESIGN-ONCE. | |

**User's choice:** Witness test against all Phase-1 vectors (recommended)
**Notes:** Given DESIGN-ONCE (Phase 3's trusted setup is irreversible), the user chose the highest-rigor option since the test vectors already exist from Phase 1.

---

## Claude's Discretion

- Test tooling for the parity check (`circom_tester`/snarkjs witness calc vs `@solarity/hardhat-zkit`)
- Exact circom template organization (single vs helper templates), as long as public-signal order/leaf layout match the spec verbatim
- Signal naming/typing for `revealedValue[7]`/`revealMask[7]`
- Constraint-count recording format/location

## Deferred Ideas

- "Is CSE" / discipline-specific predicates beyond isOver18/isPostgrad — not in v1 requirements, would be scope creep
- Cohort/"current student" predicate from `batch` — same reasoning
- Trusted setup, verifier redeploy — Phase 3
- ZKP backend integration, nonce endpoints — Phase 4
