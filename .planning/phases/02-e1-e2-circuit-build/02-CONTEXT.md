# Phase 2: E1+E2 Circuit Build - Context

**Gathered:** 2026-06-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the rebuilt `identity.circom` circuit (E1: per-attribute salted-leaf Merkle commitment + selective disclosure + predicates; E2: verifier-nonce replay binding), mirroring `docs/current/research/IDENTITY_SPEC.md` verbatim. This phase delivers a frozen, constraint-counted circuit that:

1. Computes `leaf_i = Poseidon(2)(attr_i, salt_i)` for 7 attributes + 1 zero-padding leaf (`Poseidon(2)(0,0)`), and the depth-3 Merkle root as `pubHash`.
2. Binds selective disclosure in-circuit (`revealMask_i` boolean; `revealMask_i * (revealedValue_i - attr_i) === 0`; hidden attrs never appear in public signals).
3. Computes `isOver18` (from `currentDateInt` vs `dobInt`, bound to leaf 2) and `isPostgrad` (set-membership of `programmeLevel` over the frozen codes).
4. Binds `nonce` into the constraint system (e.g. `nonceSq <== nonce * nonce`) so a captured proof cannot be replayed against a different nonce.

**Does NOT include:** the trusted setup ceremony, verifier redeploy (Phase 3), or wiring the new circuit into the ZKP backend's `/generate-proof`/`/verify` endpoints (Phase 4). This phase's acceptance is a compiled, constraint-counted, parity-tested circuit — not a deployed one.

**DESIGN-ONCE constraint:** once this phase is marked complete, the circuit is frozen. Any later edit invalidates the Phase 3 trusted setup and forces a full redo (new `.zkey`, new `IdentityVerifier.sol`, redeploy). This is why the parity-test decision below matters.

</domain>

<decisions>
## Implementation Decisions

### isPostgrad predicate set (resolves IDENTITY_SPEC.md §9 open question)
- **D-13:** Dual-degree (programmeLevel code 3) is **excluded** from `isPostgrad`. The predicate set remains `{4, 5, 6}` (M.Tech, M.Des, PhD) exactly as already documented in `IDENTITY_SPEC.md` §5/§9 and `enumCodes.js` `POSTGRAD_CODES`. No spec or enum-code change needed — this confirms the existing frozen value, it does not alter it. The circuit's set-membership constants for `isPostgrad` must use `{4, 5, 6}`.

