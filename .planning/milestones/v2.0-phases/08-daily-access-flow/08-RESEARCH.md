# Phase 8: Daily Access Flow - Research

**Researched:** 2026-06-19
**Domain:** React Native (Expo) on-device crypto + Express REST endpoints + Groth16 ZK proof generation/verification (existing zkp-backend) + two-hop QR peer-to-peer handshake
**Confidence:** HIGH

## Summary

Phase 8 wires together four already-built backend primitives — admin-backend ECIES wrap (Phase 7), the frozen E1 `identity.circom` circuit, the unmodified zkp-backend `/generate-proof` / `/verify` / `/verify-onchain` / `/session/nonce` / `/credential-info` endpoints (built pre-Phase-7, confirmed unchanged), and `expo-secure-store`-backed on-device keys (Phase 7) — into one new admin-backend endpoint (`GET /credential/:rollNo/blobs`) and four new mobile screens (Dashboard, View Credentials, Generate Proof, Verify Proof).

The single most important correction this research makes to `08-CONTEXT.md`'s framing: **the frozen E1 circuit is NOT a "depth-3 Merkle proof of inclusion" in the sense of revealing individual leaves via Merkle paths.** It is a flat 7-leaf Merkle-tree **commitment** (`pubHash` = root of a balanced binary Poseidon tree over the 7 attributes + 1 zero-pad leaf) combined with **in-circuit selective disclosure via `revealMask`/`revealedValue` arrays** — every one of the 7 attributes is always a *private* witness input, and the circuit forces `revealedValue[i]` to either equal `attr[i]` (if `revealMask[i]=1`) or `0` (if `revealMask[i]=0`), with both arrays exposed as public signals. This means `/generate-proof`'s request body is **unchanged from its current shape** — it already accepts `reveal: {name, rollNo, dob, programmeLevel, discipline, batch, email}` (name-keyed booleans) — D-07's checkbox-to-payload mapping is a name → boolean dictionary the screen already needs to build, with no new circuit-level "proof of inclusion" mechanism to implement. The "Full Credential" checkbox (5th item in the UI-SPEC's checklist) means setting all 7 `reveal` keys to `true` (note: UI-SPEC lists 5 checkboxes against a 7-attribute circuit — see Open Questions).

The 5-minute freshness window is real but lives entirely in `zkp-backend/lib/nonceStore.js`'s `TTL_MS` constant (line 30) and governs nonce session validity at `/session/nonce` issuance, not proof generation. **D-08's "raise to 15 minutes" must change this one constant.** There is no second/duplicate freshness window elsewhere in the backend — `/generate-proof` itself has no freshness logic; freshness is entirely a nonce-session-TTL property enforced at `/verify`/`/verify-onchain` time via `validateAndConsume`. Critically, the circuit's `currentDateInt` public signal is used **only** for the `isOver18` age predicate — it is NOT compared against "now" at verify time. **The proof itself carries no separate "generatedAt" timestamp distinct from the nonce's `issuedAt`/`expiresAt`** — D-08's "proof carries its own generation timestamp as a public signal" is not literally true of the current circuit; the actual mechanism is the nonce session's server-tracked `expiresAt`, checked in `validateAndConsume` against `Date.now()`. This is a meaningful gap between CONTEXT.md's mental model and the verified code — flagged in Open Questions and Assumptions Log for planner attention.

**Primary recommendation:** Build ACCESS-01 as a new `GET /credential/:rollNo/blobs` route on the existing `studentRoutes.js` pattern (Joi-validated, `asyncHandler`-wrapped, `AppError`-throwing, `enrollmentPhase: "active"` gated). Build ACCESS-02 as a new `digital-app/utils/dek.js` (or extend `utils/keypair.js`) module mirroring `ecies.js`'s `unwrapDEK` signature exactly, paired with a new client-side AES-GCM decrypt function mirroring `aesgcm.js::decryptCredential`'s `{iv, authTag, ciphertext}` blob shape. Do not modify zkp-backend at all — every contract it exposes already matches what this phase needs.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Fetch ciphertextCID + dekEnvelopeCID | API / Backend (admin-backend, new route) | — | Student record + DEK envelope CID live in MongoDB; only admin-backend has the DB connection |
| ECIES unwrap DEK | Browser / Client (mobile, on-device) | — | Private key never leaves device (CLAUDE.md ground rule 4); must happen client-side |
| AES-GCM decrypt credential JSON | Browser / Client (mobile, on-device) | — | DEK never leaves device; decrypt must happen where the DEK is unwrapped |
| Generate ZK proof | API / Backend (zkp-backend, existing, unmodified) | — | Server-side per CLAUDE.md ground rule 4 — only decrypted attrs/salts/nonce cross the wire (HTTPS), never the DEK/privkey |
| Off-chain proof verify (`/verify`) | API / Backend (zkp-backend, existing) | — | snarkjs verify needs the verification key file; stays server-side |
| On-chain proof verify (`/verify-onchain`) | API / Backend (zkp-backend, existing) → Database/Storage (Sepolia) | — | Calls the deployed Groth16Verifier contract via ethers provider |
| Nonce issue/track (anti-replay) | API / Backend (zkp-backend, existing `nonceStore.js`) | — | Must be server-tracked per D-09 — client-invented nonces defeat anti-replay |
| Blockchain Status check (issuance + revocation) | API / Backend (zkp-backend, existing `/credential-info`) → Database/Storage (Sepolia via CredentialRegistry) | — | Same registry read pattern already used elsewhere; no new on-chain call needed |
| QR code generation (challenge-out, proof-out) | Browser / Client (mobile, `react-native-qrcode-svg`) | — | Pure rendering of already-fetched JSON; no backend involvement |
| QR code scanning | Browser / Client (mobile, `expo-camera` `CameraView`, existing `QRScannerScreen.js`) | — | Camera access is device-only |
| Dashboard / screen navigation & state | Browser / Client (mobile, React Navigation stack in `App.js`) | — | Pure UI orchestration |

## User Constraints (from CONTEXT.md)

<user_constraints>

### Locked Decisions

- **D-04:** Delete and replace now, not alongside. `digital-app/screens/HomeScreen.js`, `StudentProfileScreen.js` (currently broken: old 5-attribute shape + DDMMYYYY date bug), `IdentityForm.js`, and the legacy `ShowProof.js` (787 lines) are removed as part of this phase's plan, replaced by Dashboard / View Credentials / Generate Proof. No transitional dual-screen state.
- **D-05:** "Blockchain Status: Verified" means a live on-chain check (mirrors the existing `/credential-info` → `CredentialRegistry.getCredentialByHash` pattern) confirming issuance + not-revoked — not just "decryption succeeded locally."
- **D-06:** Nonce entry is manual text-only this phase (matches the sketch exactly) — no QR-scan option added here for the *Generate Proof* screen's own nonce field. (Noted as a deferred enhancement.)
- **D-07:** The attribute checkboxes (Name / Enrollment Status / Degree Program / Graduation Year / Full Credential) must map to the frozen E1 circuit's real per-attribute selective disclosure (revealing only the chosen leaves), not app-layer-only filtering — confirmed against actual `/generate-proof` contract in this research (see Summary — `reveal` object is name-keyed booleans, unchanged shape).
- **D-08:** Proof freshness window is **15 minutes** (raised from the initially-discussed 5). Research confirmed: the ONLY hardcoded freshness constant in the backend is `zkp-backend/lib/nonceStore.js` line 30, `TTL_MS = 5 * 60 * 1000`. This is the single value to change. There is no second freshness window. See Summary for the gap between CONTEXT.md's "proof carries its own generation timestamp" framing and actual code (nonce-session TTL, not an embedded proof timestamp).
- **D-09:** Verify Proof is a peer-to-peer challenge/response with **two distinct QR hops**, not a single screen:
  1. **Outgoing:** Verifier's app calls the existing `/session/nonce` to get a backend-tracked nonce, bundles it with the requested fields, displays as QR — "Step 1: Share this challenge."
  2. **Returning:** Prover scans/enters that payload, generates the proof bound to that nonce, displays the resulting proof+publicSignals as a new QR — "Step 2: Share your proof back."
  3. Verifier scans/enters that returning QR and runs `/verify` + `/verify-onchain` + revocation check.
  - Both hops support **scan QR or manual text entry** in parallel.
  - UI must make the active hop unambiguous ("Step 1 of 2" / "Step 2 of 2").
