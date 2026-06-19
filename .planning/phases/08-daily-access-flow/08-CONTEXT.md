# Phase 8: Daily Access Flow - Context

**Gathered:** 2026-06-19
**Status:** Ready for planning

<domain>
## Phase Boundary

An actively-enrolled student's app fetches both CIDs (`GET /credential/:rollNo/blobs`), ECIES-unwraps the DEK on-device with the private key, AES-GCM-decrypts the credential JSON locally, and can either (a) display it, or (b) send only the decrypted `{attrs, salts, nonce, currentDateInt}` to the existing (unmodified) ZKP backend to generate a proof. This phase delivers the full student-facing UI: **Dashboard** (3-button: View Credentials / Generate Proof / Verify Proof — all three fully working), **View Credentials** (on-device decrypt + display, with a real on-chain revocation check for "Blockchain Status"), **Generate Proof** (consent-gated attribute checkboxes for selective disclosure + nonce binding, proof self-expires after 15 minutes), and **Verify Proof** (a live two-hop QR challenge/response — no persistent storage of any kind).

**Revision (2026-06-19, same-session):** the original plan to split Verify Proof into its own phase behind a persistent Proof-ID store has been dropped. Once the verify model moved to a live, stateless re-check (proof carries its own timestamp; `/verify` just checks crypto validity + freshness), there was no backend persistence left to justify a separate phase — Verify Proof folds back into Phase 8 as a UI/orchestration build on top of existing endpoints. See D-01 through D-03 (superseded) and D-08–D-11 (current).

Phase 9 (crypto-shredding/erasure) is untouched by this phase.

Requirements: ACCESS-01, ACCESS-02 (`.planning/REQUIREMENTS.md`).

</domain>

<decisions>
## Implementation Decisions

### Phase 8 vs Verify-by-ID split — SUPERSEDED, see D-08+
- **D-01 [superseded]:** ~~Phase 8 covers Dashboard + View Credentials + Generate Proof only; Verify-by-Proof-ID is a separate phase.~~ Verify Proof folds back into Phase 8 (see D-11).
- **D-02 [superseded]:** ~~Build a real persistent Proof-ID store.~~ No persistent store of any kind. Dropped once verification became a live, stateless re-check.
- **D-03 [superseded]:** ~~Proof-ID lookup must not wrap `/session/nonce`+`/verify`.~~ Moot — there is no Proof-ID lookup anymore.

### Verify Proof — final model (no storage, live two-hop QR handshake)
- **D-08:** Proof freshness window is **15 minutes** (raised from the initially-discussed 5, to give a real two-phone QR round trip enough slack) — confirm during research whether zkp-backend hardcodes 5 min anywhere else that also needs raising to 15 for consistency. The proof carries its own generation timestamp as a public signal (same pattern as the existing `currentDateInt`); `/verify` rejects if `now - generatedAt > 15min`. Pure stateless check — no DB, no expiry job. A proof simply stops verifying after 15 minutes.
- **D-09:** Verify Proof is a peer-to-peer challenge/response with **two distinct QR hops**, not a single screen:
  1. **Outgoing:** Verifier's app calls the existing `/session/nonce` to get a backend-tracked nonce (must come from the backend, not invented client-side, or anti-replay is meaningless), bundles it with the requested fields, displays as QR — "Step 1: Share this challenge."
  2. **Returning:** Prover scans/enters that payload (consent: see D-10), generates the proof bound to that nonce, displays the resulting proof+publicSignals as a new QR — "Step 2: Share your proof back."
  3. Verifier scans/enters that returning QR and runs `/verify` + `/verify-onchain` + revocation check.
  - Both hops support **scan QR or manual text entry** in parallel (manual is the fallback, not exclusive — supersedes D-06's "manual only" for the verifier→prover hop; `QRScannerScreen.js` is now in scope, not deferred).
  - UI must make the active hop unambiguous ("Step 1 of 2" / "Step 2 of 2").
- **D-10:** Consent is folded directly into attribute selection, not a separate screen. Whenever Generate Proof's checklist step starts — self-initiated or via an incoming peer/verifier request (D-09 step 2) — requested fields show pre-checked but editable, and the existing "Generate Proof" action **is** the consent action. Nothing is auto-disclosed from a scanned request without the prover seeing/confirming the checklist first.
- **D-11:** Verify Proof needs no new backend persistence, so it folds back into Phase 8 alongside Dashboard / View Credentials / Generate Proof — there is no Phase 8.1.

### Legacy screens
- **D-04:** Delete and replace now, not alongside. `digital-app/screens/HomeScreen.js`, `StudentProfileScreen.js` (currently broken: old 5-attribute shape + DDMMYYYY date bug), `IdentityForm.js`, and the legacy `ShowProof.js` (787 lines) are removed as part of this phase's plan, replaced by Dashboard / View Credentials / Generate Proof. No transitional dual-screen state.

### View Credentials — "Blockchain Status"
- **D-05:** "Blockchain Status: Verified" means a live on-chain check (mirrors the existing `/credential-info` → `CredentialRegistry.getCredentialByHash` pattern) confirming issuance + not-revoked — not just "decryption succeeded locally."

### Generate Proof — attribute selection & nonce
- **D-06:** Nonce entry is manual text-only this phase (matches the sketch exactly) — no QR-scan option added here. (Noted as a deferred enhancement, see below.)
- **D-07 [carried forward from existing architecture, not re-decided]:** The attribute checkboxes (Name / Enrollment Status / Degree Program / Graduation Year / Full Credential) must map to the frozen E1 depth-3 Merkle circuit's real per-attribute selective disclosure (revealing only the chosen leaves), not app-layer-only filtering of a single full-coverage hash — that was the OLD flat-Poseidon(5) circuit's limitation (see `ARCHITECTURE.md` "Key Architectural Decision #2", now stale/superseded by the frozen E1 circuit per CLAUDE.md). Research must confirm the exact `/generate-proof` request shape for partial disclosure against the current circuit/zkp-backend before planning locks in the screen's payload.

### Claude's Discretion
- Exact QR payload encoding for both D-09 hops (JSON shape, size limits) — implementation call for research/planner.
- Dashboard/View Credentials/Generate Proof/Verify Proof visual styling — follow the existing card/button visual language established in `LoginScreen.js` / `ClaimCredentialScreen.js` (white rounded cards, `#3b82f6` primary, `#f8fafc` background) per Phase 7's established pattern, unless this clashes with anything decided in a future `/gsd:ui-phase` pass.

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

- Phase 9 (crypto-shredding erasure) — untouched; Verify Proof's revocation check (D-09 step 3) calls the same live on-chain check as D-05, independent of Phase 9's timing.

(Verify Proof lookup screen and QR-scan-for-nonce, previously deferred here, are now in-scope per D-08–D-11 above.)

### Reviewed Todos (not folded)
None — no pending todos matched this phase.

</deferred>

---

*Phase: 8-Daily Access Flow*
*Context gathered: 2026-06-19*
