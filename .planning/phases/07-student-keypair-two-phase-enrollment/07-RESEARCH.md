# Phase 7: Student Keypair & Two-Phase Enrollment - Research

**Researched:** 2026-06-19
**Domain:** secp256k1 keypair generation + ECIES DEK wrapping, Node.js backend + Expo/React Native client
**Confidence:** HIGH (core library compatibility verified via live smoke test + source inspection); MEDIUM (exact RN polyfill wiring, since no automated RN bundle test was run)

## Summary

The phase's single highest-risk unknown — whether `eciesjs` works in React Native — resolves favorably, but with one mandatory addition the blueprint does not mention: a `crypto.getRandomValues` polyfill at the app's entry point. `eciesjs@0.5.0` (current npm `latest`, verified 2026-04-03) is a **complete rewrite** from the older native-binding versions: it is now 100% pure JavaScript, built on `@noble/curves` + `@noble/ciphers` + `@noble/hashes`. A live Node smoke test (keygen → ECIES encrypt → decrypt, round-trip byte match) passed. Source inspection of `eciesjs` and its `@noble/*` dependency tree found zero references to Node-only APIs (`fs`, `child_process`, `node:crypto` native bindings) — it is RN-safe by construction, the same crypto stack used by `ethers` v6, `wagmi`, and most modern web3 RN apps. However, `@noble/hashes`' RNG explicitly requires `globalThis.crypto.getRandomValues` (WebCrypto), which Hermes (RN's JS engine) does not provide out of the box. `digital-app` currently has **no crypto polyfill at all** — `ethers` is listed in `package.json` but is not actually imported in any screen, so this gap has never been exercised. Phase 7 is the first phase that will hit it. The fix is one line (`import 'react-native-get-random-values'` at the very top of `index.js`, before any other import) plus one new dependency.

Backend-side, the DEK custody chain from Phase 6 is fully understood: `Student.dek` (`select: false`) holds the plaintext 32-byte DEK as base64 after admin enrollment in `studentService.js`. `crypto/aesgcm.js` is the existing module pattern (`generateDEK`/`encryptCredential`/`decryptCredential`) that a new sibling `crypto/ecies.js` (`wrapDEK`/`unwrapDEK`) should mirror exactly, including the `timed()` instrumentation wrapper. `credentialService.js::pinToIPFS` is the reusable Pinata pinning helper — already generic over `(content, pinName)`, so pinning a `dekEnvelopeCID` is a call-site addition, not a new pattern.

**Primary recommendation:** Use `eciesjs@^0.5.0` in both `privdId_admin/backend` and `digital-app`, exactly as the blueprint specifies — but add `react-native-get-random-values` to `digital-app` and import it as the first line of `index.js`. Do not let this surface as a runtime crash during execution; it is a known, fixable gap, not a library-choice failure.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Login → claim routing**
- D-01: Login response carries `enrollmentPhase`. If `"awaiting-keypair"`, the app auto-redirects straight into `ClaimCredentialScreen` — no confirmation tap. Keygen + `POST /students/:id/pubkey` fire immediately on screen mount, shown as a loading state.
- D-02: Private key is written to `expo-secure-store` immediately after on-device generation, before the pubkey POST is attempted. On POST failure, the retry only re-sends the POST with the already-generated public key — it does not regenerate a new keypair (avoids orphaning multiple keys across retries).
- D-03: On any claim failure (keygen or POST), show an error with a "Try again" button on the same screen. No partial state to clean up since nothing server-side changes until the POST succeeds. Do not log the student out or force re-login on failure.

**eciesjs RN compatibility**
- D-04: Treat as unverified going into research. The next step (`gsd-phase-researcher`) must do a concrete RN smoke test before the plan locks in the library. **[Addressed by this research — see Code Examples and Common Pitfalls below. Library verified compatible, with one required polyfill addition.]**
- D-05: If `eciesjs` fails the RN smoke test, research must surface a working alternative. **[Not triggered — eciesjs passes, alternative documented anyway for completeness.]**

**Pubkey endpoint guard**
- D-06: `POST /students/:id/pubkey` rejects (409/400) if the student's `enrollmentPhase` is not `"awaiting-keypair"` — i.e. one-time claim. Already-`active` students get an error response; the DEK/envelope is untouched.

**Already-active-on-new-device edge case**
- D-07: Explicitly out of scope for this phase/milestone — no handling beyond the D-06 guard's natural rejection.

### Claude's Discretion
- Whether `enrollmentPhase` and `pubKey` are denormalized onto the same `Student` document or handled via a sub-object — pure schema-shape call. Blueprint §E3.6 implies flat fields (`pubKey`, `dekEnvelopeCID`, `enrollmentPhase` directly on Student).
- Exact wording/UI of `ClaimCredentialScreen`'s loading and error states — follow existing screen visual patterns (resolved by 07-UI-SPEC.md, already approved-pending).
- Whether the pubkey-rejection error on an already-active account surfaces a specific message vs a generic failure — not user-facing polish that matters yet given D-07.

