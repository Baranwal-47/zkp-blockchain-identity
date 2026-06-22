# Phase 10: Threshold Custody Primitive (E6 split) - Research

**Researched:** 2026-06-22
**Domain:** Shamir Secret Sharing (Node.js) + RSA-OAEP share wrapping + DEK lifecycle refactor
**Confidence:** HIGH

## Summary

Phase 10 replaces the v2.0 single-custody interim gap (`student.dek` stored plaintext, `select:false`) with a real 2-of-3 Shamir split of the DEK at issuance. The split happens in a new `crypto/shamir.js` module; Share A stays plaintext in the existing `Student` Mongo document (admin-readable, matching today's access model), Shares B and C are RSA-2048-OAEP-encrypted to the Registrar's and Dean's public keys before they are ever written to Mongo — so inspecting the admin DB or backend process alone never yields 2 usable shares. This is a pure additive/replacement change to two existing service functions (`studentService.createStudent`, `studentService.claimCredential`) plus one new schema shape and one new small onboarding surface (custodian public-key registration) — no new external infra, no new runtime dependency beyond a single small npm package.

Both leading Node Shamir SSS libraries (`secrets.js-grempe` and `shamirs-secret-sharing`) were installed in a scratch test and round-trip-verified directly against this project's actual 32-byte DEK shape (`crypto.randomBytes(32)` from `crypto/aesgcm.js::generateDEK`): both correctly reconstruct the exact original DEK from any 2 of 3 shares and both fail to produce the original secret from a single share. RSA-2048-OAEP-SHA256 (Node's built-in `crypto`, no new dependency) was also verified end-to-end against a real share-sized payload and comfortably fits the 190-byte OAEP/SHA-256 plaintext ceiling.

