# Phase 1: Freeze Spec & Field-Set Consistency - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-16
**Phase:** 1-Freeze Spec & Field-Set Consistency
**Areas discussed:** Attribute encoding, Attribute sourcing, Enum codes, Commitment computation

---

## Attribute Encoding (BN128 overflow)

| Option | Description | Selected |
|--------|-------------|----------|
| Hash-to-field | Reduce string attrs into the field (Poseidon over UTF-8 chunks / keccak mod p); any length maps safely; identical fn issuance + prover | ✓ |
| Enforce ≤31 bytes | Keep raw UTF-8→BigInt but validate/limit each string attr ≤31 bytes; reject longer | |
| Chunk into 2 leaves | Split long strings across multiple field elements/leaves | |

**User's choice:** Hash-to-field
**Notes:** Corrects the blueprint's "stringToBigInt as today" assumption, which overlooked BN128 overflow for long names/emails. Claude flagged that the method must be reproducible identically in JS and the Phase-2 circom circuit → Poseidon-over-chunks preferred, keccak-mod-p discouraged (expensive in-circuit). Exact chunking left as a research item.

---

## Attribute Sourcing (split `programme`)

| Option | Description | Selected |
|--------|-------------|----------|
| Separate admin inputs | Explicit dropdowns for programmeLevel + discipline + a batch-year field | ✓ |
| Parse from rollNo | Derive level/discipline/batch from roll pattern (22BCS027) | |
| Hybrid: dropdowns + rollNo batch | Explicit level/discipline, auto-fill batch from rollNo prefix | |

**User's choice:** Separate admin inputs
**Notes:** Explicit and robust to roll-format variation; avoids making issuance depend on parsing rollNo (which the blueprint flags as a privacy-correlation caveat). `phone`/`contactNo` dropped from the committed set in favor of `email`.

---

## Enum → Code Mapping

| Option | Description | Selected |
|--------|-------------|----------|
| Canonical mapping module | Shared spec module/JSON both backend + circuit reference; fixed integer codes; isPostgrad = level∈{4,5,6} | ✓ |
| Hash the enum string | Commit UTF-8/Poseidon of enum string; predicates compare hashes | |
| I'll set the codes | Claude proposes the table, user adjusts | |

**User's choice:** Canonical mapping module
**Notes:** Frozen codes — programmeLevel {B.Tech:1,B.Des:2,Dual:3,M.Tech:4,M.Des:5,PhD:6}, discipline {CSE:1,ECE:2,ME:3,SmartMfg:4,Design:5,NatSci:6}. Codes are append-only once frozen to avoid invalidating prior commitments / circuit constants.

---

## Commitment Computation (consistency proof)

| Option | Description | Selected |
|--------|-------------|----------|
| Shared JS module | One canonical identityCommitment module (Poseidon(2) salted leaves + depth-3 Merkle) imported by issuance AND prover-side/test script | ✓ |
| Spec-only, defer compute | Freeze field set only; all Merkle/salt compute waits for Phase 2 | |
| Duplicate both sides | Implement separately in backend + prover script, no shared module | |

**User's choice:** Shared JS module
**Notes:** Structural mechanism that eliminates field-set drift (the §1.4 failure). Satisfies criterion #3 (re-seed → same root from both paths). Salts generated + stored at issuance (Mongo `salts[]` interim; moves to E3 encrypted blob later).

---

## Claude's Discretion

- Module/file naming + physical location of the shared commitment module and canonical enum mapping (must be importable by ESM backend and Phase-2 circuit tooling).
- Frozen-spec doc artifact location (extend BLUEPRINT §3 vs dedicated IDENTITY_SPEC.md).
- Shape of the re-seed script + root-equality test harness.
- Whether dob/batch validation lives in existing normalizeStudentInput/validateStudentPayload.

## Deferred Ideas

- ZKP `/generate-proof` reshape + nonce endpoints → Phase 4.
- circom circuit (leaves, disclosure binding, predicates, nonce) → Phase 2.
- Trusted setup + verifier redeploy → Phase 3.
- Encrypted IPFS blob as canonical salt store → E3 (later milestone).
- Auth/bcrypt/session-JWT hardening → later milestone.
