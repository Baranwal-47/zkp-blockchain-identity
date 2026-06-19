# Phase 7: Student Keypair & Two-Phase Enrollment - Context

**Gathered:** 2026-06-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Each student gets an on-device secp256k1 keypair (generated at first login, private key never leaving `expo-secure-store`). Claiming a credential transfers DEK custody from the admin backend's plaintext escrow (Phase 6's accepted single-custody gap) to that keypair via ECIES wrapping. This phase covers: keygen, `POST /students/:id/pubkey`, the ECIES wrap, `dekEnvelopeCID` pinning, plaintext DEK wipe, and the `enrollmentPhase` state transition (`awaiting-keypair` → `active`). It does NOT cover daily proof generation (Phase 8) or erasure (Phase 9). Requirements: KEY-01, KEY-02, ENROLL-01, ENROLL-02. Shamir/E6 custodian shares are explicitly out of scope this milestone — the DEK stays in plain backend memory until claimed, per the already-accepted interim gap.

</domain>

<decisions>
## Implementation Decisions

### Login → claim routing
- **D-01:** Login response carries `enrollmentPhase`. If `"awaiting-keypair"`, the app auto-redirects straight into `ClaimCredentialScreen` — no confirmation tap. Keygen + `POST /students/:id/pubkey` fire immediately on screen mount, shown as a loading state.
- **D-02:** Private key is written to `expo-secure-store` immediately after on-device generation, before the pubkey POST is attempted. On POST failure, the retry only re-sends the POST with the already-generated public key — it does not regenerate a new keypair (avoids orphaning multiple keys across retries).
- **D-03:** On any claim failure (keygen or POST), show an error with a "Try again" button on the same screen. No partial state to clean up since nothing server-side changes until the POST succeeds. Do not log the student out or force re-login on failure.

### eciesjs RN compatibility
- **D-04 [informational]:** Treat as unverified going into research. The next step (`gsd-phase-researcher`) must do a concrete RN smoke test — import `eciesjs` in the Expo app, generate a secp256k1 keypair, ECIES-encrypt/decrypt a buffer on-device — before the plan locks in the library. Resolved by 07-RESEARCH.md (eciesjs ^0.5.0 confirmed usable with `react-native-get-random-values` polyfill); the residual sufficiency question is carried forward as 07-03 Task 2's blocking on-device smoke test, not a separate plan item.
- **D-05 [informational]:** If `eciesjs` fails the RN smoke test, research must surface a working alternative (e.g. `@noble/secp256k1` + a manual ECIES implementation, or `react-native-quick-crypto`) for the planner to use instead. Do not let this surface for the first time during execution. Moot — D-04's smoke test passed at research time, so no fallback library was needed.

### Pubkey endpoint guard
- **D-06:** `POST /students/:id/pubkey` rejects (409/400) if the student's `enrollmentPhase` is not `"awaiting-keypair"` — i.e. one-time claim. Already-`active` students get an error response; the DEK/envelope is untouched. Prevents a stray or replayed request from re-wrapping the DEK to a different pubkey and orphaning the original envelope.

### Already-active-on-new-device edge case
- **D-07 [informational]:** Explicitly out of scope for this phase/milestone — no real students are enrolled yet, the database can be freely wiped/reseeded, and no-key-recovery-yet (E6) is a known deferred gap. Do not build any handling for "active student, missing local key" beyond what naturally falls out of the guard in D-06 (the claim attempt will just get rejected since they're already active — that's an acceptable user-facing error for now). A decision to NOT build something — satisfied by 07-02's absence of any such handling, not by a citation.