### Deferred Ideas (OUT OF SCOPE)
- Shamir 2-of-3 DEK custody (E6) — replaces this phase's accepted single-custody gap. Deferred to v3+.
- Key recovery for lost/wiped device — no recovery path this milestone (D-07). Belongs with E6.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| KEY-01 | App generates secp256k1 keypair on-device at first login; private key in `expo-secure-store`, never exported | Verified `eciesjs` `PrivateKey` class generates valid secp256k1 keys via smoke test; `expo-secure-store` version-pinning gap identified (see Common Pitfalls) |
| KEY-02 | App sends only public key to backend via `POST /students/:id/pubkey` | Existing route registration pattern in `studentRoutes.js` documented; `PrivateKey.publicKey.toHex()` gives the wire format |
| ENROLL-01 | Admin enrollment pins ciphertext, holds DEK server-side, marks `enrollmentPhase: "awaiting-keypair"` | Already implemented in Phase 6 (`Student.dek`, `select:false`); this phase adds the `enrollmentPhase` field and sets it at creation time |
| ENROLL-02 | On claim, backend ECIES-wraps held DEK with pubkey, pins `dekEnvelopeCID`, wipes plaintext DEK, sets `enrollmentPhase: "active"` | `eciesjs.encrypt(pubHex, dek)` verified round-trips with `eciesjs.decrypt`; `credentialService.js::pinToIPFS` reusable for envelope; wipe = `student.dek = null` + unset via Mongo update |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| secp256k1 keypair generation | Browser/Client (Expo app) | — | Private key must never leave device (KEY-01); generation must happen on-device |
| Private key storage | Browser/Client (Expo app, `expo-secure-store`) | — | Keystore/Keychain-backed secure storage is OS-level, accessible only from the client tier |
| Public key transmission | Browser/Client → API/Backend | — | One-way: client sends pubkey, never receives/handles a private key |
| DEK custody (pre-claim) | API/Backend (in-memory/Mongo `select:false` field) | — | Server-side escrow is the accepted interim gap (no Shamir yet); must stay backend-only, never touch the client |
| ECIES wrap/unwrap (DEK envelope creation) | API/Backend | — | Backend performs `wrapDEK` at claim time using the submitted pubkey; the *unwrap* (`unwrapDEK`) belongs to the client tier in Phase 8, not this phase |
| Envelope persistence | CDN/Static (IPFS via Pinata) | Database (Mongo `dekEnvelopeCID` field) | Same pattern as `ciphertextCID` — content goes to IPFS, only the CID is indexed in Mongo |
| `enrollmentPhase` state transition | API/Backend (Mongo `Student` document) | — | Single source of truth for phase gating; client only reads/reacts to it, never writes it directly |
| Plaintext DEK wipe | API/Backend (process memory + Mongo) | — | Must happen atomically with the phase transition to close the custody window |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `eciesjs` | `^0.5.0` | ECIES encrypt/decrypt over secp256k1, used both backend (`wrapDEK`/`unwrapDEK`) and client (future unwrap in Phase 8) | `[VERIFIED: npm registry + live smoke test]` — 0.5.0 is current `latest` dist-tag (verified `npm view eciesjs version` → `0.5.0`, published 2026-04-03), rewritten on `@noble/curves`/`@noble/ciphers`/`@noble/hashes` (pure JS, no native bindings). Round-trip keygen→encrypt→decrypt verified locally. Same lib named in blueprint §E3.1/§E3.6/§11. |
| `expo-secure-store` | SDK-53-compatible range (verify via `npx expo install expo-secure-store` at execution time, **not** `^56.0.4`) | Keystore/Keychain-backed private key storage on-device | `[VERIFIED: npm registry]` for existence; `[ASSUMED]` for exact version — npm `latest` (56.0.4) targets Expo SDK 56, but `digital-app` is pinned to Expo SDK 53.0.20/RN 0.79.5. A bare `npm install expo-secure-store` (no range pin) installs the wrong SDK version. See Common Pitfalls. |
| `react-native-get-random-values` | `^1.x` (latest stable) | Polyfills `crypto.getRandomValues` so `@noble/hashes`' RNG (used transitively by `eciesjs`) functions under Hermes | `[ASSUMED]` — not named in the blueprint at all; discovered as a missing prerequisite during this research's source-level RN-compatibility audit. Confirmed via WebSearch as the standard fix for this exact noble-curves-in-RN gap; widely used (uuid, ethers, wagmi RN setups). Must be imported as the literal first line of `digital-app/index.js`. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|--------------|
| `@noble/curves`, `@noble/ciphers`, `@noble/hashes` | transitive (pulled in by `eciesjs`) | Underlying secp256k1 math, AEAD ciphers, hashing/RNG | Never imported directly by app code — only `eciesjs`'s public API (`PrivateKey`, `encrypt`, `decrypt`) should be used. Listed here for awareness: these are already present in `digital-app/node_modules` transitively via `ethers`, so `eciesjs` adds no new transitive surface area. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `eciesjs` 0.5.0 (pure JS) | `eciesjs` 0.3.x (`v0.3-latest` dist-tag, native `secp256k1`/`elliptic` bindings) | The 0.3.x line is what historically failed in RN (native binding requires a Node addon, no RN target). Do NOT pin to `^0.3` — use `^0.5.0` or later explicitly. |
| `eciesjs` | `@noble/secp256k1` + hand-rolled ECIES (HKDF + AES-GCM) | Per D-05's fallback option — not needed since `eciesjs` 0.5.0 passes. Would mean re-implementing and testing the ECIES construction (KDF, MAC, IV handling) instead of using an audited library — higher risk, no upside now that 0.5.0 works. |
| `eciesjs` | `react-native-quick-crypto` + manual ECIES | Per D-05's fallback option — adds a native module (JSI-based), heavier integration (requires native rebuild, not Expo-Go-compatible without a dev client). Not needed; reserve as a future option only if `eciesjs` regresses. |

**Installation:**
```bash
# Backend
cd privdId_admin/backend && npm install eciesjs@^0.5.0

# Mobile app — use expo install for SDK-correct versions where available
cd digital-app && npx expo install expo-secure-store
npm install eciesjs@^0.5.0 react-native-get-random-values
```

