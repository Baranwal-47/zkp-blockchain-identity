# Phase 1: Freeze Spec & Field-Set Consistency - Context

**Gathered:** 2026-06-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Freeze the 7-attribute identity spec and make the admin issuance commitment **byte-for-byte identical** to what the rebuilt prover will consume — eliminating the §1.4 `branch`/`programme` mismatch at the root *before any circom code exists*. This phase delivers: (1) a frozen, documented spec (attribute order, types, encodings, enum codes, public-signal layout); (2) a shared JS commitment module (salted Poseidon(2) leaves + depth-3 Merkle root) used by both the admin issuance path and a prover-side recomputation; (3) the admin issuance refactor from the old 5-field flat hash to the new 7-attribute salted-Merkle commitment; (4) issuer-string branding cleanup (VIT → IIITDM Jabalpur).

**This phase does NOT build the circom circuit, run any trusted setup, or touch the ZKP backend prover endpoint** — those are Phase 2/3/4. The Phase-1 "prover-side recomputation" is a JS reference/test script that mirrors the shared module, used only to prove both paths produce the same root.

**Confirmed current-state mismatch (live §1.4 bug):**
- Admin issuance hashes `[name, rollNo, dob, normalizePhone(contactNo), programme]` → `privdId_admin/backend/services/studentService.js:72-78`
- Prover sends `[name, rollNo, dob, phoneNo, branch]` → `zkp-backend/server.js:62-68`
- Circuit `Poseidon(5)` 5th signal = `branch` → `zk-proofs/circuits/identity.circom`
- 5th field differs (programme vs branch); both use identical `stringToBigInt` (UTF-8→hex→BigInt, `poseidon.F.toString()` decimal) with **no field reduction**.

</domain>

<decisions>
## Implementation Decisions

### Attribute encoding (BN128 overflow fix)
- **D-01:** String attributes (`name`, `rollNo`, `email`) use **hash-to-field** encoding, NOT raw UTF-8→BigInt. Rationale: the current `stringToBigInt` produces values > the BN128 scalar field (~254 bits / ~31 bytes) for long strings (names, some emails), which silently commits a different value and breaks verification. This corrects the blueprint's "stringToBigInt as today" assumption (§3), which overlooked overflow.
- **D-02:** The hash-to-field method MUST be identical in JS (issuance + prover-side script) and the Phase-2 circom circuit. **Preferred method:** chunk the UTF-8 bytes into ≤31-byte field elements and compute `Poseidon(chunks)` → one field element. **Avoid `keccak256(value) mod p`** — correct in JS but expensive/awkward inside the circuit. Exact chunking scheme is a research item for the planner (see Canonical References / research note below).
- **D-03:** Integer attributes `dob` (YYYYMMDD) and `batch` (admission year) are committed as **integers directly** (no string encoding) so the Phase-2 circuit can range/compare them for predicates. `dob` input is parsed/validated to an `YYYYMMDD` integer at issuance; `batch` is a 4-digit year integer.

### Attribute sourcing (split `programme`)
- **D-04:** The single `programme` string is split into **`programmeLevel`** + **`discipline`**, and **`batch`** (admission year) is added. All three come from **separate explicit admin inputs** (dropdowns for level + discipline, a year field for batch) — NOT parsed from rollNo. Rationale: explicit, unambiguous, robust to roll-number format variation; the blueprint flags rollNo correlation as a privacy caveat, so we don't make issuance depend on parsing it.
- **D-05:** `phone`/`contactNo` is **dropped from the committed attribute set** in favor of `email` (now committed attr 6). `contactNo` may remain in the Mongo record as operational data but is no longer hashed. `normalizePhone()` is no longer part of the commitment.

### Enum → code mapping (canonical)
- **D-06:** programmeLevel and discipline are committed as **numeric codes** via a **single canonical mapping module/JSON** that both the admin backend and the Phase-2 circuit reference (one source of truth). Frozen codes:
  - `programmeLevel`: `{ "B.Tech":1, "B.Des":2, "Dual":3, "M.Tech":4, "M.Des":5, "PhD":6 }`
  - `discipline`: `{ "CSE":1, "ECE":2, "ME":3, "SmartMfg":4, "Design":5, "NatSci":6 }`
  - `isPostgrad` predicate set = programmeLevel ∈ `{4, 5, 6}` (M.Tech, M.Des, PhD).
