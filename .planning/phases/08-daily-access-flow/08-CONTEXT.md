# Phase 8: Daily Access Flow - Context

**Gathered:** 2026-06-19
**Status:** Ready for planning

<domain>
## Phase Boundary

An actively-enrolled student's app fetches both CIDs (`GET /credential/:rollNo/blobs`), ECIES-unwraps the DEK on-device with the private key, AES-GCM-decrypts the credential JSON locally, and can either (a) display it, or (b) send only the decrypted `{attrs, salts, nonce, currentDateInt}` to the existing (unmodified) ZKP backend to generate a proof. This phase delivers the full student-facing UI through proof generation: **Dashboard** (3-button: View Credentials / Generate Proof / Verify Proof — the third button just navigates, no working verify-by-ID screen yet), **View Credentials** (on-device decrypt + display, with a real on-chain revocation check for "Blockchain Status"), and **Generate Proof** (attribute checkboxes for selective disclosure + manual nonce entry → returns a Proof ID + Verification URL, backed by a real persistent store created in this phase).

**Explicitly NOT in this phase:** the Verify Proof *lookup* screen (paste a Proof ID/URL and get a valid/invalid result) — that becomes its own phase (likely an inserted 8.1, decided during planning) because re-verifying a stored proof needs a separate re-check path from the existing single-use `/session/nonce` + `/verify` anti-replay pair (see Decisions). Phase 9 (crypto-shredding/erasure) is also untouched here.

Requirements: ACCESS-01, ACCESS-02 (`.planning/REQUIREMENTS.md`).

</domain>

<decisions>
## Implementation Decisions

