---
phase: 10-threshold-custody-primitive-e6-split
plan: 02
type: summary
status: complete
commit: 48d602c
---

# Plan 10-02 Summary — Custody Split Wired into Issuance + Claim

## What was built

**models/Student.js** — `dek` field removed; added `custodyShareA/B/C` (all `select:false`) and `pendingDek` (`select:false`). custodyShareA is plaintext shareA (AcadAdmin, D-03); shareB/C are RSA-OAEP ciphertext; pendingDek is the transient claim-window copy (Open Question #1 resolution).

**services/custodianKeys.js** — lazy PEM loader mirroring `safeService.js::getApiKit()`. `getRegistrarPublicKey()` / `getDeanPublicKey()` read from `REGISTRAR_PUBLIC_KEY_PATH` / `DEAN_PUBLIC_KEY_PATH` on first call; throw a descriptive error when unconfigured (never crash at boot, never surface raw ENOENT).

**services/studentService.js** changes:
- `createStudent`: after `encryptAndPinCredential`, calls `splitDEK` → `wrapShare` (×2, awaited) → stores `custodyShareA/B/C` + `pendingDek`; `student.dek` assignment removed.
- `insertBulkStudents`: same split-and-store at its `updateOne` call site.
- `claimCredential`: `.select('+pendingDek')`, reads `pendingDek`, `$unset: { pendingDek: "" }`.
- `updateStudent`: `.select('+pendingDek')`; re-issuance branch throws `AppError(409)` with TODO(Phase 11) for claimed (no-pendingDek) students.

**issuance-custody.smoke.mjs** — all assertions pass.

## Verification

```
node issuance-custody.smoke.mjs → ALL PASS
dek-sweep grep                  → zero matches (exit 1)
splitDEK( in studentService.js  → 2 (both createStudent + insertBulkStudents)
await wrapShare( count          → 4 (shareB + shareC × 2 issuance paths)
student.dek = count             → 0
pendingDek refs                 → 12
TODO(Phase 11)                  → 1
```

## Requirements met
- CUST-02: DEK split 2-of-3 at issuance; shareA plaintext, shareB/C RSA-OAEP wrapped — admin DB + process alone never yields 2 usable shares (T-10-04)
- CUST-03: `dek` field gone; only `pendingDek` (transient, wiped at claim) and shares remain — no plaintext DEK as a substitute for real custody (T-10-05)
- T-10-07: issuance fails loudly (throws) when custodian PEM is unconfigured — split never silently skipped
- T-10-12: `updateStudent` throws Phase-11 deferral for claimed students — never reuses a plaintext DEK