- **D-10:** Consent is folded directly into attribute selection, not a separate screen. Requested fields show pre-checked but editable; the "Generate Proof" action **is** the consent action.
- **D-11:** Verify Proof needs no new backend persistence — folds back into Phase 8.

### Claude's Discretion

- Exact QR payload encoding for both D-09 hops (JSON shape, size limits) — see Code Examples / Common Pitfalls below for research findings (payload size estimate, error-correction level).
- Dashboard/View Credentials/Generate Proof/Verify Proof visual styling — follow `LoginScreen.js` / `ClaimCredentialScreen.js` card/button visual language (white rounded cards, `#3b82f6` primary, `#f8fafc` background) per the approved 08-UI-SPEC.md.

### Deferred Ideas (OUT OF SCOPE)

- Phase 9 (crypto-shredding erasure) — untouched; Verify Proof's revocation check (D-09 step 3) calls the same live on-chain check as D-05, independent of Phase 9's timing.
- D-01–D-03 (Proof-ID persistent store model) — explicitly superseded mid-session; do not resurrect a Proof-ID/Verification-URL/database design. `/verify` and `/verify-onchain` are pure stateless checks; the only server-side state involved anywhere in this phase is the existing in-memory nonce `Map` in `nonceStore.js`.

</user_constraints>

## Phase Requirements

<phase_requirements>

| ID | Description | Research Support |
|----|-------------|------------------|
| ACCESS-01 | `GET /credential/:rollNo/blobs` returns both `ciphertextCID` and `dekEnvelopeCID` for an active student | Confirmed exact field names on `Student` schema (`ciphertextCID`, `dekEnvelopeCID`, `enrollmentPhase`); confirmed NO existing route looks students up by `rollNo` (only `findById`/`findOne({email})` exist) — this is genuinely new code, not a copy of an existing lookup. Route placement, validation, and error-handling pattern fully specified below (Architecture Patterns, Code Examples). |
| ACCESS-02 | App fetches both blobs, ECIES-unwraps DEK on-device, AES-GCM-decrypts credential JSON, sends only `{attrs, salts, nonce, currentDateInt}` to existing ZKP backend — DEK/privkey never leave device | Confirmed `unwrapDEK(privKeyHex, envelopeBase64)` exact signature in `privdId_admin/backend/crypto/ecies.js` (server-side original) to mirror client-side; confirmed `decryptCredential(blob, dek)` exact `{iv, authTag, ciphertext}` blob shape in `aesgcm.js` to mirror; confirmed `/generate-proof`'s actual request shape requires `attrs` (7-key object) + `salts` (7-string array) + `reveal` + `nonce` + `currentDateInt` — exactly matches the decrypted credential JSON's `buildCredentialJson()` shape (`name, rollNo, dobInt, programmeLevel, discipline, batch, email, salts, merkleRoot`) plus a client-side reveal-checkbox map. Confirmed no mobile crypto module exists yet (digital-app has zero non-`node_modules` crypto files besides `utils/keypair.js`) — this phase creates it from scratch, mirroring the server-side pattern exactly. |

</phase_requirements>

## Standard Stack

### Core (already installed — no new packages required)

| Library | Version (installed) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `eciesjs` | 0.5.0 [VERIFIED: npm registry, matches installed version in both `digital-app/package.json` and `privdId_admin/backend/package.json`] | ECIES unwrap of DEK on-device | Already used identically server-side in Phase 7's `ecies.js`; same library guarantees identical envelope format compatibility |
| `expo-secure-store` | ~14.2.4 [CITED: digital-app/package.json] | Read the on-device private key written by Phase 7's `utils/keypair.js` | Already the storage mechanism for the keypair this phase must read |
| `expo-camera` | ^16.1.11 [CITED: digital-app/package.json] | QR scanning (`CameraView`) for both D-09 hops | Already used in existing `QRScannerScreen.js`; D-09 supersedes the prior "manual only" deferral, bringing this screen into scope |
| `react-native-qrcode-svg` | ^6.3.15 installed / 6.3.21 latest [VERIFIED: npm registry] | QR code rendering for challenge-out and proof-out | Already a dependency per 08-UI-SPEC.md's "Design System" table; no new install needed |
| Node `crypto` (built-in) | n/a | AES-256-GCM decrypt of credential JSON on-device | React Native's `crypto` is not Node's — see Pitfall below; do NOT assume `aesgcm.js`'s exact code is portable as-is |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `react-native-get-random-values` | ^1.11.0 [CITED: pinned in Phase 07-03, see STATE.md decision log — 2.0.0 incompatible with RN 0.79.5/Expo SDK 53] | CSPRNG polyfill required by `eciesjs`/`@noble` libs on RN | Already installed; required transitively for any new crypto call in this phase too — do not bump |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled mobile AES-GCM via Node `crypto` polyfill | `expo-crypto` / WebCrypto `SubtleCrypto` (if available in Expo SDK 53) | Node's `crypto` module is NOT natively available in React Native; Expo/RN typically shims via `react-native-quick-crypto` or relies on `@noble/ciphers` (already a transitive dependency of `eciesjs`/`ethers` per `node_modules` scan). **Recommendation: use `@noble/ciphers`'s AES-GCM directly** (already present transitively, audited, pure-JS, RN-compatible) rather than assuming Node's `crypto.createDecipheriv` works as-is on-device — confirm in a Wave 0 smoke test (see Validation Architecture). |

## Package Legitimacy Audit

No new external packages are being installed this phase — every crypto/QR/camera dependency (`eciesjs`, `expo-secure-store`, `expo-camera`, `react-native-qrcode-svg`, `react-native-get-random-values`) is already present in `digital-app/package.json` and was already audited/installed in Phase 7. The only candidate *new* dependency surfaced by this research is `@noble/ciphers` for client-side AES-GCM — but it is **already present transitively** (confirmed via `node_modules/@noble/ciphers/` scan) as a dependency of `eciesjs`/`ethers`, so no new top-level install is required; the planner should add it to `package.json` direct dependencies (not just rely on transitive resolution) for correctness, but this is a version-pin operation on an already-vetted package, not a new-package trust decision.

**Packages removed due to slopcheck [SLOP] verdict:** none — no new packages introduced.
**Packages flagged as suspicious [SUS]:** none.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| eciesjs | npm | mature (pre-existing, already in production use Phase 7) | high | github.com/ecies/js | not run (already audited Phase 7, no new install) | Approved (reused) |
| react-native-qrcode-svg | npm | mature (already a dependency) | high | github.com/awesomejerry/react-native-qrcode-svg | not run (already installed) | Approved (reused) |
| @noble/ciphers | npm | mature, transitively present | high | github.com/paulmillr/noble-ciphers | not run (transitive, not newly introduced) | Approved (reused, pin as direct dep) |