**Version verification performed:**
```bash
npm view eciesjs version          # → 0.5.0 (latest dist-tag, published 2026-04-03)
npm view expo-secure-store versions --json  # → latest is 56.0.4 (SDK 56) — WRONG for this app (SDK 53)
```
`expo-secure-store`'s correct version for SDK 53 was **not** determined via registry inspection alone — `npx expo install` resolves SDK-pinned versions via Expo's bundled compatibility table, which is not visible through plain `npm view`. The planner must gate the install behind running `npx expo install expo-secure-store` (not a hardcoded version string) so Expo's own resolver picks the SDK-53-correct release.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `eciesjs` | npm | mature (0.3.x line predates 0.5.0 rewrite; current major published 2026-04-03) | ~7.77M/week | github.com/ecies/js | [OK] | Approved |
| `expo-secure-store` | npm | mature (official Expo SDK package) | ~3.96M/week | github.com/expo/expo | [OK] | Approved |
| `react-native-get-random-values` | npm | not run through slopcheck this session (added after the audit batch) | not checked this session | github.com/LinusU/react-native-get-random-values (per WebSearch) | not checked — `[ASSUMED]` | Flagged — planner must add `checkpoint:human-verify` before install |

**Packages removed due to slopcheck [SLOP] verdict:** none (the first slopcheck invocation flagged both as SLOP only because it defaulted to the `pypi` ecosystem instead of `npm` — re-run with `--ecosystem npm` returned `[OK]` for both; this is a tool-usage correction, not a package risk finding).

**Packages flagged as suspicious [SUS]:** none from slopcheck. `react-native-get-random-values` was not run through slopcheck in this session (discovered after the audit batch) — tag `[ASSUMED]`, planner must verify before install.