### Claude's Discretion
- Whether `enrollmentPhase` and `pubKey` are denormalized onto the same `Student` document or handled via a sub-object — pure schema-shape call. Blueprint §E3.6 implies flat fields (`pubKey`, `dekEnvelopeCID`, `enrollmentPhase` directly on Student).
- Exact wording/UI of `ClaimCredentialScreen`'s loading and error states — follow existing screen visual patterns (see `code_context` below).
- Whether the pubkey-rejection error on an already-active account surfaces a specific message vs a generic failure — not user-facing polish that matters yet given D-07.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### E3 spec (this phase)
- `docs/CLAUDE_CODE_BLUEPRINT.md` §E3.3 (lines 259-272) — exact two-phase enrollment sequence (admin side steps 1-6, student side steps 1-4)
- `docs/CLAUDE_CODE_BLUEPRINT.md` §E3.6 (lines 282-284) — backend additions: `crypto/ecies.js` (`wrapDEK`, `unwrapDEK`), `POST /students/:id/pubkey` endpoint
- `docs/CLAUDE_CODE_BLUEPRINT.md` line 242-243 — ECIES library choice (`eciesjs`, claimed Node+RN compatible — **unverified, see D-04/D-05**), student keypair storage (`expo-secure-store`)
- `docs/CLAUDE_CODE_BLUEPRINT.md` line 451-455 — Student schema additions: `pubKey`, `dekEnvelopeCID`, `enrollmentPhase` enum (`'awaiting-keypair'|'active'|'revoked'`)
- `docs/CLAUDE_CODE_BLUEPRINT.md` line 486 — digital-app dependency additions: `expo-secure-store`, `eciesjs`

### Project/requirements
- `.planning/REQUIREMENTS.md` lines 17-23 — KEY-01, KEY-02, ENROLL-01, ENROLL-02 acceptance criteria
- `.planning/ROADMAP.md` Phase 7 section (lines 35-45) — 5 success criteria
- `.planning/phases/06-encryption-ciphertext-storage/06-CONTEXT.md` — D-01/D-02/D-03 there: `Student.dek` is plaintext, `select: false`, written by Phase 6, read+wiped by Phase 7 (this phase implements that wipe)

### Field-set / DEK custody (carried forward, do not drift)
- `privdId_admin/backend/models/Student.js` lines 55-63 — existing `ciphertextCID` and `dek` (plaintext, `select: false`) fields this phase builds on
- `privdId_admin/backend/utils/identityCommitment.js` — frozen 7-attribute leaf order (unaffected by this phase, but the encrypted JSON inside the ciphertext this phase eventually unwraps depends on it)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `digital-app/screens/LoginScreen.js` — `handleLogin()` POSTs to `/api/students/login`, then `navigation.navigate('StudentProfile', { student: data.student })`. This is the hook point for D-01: branch on `data.student.enrollmentPhase` before navigating.
- `privdId_admin/backend/routes/studentRoutes.js` — existing route registration pattern (`router.post(...)`) to extend with the new `POST /:id/pubkey` route.
- `privdId_admin/backend/models/Student.js` `dek` field (`select: false`) — already has the "exclude unless explicitly selected" pattern Phase 7 should mirror for any new sensitive field.

### Established Patterns
- Screen visual style: white rounded-card forms on `#f8fafc` background, blue (`#3b82f6`) primary actions, `ActivityIndicator` for loading state (see `LoginScreen.js` styles) — follow this for `ClaimCredentialScreen`.
- `digital-app/screens/StudentProfileScreen.js` uses `useFocusEffect` to refetch student state and redirect to `LoginScreen` on `revoked` — same pattern could apply for any forced-navigation-on-state-change need, though D-01 routing happens right after login, not on focus.

### Integration Points
- New screen `ClaimCredentialScreen` needs to be added to the navigation stack (wherever `StudentProfile`/`LoginScreen` are registered — navigation container not yet inspected, check during planning).
- `privdId_admin/backend/services/studentService.js` — wherever `loginStudent` is implemented needs to return `enrollmentPhase` in its response payload for D-01 to work.
- New `crypto/ecies.js` module (backend) sits alongside the existing `crypto/aesgcm.js` from Phase 6.

</code_context>

<specifics>
## Specific Ideas

No particular UI/UX references beyond "match existing screen style" (see code_context). No production students exist yet — database can be freely wiped/reseeded during this phase's work (per D-07).

</specifics>

<deferred>
## Deferred Ideas

- **Shamir 2-of-3 DEK custody (E6)** — replaces this phase's accepted single-custody gap (DEK held in plain backend memory between Phase 1 admin enrollment and Phase 2 student claim). Deferred to v3+ per existing PROJECT.md/REQUIREMENTS.md decision — not re-opened here.
- **Key recovery for lost/wiped device** — an already-`active` student with no local private key has no recovery path this milestone (D-07). Belongs with E6 when it ships.

### Reviewed Todos (not folded)
None — no pending todos matched this phase.

</deferred>

---

*Phase: 7-Student Keypair & Two-Phase Enrollment*
*Context gathered: 2026-06-19*