## Architecture Patterns

### System Architecture Diagram

```
[Mobile App: Dashboard]
        |
        | tap "View Credentials" / "Generate Proof"
        v
[GET /api/students/credential/:rollNo/blobs]  (NEW — admin-backend)
        |  returns { ciphertextCID, dekEnvelopeCID }
        v
[Fetch both blobs from IPFS gateway]  (client-side fetch, existing gateway URL pattern)
        |
        v
[unwrapDEK(privKeyHex, dekEnvelopeBase64)]  (NEW — mobile, mirrors ecies.js)
        |  DEK (32 bytes, in-memory only, never persisted/logged)
        v
[decryptAESGCM(ciphertextBlob, dek)]  (NEW — mobile, mirrors aesgcm.js)
        |  plaintext credential JSON: {name, rollNo, dobInt, programmeLevel,
        |   discipline, batch, email, salts, merkleRoot, ...}
        v
   +----+----------------------------------+
   |                                        |
   v (View Credentials)                    v (Generate Proof)
[Display attrs]                    [Attribute checklist -> reveal{} map]
   |                                        |
   v                                        v
[POST zkp-backend /credential-info]  [POST zkp-backend /generate-proof]
  { pubHash: merkleRoot }              { attrs, salts, reveal, nonce, currentDateInt }
   |  (existing, unmodified)             |  (existing, unmodified)
   v                                      v
[Blockchain Status badge]          [proof, publicSignals, salts] returned
                                          |
                                          v
                                   [QR-encode {proof, publicSignals, sessionId}]
                                          |
                                          v
                                   [Display as "Step 2 of 2" QR / Verifier scans]

--- Verify Proof flow (separate device, D-09) ---

[Verifier: Verify Proof Step 1]
        |
        v
[POST zkp-backend /session/nonce]  (existing, unmodified)
        |  { nonce, sessionId, expiresAt }
        v
[QR-encode {nonce, sessionId, requestedFields} -> "Step 1 of 2" QR]
        |
        v  (prover scans/manually enters)
[Prover: Generate Proof screen, pre-checked from request, D-10 consent]
        |  -> same /generate-proof flow as above, bound to scanned nonce
        v
[QR-encode {proof, publicSignals, sessionId} -> "Step 2 of 2" QR]
        |
        v  (verifier scans/manually enters)
[POST zkp-backend /verify]          (existing, unmodified — crypto + nonce check)
[POST zkp-backend /verify-onchain]  (existing, unmodified — on-chain Groth16 check)
[POST zkp-backend /credential-info] (existing, unmodified — revocation check, D-05/D-09 step 3)
        |
        v
[Result screen: Proof Valid / Invalid + reason]
```

### Recommended Project Structure

```
digital-app/
├── screens/
│   ├── DashboardScreen.js          # NEW — 3-button hub, replaces HomeScreen.js's student role
│   ├── ViewCredentialsScreen.js    # NEW — decrypt + display + Blockchain Status
│   ├── GenerateProofScreen.js      # NEW — checklist + nonce field + result QR (replaces IdentityForm.js + ShowProof.js)
│   ├── VerifyProofScreen.js        # REWORK existing VerifyProof.js into two-hop flow, OR split into VerifyProofStep1Screen.js / VerifyProofStep2Screen.js for clarity
│   ├── QRScannerScreen.js          # EXISTING — reused for both D-09 hops, no changes needed to camera logic
│   ├── ManualQRInput.js            # EXISTING — reused/extended for manual-entry parity (D-09)
│   └── (DELETE) HomeScreen.js, StudentProfileScreen.js, IdentityForm.js, ShowProof.js
├── utils/
│   ├── keypair.js                  # EXISTING — generateAndStoreKeypair, getStoredPublicKeyHexForRetry
│   ├── dek.js                      # NEW — unwrapDEK(privKeyHex, envelopeBase64) mirroring ecies.js
│   └── credentialCrypto.js         # NEW — decryptCredentialBlob(blob, dek) mirroring aesgcm.js::decryptCredential
└── App.js                          # MODIFY — remove 4 legacy Stack.Screen entries + imports, add 4 new ones

privdId_admin/backend/
├── controllers/studentController.js   # MODIFY — add getCredentialBlobs (asyncHandler-wrapped)
└── routes/studentRoutes.js            # MODIFY — add `router.get("/credential/:rollNo/blobs", getCredentialBlobs)`
```

### Pattern 1: New admin-backend lookup-by-rollNo endpoint

**What:** `GET /credential/:rollNo/blobs` — first rollNo-keyed (not `_id`-keyed) lookup route in the codebase.
**When to use:** ACCESS-01.
**Example:**
```js
// Source: pattern mirrors getStudentById (studentController.js:240-245) +
// claimPubkey's validation style (studentController.js:281-298)
export const getCredentialBlobs = asyncHandler(async (req, res) => {
  const { rollNo } = req.params;

  const student = await Student.findOne({ rollNo });
  if (!student) throw new AppError("Student not found.", 404);
  if (student.enrollmentPhase !== "active") {
    throw new AppError("Student has not completed enrollment.", 403);
  }
  if (!student.ciphertextCID || !student.dekEnvelopeCID) {
    throw new AppError("Credential blobs are not available for this student.", 404);
  }

  res.json({
    status: "success",
    ciphertextCID: student.ciphertextCID,
    dekEnvelopeCID: student.dekEnvelopeCID,
  });
});
```
```js
// routes/studentRoutes.js — register BEFORE "/:id" to avoid Express route
// collision (":id" would otherwise greedily match "/credential" as an id
// value on a GET to "/credential/X1234/blobs" style paths if mounted at the
// same router level with a conflicting prefix — verify final mount path,
// likely needs to live at a route prefix that does not collide with
// "/:id/pubkey" style nesting; recommend mounting as a sibling top-level
// route, e.g. `router.get("/credential/:rollNo/blobs", getCredentialBlobs);`
// placed ABOVE `router.get("/:id", getStudentById);` in route declaration
// order since Express matches in registration order).
router.get("/credential/:rollNo/blobs", getCredentialBlobs);
```

### Pattern 2: On-device DEK unwrap (mirrors ecies.js exactly)

**What:** Client-side `unwrapDEK` — same library, same envelope format, opposite key.
**When to use:** ACCESS-02, step 1 of decrypt pipeline.
**Example:**
```js
// Source: privdId_admin/backend/crypto/ecies.js lines 93-103 (server-side
// original) — mirror exactly on mobile, reading privKeyHex from SecureStore
// instead of receiving it as a function argument from a DB-backed caller.
import { decrypt } from 'eciesjs';
import * as SecureStore from 'expo-secure-store';

const PRIVATE_KEY_STORAGE_KEY = 'privid_student_privkey'; // MUST match utils/keypair.js exactly

export async function unwrapDEK(envelopeBase64) {
  const privKeyHex = await SecureStore.getItemAsync(PRIVATE_KEY_STORAGE_KEY);
  if (!privKeyHex) throw new Error('unwrapDEK: no stored private key found');

  const envelope = Buffer.from(envelopeBase64, 'base64');
  const dek = Buffer.from(decrypt(privKeyHex, envelope)); // Uint8Array -> Buffer, same Rule-1 bug fix as Phase 7
  if (dek.length !== 32) {
    throw new Error(`unwrapDEK: decrypted DEK has unexpected length ${dek.length}`);
  }
  return dek;
}
```