### Pre-freeze parity verification (DESIGN-ONCE risk control)
- **D-14:** Before the circuit is declared frozen (end of this phase, before Phase 3's trusted setup), it MUST be verified against the exact cross-path parity vectors in `IDENTITY_SPEC.md` §9 — not spot-checked, not skipped. Concretely: generate a witness for the compiled circuit using the same attr/salt inputs behind each §9 vector (including both multi-chunk cases — the 37-byte name and the 40-byte email) and assert the circuit's computed `merkleRoot` matches the documented decimal string byte-for-byte. This is the structural mechanism that prevents a chunking/ordering bug from surviving into the irreversible Phase 3 setup.
- Rationale: DESIGN-ONCE means any encoding mismatch caught after this phase costs a full trusted-setup redo. A witness-level parity test is cheap now and the spec's vectors already exist — there is no reason to skip it.

### Claude's Discretion
- Test tooling for the parity check (raw `circom_tester`/snarkjs witness calculation vs `@solarity/hardhat-zkit`, already a devDependency in `zk-proofs/package.json`) — pick whichever integrates most simply with the existing hardhat-circom build.
- Exact circom file/template organization (single `Identity()` template vs helper templates for leaf-hash, Merkle-combine, disclosure-binding, predicates) as long as the public-signal order and leaf layout match the spec verbatim.
- How `revealedValue[7]`/`revealMask[7]` inputs are named/typed in circom signal declarations, as long as the public-signal layout in `docs/CLAUDE_CODE_BLUEPRINT.md` §3 (`[0] merkleRoot, [1] nonce, [2] currentDateInt, [3] isOver18, [4] isPostgrad, [5..11] revealedValue[7], [12..18] revealMask[7]`) is preserved exactly.
- Constraint-count recording format/location (e.g. appended to PERFORMANCE_METRICS.md vs a build log) — Phase 5 owns full benchmarking; this phase just needs the raw count captured somewhere reachable.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spec (single source of truth — frozen by Phase 1)
- `docs/current/research/IDENTITY_SPEC.md` — full leaf layout (§1), hash-to-field algorithm + frozen chunk arities (§2), integer encoding (§3), leaf/node Merkle construction incl. the non-zero zero-padding leaf (§4), enum codes + isPostgrad set (§5), salt rule (§6), public signal layout so far (§7), BN128 field order (§8), **mandatory cross-path parity test vectors** (§9 — this phase's acceptance gate per D-14), Phase-2 forward contract (§10)
- `docs/CLAUDE_CODE_BLUEPRINT.md` §3 — public-signal final order (`[0]` merkleRoot … `[12..18]` revealMask[7]), nonce-binding rationale
- `docs/CLAUDE_CODE_BLUEPRINT.md` §4.1 — recommended circuit design steps (recompute-root approach, disclosure binding constraint, predicate construction, nonce binding)
- `docs/CLAUDE_CODE_BLUEPRINT.md` §4.2 — compile/count/setup/deploy command sequence (this phase only goes through "compile + count constraints")

### Current code (exact files confirmed)
- `zk-proofs/circuits/identity.circom` — current flat `Poseidon(5)` circuit; **this is what gets rebuilt** (do not just patch it — it's a structural rewrite per the new spec)
- `zk-proofs/circomlib/circuits/poseidon.circom`, `comparators.circom`, `bitify.circom` — vendored circomlib templates confirmed present on the include path, reusable for Merkle hashing, age comparison (`LessThan`/`GreaterEqThan`), and any bit-decomposition needed
- `privdId_admin/backend/constants/enumCodes.js` — canonical executable enum codes; circuit's set-membership constants for `isPostgrad`/discipline checks must mirror these integers exactly
- `privdId_admin/backend/utils/identityCommitment.js` — JS reference implementation (hash-to-field, leaf hashing, Merkle root) built in Phase 1; this is the "other half" of the parity test in D-14
- `zk-proofs/package.json` — confirms `circom2`/`circomlibjs`/`snarkjs`/`hardhat-circom`/`@solarity/hardhat-zkit` already installed; no new toolchain dependency needed

### Codebase map
- `.planning/codebase/ARCHITECTURE.md`, `STRUCTURE.md`, `CONVENTIONS.md`, `CONCERNS.md`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Vendored circomlib (`zk-proofs/circomlib/circuits/`) already on the include path via hardhat-circom's `inputBasePath: ./circuits` — `poseidon.circom` for all leaf/node hashing, `comparators.circom` for the age predicate, `bitify.circom` if bit-level decomposition is needed for range checks.
- `identityCommitment.js` (Phase 1) is the exact JS-side oracle the new circuit must match — its internal logic (chunking order, Merkle combine order with left=lower-index) is the ground truth for translating into circom constraints.

### Established Patterns
- circom 2.1.6 with hardhat-circom build pipeline (`npx hardhat circom`), single `main` component per circuit file — same pattern as the existing flat circuit, just with a much larger template body.
- `Poseidon(2)(left, right)` is NOT symmetric — both JS and circuit must combine nodes with the lower leaf index as the left argument (IDENTITY_SPEC.md §4), already correctly implemented in the JS module.

### Integration Points
- This circuit's compiled artifacts (wasm/r1cs/zkey-input) feed Phase 3's trusted setup directly — no other phase touches `identity.circom` itself.
- The frozen public-signal order is what Phase 4's ZKP backend `/generate-proof` response and Phase 3's redeployed `IdentityVerifier.sol` both consume — getting the order right here avoids rework in both later phases.

</code_context>

<specifics>
## Specific Ideas

- The Dual-degree question was a real fork in the road (would have required an enum-code-table change before the circuit could even be written) — resolved as "exclude," matching the spec as already written, so no upstream doc edits are needed.
- The parity-test decision is the user's explicit risk-acceptance call given DESIGN-ONCE: spend the effort now on a witness-level check using IDENTITY_SPEC.md §9's vectors, specifically including the two multi-chunk cases, rather than risk discovering an encoding bug after Phase 3.

</specifics>

<deferred>
## Deferred Ideas

- "Is CSE" / discipline-specific predicates beyond `isOver18`/`isPostgrad` (mentioned only as a future possibility in blueprint §3's table) — not in v1 requirements (CIRC-04/05 only); would be scope creep for this phase.
- Cohort/"current student" predicate from `batch` (also blueprint-table mentioned) — same reasoning, not in v1 requirements.
- Trusted setup, verifier redeploy — Phase 3.
- ZKP backend `/generate-proof` new input shape, nonce endpoints — Phase 4.

None of the above were pulled into Phase 2 scope.

</deferred>

---

*Phase: 2-E1+E2 Circuit Build*
*Context gathered: 2026-06-17*