**Primary recommendation:** Use `secrets.js-grempe` (hex-string share format, well-documented, by far the highest download count and longest track record of the two) for `crypto/shamir.js`; RSA-OAEP via Node's built-in `crypto.publicEncrypt`/`privateDecrypt` (no new dependency) for wrapping Shares B/C; store all three shares as new fields directly on the existing `Student` Mongo document (no new collection needed) per the user's locked hybrid model; remove `student.dek` entirely and rewire `createStudent`/`claimCredential` so the plaintext DEK only ever lives in a local variable during the issuance/claim request, never persisted.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| DEK generation | API/Backend (`crypto/aesgcm.js`) | — | Already server-side; unchanged this phase |
| Credential AES-GCM encryption | API/Backend (`crypto/aesgcm.js`) | — | Unchanged this phase |
| Shamir split/reconstruct primitive | API/Backend (new `crypto/shamir.js`) | — | Pure crypto utility, no I/O; mirrors `aesgcm.js`/`ecies.js` module shape |
| Share B/C RSA-OAEP wrap | API/Backend (new `crypto/rsaShare.js` or inline in `shamir.js`) | — | Admin backend holds only public keys; wrapping is a public-key op, safe server-side |
| Custodian RSA keypair generation | Browser/Client (officials' own device, WebCrypto) | — | D-10 — must be born client-side or "admin never holds private key" is not cryptographically true |
| Custodian public-key registration | API/Backend (new small endpoint) + Frontend (new onboarding page) | — | Mirrors existing per-role official auth surface (`safeRoutes.js`/`requireAuth`) |
| Share storage | Database/Storage (existing `Student` Mongo doc, new fields) | — | Hybrid model (D-02) — same collection, differentiated by encryption, not by physical store |
| DEK custodial recovery copy | Database/Storage (3 Shamir shares) | — | Replaces `student.dek` as the sole recovery copy (CUST-03) |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `secrets.js-grempe` | 2.0.0 | Shamir Secret Sharing split/combine over a hex-encoded secret | Highest download count of the two candidates (238K/month vs 33K/month at research time); long track record (grempe/secrets.js, originally a JS port of a well-known C/Perl SSS implementation); zero runtime deps; hex-string share format is human-debuggable and trivially serializable into a Mongo `String` field |
| Node built-in `crypto` (RSA-OAEP) | Node 18+ (bundled) | Wraps Shares B and C to the Registrar's/Dean's RSA-2048 public keys | No new dependency — already the project's convention (`crypto/aesgcm.js`, `crypto/ecies.js` both lean on built-ins where possible); `crypto.publicEncrypt`/`privateDecrypt` with `RSA_PKCS1_OAEP_PADDING` is the textbook correct API for this |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `secrets.js-grempe` | `shamirs-secret-sharing` | Also verified round-trip-correct in this session; returns raw `Buffer` shares (vs hex string) and uses a different finite-field/padding scheme (GF(2^8) with 128-bit padding, deps: none, smaller package). Either is a defensible choice — `secrets.js-grempe`'s far larger install base and longer history is the deciding factor, not a functional gap in the alternative. |
| Node `crypto` RSA-OAEP | `node-forge` / `jose` | Unnecessary — Node's built-in `crypto` module already supports RSA-OAEP natively (`publicEncrypt`/`privateDecrypt` with `oaepHash`); pulling in a library here would violate the project's "no new dependency where built-ins suffice" pattern visible in `aesgcm.js` and `ecies.js`'s comments |

**Installation:**
```bash
npm install secrets.js-grempe
```

**Version verification:** Confirmed live against the npm registry during this research session:
```
npm view secrets.js-grempe version   →  2.0.0 (published over a year ago)
npm view shamirs-secret-sharing version →  2.0.1 (published a year ago)
```
A scratch round-trip test was run directly in `privdId_admin/backend` (where `node_modules` already resolves ESM imports) against both libraries using a real `crypto.randomBytes(32)` DEK:
- `secrets.js-grempe`: `secrets.share(dekHex, 3, 2)` → 3 hex-string shares (~99 chars each); `secrets.combine([shareA, shareB])` and `secrets.combine([shareB, shareC])` both reproduced the exact original 32-byte hex; `secrets.combine([shareA])` alone returned garbage (not the original secret, not a throw — **the planner must treat "doesn't throw" as expected behavior and verify by buffer-comparing output, never by catching an exception**).
- `shamirs-secret-sharing`: `sss.split(dekBuffer, {shares:3, threshold:2})` → 3 `Buffer` shares (82 bytes each, includes its own padding/length header); `sss.combine([s0,s1])` and `sss.combine([s1,s2])` both reproduced the exact original DEK byte-for-byte (`Buffer.compare === 0`); `sss.combine([s0])` alone returned a 40-byte buffer that does **not** match the original (also no throw).

No new dependency was left installed in the repo from this research — the scratch `npm install` performed during testing was reverted (`git checkout -- package.json package-lock.json`) before this document was written.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads (30d) | Source Repo | slopcheck | Disposition |
|---------|----------|-----|------------------|--------------|-----------|-------------|
| `secrets.js-grempe` | npm | published >1 yr ago, project itself is ~10+ yrs old (grempe/secrets.js) | 238,261/mo | github.com/grempe/secrets.js | [OK] | Approved |
| `shamirs-secret-sharing` | npm | published ~1 yr ago | 33,496/mo | github.com/jwerle/shamirs-secret-sharing | [OK] | Approved (alternative — not the primary recommendation) |

slopcheck was run with `--ecosystem npm` explicitly (auto-detection defaulted to pypi and incorrectly flagged both as `[SLOP]` "does not exist on pypi" — a textbook cross-ecosystem confusion false-positive; re-running with the correct ecosystem flag returned `[OK]` for both). Neither package declares a `postinstall` script (`npm view <pkg> scripts.postinstall` returned empty for both).

**Packages removed due to slopcheck [SLOP] verdict:** none (the pypi-ecosystem false-positive was a tooling artifact, not a real verdict — re-verified against the correct npm registry).
**Packages flagged as suspicious [SUS]:** none.

## Architecture Patterns

### System Architecture Diagram

```
ISSUANCE FLOW (createStudent, studentService.js)
─────────────────────────────────────────────────
[Admin submits new student form]
        │
        ▼
generateDEK() ──────────────────────► dek (32-byte Buffer, LOCAL VARIABLE ONLY)
        │
        ├──► encryptAndPinCredential(student, dek) ──► AES-GCM encrypt ──► pin ciphertext to IPFS ──► ciphertextCID
        │
        ├──► splitDEK(dek) ──► [shareA, shareB, shareC]  (NEW — crypto/shamir.js)
        │         │
        │         ├─ shareA ────────────────────────────► stored PLAINTEXT on Student doc
        │         ├─ shareB ──► RSA-OAEP encrypt(registrarPublicKey) ──► stored CIPHERTEXT on Student doc
        │         └─ shareC ──► RSA-OAEP encrypt(deanPublicKey)     ──► stored CIPHERTEXT on Student doc
        │
        └──► anchorCredentialOnChain(student, ciphertextCID) ──► Sepolia tx (unchanged, direct issuer EOA)
        │
        ▼
dek goes out of scope / is never written anywhere else — NOT student.dek anymore

CLAIM FLOW (claimCredential, studentService.js) — student submits their on-device pubkey
─────────────────────────────────────────────────────────────────────────────────────────
[Student submits pubKeyHex]
        │
        ▼
?? where does the plaintext DEK come from at claim time, now that step 5 of D-06
   says "delete DEK" happens right after the Shamir split at issuance ??
   ── this is Open Question #1 below — the planner MUST resolve the exact
      step-3-at-issuance vs step-4-at-claim ordering before task-izing this.

CUSTODIAN ONBOARDING (one-time setup, NEW)
───────────────────────────────────────────
[Official's own browser/device]
        │
        ▼
WebCrypto generateKey(RSA-OAEP, 2048) ──► {publicKey, privateKey}
        │
        ├──► privateKey: downloads as .pem to official's own device, NEVER transmitted
        │
        └──► publicKey: POST /api/custodians/register-key (NEW endpoint) ──► stored on backend (Mongo or .pem file)
```

### Recommended Project Structure
```
privdId_admin/backend/
├── crypto/
│   ├── aesgcm.js          # existing — unchanged
│   ├── ecies.js           # existing — unchanged
│   └── shamir.js          # NEW — splitDEK(dek) -> [A,B,C], reconstructDEK([s1,s2]) -> dek
├── services/
│   ├── studentService.js  # MODIFIED — createStudent + claimCredential rewired
│   └── custodianService.js  # NEW (if a registration endpoint is in scope) — wraps shares, stores public keys
├── models/
│   └── Student.js         # MODIFIED — remove `dek`, add shareA/shareB/shareC fields
├── routes/ + controllers/
│   └── custodianRoutes.js / custodianController.js  # NEW (small) — public-key registration endpoint
```

### Pattern 1: Module shape mirrors `aesgcm.js`/`ecies.js`
**What:** `crypto/shamir.js` exports two pure functions, validates input length synchronously before any work, never logs secret material, wraps the operation in `timed()` for the mandated perf instrumentation.
**When to use:** Always, for consistency with the existing two crypto modules in this exact directory.
**Example:**
```javascript
// Source: pattern observed in privdId_admin/backend/crypto/aesgcm.js and ecies.js
import secrets from "secrets.js-grempe";
import { timed } from "../utils/timing.js";

const DEK_LENGTH = 32;
const THRESHOLD = 2;
const TOTAL_SHARES = 3;

export async function splitDEK(dek) {
  if (!Buffer.isBuffer(dek) || dek.length !== DEK_LENGTH) {
    throw new Error(`splitDEK: expected a ${DEK_LENGTH}-byte Buffer dek`);
  }
  const { out } = await timed("splitDEK", async () => {
    const hex = dek.toString("hex");
    return secrets.share(hex, TOTAL_SHARES, THRESHOLD); // [A, B, C] hex strings
  });
  return out;
}

export async function reconstructDEK(shares) {
  if (!Array.isArray(shares) || shares.length < THRESHOLD) {
    throw new Error(`reconstructDEK: need at least ${THRESHOLD} shares`);
  }
  const { out } = await timed("reconstructDEK", async () => {
    const hex = secrets.combine(shares);
    const dek = Buffer.from(hex, "hex");
    if (dek.length !== DEK_LENGTH) {
      throw new Error(`reconstructDEK: reconstructed buffer has unexpected length ${dek.length} (wrong/insufficient shares?)`);
    }
    return dek;
  });
  return out;
}
```

### Pattern 2: RSA-OAEP wrap, verified against real share size
**What:** Wrap a hex-string Shamir share (≈99 chars / 99 bytes UTF-8) to a custodian's RSA-2048 public key.
**When to use:** Once per share, for Shares B and C only, at issuance time.
**Example:**
```javascript
// Source: verified directly in this research session with node:crypto (Node 22)
import crypto from "crypto";

export function wrapShare(publicKeyPem, shareHexString) {
  const buf = Buffer.from(shareHexString, "utf8"); // 99 bytes for secrets.js-grempe shares of a 32-byte secret
  return crypto.publicEncrypt(
    { key: publicKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    buf
  ).toString("base64"); // 344 base64 chars for a 2048-bit key — fits comfortably in a Mongo String field
}
```
**Constraint verified:** RSA-2048-OAEP-SHA256 has a 190-byte plaintext ceiling (`256 - 2*32 - 2`); a 99-byte hex-string share is well within this — no chunking needed regardless of which Shamir library is chosen (worst case, `shamirs-secret-sharing`'s 82-byte raw Buffer share is even smaller).

### Anti-Patterns to Avoid
- **Storing the plaintext DEK "just for safety" alongside the shares:** This is exactly the bug CUST-03 closes. Any code path that writes a recoverable plaintext DEK (to Mongo, to a log, to a file, to an in-memory cache with no immediate wipe) recreates the single-custody gap the phase exists to remove.
- **Catching `secrets.combine()`/`sss.combine()` exceptions as the single-share-fails check:** Verified in this session — neither library throws on a single share; both silently return non-matching garbage. Any verification task or test asserting "single share fails" MUST compare the output against the original DEK, not assert a throw.
- **Treating the custodian RSA keypair as something the backend can generate "on their behalf for convenience":** D-10 is explicit and locked — server-side keygen for custodian keys defeats the entire security claim. The private key must be born in the official's browser via WebCrypto and never POSTed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Shamir Secret Sharing math (GF(256) polynomial interpolation) | A custom finite-field SSS implementation | `secrets.js-grempe` | SSS has subtle correctness/security pitfalls (e.g. using a non-prime-power field, insufficient share randomness, predictable coefficients) that a maintained library with a decade of scrutiny has already solved; hand-rolling this for a security-critical custody primitive is exactly the kind of "deceptively complex" problem this protocol flags |
| RSA-OAEP padding | Manual textbook-RSA encryption (raw modular exponentiation, no padding) | Node's `crypto.publicEncrypt`/`privateDecrypt` with `RSA_PKCS1_OAEP_PADDING` | Unpadded/naively-padded RSA is vulnerable to a long list of known attacks (Bleichenbacher, etc.); Node's built-in OAEP implementation is correct and is the same trust boundary the project already relies on elsewhere |

**Key insight:** Both of this phase's hard cryptographic problems (SSS, OAEP) already have a single correct, free, dependency-light answer that matches the project's existing "built-in or one small audited library" pattern (`eciesjs` for ECIES, Node `crypto` for AES-GCM and now RSA-OAEP). There is no good reason to write either primitive from scratch.

## Runtime State Inventory

> Not applicable — Phase 10 is additive/replacement crypto + schema work on a system with no existing production data per `.planning/REQUIREMENTS.md`'s explicit "Out of Scope: Data migration of existing test students — wipe and re-seed under the new split-at-issuance flow." Confirmed: no migration concern, no existing custodian state, no OS-registered state, no live external service config touched by this phase.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `student.dek` (plaintext, `select:false`) on existing test student records | None — wipe-and-reseed per REQUIREMENTS.md "Out of Scope"; do not attempt to retroactively split existing DEKs |
| Live service config | None — no Mongo Atlas, no external custodian cloud service touched (hybrid model keeps everything in the existing single Mongo instance) | None |
| OS-registered state | None | None |
| Secrets/env vars | New: `registrar_public.pem` / `dean_public.pem` paths (or equivalent env var pointing at them) — these are NEW secrets the planner must add to `.env.example`, not a rename of existing ones | Add new env vars; document in `.env.example` (gitignored real `.pem` files, matching existing `*.pem` gitignore rule already present) |
| Build artifacts | None | None |

## Common Pitfalls

### Pitfall 1: Treating "single share combine doesn't throw" as a bug
**What goes wrong:** A verification task asserts `expect(() => reconstructDEK([shareA])).toThrow()` and the test fails even though the security property holds.
**Why it happens:** Both candidate libraries return a non-matching garbage value from a single share rather than throwing — this is correct SSS behavior (information-theoretic security means a single share is indistinguishable from random), not a library defect.
**How to avoid:** Verification logic and any unit test must assert `Buffer.compare(reconstructed, originalDEK) !== 0` (or hex-string inequality), never assert an exception, for the single-share case.
**Warning signs:** A "single share fails" test written with `.rejects.toThrow()` / `.toThrow()` will be flaky or simply wrong against either library.

### Pitfall 2: DEK lifecycle ordering ambiguity between issuance and claim (D-06 timing note)
**What goes wrong:** CONTEXT.md's own D-06 flags this explicitly: "the planner resolves exact step-3-at-issuance vs at-claim ordering." If the Shamir split happens at issuance (`createStudent`) but the DEK is also needed at claim time (`claimCredential`) to ECIES-wrap it to the student's pubkey, the plaintext DEK must survive between those two events somehow — but D-06 step 5 says "delete DEK" right after step 4. These two requirements are in tension under the current two-phase enrollment model.
**Why it happens:** The two-phase enrollment (admin issues → student claims later, possibly days later) means the DEK is needed at two different times that don't coincide, but the Shamir-split-then-delete lifecycle assumes a single ceremony.
**How to avoid:** The planner has two valid resolutions, both consistent with D-06/D-07's intent ("no per-student 2-of-3 ceremony at enrollment — the wrap uses the transient ceremony DEK, not a reconstruction"):
  - **(a)** Keep the DEK in `student.dek` (or equivalent, but consider renaming away from `dek` to avoid confusion with the field being removed) only between `createStudent` and `claimCredential`, perform BOTH the Shamir split AND defer it, with the split happening as today's `dek` field would — i.e., split happens at issuance, shares are written immediately, but a non-custodial DEK copy still exists transiently until claim, when it's wrapped and then truly deleted. This matches the **existing already-accepted interim gap** (a window where the plaintext DEK exists in Mongo between issuance and claim) but CUST-03's success criterion says "no code path... holds the plaintext DEK... as a substitute for real custody" — so this transient copy must be understood as a *staging* copy, not the *custodial* copy (the shares are custodial); whether a transient plaintext copy during the issuance→claim window violates the spirit of SC#3 is the **single most important open question for this phase** and should be raised to the user/discuss-phase if not already resolved.
  - **(b)** Defer the actual Shamir split to claim time (when the wrap also happens), generating the DEK fresh in `createStudent` is not possible since the encrypted credential pinned to IPFS at issuance must use the SAME DEK that gets split/wrapped later — so the DEK must persist from issuance to claim regardless of where the split happens; this just moves where in that window the split runs, not whether a transient copy exists.

  Given the math above, **some transient plaintext DEK persistence between issuance and claim is structurally unavoidable under the current two-phase enrollment design** — the realistic interpretation of CUST-03 (matching D-06's own framing: "plaintext DEK exists only during the issuance ceremony") is that the **shares + ECIES envelope become the permanent custodial copies**, and the field literally named `student.dek` (the thing SC#3 calls out by name) is what must disappear. The planner should design `createStudent` to split immediately and store only shares; storage of a transient DEK copy for the issuance→claim window (if kept) should use a clearly-labeled distinct field (not reintroducing `dek`) and be wiped at claim time exactly as today's code already does — functionally unchanged risk profile, just no longer mislabeled as the custodial copy.

### Pitfall 3: Forgetting the existing `select: false` convention when removing `dek`
**What goes wrong:** New share fields (`shareA`, `shareB` (encrypted), `shareC` (encrypted)) get added to `Student.js` without considering whether `shareA` (plaintext) should also be `select:false` to limit accidental exposure via `Student.find()`.
**Why it happens:** `sanitizeStudent()` already explicitly excludes `dek` from API responses by allowlisting fields — but that's a second line of defense; `select:false` is the first.
**How to avoid:** Apply `select:false` to `shareA` (plaintext share) at minimum, mirroring today's `dek` field; the RSA-encrypted `shareB`/`shareC` are lower-risk (ciphertext) but `select:false` on all three is the conservative, consistent choice and costs nothing (existing code already explicitly `.select('+dek')`s where needed, e.g. `updateStudent`, `claimCredential`).
**Warning signs:** A `Student.find()` call anywhere in the codebase (e.g. `listStudents()`) suddenly returning share material in bulk responses.

### Pitfall 4: Custodian public key not available at issuance time
**What goes wrong:** `createStudent` tries to RSA-encrypt Share B/C but the Registrar's or Dean's public key hasn't been registered yet (one-time onboarding hasn't happened).
**Why it happens:** This phase introduces a NEW one-time setup dependency (custodian onboarding) that must complete BEFORE the first real issuance under the new flow, but nothing in the existing issuance code path checks for this precondition today.
**How to avoid:** Either (a) load custodian public keys from a fixed, version-controlled-but-gitignored `.pem` file path read at module load / lazily with a clear error if missing (mirroring `credentialService.js`'s pattern of reading `registryArtifact` from a fixed path at module load), or (b) store them in Mongo via the registration endpoint with the issuance path failing loudly (not silently skipping the split) if a key is missing. The Phase 9 precedent (`safeService.js`'s lazy `getApiKit()` to avoid crashing the whole backend on missing config at import time) is directly relevant — apply the same lazy-load-with-clear-error pattern here.
**Warning signs:** Issuance throwing a cryptic OpenSSL error instead of a clear "Registrar public key not configured — run custodian onboarding first" message.

## Code Examples

### Updating Student.js schema (illustrative, not prescriptive on exact field names — Claude's Discretion per CONTEXT.md)
```javascript
// Source: pattern from privdId_admin/backend/models/Student.js, modified per
// CONTEXT.md D-02's concrete shape: { studentId, shareA, shareB: ENC(...), shareC: ENC(...) }
// dek field REMOVED entirely (was: type String, default: null, select: false)
custodyShareA: {
  type: String,
  default: null,
  select: false, // plaintext share — admin-readable but not returned by default queries
},
custodyShareB: {
  type: String, // base64 RSA-OAEP ciphertext, encrypted to Registrar's public key
  default: null,
  select: false,
},
custodyShareC: {
  type: String, // base64 RSA-OAEP ciphertext, encrypted to Dean's public key
  default: null,
  select: false,
},
```

### Verified round-trip test pattern (use as the basis for the Wave 0 unit test)
```javascript
// Verified live in this research session against secrets.js-grempe v2.0.0
import crypto from "crypto";
import { splitDEK, reconstructDEK } from "../crypto/shamir.js";

const dek = crypto.randomBytes(32);
const [shareA, shareB, shareC] = await splitDEK(dek);

const reconAB = await reconstructDEK([shareA, shareB]);
const reconBC = await reconstructDEK([shareB, shareC]);
console.assert(Buffer.compare(reconAB, dek) === 0, "A+B must reconstruct exactly");
console.assert(Buffer.compare(reconBC, dek) === 0, "B+C must reconstruct exactly");

// Single-share must NOT reconstruct — verified by comparison, not by expecting a throw
const single = await reconstructDEK([shareA]).catch(e => null); // length-guard MAY throw depending on impl
if (single) {
  console.assert(Buffer.compare(single, dek) !== 0, "single share must not yield the real DEK");
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `student.dek` plaintext field, `select:false`, single Mongo document is the sole custodial copy | 3 Shamir shares (1 plaintext + 2 RSA-encrypted) on the same document; no plaintext DEK persisted | This phase (v3.0 Phase 10) | Closes the documented v2.0 interim single-custody gap (CUST-03); admin alone can never assemble 2+ usable shares |
| Officials' MetaMask `eth_decrypt`/`eth_getEncryptionPublicKey` (originally proposed for share encryption) | Dedicated RSA-2048 keypairs generated client-side, separate from Ethereum identity | Superseded per CONTEXT.md D-04 — this session confirms `eth_decrypt`/`eth_getEncryptionPublicKey` are indeed deprecated MetaMask APIs (cross-checked against training knowledge; not independently re-verified via live MetaMask docs this session — flag as `[ASSUMED]`, see Assumptions Log) | Cleaner, dependency-free, decouples custody crypto from wallet identity entirely |

**Deprecated/outdated:**
- MetaMask `eth_decrypt`/`eth_getEncryptionPublicKey`: CONTEXT.md asserts these are deprecated. This claim was NOT independently re-verified against live MetaMask documentation in this research session (no WebFetch/WebSearch was run against MetaMask's docs) — it is carried over from the locked CONTEXT.md decision and should be treated as `[ASSUMED]` if it ever needs re-justifying, though it does not block this phase since the decision is already locked and the replacement (RSA-2048) is independently sound.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | MetaMask's `eth_decrypt`/`eth_getEncryptionPublicKey` are deprecated (carried from CONTEXT.md D-04, not independently re-verified live in this session) | State of the Art | Low — this is a locked decision already adopted regardless of current MetaMask API status; RSA-2048 is sound on its own merits even if the deprecation claim is imprecise |
| A2 | `secrets.js-grempe`'s hex-string share encoding has no known cryptographic weakness in its specific GF(256) construction beyond the inherent SSS guarantees | Standard Stack | Low — this is one of the two most widely-used JS SSS implementations; verified functionally correct in this session via direct round-trip test against the project's real 32-byte DEK, but a from-source security audit was not performed |

**Note:** Package legitimacy (slopcheck `[OK]`), version currency (npm registry `npm view`), and functional round-trip correctness (RSA-OAEP + both SSS candidates) were all independently verified live in this session — they are tagged `[VERIFIED]` in spirit, not `[ASSUMED]`, even though the package-name-provenance rule technically requires `[ASSUMED]` for any name sourced from training data/WebSearch rather than Context7/official docs. Per the package-name-provenance rule, both `secrets.js-grempe` and `shamirs-secret-sharing` are formally tagged `[ASSUMED]→verified via slopcheck+registry+functional test` since their names originated from training knowledge (the blueprint itself, §15, also names them) rather than an authoritative doc fetch — the planner should still treat the package choice as settled (verification was thorough) but note this provenance nuance if a `checkpoint:human-verify` gate is desired for extra caution.

## Open Questions

1. **Exact timing of the Shamir split relative to the issuance→claim window (D-06 ordering)**
   - What we know: D-06 lists the canonical 5-step lifecycle (generate → encrypt → split → wrap → delete) and explicitly flags that steps 3 (split) and 4 (wrap) both need "the same live plaintext DEK" but step 4's wrap is gated on the student's pubkey, which doesn't arrive until claim (potentially days after issuance).
   - What's unclear: Whether a transient plaintext DEK persisting in Mongo between issuance and claim (functionally identical to today's `student.dek` window) is considered an acceptable "ceremony" artifact (D-06's framing) or a violation of CUST-03's success criterion #3 ("no code path... holds the plaintext DEK... as a substitute for real custody").
   - Recommendation: Resolve before planning tasks — likely resolution is "split happens at issuance into shares (the permanent custodial copies); a transient DEK copy may still exist in a clearly-relabeled non-`dek` field until claim, exactly as today, since the shares (not that transient field) are now the thing CUST-03 cares about" — but this needs explicit confirmation, ideally via a quick discuss-phase follow-up or the planner making the call and flagging it loudly in the plan.

2. **Where do custodian public keys live operationally for local dev / Hardhat-style testing?**
   - What we know: Phase 9 established a `USE_LOCAL_SIGNERS` dev-mode pattern for Safe signers (3 Hardhat keys standing in for real officials). Phase 10 needs an equivalent dev-mode story — generating throwaway RSA keypairs locally for testing without a live onboarding UI flow.
   - What's unclear: Whether Phase 10 needs a `scripts/generateCustodianKeys.js` dev helper (mirroring `scripts/generateSafeOwners.js` from Phase 9) or whether the custodian-onboarding page itself is exercised manually even in dev.
   - Recommendation: Likely needs a small dev script (`zk-proofs/scripts/` or `privdId_admin/backend/scripts/`) that generates throwaway RSA-2048 keypairs and prints/saves the public PEMs for local `.env`/file placement, separate from the "real" browser-based onboarding flow that ships for production officials — mirrors the Phase 9 local-vs-Sepolia split.

3. **Is the custodian public-key registration endpoint in scope for Phase 10, or deferred?**
   - What we know: CONTEXT.md D-10 explicitly calls out "Setup deps: a one-time custodian-onboarding page + a backend endpoint to register each official's public key — Phase 10 setup work."
   - What's unclear: Whether this onboarding page/endpoint must be built as a small full-stack feature in Phase 10, or whether Phase 10 can ship with public keys provisioned via `.env`/file (matching the env-var-driven pattern already used for `SAFE_OWNER_*` addresses) and the real browser onboarding UI deferred.
   - Recommendation: CONTEXT.md's own wording ("Phase 10 setup work") suggests the endpoint + page ARE in scope; the planner should size this as a small additive task (1 endpoint + 1 simple page), not a major feature, and can reuse Phase 9's per-role login (`requireAuth`, `ACADADMIN_PASSWORD`-style env vars) as the auth gate on who can register a key for which role.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js `crypto` module (RSA-OAEP) | Share wrapping | ✓ | Bundled with Node 22.17.1 (verified live in this session) | — |
| `secrets.js-grempe` (npm) | Shamir split/reconstruct | ✓ (verified installable, not currently in package.json) | 2.0.0 | `shamirs-secret-sharing` 2.0.1 (also verified working) |
| MongoDB | Share storage (existing `Student` collection) | ✓ (already in use by the project) | per existing `MONGO_URI` | — |
| WebCrypto (browser) | Client-side custodian RSA keygen (D-10) | N/A — runs in officials' browsers, not server-testable here | Standard in all modern browsers | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** `secrets.js-grempe` has a verified-working fallback (`shamirs-secret-sharing`) if a future issue surfaces with the primary choice.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected in `privdId_admin/backend` — no `test/`, `tests/`, `*.test.js`, or test script in `package.json` |
| Config file | none — see Wave 0 |
| Quick run command | n/a — no harness exists yet |
| Full suite command | n/a |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|-------------|
| CUST-01 | `splitDEK`/`reconstructDEK` round-trip on a 32-byte DEK; 2-of-3 reconstructs exactly; 1-of-3 fails | unit | `node crypto/shamir.test.js` (manual node invocation, no framework) | ❌ Wave 0 |
| CUST-02 | Issuance writes 3 shares; Share A plaintext-readable, B/C are RSA ciphertext distinguishable from plaintext | unit/integration | manual node script against a test Mongo instance | ❌ Wave 0 |
| CUST-03 | `student.dek` field no longer exists in schema; no code path writes a plaintext DEK to persistent storage | static/manual | `grep -rn "\.dek\b" privdId_admin/backend/` should return zero matches outside removed/migrated code; manual code review | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** manual `node <script>.mjs` smoke test of `crypto/shamir.js` (mirrors how `aesgcm.js`/`ecies.js` were apparently verified — no existing automated harness to extend)
- **Per wave merge:** full manual createStudent/claimCredential flow exercise against local Mongo + local Hardhat (mirrors Phase 7/8's verification pattern, which also had no automated test framework)
- **Phase gate:** Manual device/flow checkpoint, consistent with how Phases 7-9 were verified in this project (see STATE.md's "Pending Todos" / "device checkpoint" pattern)

### Wave 0 Gaps
- [ ] No test framework exists anywhere in `privdId_admin/backend` — this project's established pattern (per STATE.md history) is ad-hoc manual `node script.mjs` verification + human device-checkpoints, NOT an automated test suite. The planner should follow this existing convention rather than introducing Jest/Mocha mid-milestone, unless explicitly directed otherwise.
- [ ] `crypto/shamir.js` itself does not exist yet — must be created (CUST-01's primary deliverable).

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (indirectly) | Custodian public-key registration endpoint should reuse Phase 9's existing per-role login (`requireAuth` + role-specific env-var password) — do not invent a new auth mechanism |
| V3 Session Management | no (new surface) | N/A — reuses existing JWT session middleware (`requireAuth`) if the registration endpoint is built |
| V4 Access Control | yes | Only the relevant official's own role-authenticated session should be able to register/overwrite that official's own public key (Registrar registers Registrar's key, not Dean's) |
| V5 Input Validation | yes | Validate RSA public key PEM format and modulus length (2048) before storage; validate share array length/format before calling `reconstructDEK` |
| V6 Cryptography | yes | Already covered — use Node `crypto` (RSA-OAEP) and `secrets.js-grempe` (SSS); never hand-roll either primitive |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Admin process compromise yields ≥2 shares | Information Disclosure | Hybrid model (D-02/D-05): Shares B/C are RSA-ciphertext on the admin server; the admin process never holds the Registrar's/Dean's private key, so even full admin DB + process compromise yields only Share A + 2 ciphertexts, not 2 usable shares |
| Custodian private key exfiltration via centralized generation | Information Disclosure / Elevation of Privilege | D-10: client-side-only keygen, private key never transmitted; this is the single most important control in this phase's threat model and must not be weakened "for convenience" |
| Replay/overwrite of a custodian's registered public key by an unauthorized party | Tampering | Gate the registration endpoint behind the same per-role auth Phase 9 already built; one role can only register its own key |
| Insufficient RSA key size allowing future brute-force | Tampering / Information Disclosure | RSA-2048 is the locked decision (D-04) and is currently considered secure through at least the 2030s per NIST guidance for this threat model's timeframe; this is a long-lived assumption not independently re-verified against current NIST SP 800-57 in this session — flag as carried-forward `[ASSUMED]` if ever revisited |

## Sources

### Primary (HIGH confidence)
- `docs/CLAUDE_CODE_BLUEPRINT.md` §15, §16.2, "E6. Threshold key recovery" — read directly this session; canonical spec source
- `.planning/phases/10-threshold-custody-primitive-e6-split/10-CONTEXT.md` — read directly this session; canonical locked decisions (D-01 through D-10)
- `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md` — read directly this session
- Live npm registry queries (`npm view secrets.js-grempe version`, `npm view shamirs-secret-sharing version`, `npm view <pkg> scripts.postinstall`) — run this session
- Live `slopcheck install ... --ecosystem npm` — run this session, returned `[OK]` for both candidates
- Direct functional round-trip test of both SSS libraries against a real `crypto.randomBytes(32)` DEK, run in `privdId_admin/backend`'s actual Node/module environment this session
- Direct functional test of Node `crypto` RSA-2048-OAEP-SHA256 against a real share-sized payload, run this session
- Source code read directly this session: `privdId_admin/backend/services/studentService.js`, `crypto/aesgcm.js`, `crypto/ecies.js`, `models/Student.js`, `services/credentialService.js`, `routes/studentRoutes.js`, `routes/safeRoutes.js`, `controllers/safeController.js`, `utils/timing.js`, `.env.example`, `.gitignore`, `package.json`

### Secondary (MEDIUM confidence)
- npm download counts via `api.npmjs.org/downloads/point/last-month/<pkg>` — live query this session (238,261/mo for `secrets.js-grempe` vs 33,496/mo for `shamirs-secret-sharing`)

### Tertiary (LOW confidence)
- MetaMask `eth_decrypt`/`eth_getEncryptionPublicKey` deprecation status — carried from CONTEXT.md D-04, not independently re-verified against live MetaMask docs this session (see Assumptions Log A1)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — both candidate libraries functionally verified end-to-end against the project's real DEK shape in this session, not just trusted from documentation
- Architecture: HIGH — directly derived from locked CONTEXT.md decisions (D-01 through D-10) plus direct reading of the exact files the phase will modify
- Pitfalls: HIGH for the SSS/RSA mechanics (independently verified); MEDIUM for the D-06 timing-ordering pitfall (this is a real ambiguity in the locked context itself, not resolved by research — flagged as Open Question #1, the most important one in this document)

**Research date:** 2026-06-22
**Valid until:** 2026-07-22 (30 days — stable cryptography domain, no fast-moving dependencies)

## RESEARCH COMPLETE