### Pattern 3: On-device AES-GCM decrypt (mirrors aesgcm.js — verify crypto module availability first)

**What:** Decrypt `{iv, authTag, ciphertext}` blob to plaintext credential JSON.
**When to use:** ACCESS-02, step 2 of decrypt pipeline.
**Example:**
```js
// Source: privdId_admin/backend/crypto/aesgcm.js lines 98-119 (server-side
// original, uses Node's crypto.createDecipheriv). React Native does NOT
// have Node's `crypto` module natively — Pitfall 1 below. Recommended
// mobile equivalent using @noble/ciphers (already transitively installed,
// pure-JS, RN-compatible):
import { gcm } from '@noble/ciphers/aes';

export function decryptCredentialBlob(blob, dek) {
  if (!blob || typeof blob.iv !== 'string' || typeof blob.authTag !== 'string' || typeof blob.ciphertext !== 'string') {
    throw new Error('decryptCredentialBlob: blob must have iv, authTag, ciphertext base64 strings');
  }
  const iv = Buffer.from(blob.iv, 'base64');
  const authTag = Buffer.from(blob.authTag, 'base64');
  const ciphertext = Buffer.from(blob.ciphertext, 'base64');

  // @noble/ciphers' gcm expects ciphertext+tag concatenated, not separate —
  // VERIFY exact API shape against @noble/ciphers docs before implementation
  // (flagged LOW confidence below — Context7/official docs not consulted
  // for this specific call signature in this research pass).
  const combined = Buffer.concat([ciphertext, authTag]);
  const plaintext = gcm(dek, iv).decrypt(combined);
  return JSON.parse(Buffer.from(plaintext).toString('utf8'));
}
```

### Pattern 4: `/generate-proof` request construction from decrypted credential + checklist