### Phase 8 vs Verify-by-ID split
- **D-01:** Phase 8 covers Dashboard + View Credentials + Generate Proof (through Proof-ID issuance). The Verify-by-Proof-ID lookup screen and its public re-verification logic is a separate phase — do not build the lookup/verify UI here.
- **D-02:** Despite the lookup screen being deferred, Phase 8 DOES build the real persistent Proof-ID store and records every generated proof against it (not a display-only placeholder ID). Rationale: avoids a gap where proofs generated before the verify-phase ships have no real backing record. The store's exact shape (new Mongo collection vs. zkp-backend-local store, etc.) is research's/planner's call.
- **D-03 [architectural, carried into both this phase and the deferred verify phase]:** The Proof-ID lookup/re-verification path must NOT be a wrapper around the existing `/session/nonce` + `/verify` pair — that nonce is single-use/anti-replay and is consumed at proof-*generation* time (this phase). Re-verifying an already-generated proof later (the deferred phase's job) needs its own re-check path (cryptographic re-verify + registry/revocation lookup) that doesn't touch or depend on that nonce.

### Legacy screens
- **D-04:** Delete and replace now, not alongside. `digital-app/screens/HomeScreen.js`, `StudentProfileScreen.js` (currently broken: old 5-attribute shape + DDMMYYYY date bug), `IdentityForm.js`, and the legacy `ShowProof.js` (787 lines) are removed as part of this phase's plan, replaced by Dashboard / View Credentials / Generate Proof. No transitional dual-screen state.

### View Credentials — "Blockchain Status"
- **D-05:** "Blockchain Status: Verified" means a live on-chain check (mirrors the existing `/credential-info` → `CredentialRegistry.getCredentialByHash` pattern) confirming issuance + not-revoked — not just "decryption succeeded locally."

### Generate Proof — attribute selection & nonce
- **D-06:** Nonce entry is manual text-only this phase (matches the sketch exactly) — no QR-scan option added here. (Noted as a deferred enhancement, see below.)
- **D-07 [carried forward from existing architecture, not re-decided]:** The attribute checkboxes (Name / Enrollment Status / Degree Program / Graduation Year / Full Credential) must map to the frozen E1 depth-3 Merkle circuit's real per-attribute selective disclosure (revealing only the chosen leaves), not app-layer-only filtering of a single full-coverage hash — that was the OLD flat-Poseidon(5) circuit's limitation (see `ARCHITECTURE.md` "Key Architectural Decision #2", now stale/superseded by the frozen E1 circuit per CLAUDE.md). Research must confirm the exact `/generate-proof` request shape for partial disclosure against the current circuit/zkp-backend before planning locks in the screen's payload.

### Claude's Discretion
- Exact shape of the new Proof-ID persistence (collection name, fields, which service owns it — admin backend vs zkp-backend) — pure implementation call for research/planner, informed by D-02/D-03.
- Dashboard/View Credentials/Generate Proof visual styling — follow the existing card/button visual language established in `LoginScreen.js` / `ClaimCredentialScreen.js` (white rounded cards, `#3b82f6` primary, `#f8fafc` background) per Phase 7's established pattern, unless this clashes with anything decided in a future `/gsd:ui-phase` pass.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Target UX (mandatory — UI source of truth)
- `.planning/ROADMAP.md` — "Target End-to-End UX (north star for Phases 7-9)" section — the full Dashboard / View Credentials / Generate Proof / Verify Proof sketch this phase implements. The Phase 8 "Success Criteria" list further down the same file is backend-only and incomplete on its own; this section is the UI spec.
- `.planning/ROADMAP.md` Phase 8 section — ACCESS-01/ACCESS-02 success criteria (backend mechanics)

### E3 spec / requirements
- `docs/CLAUDE_CODE_BLUEPRINT.md` §E3.4-E3.5 (daily access flow) — exact fetch-unwrap-decrypt-send sequence
- `.planning/REQUIREMENTS.md` lines covering ACCESS-01/ACCESS-02 — acceptance criteria
- `.planning/phases/07-student-keypair-two-phase-enrollment/07-CONTEXT.md` — prior decisions this phase builds on (keypair storage, `enrollmentPhase` state machine, ECIES wrap pattern this phase's unwrap mirrors)
- `.planning/phases/06-encryption-ciphertext-storage/06-CONTEXT.md` — `ciphertextCID` shape, DEK custody lifecycle this phase consumes

### Circuit / selective disclosure (verify before locking payload shape — D-07)
- `CLAUDE.md` ground rule 1 and 3 — frozen E1 depth-3 Merkle circuit, 7-attribute field-set consistency requirement
- `zkp-backend/server.js` — current `/generate-proof`, `/verify`, `/verify-onchain`, `/session/nonce` contracts (confirm partial-disclosure input shape)
- `.planning/codebase/ARCHITECTURE.md` "ZK Proof Pipeline" + "Key Architectural Decisions" #2 — **STALE**: describes the old flat Poseidon(5)/5-attribute circuit and app-layer-only selective disclosure; superseded by the frozen E1 Merkle circuit (per CLAUDE.md) but the codebase map itself has not been refreshed post-E1/E2/E3 (see `PROJECT.md` Context section, which already flags this map as needing an update pass)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `digital-app/screens/LoginScreen.js` / `ClaimCredentialScreen.js` — card/button/loading visual style to reuse for the three new screens.
- `digital-app/screens/QRScannerScreen.js` — existing QR-scan pattern, not used this phase (D-06: manual nonce only) but available if a later phase adds scan-to-enter.
- `privdId_admin/backend/services/credentialService.js` / zkp-backend `/credential-info` pattern — existing on-chain issuance+revocation lookup logic to reuse for D-05's "Blockchain Status" check.

### Established Patterns
- `privdId_admin/backend/models/Student.js` `dek`/`select: false` pattern — mirror for any new Proof-ID record needing field-level exclusion if it stores sensitive material.
- Phase 7's `crypto/ecies.js` `wrapDEK`/`unwrapDEK` — this phase implements the corresponding on-device `unwrapDEK` call (mobile-side `eciesjs` usage, RN-compatibility already validated in Phase 7's research/smoke test).

### Integration Points
- New screens replace `HomeScreen.js`, `StudentProfileScreen.js`, `IdentityForm.js`, `ShowProof.js` in `App.js`'s navigation stack (per D-04) — exact registration mirrors Phase 7's `ClaimCredentialScreen` precedent (`headerLeft`/`gestureEnabled` options as needed per screen).
- New admin-backend endpoint `GET /credential/:rollNo/blobs` (ACCESS-01) sits alongside the existing `studentRoutes.js` pattern.
- New Proof-ID persistence (D-02) is a new model/service — service ownership (admin backend vs zkp-backend) not yet decided, flagged for research.

</code_context>

<specifics>
## Specific Ideas

The user provided a complete screen-by-screen sketch (copy, button labels, field names, internal flow per screen) — preserved verbatim in `.planning/ROADMAP.md`'s "Target End-to-End UX" section. Use that copy/layout as the literal reference, not a paraphrase, when planning each screen.

</specifics>

<deferred>
## Deferred Ideas

- **Verify Proof lookup screen + public re-verification** — explicit split per D-01; becomes its own phase (likely inserted as 8.1) once Phase 8 ships the Proof-ID store it depends on.
- **QR-scan entry for the verifier's challenge nonce** — sketch only described manual entry (D-06); scanning is a nice-to-have noted for a future pass, not blocking.
- Phase 9 (crypto-shredding erasure) — untouched; the Verify Proof phase's "check revocation status" step will depend on Phase 9's erasure/revocation state once that ships.

### Reviewed Todos (not folded)
None — no pending todos matched this phase.

</deferred>

---

*Phase: 8-Daily Access Flow*
*Context gathered: 2026-06-19*
