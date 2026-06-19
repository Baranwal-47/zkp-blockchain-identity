# Phase 6: Encryption & Ciphertext Storage - Context

**Gathered:** 2026-06-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Every credential issued by the admin backend (create, bulk-create, update/re-issue) is AES-256-GCM encrypted under a random per-student DEK before it touches IPFS. Plaintext credential JSON is eliminated from the storage layer entirely — only ciphertext is pinned. This phase does NOT touch the student keypair, ECIES wrapping, or two-phase enrollment (Phase 7) — it only generates the DEK, encrypts, and pins. Requirements: STORE-01, STORE-02.

</domain>

<decisions>
## Implementation Decisions

### DEK custody (until Phase 7 wraps it)
- **D-01:** Add a new plaintext DEK field directly to the `Student` model (e.g. `dek`, base64). This is the accepted single-custody interim gap already documented in PROJECT.md/REQUIREMENTS.md (no real Shamir split until E6).
- **D-02:** This field MUST be excluded from `sanitizeStudent()` (and any other student-serialization path) so it never leaks via the admin API. Treat this as a hard requirement for the planner/executor, not optional cleanup.
- **D-03:** Phase 7 will read this field, ECIES-wrap it to the student's pubkey, then wipe it (set to null) — Phase 6 only needs to write it, not clear it.

### Re-issuance / update DEK policy
- **D-04:** `updateStudent()` re-encrypts the credential JSON with the student's EXISTING DEK (reuse, not rotate). Only the ciphertext changes on update; the DEK itself is stable across the student's lifetime (until erasure in Phase 9).
- **D-05:** Rationale: once Phase 7/8 ship, a student may have already claimed an ECIES envelope wrapping this DEK. Rotating the DEK on every profile edit would silently invalidate that envelope with no re-claim flow anywhere in the roadmap. Reuse avoids ever needing one.
- **D-06:** `createStudent()` and `insertBulkStudents()` (first issuance) generate a fresh DEK — reuse only applies to `updateStudent()`'s re-issuance path, since at first issuance no DEK exists yet.

### Schema field rename: ipfsCID → ciphertextCID
- **D-07:** Rename the field outright everywhere — do not add `ciphertextCID` alongside the old `ipfsCID`. No migration path exists anyway (wipe-and-reseed is already the locked v2.0 approach), so there's no legacy data to preserve under the old name.
- **D-08:** Touches 4 files confirmed by grep: `privdId_admin/backend/models/Student.js`, `privdId_admin/backend/services/studentService.js`, `zkp-backend/server.js`, `digital-app/screens/VerifyProof.js`. The Phase 6 plan must include updating all 4, not just the admin backend.

### Claude's Discretion
- Exact shape/naming of the new crypto module (`crypto/aesgcm.js` per blueprint §E3.6) — function signatures, internal helpers.
- Whether to wrap the new `encryptCredential` call in the existing `timed()` helper (CLAUDE.md ground rule 5 mandates benchmarking new crypto ops — this should just be done, not re-litigated).
- Pinata pin naming convention for the ciphertext blob (existing pattern: `privid-credential-${rollNo}` — extend analogously, e.g. `privid-ciphertext-${rollNo}`).
- Whether to centralize the duplicated attrs-array-building logic (`createStudent`/`updateStudent` both build the same 7-element array inline) into a shared helper — pure code-quality call, not a product decision.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### E3 spec (this milestone)
- `docs/CLAUDE_CODE_BLUEPRINT.md` §E3.1 (lines 240-243) — AES-256-GCM blob format `{iv, authTag, ciphertext}`, base64-encoded
- `docs/CLAUDE_CODE_BLUEPRINT.md` §E3.2 (lines 245-257) — exact encrypted credential JSON shape (7 attrs + 7 salts in frozen leaf order + merkleRoot + issuedAt/issuer/type/version); salts MUST live inside this object
- `docs/CLAUDE_CODE_BLUEPRINT.md` §E3.6 (lines 282-284) — backend additions: `crypto/aesgcm.js`, updated `credentialService.js`