**What:** Map decrypted credential JSON + UI checkbox state into the exact `/generate-proof` request shape.
**When to use:** Generate Proof screen submit handler.
**Example:**
```js
// Source: zkp-backend/server.js lines 64-116 (verified exact contract) +
// privdId_admin/backend/services/credentialService.js buildCredentialJson
// (verified exact decrypted-JSON shape, lines 70-94)
async function handleGenerateProof(decryptedCredential, checkedAttrs, nonce) {
  // decryptedCredential = { name, rollNo, dobInt, programmeLevel, discipline,
  //   batch, email, salts, merkleRoot, issuedAt, issuer, type, version }
  const attrs = {
    name: decryptedCredential.name,
    rollNo: decryptedCredential.rollNo,
    dob: decryptedCredential.dobInt,        // witnessBuilder accepts dobInt directly (resolveDobInt strips dashes, already-integer passes through)
    programmeLevel: decryptedCredential.programmeLevel,
    discipline: decryptedCredential.discipline,
    batch: decryptedCredential.batch,
    email: decryptedCredential.email,
  };

  const currentDateInt = Number(
    new Date().toISOString().slice(0, 10).replace(/-/g, '')
  ); // YYYYMMDD, matches circuit's expected format

  const response = await fetch(`${BACKEND_URL}/generate-proof`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      attrs,
      salts: decryptedCredential.salts,       // MUST reuse issuance-time salts, never regenerate (Pitfall below)
      reveal: checkedAttrs,                    // name-keyed booleans from UI checklist
      nonce,                                    // from manual entry (D-06) or scanned D-09 challenge
      currentDateInt,
    }),
  });
  const { proof, publicSignals, salts } = await response.json();
  return { proof, publicSignals };
}
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ZK proof generation | A new proof-construction call | Existing `/generate-proof` (zkp-backend, unmodified) | CLAUDE.md ground rule 1+4: circuit is frozen, proof gen is server-side; rebuilding this client-side would require shipping the zkey/wasm to the device and re-deriving witness logic — explicitly out of scope |
| Selective-disclosure logic | App-layer filtering of a single hash (the OLD bug per ARCHITECTURE.md) | The circuit's `revealMask`/`revealedValue` in-circuit constraints (already built) | The circuit already cryptographically enforces "hidden attributes never appear in publicSignals" — re-implementing this client-side would be both redundant and weaker (witness-discipline instead of circuit-enforced) |
| Anti-replay nonce tracking | A new client-side or mobile-local nonce store | Existing `/session/nonce` + `nonceStore.js` (zkp-backend, server-tracked Map) | D-09 explicitly requires backend-issued nonces — a client-invented nonce defeats the entire anti-replay guarantee |
| On-chain revocation check | A new ethers.js contract call from the mobile app | Existing `/credential-info` (zkp-backend) | Mobile apps should never hold an RPC URL/provider config directly; the existing endpoint already wraps this correctly and is reused for both D-05 and D-09 step 3 |
| AES-256-GCM / ECIES primitives | Hand-rolled cipher math | `@noble/ciphers` (AES-GCM) + `eciesjs` (ECIES) — both already vetted, in production use server-side | Hand-rolling authenticated encryption is a textbook security anti-pattern; both libraries are already proven compatible with this exact envelope/blob format server-side |

**Key insight:** Every cryptographic and ZK-proof primitive this phase needs already exists and is already proven correct server-side (Phases 6-7) or pre-existing (zkp-backend). The ENTIRE engineering surface of this phase is: (1) one new lookup-by-rollNo REST endpoint, (2) porting two already-correct Node crypto functions to their RN-compatible equivalents, and (3) four new screens that orchestrate calls to endpoints that already work. Resist any temptation to "improve" or "harden" the circuit, the nonce store, or the verify endpoints in this phase — they are explicitly frozen/unmodified per the phase boundary.

## Runtime State Inventory

Not applicable — this phase adds new screens/endpoints and deletes legacy screens via source-file removal + import/registration deletion in `App.js`. It is not a rename/rebrand/migration phase. The "delete legacy screens" requirement (D-04) is a straightforward file-removal + `App.js` edit, not a runtime-state migration — confirmed via grep that `HomeScreen.js`, `StudentProfileScreen.js`, `IdentityForm.js`, `ShowProof.js` have zero references outside `digital-app/` source files (no Mongo records, no env vars, no OS-registered state reference these screen names).

**Full reference map for D-04 removal** (grep-verified, exhaustive):
- `App.js`: imports lines 5, 8, 9, 11; `Stack.Screen` registrations at lines 69-73 (HomeScreen), 86-90 (StudentProfile), 93-102 (IdentityForm), 114-118 (ShowProof, shares the "Shared Proof Screens" block with `LoadingScreen`/`VerifyProof`/`ErrorScreen`/`QRScannerScreen`/`ManualQRInput` — do NOT delete the whole block, only the `ShowProof` entry)
- `digital-app/screens/HomeScreen.js`: self-reference (component definition) + internal `navigation.navigate('IdentityForm')` (line 139)
- `digital-app/screens/IdentityForm.js`: self-reference + internal `navigation.navigate` reset to `'HomeScreen'` (line 41)
- `digital-app/screens/ShowProof.js`: self-reference + internal `navigation.navigate('IdentityForm')` (line 61) + reset to `'IdentityForm'` (line 140)
- `digital-app/screens/StudentProfileScreen.js`: self-reference only (no outbound navigation found in this screen)
- `digital-app/screens/LoadingScreen.js` line 40: `navigation.replace('ShowProof', ...)` — **this is a cross-file dependency the planner must redirect** to whatever replaces ShowProof's role (likely GenerateProofScreen's result view), or LoadingScreen itself may be subsumed into the new GenerateProofScreen's own loading state per the UI-SPEC's "Decrypting your credential…" / generate-proof in-flight pattern — confirm with planner whether `LoadingScreen.js` survives as a shared component or is also retired.
- `digital-app/screens/ErrorScreen.js` lines 11, 18: `navigation.navigate('IdentityForm')` / reset to `'IdentityForm'` — **dangling reference if IdentityForm is deleted**, must be redirected to `'DashboardScreen'` (or equivalent).
- `digital-app/screens/VerifyProof.js` line 111: reset to `'IdentityForm'` — same dangling-reference issue; this entire file is being reworked per D-09 anyway, so this reference disappears naturally if VerifyProof.js is rewritten rather than patched.
- `digital-app/screens/ManualQRInput.js` line 19: reset to `[{ name: 'HomeScreen' }]` — **dangling reference**, must be redirected to the new Dashboard screen name.
- `digital-app/screens/HomeScreen.js` line 81: `navigation.navigate('LoginScreen')` — this is the entry point students currently use to reach the login flow; the planner must decide where this affordance moves (likely: app boots directly to LoginScreen, or a slimmed-down landing screen retains this single button before Dashboard, since Dashboard is post-login per the UI-SPEC).

**Nothing found in category:** No database records, env vars, or OS-registered state reference these screen names — confirmed via grep across `digital-app/` (excluding `node_modules`); this is a pure source-code removal with several dangling `navigation.navigate`/`reset` string-literal references that must be redirected, not a data migration.

## Common Pitfalls

### Pitfall 1: Assuming Node's `crypto` module works unmodified in React Native
**What goes wrong:** `aesgcm.js`'s `decryptCredential` uses `crypto.createDecipheriv` from Node's built-in `crypto` module. React Native does not ship Node's `crypto` — Metro bundler will either fail to resolve it or silently pull in an incomplete browser-shim polyfill that lacks GCM support.
**Why it happens:** Server-side code (`privdId_admin/backend`) runs under real Node.js; mobile code runs under Hermes/JSC with RN's module resolution, which is NOT Node-compatible by default.
**How to avoid:** Use `@noble/ciphers`'s `gcm` (already transitively installed, confirmed pure-JS and RN-safe — it's how `eciesjs`/`ethers` already work on this exact RN setup) instead of porting `crypto.createDecipheriv` directly. Verify the exact `@noble/ciphers` GCM API call signature (ciphertext+tag concatenation order) via Context7/official docs before implementation — flagged LOW confidence in this research (see Code Examples Pattern 3 comment).
**Warning signs:** Metro bundler error "Unable to resolve module crypto", or a decrypt that "succeeds" but produces garbage (wrong API usage silently returning wrong bytes instead of throwing).

### Pitfall 2: Regenerating salts instead of reusing issuance-time salts
**What goes wrong:** `/generate-proof` accepts an OPTIONAL `salts` field and will silently call `generateSalts(7)` server-side if omitted (server.js lines 95-101). If the Generate Proof screen forgets to pass the decrypted credential's actual `salts` array, the proof will be cryptographically valid but for a DIFFERENT (freshly-randomized) Merkle root that does NOT match the on-chain-registered `merkleRoot` — the proof will verify off-chain (`/verify`) but FAIL on-chain (`/verify-onchain`) and fail `/credential-info` lookup, because `pubHash` (publicSignals[0]) won't match any registered hash.
**Why it happens:** The optional-salts convenience parameter exists for testing/benchmarking (see `bench.js`'s `FIXED_SALTS`), not for production use — it's easy to omit by accident since the endpoint doesn't error if you do.
**How to avoid:** ALWAYS pass `salts: decryptedCredential.salts` explicitly from the decrypted credential JSON (per `buildCredentialJson`'s shape, confirmed it includes a `salts` array) — never rely on server-side auto-generation in this phase.
**Warning signs:** Proof generates successfully and passes `/verify` but fails `/verify-onchain` or `/credential-info` lookup ("Credential not found in registry").

### Pitfall 3: `dob` field naming mismatch between decrypted JSON (`dobInt`) and witnessBuilder's expected key (`dob`)
**What goes wrong:** `buildCredentialJson` (admin backend, issuance-time) stores the field as `dobInt` (already an integer). `witnessBuilder.js`'s `buildWitnessInput` expects `attrs.dob` (singular, no "Int" suffix) and calls `resolveDobInt(attrs.dob)` to normalize it. If the Generate Proof screen passes the decrypted JSON's `dobInt` key straight through as `attrs.dobInt` instead of remapping to `attrs.dob`, `/generate-proof`'s required-field validation (server.js line 84-88, checks for `dob` key specifically) will 400 with "attrs missing required field(s): dob".
**Why it happens:** Two different modules (issuance-side `credentialService.js` and proof-side `witnessBuilder.js`) independently named this field differently; there is no shared constant.
**How to avoid:** Explicit remap in the Generate Proof screen's request-construction code: `attrs.dob = decryptedCredential.dobInt` (see Code Examples Pattern 4, already shows this correctly).
**Warning signs:** 400 error "attrs missing required field(s): dob" despite the decrypted credential clearly containing date-of-birth data under a different key name.

### Pitfall 4: QR payload size near the practical ceiling for dense JSON
**What goes wrong:** A full Groth16 proof (`pi_a`, `pi_b`, `pi_c` — each containing ~77-digit decimal field elements) + 19 `publicSignals` (each up to ~77 digits) + `sessionId` (UUID) serializes to roughly **1900-2600 characters** of JSON (measured directly in this research: 1982 chars for a realistic synthetic payload). Standard QR codes in byte/binary mode at error-correction level L can hold up to ~2953 bytes (Version 40); at the more failure-tolerant level M/Q/H, capacity drops substantially (down to ~1273 bytes at level H). Scanning a near-capacity QR code at "arm's length on a second phone" (per UI-SPEC) is measurably less reliable than a sparser code.
**Why it happens:** Groth16 proof elements are full ~254-bit BN128 field elements; there is no way to shrink them without changing the proof system.
**How to avoid:** Use a LOW or MEDIUM error-correction level (not the QR default in many libraries, which can be H) to maximize usable capacity for this payload size, OR base64-encode + gzip-compress the JSON before QR-encoding (likely only modest gains on already-dense decimal-string JSON — test empirically), OR widen the QR module size beyond 220px if scan reliability proves to be an issue at arm's length. Recommend the planner add an explicit smoke-test task scanning a real generated proof QR on two physical devices before considering D-09 done (this is exactly the "Verify Proof two-device QR checkpoint" already flagged as a deferred human-verify item in STATE.md's Pending Todos).
**Warning signs:** Intermittent scan failures, or `react-native-qrcode-svg` silently truncating/erroring on oversized data — verify the library's max-capacity behavior (does it throw, or silently clip?) before relying on it for the largest expected payload (proof+publicSignals+sessionId, NOT the smaller challenge-out payload which is just nonce+sessionId+requestedFields and comfortably small).

### Pitfall 5: Express route-ordering collision for the new `:rollNo` lookup route
**What goes wrong:** `studentRoutes.js` already has `router.get("/:id", getStudentById)`. If `router.get("/credential/:rollNo/blobs", ...)` is registered AFTER `/:id`, Express's path-matching could behave unexpectedly depending on final mount-path structure (e.g., if mounted such that `/credential` itself could be captured as an `:id` value in some other route ordering, or if a future route like `/:id/something` is added carelessly).
**Why it happens:** Express matches routes in registration order; ambiguous path segments sharing a common prefix structure are a classic source of shadowed routes.
**How to avoid:** Register the new `/credential/:rollNo/blobs` route BEFORE `/:id` in `studentRoutes.js`, and confirm via a quick manual `curl` test that `GET /api/students/credential/22BCSD01/blobs` resolves to the new handler, not to `getStudentById` with `id="credential"`.
**Warning signs:** New endpoint returns "Student not found" (404 from `getStudentById`'s `findById("credential")` failing) instead of executing the new handler at all.

## Code Examples

See **Architecture Patterns** section above (Patterns 1-4) — all four code examples are sourced directly from verified existing project files (`studentController.js`, `ecies.js`, `aesgcm.js`, `server.js`, `witnessBuilder.js`, `credentialService.js`), not external documentation, since this phase's entire surface is internal-codebase integration rather than third-party library usage.

### `/session/nonce` exact response shape (for D-09 Step 1 QR payload)
```js
// Source: zkp-backend/server.js lines 121-124 (verified exact)
// POST /session/nonce (no request body needed)
// Response: { nonce: "<decimal string>", sessionId: "<uuid>", expiresAt: <epoch ms> }
```

### `/verify` and `/verify-onchain` exact request/response shape (for D-09 Step 3)
```js
// Source: zkp-backend/server.js lines 133-205 (verified exact)
// POST /verify  { proof, publicSignals, sessionId } -> { valid: boolean, reason?: string }
// POST /verify-onchain  { proof, publicSignals, sessionId } -> { valid: boolean, reason?: string }
// reason values observed in code: "invalid_proof", "unknown_session",
// "nonce_already_used", "nonce_expired", "nonce_mismatch"
// NOTE: nonce consumption happens in BOTH /verify and /verify-onchain
// independently (each calls validateAndConsume separately) — if the Verify
// Proof flow calls /verify THEN /verify-onchain on the same sessionId, the
// second call will get "nonce_already_used" since validateAndConsume marks
// the entry used on first success. The planner must decide: call only
// /verify-onchain (skip the off-chain-only /verify entirely, since
// on-chain verify is strictly stronger and the UI-SPEC's D-09 step 3 lists
// "/verify + /verify-onchain + revocation check" as three checks) OR
// restructure nonce handling. RECOMMENDATION: call /verify-onchain alone
// for the cryptographic check (it already does snarkjs-equivalent
// verification via the deployed contract) and /credential-info separately
// for revocation — do not call both /verify and /verify-onchain against the
// same sessionId. Flagged in Open Questions.
```

### `/credential-info` exact request/response shape (for D-05 and D-09 step 3)
```js
// Source: zkp-backend/server.js lines 207-235 (verified exact)
// POST /credential-info  { pubHash: "<decimal string, publicSignals[0]>" }
// Response (found):
//   { found: true, rollNo, ciphertextCID, issuedAtMs, revoked,
//     ipfsUrl, etherscanUrl }
// Response (not found): { found: false, message: "Credential not found in registry" }
// "Blockchain Status: Verified" (D-05) = found:true && revoked:false
// "Blockchain Status: Revoked" = found:true && revoked:true
// "Blockchain Status: Unable to verify" = network/fetch error (5xx or thrown), NOT found:false
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Flat Poseidon(5) hash, app-layer-only selective disclosure (described in `.planning/codebase/ARCHITECTURE.md` "Key Architectural Decision #2") | Depth-3 balanced Merkle tree (8 leaves: 7 attrs + 1 zero-pad) with in-circuit `revealMask`/`revealedValue` enforcement | E1+E2 circuit rebuild (Phase 1-4 of this rebuild effort, completed per STATE.md before Phase 8) | `/generate-proof`'s request shape (`attrs`, `salts`, `reveal`, `nonce`, `currentDateInt`) was ALREADY updated for the new circuit before Phase 8 started — there is no migration work needed in zkp-backend itself, only in the mobile client that now needs to call it correctly for the first time post-encryption-rollout |
| 5-attribute identity spec | 7-attribute identity spec (`name, rollNo, dob, programmeLevel, discipline, batch, email`) | Same E1+E2 rebuild | `StudentProfileScreen.js` (being deleted per D-04) is described in CONTEXT.md as "currently broken: old 5-attribute shape + DDMMYYYY date bug" — confirms it predates this 7-attribute spec and should not be referenced as a pattern for the new View Credentials screen |

