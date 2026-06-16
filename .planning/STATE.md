# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-16)

**Core value:** A verifier can cryptographically confirm a student's selectively-disclosed identity attributes and predicates against an on-chain Merkle-root commitment, with replay-proof freshness.
**Current focus:** Phase 1 — Freeze Spec & Field-Set Consistency

## Current Position

Phase: 1 of 5 (Freeze Spec & Field-Set Consistency)
Plan: 0 of TBD in current phase
Status: Ready to plan
Last activity: 2026-06-16 — Roadmap created, 19/19 requirements mapped across 5 phases

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: — min
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: —
- Trend: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Milestone]: Scope = circuit critical path only (blueprint Phase 0 + Phase 1); E3/E5/E6/UI/auth-hardening deferred to v2.
- [Milestone]: 7 committed attributes, depth-3 Merkle, 1 reserved leaf; `programme` split into `programmeLevel`+`discipline`, `phone` dropped for `email`.
- [Milestone]: Enrollment status is on-chain only (not a committed attribute); proof generation stays server-side.

### Pending Todos

None yet.

### Blockers/Concerns

- DESIGN-ONCE: the circuit must be frozen (Phase 2 complete) before the trusted setup (Phase 3) runs — any later circuit edit invalidates the .zkey and forces a full redeploy. Do not split E1 and E2 across phases.
- FIELD-SET CONSISTENCY (§1.4) is the highest-risk inconsistency and must be fully resolved in Phase 1 — any mismatch causes silent on-chain verification failure.
- Existing build artifacts and old flat-Poseidon(5) credentials are all regenerated; wipe and re-seed test students rather than migrate. `pot12_final.ptau` must be downloaded (or a larger ptau if constraints exceed the power of tau).

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Storage (E3) | Encrypted holder-controlled IPFS storage | Deferred to v2 | 2026-06-16 |
| Governance (E5) | Gnosis Safe 2-of-3 registry admin | Deferred to v2 | 2026-06-16 |
| Key Recovery (E6) | Shamir 2-of-3 split/reconstruct | Deferred to v2 | 2026-06-16 |
| UI & Hardening | Theme token system, auth/bcrypt/JWT/rate-limit | Deferred to v2 | 2026-06-16 |

## Session Continuity

Last session: 2026-06-16 09:37
Stopped at: Roadmap and STATE created; ready to plan Phase 1
Resume file: None
