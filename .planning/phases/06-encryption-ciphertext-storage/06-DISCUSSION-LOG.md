# Phase 6: Encryption & Ciphertext Storage - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-19
**Phase:** 6-Encryption & Ciphertext Storage
**Areas discussed:** DEK custody, Re-issuance DEK policy, Schema field rename (ipfsCID → ciphertextCID)

---

## DEK custody (until Phase 7 wraps it)

| Option | Description | Selected |
|--------|-------------|----------|
| New field on Student doc | Plaintext DEK field on the existing Student model; must be stripped from sanitizeStudent(). Matches the single-custody gap already accepted in PROJECT.md. | ✓ |
| Separate collection | New collection keyed by studentId, isolated from the Student read path entirely. | |
| Don't persist | Return DEK to caller only; Phase 6-issued credentials become unclaimable until Phase 7 revisits issuance. | |
| You decide | | |

**User's choice:** New field on Student doc
**Notes:** Recommended option — least total code across Phase 6+7, consistent with the already-documented single-custody interim gap.

---

## Re-issuance DEK policy

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse existing DEK | Only ciphertext changes on update; any already-claimed envelope (Phase 7/8) stays valid, no re-claim flow ever needed. | ✓ |
| Rotate to a fresh DEK | Simpler mental model, but invalidates already-wrapped envelopes — would need an unplanned re-claim flow. | |
| You decide | | |

**User's choice:** Reuse existing DEK
**Notes:** First issuance (create/bulk) still generates a fresh DEK — reuse applies specifically to updateStudent()'s re-issuance path.

---

## Schema field rename (ipfsCID → ciphertextCID)

| Option | Description | Selected |
|--------|-------------|----------|
| Rename everywhere | Matches spec name exactly, no dead field. Touches 4 files (admin backend model+service, zkp-backend server.js, digital-app VerifyProof.js), each a one-line rename. | ✓ |
| Add alongside, leave ipfsCID | Avoids touching zkp-backend/digital-app this phase, but leaves a vestigial field nothing writes to. | |
| You decide | | |

**User's choice:** Rename everywhere
**Notes:** No migration path exists anyway (wipe-and-reseed already locked for v2.0), so there's no legacy data under the old name to preserve.

---

## Claude's Discretion

- Exact shape/naming of the new `crypto/aesgcm.js` module (function signatures, internal helpers).
- Wrapping `encryptCredential` in the existing `timed()` benchmark helper (CLAUDE.md ground rule 5 mandates this — not really optional).
- Pinata pin naming convention for the ciphertext blob (extend existing `privid-credential-${rollNo}` pattern).
- Whether to de-duplicate the attrs-array-building logic shared by createStudent/updateStudent into a helper.

## Deferred Ideas

- **eciesjs Node+RN compatibility verification spike** — flagged by the user at the start of this session. Belongs in Phase 7's research/discuss step (where the on-device RN keypair side of ECIES is actually exercised), not Phase 6 (pure backend Node). Carried into CONTEXT.md's `<deferred>` section so it surfaces again at `/gsd:discuss-phase 7`.