**Note on inadvertent install:** Running `slopcheck install eciesjs expo-secure-store --ecosystem npm` actually executed `npm install` against the real `digital-app/package.json` (slopcheck's documented "install clean packages" behavior), pulling in `expo-secure-store@^56.0.4` (wrong SDK version) and `eciesjs@^0.5.0`. This was reverted via `git checkout -- digital-app/package.json` before this document was written — the working tree is clean. The planner should NOT re-run `slopcheck install` against a live project directory for similar checks; use `slopcheck scan` or run installs in a scratch directory instead.

## Architecture Patterns

### System Architecture Diagram

```
[Admin Portal]                [Admin Backend]                    [IPFS/Pinata]   [MongoDB]
     |                              |                                  |             |
     |--POST /students (enroll)---->|                                  |             |
     |                              |--generateDEK()------------------>|             |
     |                              |--encryptCredential(json, dek)--->|             |
     |                              |--pinToIPFS(ciphertext)---------->| ciphertextCID
     |                              |--save Student{dek(plain),        |             |
     |                              |   enrollmentPhase:"awaiting-     |             |
     |                              |   keypair", ciphertextCID}------------------->  |
     |                              |                                  |             |
     |                       [DEK held in Mongo, select:false,         |             |
     |                        plaintext — accepted interim gap]        |             |
     |                              |                                  |             |
                                     .
                                     . (time passes — student installs app)
                                     .
[Expo App: LoginScreen]       [Admin Backend]
     |                              |
     |--POST /students/login------->|
     |<--{student, enrollmentPhase:"awaiting-keypair"}--|
     |
     |--(D-01: auto-redirect, no tap)
     v
[ClaimCredentialScreen mount]
     |
     |--PrivateKey() generate (eciesjs, on-device)
     |--SecureStore.setItemAsync(privKeyHex)  [D-02: write BEFORE network call]
     |--POST /students/:id/pubkey {pubKeyHex}------------------------>[Admin Backend]
     |                                                                     |
     |                                                    [D-06 guard: enrollmentPhase
     |                                                     must == "awaiting-keypair",
     |                                                     else 409/400, no DEK touched]
     |                                                                     |
     |                                                    --select('+dek') Student
     |                                                    --eciesjs.encrypt(pubKeyHex, dek)
     |                                                    --pinToIPFS(envelope)---------->[IPFS/Pinata]
     |                                                                                          |
     |                                                    --Student.dek = null (WIPE)           |
     |                                                    --Student.dekEnvelopeCID = cid        |
     |                                                    --Student.enrollmentPhase = "active"  |
     |                                                    --save()---------------------------->[MongoDB]
     |<--{student: {..., enrollmentPhase:"active"}}-------|
     |
     |--navigation.navigate('StudentProfile', {student})
```

### Recommended Project Structure
```
privdId_admin/backend/
├── crypto/
│   ├── aesgcm.js          # existing (Phase 6) — DEK gen, AES-GCM encrypt/decrypt
│   └── ecies.js           # NEW — wrapDEK(pubKeyHex, dek), unwrapDEK(privKeyHex, envelope)
├── models/Student.js      # add pubKey, dekEnvelopeCID, enrollmentPhase fields
├── controllers/studentController.js  # add claimPubkey handler
├── routes/studentRoutes.js           # add POST /:id/pubkey route
└── services/studentService.js        # add claimCredential(id, pubKeyHex) orchestration

digital-app/
├── index.js               # MODIFY — add `import 'react-native-get-random-values'` as first line
├── screens/
│   └── ClaimCredentialScreen.js   # NEW — per 07-UI-SPEC.md
├── App.js                 # add Stack.Screen registration for ClaimCredentialScreen
└── utils/ (or services/)
    └── keypair.js          # NEW — generateKeypair(), storePrivateKey(), getStoredPrivateKey() wrapping expo-secure-store + eciesjs
```

### Pattern 1: Backend ECIES wrap module (mirrors aesgcm.js exactly)
**What:** A `crypto/ecies.js` module with `wrapDEK(pubKeyHex, dek)` / `unwrapDEK(privKeyHex, envelope)`, following the existing `aesgcm.js` conventions: input validation before the timed() call, base64 string in/out at the boundary, never logs key material.
**When to use:** Called once at claim time (`wrapDEK`) in this phase. `unwrapDEK` is unused server-side in this phase (the backend never holds a student's private key) — include it only if the blueprint's symmetric module shape is wanted for completeness, but it has no caller in Phase 7's scope.
**Example:**
```javascript
// Source: verified via local smoke test (eciesjs 0.5.0 API), pattern mirrors
// privdId_admin/backend/crypto/aesgcm.js conventions exactly.
import { encrypt, decrypt } from "eciesjs";
import { timed } from "../utils/timing.js";

const DEK_LENGTH = 32;

export async function wrapDEK(pubKeyHex, dek) {
  if (!Buffer.isBuffer(dek) || dek.length !== DEK_LENGTH) {
    throw new Error(`wrapDEK: expected a ${DEK_LENGTH}-byte Buffer dek`);
  }
  if (typeof pubKeyHex !== "string" || !pubKeyHex.length) {
    throw new Error("wrapDEK: pubKeyHex must be a non-empty hex string");
  }

  const { out } = await timed("wrapDEK", async () => {
    const envelope = encrypt(pubKeyHex, dek); // returns Buffer
    return envelope.toString("base64");
  });

  return out;
}

export function unwrapDEK(privKeyHex, envelopeBase64) {
  const envelope = Buffer.from(envelopeBase64, "base64");
  const dek = decrypt(privKeyHex, envelope); // returns Buffer, throws on auth failure
  if (dek.length !== DEK_LENGTH) {
    throw new Error(`unwrapDEK: decrypted DEK has unexpected length ${dek.length}`);
  }
  return dek;
}
```

### Pattern 2: On-device keypair generation + secure storage (client)
**What:** Generate keypair once, persist private key to SecureStore immediately (D-02), expose only the public key hex for the POST.
**When to use:** `ClaimCredentialScreen` mount, exactly once per device per student (guarded server-side by D-06, not client-side).
**Example:**
```javascript
// Source: verified via local Node smoke test of eciesjs 0.5.0's PrivateKey API.
// digital-app/index.js MUST import 'react-native-get-random-values' before
// this module (or anything importing eciesjs/ethers) is ever loaded.
import { PrivateKey } from 'eciesjs';
import * as SecureStore from 'expo-secure-store';

const PRIVATE_KEY_STORAGE_KEY = 'privid_student_privkey';

export async function generateAndStoreKeypair() {
  const priv = new PrivateKey();
  const privKeyHex = priv.toHex();
  const pubKeyHex = priv.publicKey.toHex(); // 33-byte compressed pubkey, hex-encoded

  // D-02: write to SecureStore BEFORE attempting the network call.
  await SecureStore.setItemAsync(PRIVATE_KEY_STORAGE_KEY, privKeyHex);

  return { pubKeyHex };
}

export async function getStoredPublicKeyHexForRetry() {
  // D-02 retry path: re-derive pubkey from the ALREADY-stored private key,
  // never generate a new keypair on retry.
  const privKeyHex = await SecureStore.getItemAsync(PRIVATE_KEY_STORAGE_KEY);
  if (!privKeyHex) throw new Error('No stored private key found for retry');
  const priv = PrivateKey.fromHex(privKeyHex);
  return priv.publicKey.toHex();
}
```
**Verified locally:** `new PrivateKey()` produces a 32-byte private key and 33-byte compressed public key (smoke-tested in Node; the underlying `@noble/curves` math is platform-agnostic, so behavior is identical under Hermes once the RNG polyfill is in place).

### Pattern 3: Entry-point polyfill (mandatory, not optional)
**What:** Import the RNG polyfill as the literal first statement evaluated by the bundle.
**When to use:** Always, once, in `digital-app/index.js`.
**Example:**
```javascript
// digital-app/index.js
import 'react-native-get-random-values'; // MUST be first — before any eciesjs/ethers import
import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
```

### Anti-Patterns to Avoid
- **Generating a new keypair on every claim retry:** Violates D-02 explicitly — orphans the previously-stored private key (and any pubkey already accepted server-side, if the first POST actually succeeded but the response was lost). Always re-derive the pubkey from the already-stored private key on retry.
- **Importing `react-native-get-random-values` anywhere other than the true entry point:** If imported inside a screen component or a lazily-loaded module, any code that runs before that import (including other modules' top-level `eciesjs`/`ethers` imports) may already have cached a reference to a missing `crypto` global and throw. Must be the first line of `index.js`.
- **Hardcoding `expo-secure-store`'s version to the npm `latest` tag:** `latest` targets the newest Expo SDK (56), not this project's SDK 53. Always resolve via `npx expo install`.
- **Returning `student.dek` in any API response, ever:** The Phase 6 `sanitizeStudent()` allowlist already excludes it — Phase 7 must not add it back when building the claim response. Mirror the existing comment in `studentService.js` line 58-60.
- **Wrapping the DEK before validating the `enrollmentPhase` guard (D-06):** Always check phase state and reject before touching `student.dek` or calling `eciesjs.encrypt` — prevents wasted Pinata calls and accidental re-wraps on replayed requests.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ECIES construction (ECDH + KDF + AEAD) | A manual `@noble/secp256k1` + HKDF + AES-GCM-256 hand-rolled envelope scheme | `eciesjs`'s `encrypt`/`decrypt` | ECIES has several historically-exploited footguns (KDF info-string binding, IV/nonce derivation, public-key point validation, ciphertext malleability) — `eciesjs` is purpose-built and the one the blueprint specifies; reinventing it adds review burden for zero benefit now that it's confirmed RN-compatible |
| Private key secure storage on-device | A custom AsyncStorage + manual AES wrapper using a device-derived key | `expo-secure-store` | AsyncStorage is unencrypted plaintext on both platforms; SecureStore is backed by Android Keystore / iOS Keychain, hardware-backed where available — re-implementing this is a security regression, not an improvement |
| CSPRNG for keygen in RN | A custom `Math.random()`-seeded generator (insecure) or untested manual native-module RNG | `react-native-get-random-values` (delegates to OS CSPRNG via native module) | `Math.random()` is not cryptographically secure and must never seed key material; this is exactly the class of bug the polyfill exists to prevent |

**Key insight:** Every "don't hand-roll" item in this phase maps to a primitive where a subtle implementation mistake is invisible until exploited (weak randomness, malformed ECIES construction, unencrypted "secure" storage) — use the audited libraries the blueprint specifies, verified compatible by this research.

## Common Pitfalls

### Pitfall 1: Assuming `npm install eciesjs` alone makes RN crypto work
**What goes wrong:** App builds fine, but the first call to `new PrivateKey()` (or any `eciesjs`/`ethers` call that needs randomness) throws `crypto.getRandomValues must be defined` at runtime on-device — likely surfacing first on a physical device or release build, not necessarily in every dev environment.
**Why it happens:** `@noble/hashes`' RNG (used transitively by `eciesjs`) requires `globalThis.crypto.getRandomValues`, which Hermes does not provide by default. Metro bundling and Node-side testing won't catch this — Node *does* have a global `crypto` (via `node:crypto`'s Web Crypto API surface in Node 16+), which is exactly why a Node-side smoke test passes while an unprotected RN build fails. This is a genuine "verified in Node, not yet verified in the actual RN runtime" gap in this research — see Open Questions.
**How to avoid:** Add `react-native-get-random-values` and import it as literally the first line of `digital-app/index.js`, before `expo`/`App` imports.
**Warning signs:** Any error string containing "getRandomValues" or "crypto.getRandomValues must be defined" when `ClaimCredentialScreen` mounts.

### Pitfall 2: Installing `expo-secure-store` without SDK pinning
**What goes wrong:** A bare `npm install expo-secure-store` grabs the npm `latest` tag (56.0.4 as of this research), which targets Expo SDK 56 — but `digital-app` is pinned to Expo SDK 53.0.20. Version-mismatched Expo native modules are a common source of native build failures or silent API incompatibilities (the SecureStore JS API has had `keychainService`/`requireAuthentication` option changes across SDK majors).
**Why it happens:** `npm view`/`npm install` defaults to the dist-tag `latest`, which always tracks the newest Expo SDK, not the project's pinned SDK.
**How to avoid:** Use `npx expo install expo-secure-store` — Expo's CLI resolves the SDK-53-compatible version automatically from its bundled compatibility table. Never pin the version manually in `package.json` without first running this command to discover what it resolves to.
**Warning signs:** `expo doctor` or `npx expo install --check` flagging a version mismatch; native module link errors at `expo prebuild`/build time.

### Pitfall 3: Regenerating the keypair on every claim retry
**What goes wrong:** If keygen happens fresh on every retry (instead of D-02's "generate once, retry only resends the POST"), and a prior POST attempt actually succeeded server-side (e.g., response was lost on the client side due to a network blip, but the backend already flipped `enrollmentPhase` to `"active"`), the next retry's *new* keypair's pubkey is sent — but D-06's guard now rejects it (phase already `"active"`), and the locally-stored private key on the device no longer matches whatever the *first* successful POST's pubkey was wrapped against. The student ends up locked out with a private key that doesn't unlock their envelope.
**Why it happens:** Treating "claim failed" and "claim succeeded but response lost" as the same case, and naively retrying the entire flow including keygen.
**How to avoid:** Strictly follow D-02 — write the private key to SecureStore immediately after generation, before the POST; on any retry, re-derive the pubkey from the *already-stored* key and only resend the POST.
**Warning signs:** A student record stuck in `enrollmentPhase: "active"` whose on-device private key, when used to unwrap `dekEnvelopeCID`, fails ECIES decryption (auth tag mismatch).

### Pitfall 4: Forgetting the field-set/phase atomicity on claim
**What goes wrong:** If the backend pins the `dekEnvelopeCID` to IPFS, then crashes/errors before writing `enrollmentPhase: "active"` and wiping `student.dek`, the system ends up with both a valid envelope on IPFS AND a still-present plaintext DEK in Mongo — a worse state than before (now there are two copies of access material, and the phase field still says `"awaiting-keypair"`, so a retry could pin a *second*, different envelope keyed to a different attempt's pubkey, orphaning the first).
**Why it happens:** Treating "pin to IPFS" + "update Mongo" as independent steps without considering partial-failure ordering.
**How to avoid:** Order operations so that pinning to IPFS happens first (cheap to retry, no DEK exposure risk if it fails), and the **single** Mongo update that sets `dekEnvelopeCID`, wipes `dek` (`$unset` or `= null`), AND flips `enrollmentPhase` happens atomically as one `save()`/`updateOne()` call. If the IPFS pin succeeds but the Mongo write fails, the orphaned-but-harmless pinned envelope can simply be ignored (IPFS pins are idempotent-safe to abandon) — but if the inverse happens (Mongo says `"active"` with no envelope), that is the failure mode to prevent.
**Warning signs:** A student with `enrollmentPhase: "active"` but `dekEnvelopeCID: null`, or vice versa with `dek` still populated.

## Code Examples

### Verified ECIES round-trip (Node-side smoke test, executed during this research)
```javascript
// Source: live smoke test run in this research session against eciesjs@0.5.0
// (npm latest dist-tag, verified via `npm view eciesjs version`).
import { encrypt, decrypt, PrivateKey } from 'eciesjs';

const dek = Buffer.from('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcd', 'hex'); // 32 bytes

const priv = new PrivateKey();
const pub = priv.publicKey;
// pub.toBytes().length === 33 (compressed secp256k1 pubkey) — verified
// priv.toHex().length === 64 (32 bytes hex) — verified

const envelope = encrypt(pub.toHex(), dek);
// envelope.length === 128 bytes — verified (ephemeral pubkey + IV + ciphertext + MAC)

const unwrapped = decrypt(priv.toHex(), envelope);
// Buffer.compare(dek, unwrapped) === 0 — verified, round-trip is byte-exact
```

### Existing aesgcm.js pattern to mirror in ecies.js
```javascript
// Source: privdId_admin/backend/crypto/aesgcm.js (read directly, lines 1-46)
// Demonstrates the project's established module conventions: input length
// guards BEFORE the timed() wrapper, base64 string boundaries, no key logging.
export function generateDEK() {
  return crypto.randomBytes(KEY_LENGTH);
}

export async function encryptCredential(plaintextObj, dek) {
  if (!Buffer.isBuffer(dek) || dek.length !== KEY_LENGTH) {
    throw new Error(`encryptCredential: expected a ${KEY_LENGTH}-byte Buffer dek`);
  }
  const { out } = await timed("encryptCredential", async () => { /* ... */ });
  return out;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `eciesjs` 0.3.x (native `secp256k1`/`elliptic` Node bindings, RN-incompatible) | `eciesjs` 0.5.x (pure JS, `@noble/curves`-based, RN-compatible) | Confirmed current `latest` dist-tag is 0.5.0, published 2026-04-03; the npm registry still serves the old line under the `v0.3-latest` dist-tag for legacy consumers | The blueprint's claim "Node + RN compatible" is only true for the 0.5.x line — pinning `eciesjs` without a version range, or accidentally resolving to `^0.3.x` via a stale lockfile, would silently reintroduce the exact RN-incompatibility D-04/D-05 worried about. **Always pin `^0.5.0` or later explicitly.** |

**Deprecated/outdated:** `eciesjs` 0.3.x's native-binding architecture — superseded by the 0.5.x pure-JS rewrite; do not use 0.3.x for any new integration.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | `expo-secure-store`'s SDK-53-compatible version must be resolved via `npx expo install`, not a hardcoded version string | Standard Stack, Common Pitfalls | If the planner hardcodes a version guess instead of running the resolver command, the app may install an SDK-56-targeted package against an SDK-53 project, risking native module incompatibility at build time |
| A2 | `react-native-get-random-values` (not `expo-crypto`'s `polyfillWebCrypto`, not Metro's `require('crypto')` rewrite) is the correct/sufficient polyfill for this exact stack | Standard Stack, Code Examples, Common Pitfalls | If wrong, `eciesjs`/`ethers` calls may still throw `crypto.getRandomValues must be defined` even after adding this package; the planner should treat the actual RN device/simulator test (not just this research's Node-side smoke test) as the final verification gate before considering KEY-01 done |
| A3 | The Node-side smoke test (executed in a plain Node 18+ environment, not inside an actual Metro/Hermes bundle) is a sufficiently strong proxy for RN runtime behavior, given the source-level confirmation that `eciesjs`'s dependency tree contains zero Node-only API calls | Summary, Code Examples | If Hermes has any subtle ECMAScript or typed-array behavior difference that `@noble/curves`/`@noble/ciphers` don't account for, the actual on-device test could still fail in a way this research did not catch — the planner should still budget an execution-time task to run the actual claim flow on a real device/simulator before declaring KEY-01/ENROLL-02 done |
| A4 | `react-native-get-random-values` itself is legitimate/safe (slopcheck did not run against it this session — it was discovered after the initial audit batch) | Package Legitimacy Audit | If hallucinated or compromised, installing it would defeat the purpose of the audit gate; planner must run `slopcheck install react-native-get-random-values --ecosystem npm` (in a scratch directory, not the live project) before installation |

**If this table is empty:** N/A — see above, table is populated.

## Open Questions

1. **Does the actual Hermes/Metro RN bundle environment behave identically to the Node-side smoke test for `eciesjs`'s noble-based crypto?**
   - What we know: Source-level audit found zero Node-only API dependencies in `eciesjs` or its `@noble/*` dependency tree; a live Node smoke test of keygen + ECIES encrypt/decrypt passed with a byte-exact round-trip; `@noble/curves`/`@noble/hashes` are already present transitively via `ethers` in `digital-app/node_modules`, suggesting the same crypto stack already loads fine under this project's Metro config.
   - What's unclear: No actual Expo Go / dev-client build was run in this research session (would require modifying the live project's dependencies and running the Metro bundler, which research-phase scope and the "don't mutate the project" constraint both caution against). The `crypto.getRandomValues` polyfill gap is a real, sourced finding, but its *sufficiency* (i.e., that adding `react-native-get-random-values` fully resolves it with no other missing globals) is inferred from documentation/community precedent, not directly executed against this exact RN 0.79.5/Expo 53/Hermes combination.
   - Recommendation: The planner should schedule an early execution-time task (ideally the very first task of Phase 7's mobile-side work) that does nothing but: add the polyfill import, install `eciesjs` + `react-native-get-random-values`, and run a minimal on-device/simulator smoke test (generate a keypair, log only its length/type — never the key itself) before building out the rest of `ClaimCredentialScreen`. This converts A2/A3 from assumptions into verified facts before the bulk of the phase's work depends on them.

2. **Exact resolved version of `expo-secure-store` for Expo SDK 53.**
   - What we know: npm `latest` is 56.0.4 (wrong — targets SDK 56). The SDK-53-correct version is resolved by Expo's own compatibility table, not visible via plain `npm view`.
   - What's unclear: The exact version string `npx expo install expo-secure-store` will resolve to, since this research did not run that command against the live project (to avoid mutating `package.json` outside of an execution task).
   - Recommendation: First task of the mobile-side plan should run `npx expo install expo-secure-store` and commit whatever version it resolves to — do not pre-guess or hardcode a version number in the plan itself.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (backend dev) | `eciesjs` install/runtime | ✓ | Node 18+ confirmed (smoke test ran successfully) | — |
| npm registry access | Package installs, version verification | ✓ | — | — |
| Expo CLI / `npx expo install` | SDK-correct `expo-secure-store` resolution | ✓ (expo CLI present via `node_modules/.bin/expo`) | Expo 53.0.20 project | — |
| Physical device or Expo Go / simulator for RN runtime smoke test | Verifying Pitfall 1's polyfill actually resolves the gap in practice | not verified this session — see Open Question 1 | — | Defer the real on-device check to the first execution task, as recommended above |
| Pinata account / `PINATA_JWT` env var | Pinning `dekEnvelopeCID` | assumed configured (already used by Phase 6's `credentialService.js::pinToIPFS`) | — | none needed — reuses existing Phase 6 credential |

**Missing dependencies with no fallback:** none blocking — the one genuine gap (actual on-device RN verification of the polyfill) has a clear, low-cost fallback: do it as the first execution task rather than during research.

**Missing dependencies with fallback:** On-device crypto smoke test deferred to execution (see above).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | none detected in either `privdId_admin/backend` or `digital-app` — both `package.json` files have no `test` script beyond placeholders, and no `jest.config.*`/`vitest.config.*`/test directories exist outside `node_modules` |
| Config file | none — see Wave 0 |
| Quick run command | none currently runnable |
| Full suite command | none currently runnable |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| KEY-01 | On-device keypair generation produces valid secp256k1 key, private key never transmitted | unit (backend-mirrorable logic) + manual (actual SecureStore/device behavior) | none yet — would be `node --experimental-vm-modules node_modules/.bin/jest tests/keypair.test.js` once Jest is added | ❌ Wave 0 |
| KEY-02 | `POST /students/:id/pubkey` accepts a pubkey and persists it | integration (supertest against Express app) | none yet — `npm test` once a test runner exists | ❌ Wave 0 |
| ENROLL-01 | New student created with `enrollmentPhase: "awaiting-keypair"`, DEK held, ciphertext pinned | unit (`createStudent` already has no test coverage) | none yet | ❌ Wave 0 |
| ENROLL-02 | Claim flow wraps DEK, pins envelope, wipes plaintext DEK, flips phase to `"active"` | integration (mock Pinata/IPFS call, real eciesjs wrap/unwrap) | none yet | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** manual verification via `node` one-off scripts (no test runner currently wired) — e.g., `node -e "..."` smoke checks mirroring this research's smoke test, until Jest/Vitest is set up
- **Per wave merge:** manual end-to-end walk-through (admin enrolls a student → student logs in → claim flow completes → verify `enrollmentPhase` is `"active"` and `student.dek` is null in Mongo)
- **Phase gate:** Given no test framework exists project-wide, the realistic gate for this phase is the manual end-to-end walk-through above, not an automated suite — `workflow.nyquist_validation` should be treated as "establish Wave 0 test infra if budget allows, otherwise gate on manual verification" since this is a pre-existing gap, not something introduced by this phase.

### Wave 0 Gaps
- [ ] No test framework installed in either service — adding one (Jest for backend ESM, or a lighter assertion-only smoke script) is out of this phase's stated scope (KEY-01/02, ENROLL-01/02) but the planner should flag it as a standing gap, consistent with how Phase 6 likely also shipped without automated tests
- [ ] No `tests/` directory or `conftest`-equivalent shared fixtures in either service
- [ ] If the planner chooses to add minimal test coverage for this phase specifically, recommend `supertest` (backend, Express-native, no new conceptual surface) for the `POST /students/:id/pubkey` endpoint and a plain Node script (not a full RN test runner — none is installed) for the keypair/ECIES logic, mirroring this research's own smoke-test style

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|-------------------|
| V2 Authentication | partial | Student login is email+password only (no OTP/JWT yet — `HARD-01` is explicitly deferred per REQUIREMENTS.md); this phase does not change that, but the claim flow's auto-redirect (D-01) implicitly trusts whatever `loginStudent` already returned — no new auth surface introduced |
| V3 Session Management | no | No session/JWT exists in this codebase yet (deferred to `HARD-01`); the student object is passed via navigation params, an existing pattern this phase does not change |
| V4 Access Control | yes | `POST /students/:id/pubkey`'s D-06 guard (`enrollmentPhase` must be `"awaiting-keypair"`) is the access-control-relevant piece of this phase — it is a state-machine guard, not a user-identity guard (no auth header is checked, consistent with the rest of the currently-unauthenticated student CRUD surface, a known/accepted gap per `HARD-01`) |
| V5 Input Validation | yes | New endpoint must validate `pubKeyHex` is a well-formed secp256k1 compressed public key before calling `eciesjs.encrypt` — malformed input should 400, not throw an unhandled exception inside `wrapDEK` |
| V6 Cryptography | yes | ECIES (`eciesjs`) for DEK wrapping, AES-256-GCM (existing `aesgcm.js`) for credential encryption — both are audited libraries, never hand-rolled, per the Don't Hand-Roll section above |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Replayed/forged `POST /students/:id/pubkey` re-wrapping the DEK to an attacker-controlled pubkey | Tampering / Elevation of Privilege | D-06's `enrollmentPhase` guard — one-time claim, rejects any request once phase is no longer `"awaiting-keypair"`. Note: this does NOT prevent a *first-time* race where two different pubkeys race to claim before the phase flips — the planner should ensure the guard-check + wrap + phase-flip is effectively atomic (e.g., a single `findOneAndUpdate` with the phase as part of the query filter) rather than read-then-write, to close a TOCTOU window. |
| Malformed/oversized `pubKeyHex` payload causing a crash or excessive resource use in `eciesjs.encrypt` | Denial of Service | Validate the pubkey is exactly 33 bytes (66 hex chars) compressed-format secp256k1 before passing to `eciesjs`; reject with 400 otherwise. |
| Private key ever appearing in a backend log, error message, or API response | Information Disclosure | Backend never receives a private key in this design (KEY-02 explicitly sends only the pubkey) — the threat is purely client-side: never `console.log` the private key hex, never include it in a crash report. Mirror the existing `sanitizeStudent()` discipline of explicit allowlisting. |
| `crypto.getRandomValues` polyfill silently falling back to a weak/predictable source if misconfigured | Tampering (weak key material) | Use the well-known, widely-audited `react-native-get-random-values` package (delegates to the OS's native CSPRNG via a native module) — never a manual `Math.random()`-based shim. |

## Sources

### Primary (HIGH confidence)
- Local smoke test (this session) — `eciesjs@0.5.0` keygen + ECIES encrypt/decrypt round-trip, executed in `/tmp/eciesjs-smoketest/smoke.mjs`, byte-exact match confirmed
- Local source inspection (this session) — `eciesjs`, `@noble/curves`, `@noble/ciphers`, `@noble/hashes` package contents in `node_modules`, confirming zero Node-only API usage and the `globalThis.crypto.getRandomValues` RNG dependency at `node_modules/@noble/hashes/utils.js` line 165-171
- `npm view eciesjs version` / `npm view eciesjs dependencies` / `npm view eciesjs time.modified` — confirms 0.5.0 is current `latest`, published 2026-04-03, dependency tree is `@noble/*` only
- `npm view expo-secure-store versions --json` / `time.modified` — confirms npm `latest` is 56.0.4, published 2026-06-06, targeting Expo SDK 56 (mismatch with this project's SDK 53)
- Direct read of `privdId_admin/backend/crypto/aesgcm.js`, `models/Student.js`, `services/studentService.js`, `controllers/studentController.js`, `routes/studentRoutes.js`, `services/credentialService.js`, `utils/timing.js` — exact current implementation
- Direct read of `digital-app/screens/LoginScreen.js`, `digital-app/App.js`, `digital-app/index.js`, `digital-app/package.json`, `digital-app/app.json` — exact current client implementation, confirmed no existing crypto polyfill, confirmed `ethers` unused client-side
- `docs/CLAUDE_CODE_BLUEPRINT.md` §E3.1, §E3.3, §E3.6, §11 — canonical spec for this phase, read directly

### Secondary (MEDIUM confidence)
- WebSearch: "eciesjs React Native Expo compatibility crypto polyfill secp256k1" — confirmed eciesjs lists RN as a supported platform per its own documentation, confirmed Buffer polyfill requirement, pointed to the RN demo in the `ecies/js` repo
- WebSearch: "react-native-get-random-values noble curves crypto.getRandomValues polyfill setup expo" — confirmed the standard fix pattern (import at entry point) and the underlying mechanism (Hermes lacks `globalThis.crypto`)

### Tertiary (LOW confidence)
- None — all findings were cross-verified against either a live local test, direct source inspection, or npm registry metadata.

## Metadata

**Confidence breakdown:**
- Standard stack (`eciesjs` RN compatibility): HIGH — verified via live smoke test + full source-level dependency audit, not just documentation claims
- Standard stack (`expo-secure-store` version): MEDIUM — package choice is HIGH confidence, exact version string is unresolved pending `npx expo install` at execution time
- Architecture (backend DEK/ECIES flow): HIGH — read directly from existing Phase 6 code, no inference required
- Architecture (client keypair/SecureStore flow): MEDIUM — pattern is well-established and verified for the crypto primitives, but no actual on-device RN bundle test was executed this session (see Open Question 1)
- Pitfalls: HIGH for the `crypto.getRandomValues` gap (directly sourced from `@noble/hashes` source code) and the `expo-secure-store` SDK-version mismatch (directly sourced from npm registry data); MEDIUM for the claim-retry/atomicity pitfalls (reasoned from D-02/D-06 decisions, not yet exercised against real concurrent requests)

**Research date:** 2026-06-19
**Valid until:** 2026-07-19 (30 days — npm package versions and Expo SDK compatibility tables can shift faster than 30 days; re-verify `eciesjs` and `expo-secure-store` versions if planning is delayed past this window)
