---
phase: 01-freeze-spec-field-set-consistency
plan: "01"
subsystem: identity-commitment-spec
tags: [spec, frozen, enum-codes, poseidon, merkle, bn128]
requirements_satisfied: [SPEC-01]
decisions:
  - D-01: String attributes use hash-to-field (31-byte chunks → Poseidon), not raw UTF-8→BigInt
  - D-02: Chunk-then-Poseidon scheme identical in JS and Phase-2 circom; arities name=4, rollNo=2, email=2 frozen
  - D-03: dob as YYYYMMDD integer, batch as 4-digit year — fed directly to leaf hasher
  - D-06: programmeLevel and discipline as integer codes from canonical enumCodes.js
  - D-07: Codes are append-only once frozen; renumbering invalidates all prior commitments
  - D-09: Leaf layout fixed (0:name, 1:rollNo, 2:dob, 3:programmeLevel, 4:discipline, 5:batch, 6:email, 7:zero-pad); node order Poseidon(2)(left,right) with left=lower-index
dependency_graph:
  requires: []
  provides: [SPEC-01, enumCodes-module]
  affects: [plan-02-identity-commitment-module, plan-03-issuance-refactor, plan-04-reseed, phase-2-circuit]
tech_stack:
  added: []
  patterns:
    - Frozen spec document as single source of truth for downstream circuit and JS module
    - Canonical enum code ESM module with append-only comment block
key_files:
  created:
    - docs/current/research/IDENTITY_SPEC.md
    - privdId_admin/backend/constants/enumCodes.js
  modified: []
metrics:
  duration_minutes: 4
  completed_date: "2026-06-17"
  tasks_total: 2
  tasks_completed: 2
  files_created: 2
  files_modified: 0
---

# Phase 01 Plan 01: Freeze Spec & Enum Codes Summary

## One-liner

Frozen 7-attribute Poseidon-Merkle identity spec (hash-to-field, 31-byte chunks, depth-3 tree) and canonical ESM enum-code module for programmeLevel/discipline/isPostgrad committed as BN128 field elements.

## What Was Built

**Task 1 — docs/current/research/IDENTITY_SPEC.md (SPEC-01)**

The frozen single source of truth for the PrivdID 7-attribute identity commitment. Contains:
- Leaf layout table (indices 0–7, fixed): name, rollNo, dob, programmeLevel, discipline, batch, email, zero-padding
- Hash-to-field encoding rule (31-byte big-endian chunks → `Poseidon(maxChunks)`): arities name=4, rollNo=2, email=2 frozen; email validator cap at 62 bytes specified
- Integer encoding rule: dob as YYYYMMDD integer, batch as 4-digit year, enum codes directly to leaf hasher
- Merkle construction: `leaf_i = Poseidon(2)(encodedAttr_i, salt_i)`; `node = Poseidon(2)(left, right)` with left=lower-index explicitly stated; depth-3 topology diagram; leaf[7] = `Poseidon(2)(0,0)` = `14744269619966411208460611736853059166543709924778005885397896789179099038553` (non-zero)
- Salt rule: 31 random bytes → BigInt → decimal string; 7 salts in leaf-index order in `Student.salts[]`
- Public signal layout: pubHash (Merkle root) = signal [0]; bytes32 via `ethers.zeroPadValue`
- BN128 scalar field order: `21888242871839275222246405745257275088548364400416034343698204186575808495617`
- Frozen enum codes table (informational copy; enumCodes.js is canonical)
- 9 verified parity test vectors including the mandatory multi-chunk vectors: 37-byte name and 40-byte email (2-chunk paths)
- Phase-2 forward contract with Dual(3) isPostgrad confirmation note

**Task 2 — privdId_admin/backend/constants/enumCodes.js**

Frozen ESM constants module (named exports only, no default export):
- `PROGRAMME_LEVEL`: B.Tech=1, B.Des=2, Dual=3, M.Tech=4, M.Des=5, PhD=6
- `DISCIPLINE`: CSE=1, ECE=2, ME=3, SmartMfg=4, Design=5, NatSci=6
- `POSTGRAD_CODES = new Set([4, 5, 6])` — M.Tech, M.Des, PhD; Dual(3) excluded
- Top-of-file FROZEN comment block: append-only rule, circuit rebuild warning, Dual confirmation note

Node ESM import verified: all codes correct, isPostgrad excludes Dual (3).

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Write frozen IDENTITY_SPEC.md | b745377 | docs/current/research/IDENTITY_SPEC.md |
| 2 | Create frozen enumCodes.js | e46481e | privdId_admin/backend/constants/enumCodes.js |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. Both artifacts are complete specs and code; no placeholders or TODO stubs exist.

## Threat Flags

No new security-relevant surface introduced (these are pure documentation and constants files with no network endpoints, auth paths, or file access patterns).

## Self-Check: PASSED

- `docs/current/research/IDENTITY_SPEC.md` exists: FOUND
- `privdId_admin/backend/constants/enumCodes.js` exists: FOUND
- Commit b745377 exists: FOUND
- Commit e46481e exists: FOUND
- IDENTITY_SPEC.md line count: 288 (>= 60 minimum)
- IDENTITY_SPEC.md contains BN128 field order: FOUND
- IDENTITY_SPEC.md contains >31-byte email parity vector: FOUND
- IDENTITY_SPEC.md contains name=4 chunk count: FOUND
- IDENTITY_SPEC.md contains Poseidon(2)(left node order: FOUND
- enumCodes.js ESM import test: PASSED (enumCodes ok)
- Both artifacts agree on enum codes (B.Tech=1): CONFIRMED
