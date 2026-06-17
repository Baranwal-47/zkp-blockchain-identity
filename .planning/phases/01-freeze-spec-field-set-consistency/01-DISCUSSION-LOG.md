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

### These are some warnings I the user generated from Cowork when i was giving the questions u asked me to it, ignore it if most of them are obvious, and those that are not take it into cosideration if its correct, no need to clash anything(May god bless you)

## Cross-phase warnings (carry forward)

- **Field-set consistency:** every commitment/encoding goes through the ONE shared module — no second hand-written copy (the duplicated `stringToBigInt` in `zkp-backend/server.js:23-30` is the exact drift to delete).
- **Canonical addresses = freshly deployed values in `.env`** — README/docs/`server.js` fallbacks are stale; never copy them.
- **Branding:** purge all VIT references (issuer string, screens, docs) → IIITDM Jabalpur.
- **Re-measure everything with n≥10 (mean ± σ)** — the existing perf numbers are single-run.

## Phase  — Circom circuit (E1+E2)
- **Hash-to-field chunking MUST be byte-identical to the Phase-1 JS module** — prove it with a shared test vector incl. a >31-byte email before trusting anything. If the circuit can't reproduce the root, the whole scheme breaks.
- **Verify circomlibjs Poseidon ↔ circom Poseidon parity** with a known test vector (same params → same field output); don't assume.
- **Mirror the JS Merkle algorithm exactly:** leaf order 0–6 + zero-pad leaf 7, `Poseidon(2)(left,right)` node combine, padding leaf = 0.
- **`isPostgrad` set constants `{4,5,6}` hardcoded in circom must match the canonical enum module verbatim.** Dual(3) is currently EXCLUDED — confirm before it's immutable.
- **Constraint count:** run `snarkjs r1cs info`; if > 4096, download a bigger `.ptau` (pot14/15). Don't assume pot12 fits — Merkle + comparators + 7 leaves may exceed.
- **Nonce binding:** declaring `nonce` public isn't enough; circom optimizes unused signals away — force it in (`nonceSq <== nonce*nonce`).
- **`currentDateInt` must be a public input set by the verifier/session, NOT the prover** — else the student can lie about "today" for the age predicate.
- **Age predicate via YYYYMMDD threshold:** `isOver18 = dobInt <= cutoff` where `cutoff = (Y-18)*10000 + MM*100 + DD` — it's a lexicographic compare, not date subtraction. Implement the cutoff correctly.
- **`revealMask[i]` must be constrained boolean**; revealed string values are the hash-to-field element (verifier rebinds against plaintext in Phase 4).
- More public signals → more on-chain verify gas + bigger QR. Measure.

## Phase 3 — Trusted setup + redeploy
- **Download the `.ptau` (don't regenerate);** size must cover the constraint count.
- **Run the Phase-2 zkey ceremony ONCE, after the circuit is frozen** — any later circuit edit invalidates it and forces a full redo.
- 3-contribution chain → beacon → `zkey verify`, locally; describe it accurately in the paper.
- **After redeploy:** copy fresh `wasm/zkey/vkey` to `zkp-backend/` AND update `VERIFIER_ADDRESS` (+ `REGISTRY_ADDRESS` if ABI changed). Stale artifacts = silent verify failures.
- Keep the existing `pi_b` inner-array swap in `verify-onchain` when passing the larger `publicSignals`.

## Phase 4 — ZKP backend prover + E2 nonce
- `/generate-proof` input reshapes to `{attrs, salts, reveal, nonce, currentDateInt}`; route hashing through the shared module (kill the duplicated helper).
- **Nonce store: enforce TTL (5 min) + one-time-use server-side** — never trust client clocks.
- Interactive flow = **two QR scans** (verifier challenge → student proof). Changes the demo UX — build the verifier `GenerateChallengeScreen` + student `ScanChallengeScreen`.
- **Verifier must recompute hash-to-field on the revealed plaintext** and check it equals the revealed signal (this is what binds disclosure).
- Proof gen needs the **salts at proof time** — student must have them (E3 blob, or Mongo interim).

## E3 — Encrypted IPFS + keypair
- **Proof gen stays server-side:** decrypted attrs+salts transit to backend over TLS; **DEK + private key never leave the device.** State the trade-off in the paper.
- **Don't overclaim "secure enclave"** — `expo-secure-store` is Keystore/Keychain-backed, not a true hardware enclave. Say "device secure storage."
- Verify `eciesjs` (secp256k1) + `expo-secure-store` actually work in Expo before committing to them.
- Salt canonical store moves Mongo → encrypted blob; **root must still match (same salt values).**
- **DEK held between enrollment Phase 1 and Phase 2** — if backend restarts before the student claims, recover via Shamir (don't lose it). Decide where the temp DEK lives.
- 2 Pinata pins per student now (ciphertext + envelope) — watch free-tier pin limits.
- Erasure = destroy DEK + all shares + envelope; ciphertext stays on IPFS (fine, unreadable).

## E5 — Gnosis Safe (2-of-3)
- **Add `transferAdmin`/`acceptAdmin` to `CredentialRegistry` and hand over to the Safe** before any Safe-routed write.
- **Safe signing is a browser/MetaMask flow — do it in the admin web portal or hosted Safe{Wallet}, NOT Expo.** Don't build mobile signing; mobile screen is status-only.
- **Only the executor pays gas** — fund AcadAdmin (proposer/executor) well; Registrar/Dean minimal.
- Backend needs `PROPOSER_PRIVATE_KEY` + `SAFE_TX_SERVICE_URL` + `CHAIN_ID` + `SAFE_ADDRESS`.
- Decide update path: re-`issueCredential` (invalidates old hash) vs a dedicated `update` — route either through the Safe.

## E6 — Shamir (2-of-3)
- **Shares B and C must live in storage AcadAdmin cannot read** (separate Atlas DBs / custodian service) — otherwise admin alone holds 2 shares and the threshold is defeated.
- **Split the DEK (32 bytes) — NOT any wallet key, NOT the student's private key.**
- Shares encrypted at rest; custodian authenticates to release; reconstruct in memory, wipe after.
- **Case A (modify) = Shamir THEN Gnosis; Case B (lost key) = Shamir only, no chain tx; Case C (revoke) = Gnosis only.** Don't conflate the three.

## Later milestone (not blocking the crypto phases)
- Hardening: auth middleware on student CRUD routes, bcrypt passwords, student session JWT, rate limiting (blueprint §12).