### Project/requirements
- `.planning/PROJECT.md` — v2.0 milestone scope, single-custody DEK gap rationale
- `.planning/REQUIREMENTS.md` — STORE-01, STORE-02 acceptance criteria
- `.planning/ROADMAP.md` Phase 6 section — success criteria (3 criteria: DEK+encrypt+pin on issuance, no plaintext ever pinned, two different students yield two different DEKs/ciphertexts)

### Field-set / leaf order (do not drift)
- `privdId_admin/backend/utils/identityCommitment.js` — frozen 7-attribute leaf order and `CHUNK_COUNTS`; the encrypted JSON's attribute order MUST match this exactly (name, rollNo, dobInt, programmeLevel, discipline, batch, email)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `privdId_admin/backend/services/credentialService.js::pinToIPFS()` — existing Pinata `pinJSONToIPFS` call; reuse the same axios/auth pattern for pinning the ciphertext blob object (it's still JSON — base64 strings inside).
- `privdId_admin/backend/utils/identityCommitment.js::timed()` (imported from `./timing.js`) — existing benchmark wrapper used by `computeMerkleRoot`; reuse for the new `encryptCredential` call per CLAUDE.md ground rule 5.
- `Student.salts`, `Student.merkleRoot`, `Student.dobInt`, `Student.programmeLevel`, `Student.discipline`, `Student.batch` — all 7 raw attribute values + salts already exist on the Student document; no new fields needed to build the §E3.2 JSON except the new DEK field and the renamed CID field.

### Established Patterns
- **Non-blocking anchor pattern**: all 3 call sites (`createStudent`, `insertBulkStudents`, `updateStudent`) wrap `issueCredentialOnChain` in try/catch — student record is saved/updated regardless of IPFS/chain failure, error is logged. Keep this pattern for the encrypt+pin step; don't make it suddenly blocking.
- **Three call sites, not one**: `issueCredentialOnChain` is called from `createStudent` (single), `insertBulkStudents` (loop), and `updateStudent` (re-issuance). Any change to the JSON shape or DEK handling must be applied consistently across all three — this is exactly the kind of field-set drift this project has been bitten by before (see `privdId_admin/backend/services/studentService.js` lines 109-117 vs 257-265, currently duplicated).

### Integration Points
- `credentialService.js::issueCredentialOnChain(student)` currently builds a credential object with only `{rollNo, email, merkleRoot, issuedAt, issuer, type, version}` and pins it directly. This needs to: (1) accept/build the full §E3.2 JSON (add name, dobInt, programmeLevel, discipline, batch, salts), (2) generate or accept a DEK, (3) AES-GCM encrypt before calling `pinToIPFS`, (4) return the DEK alongside `{cid, txHash, blockNumber}` so the caller can persist it to `Student.dek`.
- `anchorOnChain()` is unaffected — it still anchors `merkleRoot` + the (now ciphertext) CID on-chain exactly as before.

</code_context>

<specifics>
## Specific Ideas

No particular UI/UX references for this phase — it's backend-only, no user-facing surface changes.

</specifics>

<deferred>
## Deferred Ideas

- **eciesjs Node+RN compatibility verification** — the blueprint asserts `eciesjs` is "Node + RN compatible" (§E3.1). This needs a verification spike, but belongs in Phase 7's research/discuss step (where the on-device keypair + RN side of ECIES actually gets exercised), not Phase 6, which is pure backend Node and never touches React Native. Flagged here so it isn't lost — raise it again when running `/gsd:discuss-phase 7`.

### Reviewed Todos (not folded)
None — no pending todos matched this phase.

</deferred>

---

*Phase: 6-Encryption & Ciphertext Storage*
*Context gathered: 2026-06-19*
