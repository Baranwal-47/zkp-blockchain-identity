---
phase: 01-freeze-spec-field-set-consistency
plan: "04"
subsystem: acceptance-gate
tags: [parity, merkle, reseed, SPEC-02, acceptance-gate, multi-chunk]
dependency_graph:
  requires: ["01-02", "01-03"]
  provides: ["reseed-parity-gate", "spec-02-verified"]
  affects: []
tech_stack:
  added: []
  patterns:
    - "Wipe-and-reseed ESM script (top-level async main, mongoose connect/disconnect in finally)"
    - "Independent prover-side root recomputation reading back persisted salts"
    - "assert.strictEqual root-equality gate per student"
key_files:
  created:
    - privdId_admin/backend/scripts/reseed.js
  modified: []
decisions:
  - "D-12: wipe-and-reseed (no migration); SEED set covers postgrad/undergrad, over-18/under-18, discipline spread, and the two mandatory >31-byte multi-chunk cases"
metrics:
  duration_seconds: 138
  completed_date: "2026-06-17"
  tasks_completed: 2
  files_modified: 1
---

# Phase 01 Plan 04: Wipe-and-Reseed Parity Gate Summary

**One-liner:** The central Phase-1 acceptance gate — re-seeds 7 test students through the new issuance path and independently recomputes each Merkle root prover-side, asserting equality. Live run: 7/7 PASS, exit 0. The §1.4 field-set drift is provably dead.

---

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Write the wipe-and-reseed script with the root-equality acceptance gate | 9588bf9 | privdId_admin/backend/scripts/reseed.js (created, 282 lines) |
| 2 | Run reseed.js against live MongoDB and confirm the root-equality gate passes (checkpoint:human-verify, blocking) | — (verification task) | — |

---

## What Was Built

### Task 1 — reseed.js

ESM script (run with `node scripts/reseed.js` from `privdId_admin/backend/`). Imports the shared `identityCommitment.js` (`hashToField`, `generateSalts`, `computeMerkleRoot`, `CHUNK_COUNTS`), `enumCodes.js` (`PROGRAMME_LEVEL`, `DISCIPLINE`), the `Student` model, mongoose, assert, and dotenv.

`main()`:
1. Fails fast if `MONGO_URI` is unset.
2. `mongoose.connect(process.env.MONGO_URI)`.
3. `Student.deleteMany({})` (D-12 wipe — no migration).
4. For each of 7 SEED students: derives `dobInt` from the `YYYY-MM-DD` string, generates 7 salts, builds the **issuance** `attrs` array in the frozen leaf order, computes `merkleRoot`, persists via `Student.create(...)`.
5. **Prover-side recomputation:** independently rebuilds `attrs` from the known field values (re-running `hashToField` + enum lookups, NOT reusing the issuance array) and recomputes the root against the **persisted** `salts`, then `assert.strictEqual(recomputed, createdStudent.merkleRoot)`.
6. `mongoose.disconnect()` in a `finally` block.

**SEED edge-case coverage (D-12):**
- `23BCS041` — name "Rajesh Kumar Sharma Gupta Verma Singh" (37 bytes) → **2-chunk name path**
- `22MTE007` — email "utkarshbaranwal47@students.iiitdmj.ac.in" (40 bytes) → **2-chunk email path**, postgrad (M.Tech)
- `22PHD003` — postgrad (PhD); `21DUL015` — Dual; `23BDS012`, `24BCS098`, `21MDE004` — undergrad/spread
- over-18 and under-18 DOBs (computed relative to 2026-06-16); discipline spread across the enum set

### Task 2 — Live acceptance gate (human-verify)

Run by the orchestrator with explicit user authorization (test DB, disposable data).

```
[reseed] Wiped 6 existing student record(s).
[reseed] 23BCS041  root=2794297736408240...  salts=7  (2-chunk name)  PASS
[reseed] 22MTE007  root=4763978709902074...  salts=7  (2-chunk email)  PASS
[reseed] 23BDS012  root=2157096033403700...  salts=7  (1-chunk)  PASS
[reseed] 22PHD003  root=1411221010364985...  salts=7  (1-chunk)  PASS
[reseed] 21DUL015  root=9103936503782788...  salts=7  (1-chunk)  PASS
[reseed] 24BCS098  root=6013680065971829...  salts=7  (1-chunk)  PASS
[reseed] 21MDE004  root=1463050415106170...  salts=7  (1-chunk)  PASS
[reseed] Done. 7/7 students seeded and verified. All root-equality gates PASSED.
```
Exit code 0. Both mandatory multi-chunk cases (`23BCS041`, `22MTE007`) PASSED.

---

## Deviations from Plan

None for this plan. (Note: a cross-plan parity-oracle fix landed during this phase — the `Poseidon(2)(0,0)` zero-pad value in `IDENTITY_SPEC.md` was corrected to the empirically-verified circomlibjs@0.1.7 value before this gate ran; see commit 49c7971.)

---

## Threat Mitigations Implemented

| Threat | Status |
|--------|--------|
| T-01-12: issuance and prover-side leaf computation silently diverge (the §1.4 failure) | Mitigated — `assert.strictEqual` root-equality gate passed per student; both paths import the same shared module (D-08) |
| T-01-13: multi-chunk string path (>31 bytes) diverges while short strings pass | Mitigated — gate PASSED for the 37-byte name and 40-byte email students |
| T-01-14: re-seed lacks predicate edge cases | Mitigated — SEED set covers over-18/under-18, postgrad/undergrad, discipline spread (D-12) |

---

## Known Stubs

None. The script is the live acceptance gate; it does not touch the ZKP backend prover endpoint (Phase 4), by design — the prover-side path here is the in-process recomputation.

---

## Self-Check: PASSED

File exists:
- `privdId_admin/backend/scripts/reseed.js` — FOUND (contains assert.strictEqual, deleteMany, computeMerkleRoot, both >31-byte fixtures)

Commit exists:
- 9588bf9 — Task 1 (reseed script)

Live gate:
- 7/7 students PASS, exit 0 (run 2026-06-17)
