# Roadmap: PrivdID

## Milestones

- ✅ **v1.0 — Circuit Rebuild (E1 + E2)** — Phases 1-5 (shipped 2026-06-18)
- ✅ **v2.0 — E3 Encrypted Holder-Controlled Storage** — Phases 6-8 (shipped 2026-06-20)
- 📋 **v3.0 — Governance & Custody (E5 + E6)** — Phases 9+ (planning)

## Phases

<details>
<summary>✅ v1.0 — Circuit Rebuild (E1 + E2) — Phases 1-5 — SHIPPED 2026-06-18</summary>

E1 depth-3 Merkle selective-disclosure circuit + E2 verifier-nonce replay protection. Fresh Groth16 trusted setup, redeployed verifier, ZKP backend integration, nonce lifecycle, benchmarked (mean ± σ, n≥19). Phase artifacts under `.planning/archive/v1.0-phases/`; full detail in `.planning/milestones/v2.0-ROADMAP.md` predecessor notes and `MILESTONES.md`.

</details>

<details>
<summary>✅ v2.0 — E3 Encrypted Holder-Controlled Storage — Phases 6-8 — SHIPPED 2026-06-20</summary>

- [x] Phase 6: Encryption & Ciphertext Storage (3/3 plans) — 2026-06-19
- [x] Phase 7: Student Keypair & Two-Phase Enrollment (4/4 plans) — 2026-06-20
- [x] Phase 8: Daily Access Flow (5/5 plans) — 2026-06-20

Full detail archived in `.planning/milestones/v2.0-ROADMAP.md`; phase dirs in `.planning/milestones/v2.0-phases/`. ERASE-01 (crypto-shredding) was descoped to E6-04 — erasure needs E6's destroyable Shamir custody.

</details>

### 📋 v3.0 — Governance & Custody (E5 + E6) (planning)

Phases TBD via `/gsd:new-milestone` (continuing numbering from Phase 9).

## Progress

| Phase | Milestone | Plans | Status | Completed |
|-------|-----------|-------|--------|-----------|
| 1-5 (E1+E2 circuit) | v1.0 | — | Complete | 2026-06-18 |
| 6. Encryption & Ciphertext Storage | v2.0 | 3/3 | Complete | 2026-06-19 |
| 7. Student Keypair & Two-Phase Enrollment | v2.0 | 4/4 | Complete | 2026-06-20 |
| 8. Daily Access Flow | v2.0 | 5/5 | Complete | 2026-06-20 |