**Deprecated/outdated:**
- `.planning/codebase/ARCHITECTURE.md`'s "ZK Proof Pipeline" and "Key Architectural Decision #2" sections: confirmed stale by direct circuit/server.js inspection in this research — do not consult that file for circuit/proof-shape facts; this RESEARCH.md's Summary and Code Examples sections supersede it for Phase 8 planning purposes.
- The "Proof-ID lookup" / persistent verification-URL model (D-01–D-03): superseded mid-session per STATE.md; do not resurrect.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@noble/ciphers`'s `gcm(key, iv).decrypt(ciphertext)` expects ciphertext+authTag concatenated (not separate args) | Code Examples Pattern 3, Pitfall 1 | If the actual API differs (e.g., separate tag param, or different concatenation order), decrypt will throw or silently produce wrong plaintext — verify against Context7/official `@noble/ciphers` docs before implementation; this was NOT verified via Context7 in this research pass (training-knowledge only) |
| A2 | `witnessBuilder.js`'s `resolveDobInt` accepts an already-integer `dobInt` value (not just dash-separated date strings) passed as `attrs.dob` | Code Examples Pattern 4, Pitfall 3 | Re-read of `resolveDobInt` (witnessBuilder.js lines 88-99) shows it does `String(dob).replace(/[-/]/g,'')` then validates 8-digit — an already-integer `dobInt` like `20040215` stringifies fine and has no dashes to strip, so this should work, but was not executed/tested in this research session, only traced by reading. If wrong, `/generate-proof` would 400 on a malformed dob. |
| A3 | The UI-SPEC's 5 checkboxes (Name / Enrollment Status / Degree Program / Graduation Year / Full Credential) map cleanly onto the circuit's 7 `reveal` keys (name, rollNo, dob, programmeLevel, discipline, batch, email) | Summary, Phase Requirements | This mapping is NOT 1:1 and is NOT specified anywhere in 08-CONTEXT.md or 08-UI-SPEC.md — "Enrollment Status" and "Degree Program" don't correspond to obvious single circuit keys (programmeLevel ≈ "Degree Program"? discipline ≈ ? batch ≈ "Graduation Year"? rollNo/email/dob are not represented at all in the 5-item list). This is a real gap requiring user/planner decision — see Open Questions Q1. |

## Open Questions

1. **UI-SPEC's 5 checkboxes vs circuit's 7 reveal keys — exact mapping undefined**
   - What we know: The circuit has exactly 7 revealable attributes (`name, rollNo, dob, programmeLevel, discipline, batch, email`). The UI-SPEC and CONTEXT.md D-07 specify exactly 5 checkbox labels: "Name", "Enrollment Status", "Degree Program", "Graduation Year", "Full Credential".
   - What's unclear: "Enrollment Status" isn't a circuit attribute at all (closest analog: `enrollmentPhase`, which lives only in MongoDB, never enters the circuit/credential JSON — so "Enrollment Status" cannot literally be a `reveal` key). "Degree Program" most likely maps to `programmeLevel` (the human label is friendlier). "Graduation Year" most likely maps to `batch` (admission/graduating year) — but could also mean a computed graduation year that doesn't exist as a raw circuit field. `rollNo` and `email` and `dob` (besides via "Full Credential") have no checkbox of their own.
   - Recommendation: The planner should treat "Full Credential" as `reveal = {name:true, rollNo:true, dob:true, programmeLevel:true, discipline:true, batch:true, email:true}` (all 7), and treat "Name"/"Degree Program"/"Graduation Year" as `name`/`programmeLevel`/`batch` respectively. "Enrollment Status" likely should NOT be a `reveal` boolean at all — it may instead just gate whether the screen displays the (always-locally-known, never-disclosed) `enrollmentPhase` value, OR it may be intended as a stand-in label for something else the user actually meant (e.g., proving non-revocation, which is already handled out-of-band via `/credential-info`, not via the circuit's reveal mechanism at all). **This needs a one-line user confirmation before the planner locks the screen's checkbox-to-reveal-key mapping** — flag as a discuss-phase follow-up or a planner-level clarifying assumption documented in the plan.

2. **D-09's "proof carries its own generation timestamp as a public signal" vs verified circuit/code reality**
   - What we know: The circuit's public signals are `[pubHash, nonce, currentDateInt, isOver18, isPostgrad, revealedValue[7], revealMask[7]]` — there is no distinct "generatedAt" signal. `currentDateInt` is used only for the age predicate, not compared against "now" at verify time. The only server-tracked expiry is the nonce session's `expiresAt` in `nonceStore.js`, checked in `validateAndConsume`.
   - What's unclear: Whether D-08/D-09's 15-minute freshness requirement is satisfied entirely by raising `nonceStore.js`'s `TTL_MS` to 15 minutes (sufficient, since the nonce is single-use and time-boxed, and a proof is only useful bound to a valid unexpired nonce), or whether CONTEXT.md intended something additional (an actual embedded proof timestamp) that does not currently exist in the circuit and would require a circuit change (explicitly forbidden mid-phase per CLAUDE.md ground rule 1 — circuit is frozen).
   - Recommendation: Treat `nonceStore.js`'s `TTL_MS` as the sole mechanism satisfying D-08 — this is a one-line constant change, fully within the "existing ZKP backend untouched" constraint in spirit (it's a config-level TTL change, not a circuit/contract change) but technically IS a zkp-backend code edit. Flag for the planner: phase description says "existing ZKP backend untouched" but D-08 explicitly requires changing `nonceStore.js`'s constant — these two statements are in tension and the planner should treat the TTL_MS change as an explicit, narrow, justified exception to "untouched," not an oversight.

3. **Nonce double-consumption risk in `/verify` + `/verify-onchain` sequential calls**
   - What we know: Both endpoints independently call `validateAndConsume(sessionId, publicSignals[1])`, and `validateAndConsume` marks the nonce `used` on first success.
   - What's unclear: Whether the Verify Proof flow (D-09 step 3, "runs `/verify` + `/verify-onchain` + revocation check") is meant to call both sequentially against the SAME nonce session, which would fail the second call with `nonce_already_used`.
   - Recommendation: See Code Examples note above — call `/verify-onchain` alone (it performs an equivalent cryptographic check via the deployed contract, strictly superseding `/verify`'s off-chain check for this use case) plus `/credential-info` for revocation, skipping `/verify` entirely in the Verify Proof flow. STATE.md's Jun 19 decision log entry "Nonce-Flow Redesign: Off-Chain /verify Pre-Check Removed to Prevent Double-Consumption Bug" (observation #314, surfaced by the session-memory hook during this research) appears to independently corroborate this exact concern — the planner should pull that full observation via `get_observations([314])` before finalizing the Verify Proof task breakdown.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js / npm | All backend dev | ✓ | (npm registry reachable, confirmed via `npm view` calls in this research) | — |
| `eciesjs` (npm registry) | ACCESS-02 | ✓ | 0.5.0 (matches installed) | — |
| `react-native-qrcode-svg` (npm registry) | D-09 QR display | ✓ | 6.3.21 latest / 6.3.15 installed (compatible) | — |
| zkp-backend running instance | Generate Proof / Verify Proof | Not probed (requires `BLOCKCHAIN_RPC_URL`/`VERIFIER_ADDRESS`/`REGISTRY_ADDRESS` env vars per `server.js`'s `requireEnv` fail-fast pattern) | — | Planner should confirm zkp-backend's `.env` is configured before relying on live `/generate-proof` calls in Wave 0 smoke tests |
| Sepolia RPC connectivity | `/verify-onchain`, `/credential-info` | Not probed in this research session | — | If RPC is unreachable, `/verify-onchain`/`/credential-info` will throw — Generate Proof's off-chain path still works without it, but Blockchain Status (D-05) and Verify Proof step 3 require it |

**Missing dependencies with no fallback:** none identified that would block planning — both flagged items above are runtime-environment configuration checks for execute-phase, not phase-blocking research gaps.

**Missing dependencies with fallback:** none beyond the above.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest-style (zkp-backend has `test/*.test.js` files: `generateProof.test.js`, `verifyFlow.test.js`, `nonceStore.test.js`, `witnessBuilder.test.js` — confirmed via graphify query) using `supertest` for HTTP-level tests against the Express app exported from `server.js` (`module.exports = app` guarded by `require.main === module` check, confirmed lines 240-246) |
| Config file | Not located in this research pass — planner/Wave-0 should confirm `zkp-backend/package.json`'s test script and whether `digital-app`/`privdId_admin/backend` have any test infra at all (none was surfaced by graphify queries in this session — likely none exists for the mobile app or admin backend yet) |
| Quick run command | `cd zkp-backend && npm test` (assumed standard `npm test` script — verify exact script name in Wave 0) |
| Full suite command | same as above (single test directory, no multi-suite split observed) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ACCESS-01 | `GET /credential/:rollNo/blobs` returns correct CIDs for active student, 403/404 for inactive/missing | integration (supertest against admin-backend Express app) | `cd privdId_admin/backend && npm test -- studentRoutes` (assumed — no existing test file found for studentRoutes; this is new) | ❌ Wave 0 — no admin-backend test infra was located in this research; planner must confirm whether one exists before assuming Jest/supertest is wired up there at all |
| ACCESS-02 | On-device unwrap+decrypt produces the same plaintext as what was encrypted at issuance; `/generate-proof` call succeeds with decrypted attrs/salts and produces a proof whose `pubHash` matches the on-chain `merkleRoot` | integration (likely manual/device smoke test, NOT automatable in CI without a physical device or RN test harness) | manual-only — RN crypto correctness on-device is the kind of thing that needs an actual Hermes/JSC runtime, not a Node test runner, to validate `@noble/ciphers` behaves as expected in this environment | ❌ Wave 0 — flag as manual-only with justification: no existing RN unit-test harness was found in `digital-app/` in this research session |

### Sampling Rate

- **Per task commit:** zkp-backend existing test suite (`npm test`) for any admin-backend/zkp-backend change — though Phase 8 should make ZERO changes to zkp-backend's test-covered logic except the `TTL_MS` constant (D-08), which `nonceStore.test.js` likely already exercises (confirm test still passes after the constant change).
- **Per wave merge:** Full zkp-backend suite green; manual device smoke test for the mobile crypto module (unwrap+decrypt) before considering ACCESS-02 done.
- **Phase gate:** Full zkp-backend suite green + at least one successful end-to-end device run (enroll → login → claim → Dashboard → View Credentials decrypt success → Generate Proof success → on-chain `/verify-onchain` success) before `/gsd:verify-work`. This aligns with STATE.md's already-flagged "Phase 07-04 Task 3" + "Verify Proof two-device QR checkpoint" deferred human-verify items — Phase 8 should batch its own device checkpoint with those.

### Wave 0 Gaps

- [ ] Confirm whether `privdId_admin/backend` has ANY existing test infrastructure (Jest config, test directory) — none was surfaced in this research session; if absent, the new `getCredentialBlobs` endpoint will need either a new lightweight test file or explicit planner decision to skip automated testing for this one route (acceptable given the codebase's existing precedent of no admin-backend tests, but should be an explicit decision, not a silent gap).
- [ ] Confirm `@noble/ciphers`'s exact GCM decrypt API signature via Context7 or official docs before writing `digital-app/utils/credentialCrypto.js` — this research's Code Example is marked `[ASSUMED]` (Assumption A1) and needs verification before implementation, not just before merge.
- [ ] Add `@noble/ciphers` as an explicit direct dependency in `digital-app/package.json` (currently only transitive) to avoid relying on hoisting behavior that could break across npm/yarn versions or future dependency updates.
- [ ] A real two-device QR scan-and-decode smoke test for both D-09 hops, sized against an actual generated proof (not synthetic) — confirms Pitfall 4's payload-size concern empirically rather than theoretically.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Partial | This phase does not add new authentication — relies on existing student login (Phase 7, pre-existing, out of scope here). No new auth surface introduced. |
| V3 Session Management | Yes | The zkp-backend nonce session (`sessionId`) is the only session-like construct touched by this phase (via D-08's TTL change) — already implements single-use + time-bound semantics correctly (`nonceStore.js`, verified). |
| V4 Access Control | Yes | New `GET /credential/:rollNo/blobs` endpoint has NO authentication/authorization check in the pattern shown above (mirrors existing `getStudentById`'s equally-unauthenticated pattern) — this is a KNOWN, ALREADY-ACCEPTED gap per `.planning/REQUIREMENTS.md`'s deferred `HARD-01` ("Auth middleware on student CRUD... rate limiting" — deferred to v3+). Flag explicitly: anyone who knows or guesses a valid `rollNo` can fetch that student's `ciphertextCID`+`dekEnvelopeCID` (both CIDs, not plaintext — the DEK envelope is still ECIES-locked to that student's private key, so this is a CID-disclosure risk, not a credential-disclosure risk, but should be called out in the plan as inheriting the project's pre-existing, accepted auth-hardening deferral). |
| V5 Input Validation | Yes | New endpoint must validate `rollNo` param shape (mirror `claimPubkey`'s regex-validation pattern for `pubKeyHex`, or at minimum Joi-validate against the existing `rollNo: Joi.string().trim().min(1).max(50).required()` schema already defined in `studentValidator.js`'s pattern, confirmed via studentController.js grep) before querying MongoDB. |
| V6 Cryptography | Yes | ECIES (`eciesjs`) and AES-256-GCM (`@noble/ciphers` recommended for mobile) — both are established, audited libraries, never hand-rolled, consistent with the project's existing server-side precedent. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthenticated rollNo enumeration against `/credential/:rollNo/blobs` | Information Disclosure | Already an accepted project-wide gap (HARD-01 deferred) — document, do not attempt to fix in this phase (scope creep); the disclosed CIDs are not independently useful to an attacker without the student's private key. |
| Proof replay across sessions | Tampering / Spoofing | Already mitigated by existing nonce single-use enforcement in `nonceStore.js` (`validateAndConsume`'s `used` flag) — no new work needed, just confirm the 15-minute TTL change doesn't weaken anything else. |
| QR payload tampering in transit (visual channel, no TLS) | Tampering | Out of scope for a Groth16 proof — a tampered proof simply fails `/verify-onchain`'s cryptographic check; no additional integrity wrapper is needed around the QR payload itself. |
| DEK/private key exfiltration via logging | Information Disclosure | Mirror `ecies.js`'s/`aesgcm.js`'s existing discipline (never `console.log` the DEK, privKeyHex, or plaintext credential) in the new mobile-side `unwrapDEK`/`decryptCredentialBlob` functions — confirmed both server-side originals already follow this discipline; the mobile port must preserve it. |

## Sources

### Primary (HIGH confidence — direct source code read in this session)
- `zkp-backend/server.js` — full file read, all 5 endpoints (`/generate-proof`, `/session/nonce`, `/verify`, `/verify-onchain`, `/credential-info`) verified line-by-line
- `zkp-backend/lib/witnessBuilder.js` — full file read, exact `buildWitnessInput` contract and field-naming
- `zkp-backend/lib/nonceStore.js` — full file read, exact TTL constant location and validation logic
- `zk-proofs/circuits/identity.circom` — full file read, confirmed Merkle-tree-as-commitment + in-circuit selective disclosure design (not Merkle-path-proof-of-inclusion)
- `privdId_admin/backend/crypto/ecies.js` — full file read, exact `wrapDEK`/`unwrapDEK` signatures
- `privdId_admin/backend/crypto/aesgcm.js` — full file read, exact `encryptCredential`/`decryptCredential` blob shape
- `privdId_admin/backend/models/Student.js` — full file read, exact schema field names
- `privdId_admin/backend/routes/studentRoutes.js` + `controllers/studentController.js` (relevant excerpts) — confirmed existing lookup patterns, `asyncHandler`/`AppError` convention
- `privdId_admin/backend/services/credentialService.js` — full file read, exact `buildCredentialJson` decrypted-JSON shape
- `digital-app/App.js` — full file read, exact navigation stack and legacy screen registrations
- `digital-app/utils/keypair.js` — full file read, exact SecureStore key name and pattern
- `digital-app/screens/ClaimCredentialScreen.js`, `QRScannerScreen.js` — full file reads, visual/interaction pattern confirmation
- `digital-app/environment.js` — full file read, backend URL config pattern
- `zk-proofs/artifacts/contracts/CredentialRegistry.sol/CredentialRegistry.json` — ABI excerpt read, confirmed `getCredentialByHash` exact output shape
- `npm view eciesjs version` / `npm view react-native-qrcode-svg version` — registry verification commands run directly

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` — decision log entries cross-referenced (Phase 07/08 decisions), particularly the "Nonce-Flow Redesign" observation surfaced by the session-memory hook (#314) — full text not pulled via `get_observations`, recommend planner do so

### Tertiary (LOW confidence — flagged for validation)
- `@noble/ciphers` exact GCM API call signature (Assumption A1) — based on training knowledge of the library's general API shape, NOT verified via Context7 or official docs in this research session; Context7 MCP tools were not invoked in this session (CLI fallback `ctx7` was not checked for availability) — this is a genuine gap the planner/Wave-0 should close before implementation, not before merge.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every library is already installed and in production use elsewhere in this exact codebase; no new packages introduced.
- Architecture: HIGH — every endpoint contract, schema field, and module signature was read directly from source, not inferred from documentation or training knowledge.
- Pitfalls: HIGH for Pitfalls 2/3/5 (directly traced from source code field-naming and route-ordering facts); MEDIUM for Pitfall 1 (the RN-crypto-incompatibility claim is well-established general RN knowledge but the specific `@noble/ciphers` recommendation's exact API was not verified against Context7); MEDIUM for Pitfall 4 (QR capacity figures are general QR-spec knowledge, the payload-size measurement is HIGH confidence since it was computed directly in this session).

**Research date:** 2026-06-19
**Valid until:** 30 days (stable internal codebase contracts; the one fast-moving external unknown — `@noble/ciphers` API verification — should be resolved at Wave 0, not by re-running this research)