- **D-07:** Codes are **append-only** once frozen — never renumber an existing enum (would invalidate every prior commitment + force the circuit's set-membership constants to change). New programmes/disciplines get the next free integer.

### Commitment computation (consistency proof)
- **D-08:** Phase 1 implements **one shared JS `identityCommitment` module** (circomlibjs `Poseidon(2)` salted leaves + depth-3 / 8-leaf Merkle root). Imported by **both** the admin issuance path AND a prover-side/test recomputation script. This is the structural mechanism that kills field-set drift (the exact failure §1.4 is about) — there is no second hand-written copy to fall out of sync.
- **D-09:** Leaf layout (fixed, indices = Merkle leaf positions): `0:name, 1:rollNo, 2:dob(int), 3:programmeLevel(code), 4:discipline(code), 5:batch(int), 6:email, 7:zero-padding`. `leaf_i = Poseidon(2)(encodedAttr_i, salt_i)`; internal node = `Poseidon(2)(left,right)`; root = `merkleRoot` = `pubHash` (decimal string; bytes32 via existing `ethers.zeroPadValue(ethers.toBeHex(BigInt(root)),32)`).
- **D-10:** **Salts** are generated at issuance (one per committed attribute, 32 random bytes reduced < BN128 order, stored as decimal strings, order = leaf index) and persisted on the Student model as `salts: [String]`. Mandatory for every attribute (low-entropy leaves like dob/level/discipline/batch are brute-forceable without salt). NOTE: canonical salt storage moves into the E3 encrypted blob in a later milestone; the Mongo `salts[]` field here is the interim store.

### Branding (SPEC-03)
- **D-11:** Replace the issuer string `'PrivdID — VIT Bhopal University'` (em-dash, `credentialService.js:62`) with `'PrivdID — IIITDM Jabalpur'`. Bump credential `version` `'1.0'` → `'2.0'` (new commitment scheme). Scan issuance output for any other VIT references and remove.

### Data reset
- **D-12:** No migration of old flat-`Poseidon(5)` records — **wipe and re-seed** test students under the new commitment (per blueprint §13). The re-seed set should cover predicate edge cases for downstream phases: over-18 and under-18 DOBs, at least one postgrad (level ∈ {4,5,6}) and one undergrad, and a spread of disciplines.

### Claude's Discretion
- Exact module/file naming and where the shared commitment module + canonical enum mapping physically live (e.g. a shared package vs duplicated constants resolved by import). Keep it importable by both Node backend (ESM) and the Phase-2 circuit tooling.
- Location/format of the frozen spec doc artifact (extend `docs/CLAUDE_CODE_BLUEPRINT.md §3` vs a dedicated `docs/current/research/IDENTITY_SPEC.md`).
- Shape of the re-seed script and test harness that proves root-equality across both paths.
- Whether `dob`/`batch` input validation lives in the existing `normalizeStudentInput`/`validateStudentPayload` flow.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spec (single source of truth)
- `docs/CLAUDE_CODE_BLUEPRINT.md` §3 — frozen 7-attribute spec, leaf indices, integer-typed attrs, public-signal layout
- `docs/CLAUDE_CODE_BLUEPRINT.md` §1.4 — the latent branch/programme bug this phase resolves
- `docs/CLAUDE_CODE_BLUEPRINT.md` §11, §12.1–2, §15 — data-model changes, branding + field-set cleanup, locked decisions

### Current code to refactor (exact files confirmed during discussion)
- `privdId_admin/backend/services/studentService.js:72-78` — current 5-field hash call (`hashPoseidonFields([name, rollNo, dob, normalizePhone(contactNo), programme])`); `normalizeStudentInput()` lines 23-32; `normalizePhone()` lines 8-21
- `privdId_admin/backend/utils/poseidonHash.js` — `hashPoseidonFields` (lines 22-28), `stringToBigInt` (lines 8-20), circomlibjs `buildPoseidon`
- `privdId_admin/backend/services/credentialService.js:51-66` — credential JSON build, issuer string (line 62), pubHash→bytes32 (line 51), registry `issueCredential`
- `privdId_admin/backend/models/Student.js` — schema (add `programmeLevel, discipline, batch, salts[], merkleRoot`; `dob` string→int handling)
- `privdId_admin/backend/controllers/studentController.js` — `buildStudentRecord()` assembly path (single + bulk)
- `zkp-backend/server.js:62-68` — prover input order (Phase-1 reference/test mirrors this shape; the live endpoint change is Phase 4)
- `zk-proofs/circuits/identity.circom` — current flat `Poseidon(5)` (rebuilt in Phase 2; do not edit here)
- `zk-proofs/circomlib/circuits/poseidon.circom` + `comparators.circom` — **vendored** circomlib on the include path (confirmed present)

### Codebase map
- `.planning/codebase/ARCHITECTURE.md`, `STRUCTURE.md`, `CONVENTIONS.md`, `CONCERNS.md`

### Research note for planner/researcher (open item)
- Confirm the exact **hash-to-field chunking scheme** (UTF-8 → ≤31-byte field-element chunks → `Poseidon(chunks)`) that is reproducible identically in circomlibjs (JS) and circom (Phase 2). Verify against a known circom-compatible string-commitment pattern before freezing D-02.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `poseidonHash.js` `buildPoseidon` (circomlibjs) + `poseidon.F.toString()` — reuse for `Poseidon(2)` leaf/node hashing in the shared commitment module.
- `stringToBigInt` (UTF-8→hex→BigInt) — keep as the *inner* step but wrap with the new hash-to-field reduction (D-01/D-02); identical helper already duplicated in `zkp-backend/server.js:23-30`, which is precisely the drift the shared module removes.
- `ethers.zeroPadValue(ethers.toBeHex(BigInt(root)), 32)` — existing decimal→bytes32 conversion (`credentialService.js:51`, `server.js:137`) works unchanged for the Merkle root.

### Established Patterns
- Admin backend is ESM, service-layer pattern (`studentService`/`credentialService`), `normalizeStudentInput` → `validateStudentPayload` → `buildStudentRecord` pipeline. New attrs slot into this pipeline.
- circomlib is vendored under `zk-proofs/circomlib/circuits/`, resolved via hardhat-circom `inputBasePath: ./circuits`.

### Integration Points
- `buildStudentRecord()` is the single convergence point (single + bulk add) where the commitment is computed — the cleanest place to swap the old hash for the shared module.
- `Student` model gains `programmeLevel, discipline, batch, salts[], merkleRoot`; `programme` may be retained as legacy/display or dropped.
- The canonical enum-code module is the cross-cutting artifact the Phase-2 circuit will also import (set-membership constants for `isPostgrad`).

</code_context>

<specifics>
## Specific Ideas

- Frozen enum codes are explicit and append-only (D-06/D-07) — these exact integers must be mirrored verbatim by the Phase-2 circuit's set-membership constants.
- Root-equality test is the concrete acceptance gate for criterion #3: same student in → same `merkleRoot` from issuance path and prover-side script.

</specifics>

<deferred>
## Deferred Ideas

- ZKP backend `/generate-proof` new input shape + nonce endpoints — Phase 4 (REPL-03, BACK-01..03).
- The actual circom circuit (salted leaves, disclosure binding, predicates, nonce binding) — Phase 2.
- Trusted setup + verifier redeploy — Phase 3.
- Encrypted IPFS blob as the canonical salt store (replacing the interim Mongo `salts[]`) — E3, later milestone.
- Auth middleware / bcrypt / session JWT on student CRUD — later milestone (§12.3–4), not part of the field-set fix.

None of the above were pulled into Phase 1 scope.

</deferred>

---

*Phase: 1-Freeze Spec & Field-Set Consistency*
*Context gathered: 2026-06-16*
