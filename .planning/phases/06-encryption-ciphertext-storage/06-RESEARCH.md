# Phase 6: Encryption & Ciphertext Storage - Research

**Researched:** 2026-06-19
**Domain:** Node.js native `crypto` AES-256-GCM symmetric encryption; backend service refactor (schema rename + 3 call-site diff)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### DEK custody (until Phase 7 wraps it)
- **D-01:** Add a new plaintext DEK field directly to the `Student` model (e.g. `dek`, base64). This is the accepted single-custody interim gap already documented in PROJECT.md/REQUIREMENTS.md (no real Shamir split until E6).
- **D-02:** This field MUST be excluded from `sanitizeStudent()` (and any other student-serialization path) so it never leaks via the admin API. Treat this as a hard requirement for the planner/executor, not optional cleanup.
- **D-03:** Phase 7 will read this field, ECIES-wrap it to the student's pubkey, then wipe it (set to null) — Phase 6 only needs to write it, not clear it.

#### Re-issuance / update DEK policy
- **D-04:** `updateStudent()` re-encrypts the credential JSON with the student's EXISTING DEK (reuse, not rotate). Only the ciphertext changes on update; the DEK itself is stable across the student's lifetime (until erasure in Phase 9).
- **D-05:** Rationale: once Phase 7/8 ship, a student may have already claimed an ECIES envelope wrapping this DEK. Rotating the DEK on every profile edit would silently invalidate that envelope with no re-claim flow anywhere in the roadmap. Reuse avoids ever needing one.
- **D-06:** `createStudent()` and `insertBulkStudents()` (first issuance) generate a fresh DEK — reuse only applies to `updateStudent()`'s re-issuance path, since at first issuance no DEK exists yet.

#### Schema field rename: ipfsCID → ciphertextCID
- **D-07:** Rename the field outright everywhere — do not add `ciphertextCID` alongside the old `ipfsCID`. No migration path exists anyway (wipe-and-reseed is already the locked v2.0 approach), so there's no legacy data to preserve under the old name.
- **D-08:** Touches 4 files confirmed by grep: `privdId_admin/backend/models/Student.js`, `privdId_admin/backend/services/studentService.js`, `zkp-backend/server.js`, `digital-app/screens/VerifyProof.js`. The Phase 6 plan must include updating all 4, not just the admin backend.

### Claude's Discretion
- Exact shape/naming of the new crypto module (`crypto/aesgcm.js` per blueprint §E3.6) — function signatures, internal helpers.
- Whether to wrap the new `encryptCredential` call in the existing `timed()` helper (CLAUDE.md ground rule 5 mandates benchmarking new crypto ops — this should just be done, not re-litigated).
- Pinata pin naming convention for the ciphertext blob (existing pattern: `privid-credential-${rollNo}` — extend analogously, e.g. `privid-ciphertext-${rollNo}`).
- Whether to centralize the duplicated attrs-array-building logic (`createStudent`/`updateStudent` both build the same 7-element array inline) into a shared helper — pure code-quality call, not a product decision.

### Deferred Ideas (OUT OF SCOPE)
- **eciesjs Node+RN compatibility verification** — the blueprint asserts `eciesjs` is "Node + RN compatible" (§E3.1). This needs a verification spike, but belongs in Phase 7's research/discuss step (where the on-device keypair + RN side of ECIES actually gets exercised), not Phase 6, which is pure backend Node and never touches React Native. Flagged here so it isn't lost — raise it again when running `/gsd:discuss-phase 7`.
- No particular UI/UX references for this phase — it's backend-only, no user-facing surface changes.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-------------------|
| STORE-01 | Admin backend generates a random 32-byte DEK per student, AES-256-GCM encrypts the credential JSON (7 attrs + 7 salts + merkleRoot + metadata, §E3.2 shape), and pins the ciphertext to IPFS as `ciphertextCID` | `crypto/aesgcm.js` pattern (Architecture Patterns → Pattern 1) gives the exact verified `encryptCredential`/`generateDEK` implementation; Pattern 2 gives the generate-vs-reuse policy per call site; `buildCredentialJson()` example gives the exact §E3.2 JSON shape matching the frozen leaf order |
| STORE-02 | No plaintext credential blob is ever pinned to IPFS post-encryption — only ciphertext and the DEK envelope are pinned | Architecture Diagram shows the encrypt step interposed between JSON-building and `pinToIPFS()`; Common Pitfall 4 (encoding shape) and Security Domain → "Plaintext credential PII exposure" row both target verifying zero remaining plaintext-pin code paths |

</phase_requirements>

## Summary

This phase is a well-scoped backend-only refactor with no new external dependencies. Node.js's built-in `crypto` module (available natively since Node 10, confirmed working on the installed Node v22.17.1) provides everything needed for AES-256-GCM: `crypto.randomBytes(32)` for the DEK, `crypto.randomBytes(12)` for the IV, `createCipheriv`/`createDecipheriv` with `'aes-256-gcm'`, and `cipher.getAuthTag()`/`decipher.setAuthTag()` for the 16-byte authentication tag. A live round-trip was executed in this research session against the actual installed Node runtime and confirmed correct: 12-byte IV, 16-byte auth tag, successful encrypt→decrypt round trip.

The diff surface is precisely three call sites in `studentService.js` (`createStudent`, `insertBulkStudents`, `updateStudent`) plus one function in `credentialService.js` (`issueCredentialOnChain`), one schema file (`Student.js`), and two read-only references outside the admin backend (`zkp-backend/server.js`, `digital-app/screens/VerifyProof.js`) that only need the field renamed, not logic changed. There is no existing automated test coverage that asserts on `ipfsCID` or the plaintext credential JSON shape — the only backend test file (`identityCommitment.test.mjs`) tests Poseidon/Merkle math exclusively and is unaffected by this phase.

**Primary recommendation:** Build a new `crypto/aesgcm.js` module exporting `encryptCredential(plaintextObj, dek)` / `decryptCredential(blob, dek)` using Node's native `crypto` (no new npm dependency), wire it into `issueCredentialOnChain()` to replace the current plaintext-pin behavior, generate/reuse the DEK per the CONTEXT.md D-04/D-06 policy in `studentService.js` at each of the 3 call sites, and rename `ipfsCID`→`ciphertextCID` everywhere in one atomic pass across all 4 confirmed files.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| DEK generation (32 random bytes) | API / Backend (admin) | — | Must happen server-side at issuance time; no client exists yet (pre-Phase 7 keypair) |
| AES-256-GCM encrypt/decrypt | API / Backend (admin) | — | New `crypto/aesgcm.js` module lives in `privdId_admin/backend/` per blueprint §E3.6 |
| DEK persistence (interim, plaintext) | Database / Storage | — | New `Student.dek` field on the existing MongoDB document; single-custody gap accepted per D-01 |
| Ciphertext pinning | API / Backend (admin) → CDN/Static (IPFS via Pinata) | — | `pinToIPFS()` already exists; reused verbatim for the ciphertext blob object |
| Field sanitization (`dek` exclusion) | API / Backend (admin) | — | `sanitizeStudent()` is the single chokepoint for all API responses; confirmed no other leak path exists (no Mongoose `toJSON`/`toObject` transform on `Student` schema) |
| CID field rename consumption (read) | API / Backend (zkp-backend), Browser/Client (digital-app) | — | Both are read-only consumers of the on-chain/registry CID value; rename is mechanical, no logic change |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js `crypto` (built-in) | Node 22.17.1 (installed) | AES-256-GCM encrypt/decrypt, CSPRNG for DEK/IV | Native module, zero supply-chain risk, audited OpenSSL bindings underneath — the correct choice for authenticated symmetric encryption in Node; no third-party AES library is standard practice when the built-in suffices |

**No new npm package is required for this phase.** AES-256-GCM via `node:crypto` is sufficient; `eciesjs` (for DEK wrapping) is explicitly out of scope for Phase 6 per CONTEXT.md's `<deferred>` section — it belongs to Phase 7.

### Supporting
None — this phase touches only files already inside `privdId_admin/backend/`, `zkp-backend/`, and `digital-app/`, using only built-ins and already-installed dependencies (`axios`, `mongoose`).

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Node native `crypto` | `node-forge`, `crypto-js` | Both are userland JS reimplementations with historically weaker constant-time guarantees and larger attack surface; no reason to add a dependency when the native binding (OpenSSL-backed) is already present and verified working on the target runtime |
| AES-256-GCM | AES-256-CBC + HMAC | GCM provides authenticated encryption in one pass (confidentiality + integrity); CBC+HMAC (Encrypt-then-MAC) is more error-prone to implement correctly and not what the blueprint specifies (§E3.1 explicitly mandates GCM) |

**Installation:**
```bash
# No installation needed — node:crypto is a Node.js built-in module.
```

**Version verification:** N/A (built-in module, not a registry package). Verified live against the project's installed Node v22.17.1 via direct script execution in this research session (see Code Examples below for the exact verified snippet).

## Package Legitimacy Audit

**Not applicable to this phase.** No new external packages are installed. AES-256-GCM is implemented entirely with Node's built-in `crypto` module. The Package Legitimacy Gate is skipped because there is nothing to audit.

**Packages removed due to slopcheck [SLOP] verdict:** none (no packages evaluated)
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
Admin enters/edits student data (frontend/Excel)
        │
        ▼
studentService.js: createStudent() / buildBulkStudents()+insertBulkStudents() / updateStudent()
        │  (builds 7-attr Merkle commitment via identityCommitment.js — UNCHANGED)
        │
        ├─[D-06: first issuance]──> generate DEK = crypto.randomBytes(32)
        ├─[D-04: re-issuance]─────> reuse existing student.dek
        │
        ▼
credentialService.js: issueCredentialOnChain(student, dek)
        │
        ├─> build §E3.2 JSON { name, rollNo, dobInt, programmeLevel,
        │     discipline, batch, email, salts[7], merkleRoot,
        │     issuedAt, issuer, type, version }
        │
        ▼
crypto/aesgcm.js: encryptCredential(json, dek)
        │   iv = randomBytes(12)
        │   cipher = createCipheriv('aes-256-gcm', dek, iv)
        │   ciphertext = cipher.update(JSON.stringify(json)) + cipher.final()
        │   authTag = cipher.getAuthTag()
        │   → { iv: base64, authTag: base64, ciphertext: base64 }
        │
        ▼
credentialService.js: pinToIPFS(encryptedBlob)   [REUSED, unchanged internals]
        │   → Pinata pinJSONToIPFS  →  ciphertextCID
        │
        ▼
credentialService.js: anchorOnChain(rollNo, ciphertextCID, merkleRoot)  [UNCHANGED]
        │   → Sepolia tx: issueCredential(rollNo, cid, pubHashBytes32)
        │
        ▼
studentService.js persists: student.ciphertextCID = cid; student.dek = dek (first issuance only);
                              student.onChainTxHash, student.onChainBlock
        │
        ▼
sanitizeStudent() — strips `dek` and `password` before any res.json() [D-02 enforcement point]
        │
        ▼
Admin API response (no plaintext credential, no DEK, ever)
```

Downstream (out of scope for Phase 6, shown for context only): `zkp-backend/server.js` and `digital-app/screens/VerifyProof.js` read `ciphertextCID` (renamed) off the on-chain registry for display/verification — no encryption logic on that path until Phase 8 (ACCESS-01/02).

### Recommended Project Structure
```
privdId_admin/backend/
├── crypto/
│   └── aesgcm.js          # NEW — encryptCredential(), decryptCredential()
├── services/
│   ├── credentialService.js   # MODIFIED — issueCredentialOnChain() builds §E3.2 JSON + encrypts
│   └── studentService.js      # MODIFIED — 3 call sites: DEK gen/reuse, ciphertextCID rename, sanitizeStudent dek exclusion
├── models/
│   └── Student.js             # MODIFIED — add `dek` field, rename ipfsCID → ciphertextCID
└── utils/
    ├── identityCommitment.js  # UNCHANGED — reused for attrs/salts/merkleRoot (already correct)
    └── timing.js               # UNCHANGED — reused: wrap encryptCredential in timed()
```

### Pattern 1: AES-256-GCM encrypt/decrypt module (blueprint §E3.1/§E3.6 shape)
**What:** A small, self-contained module with two pure functions: one to encrypt a JSON-serializable object under a 32-byte key, one to reverse it. No state, no I/O.
**When to use:** Any time a credential JSON must be encrypted before leaving the backend process boundary (IPFS pin).
**Example:**
```javascript
// Source: Node.js crypto docs (https://nodejs.org/api/crypto.html#class-cipher) +
// live verification against installed Node v22.17.1 in this research session.
// crypto/aesgcm.js
import crypto from "crypto";
import { timed } from "../utils/timing.js";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;   // GCM-recommended IV size — NOT 16; using 16 here is a common mistake
const KEY_LENGTH = 32;  // AES-256 key size

export function generateDEK() {
  return crypto.randomBytes(KEY_LENGTH); // Buffer, 32 bytes
}

export async function encryptCredential(plaintextObj, dek) {
  const { out } = await timed("encryptCredential", async () => {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGO, dek, iv);
    const plaintext = Buffer.from(JSON.stringify(plaintextObj), "utf8");
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag(); // MUST be called after cipher.final()

    return {
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    };
  });
  return out;
}

export function decryptCredential(blob, dek) {
  const iv = Buffer.from(blob.iv, "base64");
  const authTag = Buffer.from(blob.authTag, "base64");
  const ciphertext = Buffer.from(blob.ciphertext, "base64");

  const decipher = crypto.createDecipheriv(ALGO, dek, iv);
  decipher.setAuthTag(authTag); // MUST be called before decipher.final()
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8"));
}
```
**Verified live in this research session** (Node v22.17.1): encrypt→decrypt round trip succeeds; `iv.length === 12`, `authTag.length === 16` confirmed by direct execution.

### Pattern 2: DEK generate-or-reuse per call site (D-04/D-06)
**What:** First issuance generates a fresh DEK; re-issuance (`updateStudent`) reuses the DEK already on the student document.
**When to use:** Exactly the 3 call sites named in CONTEXT.md.
**Example:**
```javascript
// createStudent() / insertBulkStudents() — first issuance, fresh DEK
import { generateDEK, encryptCredential } from "../crypto/aesgcm.js";

const dek = generateDEK();
const credentialJson = buildCredentialJson(record); // §E3.2 shape
const encryptedBlob = await encryptCredential(credentialJson, dek);
// ... pin encryptedBlob, then persist:
student.dek = dek.toString("base64");
student.ciphertextCID = cid;

// updateStudent() — re-issuance, REUSE existing DEK (D-04)
const dek = Buffer.from(student.dek, "base64"); // do NOT generate a new one
const credentialJson = buildCredentialJson(student);
const encryptedBlob = await encryptCredential(credentialJson, dek);
```

### Anti-Patterns to Avoid
- **Reusing an IV across encryptions with the same key:** Catastrophic for GCM — reusing (key, IV) pairs leaks the XOR of plaintexts and breaks authentication entirely. Always generate a fresh `crypto.randomBytes(12)` IV per `encryptCredential()` call (this is naturally satisfied as long as IV generation lives inside the function, not hoisted/cached).
- **Calling `getAuthTag()` before `cipher.final()`:** Node throws/returns garbage if you read the auth tag before finalizing the cipher stream. Always call `cipher.final()` first, then `getAuthTag()`.
- **Calling `setAuthTag()` after `decipher.final()` (or never):** Must call `decipher.setAuthTag(tag)` before consuming output via `final()`, or tampering goes undetected.
- **Using a 16-byte IV for GCM:** AES-GCM is defined for a 96-bit (12-byte) IV in the standard/recommended case; Node's `createCipheriv` accepts other lengths but 12 bytes is the interoperable, NIST-recommended choice and matches the blueprint's explicit `iv (12B)` spec. Do not default to 16 bytes (that's the GCM tag/block size, easily confused).
- **Storing the DEK in a Mongoose field without auditing every serialization path:** Confirmed in this research that `sanitizeStudent()` is the *only* function that shapes API responses (`studentController.js` has zero other `res.json()` calls returning raw documents, and `Student.js` has no `toJSON`/`toObject` schema transform). This means D-02 is satisfiable by adding `dek` exclusion in exactly one place — but if a future code path adds a new response shape, it must also be checked against this same property.
- **Logging the DEK or plaintext credential JSON:** The existing logging pattern (`console.log('[credential] Anchored ...')`, `console.error('[credential] ... failed ...')`) only logs `rollNo`, `cid`, `txHash`, and `err.message` — never the credential object or key material. Preserve this discipline; do not add a debug log that prints `dek`, `credentialJson`, or the `encryptedBlob` in full (CID and timing are fine to log).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| AES-GCM encryption primitives | A custom AES/GCM implementation in JS | `node:crypto` `createCipheriv('aes-256-gcm', ...)` | OpenSSL-backed, constant-time, audited; hand-rolling block cipher modes is a classic source of timing/padding side-channel and IV-reuse bugs |
| Random key/IV generation | `Math.random()`-based byte generation | `crypto.randomBytes(n)` | `Math.random()` is not cryptographically secure (predictable PRNG state); `crypto.randomBytes` uses the OS CSPRNG |
| Base64 encode/decode | Custom encoder | `Buffer.from(...).toString('base64')` / `Buffer.from(str, 'base64')` | Built-in, correct, zero dependency |

**Key insight:** Every primitive this phase needs (CSPRNG, AES-GCM, base64) already exists correctly in Node's standard library. The only design work is *composition* (what JSON shape gets encrypted, in what order, with what key lifecycle) — not cryptographic implementation. Resist any temptation to add a crypto-adjacent npm package for this phase; it would add supply-chain risk for zero capability gain.

## Common Pitfalls

### Pitfall 1: Field-set drift between the 3 call sites
**What goes wrong:** `createStudent`, `insertBulkStudents`, and `updateStudent` each independently build the attrs/salts array and credential object. The project has already been bitten by this exact failure mode once (see `identityCommitment.js` header comment: "having one module eliminates field-set drift" and STATE.md's "FIELD-SET CONSISTENCY (carried from v1.0)" blocker).
**Why it happens:** Three call sites, no shared builder for the §E3.2 JSON object (unlike the Merkle commitment, which already has a shared `identityCommitment.js`).
**How to avoid:** Build one shared helper (e.g., `buildCredentialJson(student)` in `credentialService.js` or a new util) that all 3 call sites pass to `encryptCredential`. CONTEXT.md flags this exact concern in its Claude's Discretion section ("Whether to centralize the duplicated attrs-array-building logic"). Strongly recommend centralizing for this phase specifically because the credential JSON has even more fields (name, dobInt, programmeLevel, discipline, batch, email, salts) than the existing attrs array, multiplying the drift surface.
**Warning signs:** Any PR that touches the credential JSON shape in only one of the three call sites' code blocks.

### Pitfall 2: Forgetting to update `sanitizeStudent()` when adding the `dek` field
**What goes wrong:** A new Mongoose field is automatically included by default in any manual response object that does `student.toObject()` or spreads `student._doc`. `sanitizeStudent()` is currently an explicit allowlist (manually lists each field), which is actually the SAFEST pattern here — it means `dek` is excluded by default unless someone explicitly adds it. The risk is the opposite: someone adds a *new* response path later that doesn't go through `sanitizeStudent()`.
**Why it happens:** Express handlers are easy to write as `res.json(student)` directly when prototyping, bypassing the sanitizer.
**How to avoid:** Confirmed in this research that all current `res.json()` calls in `studentController.js` go through `sanitizeStudent()` or the `listStudents()`/`updateStudent()`/`revokeStudent()` service functions (which themselves call `sanitizeStudent()`). No fix needed for existing code — just don't regress this property when adding the `dek` field.
**Warning signs:** Any new controller function that calls `res.json()` with a raw `student` Mongoose document instead of `sanitizeStudent(student)`.

### Pitfall 3: Reusing the DEK incorrectly (rotating when reuse is required, or vice versa)
**What goes wrong:** D-04 mandates `updateStudent()` reuses the *existing* DEK; D-06 mandates `createStudent()`/`insertBulkStudents()` generate a *fresh* DEK. Swapping this (e.g., rotating on every update) silently breaks future ECIES envelopes from Phase 7 with no detection until a student tries to decrypt and fails.
**Why it happens:** It is the "obvious"-looking choice to regenerate a fresh DEK on every credential re-issuance (mirroring how the Merkle salts ARE regenerated on every update) — but DEK lifecycle is intentionally different from salt lifecycle per D-05's stated rationale.
**How to avoid:** Make the DEK-reuse path structurally explicit: `updateStudent()` should read `student.dek` and throw/log loudly if it's missing/null rather than silently generating a new one as a fallback. This makes the "no DEK exists yet" precondition impossible to silently violate.
**Warning signs:** A test or manual check where re-issuing a credential changes `student.dek`'s value — this should never happen after first issuance.

### Pitfall 4: IV/authTag/ciphertext encoding mismatch with what blueprint §E3.1 specifies
**What goes wrong:** Blueprint says `{ iv (12B), authTag (16B), ciphertext }`, base64-encoded. If the implementation accidentally concatenates IV+authTag+ciphertext into one base64 blob instead of three separate base64 fields, Phase 8's decrypt logic (which reads this exact shape) will fail to parse it.
**Why it happens:** Some AES-GCM tutorials concatenate IV+tag+ciphertext into a single buffer for storage efficiency — this is a valid alternative pattern, but NOT what this project's blueprint specifies.
**How to avoid:** Use the exact `{ iv, authTag, ciphertext }` three-key object shape (each base64 string) as the canonical encrypted blob — confirmed by the blueprint excerpt and consistent with how `pinToIPFS()` already pins arbitrary JSON objects (no change needed there).

## Code Examples

### AES-256-GCM round trip (verified working against installed Node v22.17.1)
```javascript
// Source: live execution in this research session via `node -e`, validated against
// Node.js official crypto docs (https://nodejs.org/api/crypto.html)
const crypto = require('crypto');
const key = crypto.randomBytes(32);     // DEK
const iv = crypto.randomBytes(12);       // GCM IV — 12 bytes confirmed correct

const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
const ciphertext = Buffer.concat([
  cipher.update(JSON.stringify({ hello: 'world' }), 'utf8'),
  cipher.final(),
]);
const authTag = cipher.getAuthTag();    // 16 bytes confirmed correct

const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
decipher.setAuthTag(authTag);
const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
// plaintext.toString('utf8') === '{"hello":"world"}'  — VERIFIED in this session
```
**Verified output from this session:** `iv len: 12 authTag len: 16 ciphertext len: 17`, `decrypted: {"hello":"world"}`.

### §E3.2 credential JSON builder (the object to encrypt)
```javascript
// Source: docs/CLAUDE_CODE_BLUEPRINT.md §E3.2 (lines 245-257), cross-referenced against
// identityCommitment.js frozen leaf order and the existing attrs/salts already on Student.
function buildCredentialJson(student) {
  return {
    name: student.name,
    rollNo: student.rollNo,
    dobInt: student.dobInt,
    programmeLevel: student.programmeLevel,
    discipline: student.discipline,
    batch: student.batch,
    email: student.email,
    salts: student.salts,           // array of 7, frozen leaf order — already on Student doc
    merkleRoot: student.merkleRoot, // already on Student doc
    issuedAt: new Date().toISOString(),
    issuer: 'PrivdID — IIITDM Jabalpur',
    type: 'StudentIdentityCredential',
    version: '2.0',
  };
}
```
Note: this exactly preserves the frozen 7-attribute leaf order from `identityCommitment.js` (`name, rollNo, dobInt, programmeLevel, discipline, batch, email`), matching CONTEXT.md's explicit ordering requirement.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `issueCredentialOnChain()` pins a small plaintext object `{rollNo, email, merkleRoot, issuedAt, issuer, type, version}` directly to IPFS | Pins an AES-256-GCM encrypted blob `{iv, authTag, ciphertext}` wrapping the full §E3.2 JSON (adds name, dobInt, programmeLevel, discipline, batch, salts) | This phase (Phase 6) | IPFS content is now opaque ciphertext; anyone with the CID alone (the entire point of public IPFS) can no longer read student PII. Requires DEK to decrypt — DEK custody is Phase 6/7's actual product change. |
| `Student.ipfsCID` field name | `Student.ciphertextCID` field name | This phase (Phase 6) | Purely a rename — same semantics (Pinata CID), but the new name disambiguates from the future `dekEnvelopeCID` field (Phase 7) |

**Deprecated/outdated:**
- Plaintext credential pinning: eliminated entirely per STORE-02 — there must be zero code path remaining that pins an unencrypted credential JSON to IPFS after this phase ships.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Node's native `crypto` module (no third-party package) is sufficient and is the standard/expected approach for AES-256-GCM in this codebase's ecosystem | Standard Stack | Low — verified live against the actual installed Node v22.17.1 runtime in this session; this is official Node.js API behavior, not training-data speculation |

**Note:** This table is nearly empty because the core crypto claims were verified by direct code execution against the project's actual Node runtime in this research session (not training-data recall), and all file/schema/call-site claims were verified by reading the actual source files rather than assumed from the CONTEXT.md description. The one row above is included for completeness/transparency, not because there is meaningful doubt.

## Open Questions

1. **Should the DEK be stored as base64 string or Buffer/Mongoose `Buffer` type on the `Student` schema?**
   - What we know: CONTEXT.md D-01 says "Add a new plaintext DEK field... (e.g. `dek`, base64)" — base64 string is the stated preference.
   - What's unclear: Whether Mongoose's `Buffer` SchemaType (native binary storage) might be preferable for a 32-byte value to avoid base64 encode/decode overhead on every read.
   - Recommendation: Follow CONTEXT.md's explicit base64-string guidance (`type: String`) for consistency with how `salts` (also semantically binary-ish field elements) are already stored as strings on this schema, and because Phase 7 will read+ECIES-wrap this value — a string is the simplest cross-phase interface. Low stakes either way; base64 string is simpler to reason about and log-safely redact.

2. **Where should `buildCredentialJson()` live to avoid the 3-call-site drift (Pitfall 1)?**
   - What we know: CONTEXT.md flags centralizing the attrs-array-building logic as "Claude's Discretion," and `identityCommitment.js`'s own header comment explicitly states the rationale for centralizing shared commitment logic ("Having one module eliminates field-set drift").
   - What's unclear: Whether this new helper belongs in `credentialService.js` (next to `issueCredentialOnChain`) or as a new export from `identityCommitment.js` (next to the attrs-array logic it mirrors).
   - Recommendation: Place it in `credentialService.js` since it's encryption/pinning-specific (the §E3.2 JSON is the *encrypted payload*, conceptually closer to `issueCredentialOnChain` than to the Merkle math in `identityCommitment.js`). Planner should make this an explicit task, not leave it implicit in the 3 call-site edits.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js `crypto` module | AES-256-GCM encrypt/decrypt | ✓ | Node v22.17.1 (built-in) | — |
| Pinata API (`PINATA_JWT` env var) | `pinToIPFS()` — already in use, unchanged | Assumed ✓ (pre-existing dependency, not newly introduced by this phase) | — | — |
| MongoDB / Mongoose | `Student.dek` field persistence | ✓ (already in use, `mongoose ^8.14.2`) | 8.14.2 | — |

**Missing dependencies with no fallback:** none identified.
**Missing dependencies with fallback:** none — this phase introduces zero new external dependencies.

## Validation Architecture

**Skipped.** `.planning/config.json` has `workflow.nyquist_validation: false` explicitly set.

## Security Domain

`security_enforcement` is absent from config (treated as enabled). This phase is fundamentally a security control (encryption-at-rest for PII before third-party storage), so this section is high-signal.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No | Out of scope — HARD-01 (auth middleware) is deferred to a later milestone; this phase doesn't touch authn |
| V3 Session Management | No | Not touched by this phase |
| V4 Access Control | No | Not touched by this phase (admin CRUD authorization is a pre-existing, separately-tracked gap per STATE.md blockers) |
| V5 Input Validation | Partial | Existing Joi validators (`studentValidator.js`) already validate input shape before it reaches `buildStudentRecord`; no new input validation surface is introduced by encryption itself |
| V6 Cryptography | Yes | AES-256-GCM via `node:crypto` (never hand-roll); CSPRNG via `crypto.randomBytes` for DEK and IV generation; this is the core control this phase implements |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| IV reuse under a fixed key (catastrophic GCM failure — plaintext XOR leakage + forgeable auth tags) | Tampering / Information Disclosure | Generate a fresh `crypto.randomBytes(12)` IV inside `encryptCredential()` on every call — never hoist, cache, or derive the IV deterministically |
| DEK leak via API response (the single-custody interim gap this phase explicitly creates) | Information Disclosure | `sanitizeStudent()` allowlist excludes `dek` (D-02) — confirmed as the sole response-shaping chokepoint in this codebase; no other res.json() path bypasses it today |
| DEK leak via logging | Information Disclosure | Existing logging pattern already only logs `rollNo`/`cid`/`txHash`/error messages — preserve this; never log `dek`, the plaintext credential JSON, or the full encrypted blob |
| Ciphertext tampering on IPFS (IPFS itself provides no authenticity) | Tampering | AES-GCM's auth tag detects tampering at decrypt time (`decipher.final()` throws if the tag doesn't verify) — this is inherent to choosing GCM mode, no extra work needed |
| Plaintext credential PII exposure via public IPFS gateway | Information Disclosure | STORE-02's entire purpose — eliminate plaintext pinning. Verify with a manual/automated check that no code path remains that calls `pinToIPFS()` with an unencrypted credential object |

## Sources

### Primary (HIGH confidence)
- Node.js official `crypto` module documentation (`createCipheriv`, `createDecipheriv`, `getAuthTag`, `setAuthTag`, `randomBytes`) — behavior confirmed via direct execution against the project's installed Node v22.17.1 runtime in this research session
- `docs/CLAUDE_CODE_BLUEPRINT.md` §E3.1, §E3.2, §E3.6 (read directly, lines 238-286)
- `privdId_admin/backend/services/credentialService.js` (read directly, full file, 77 lines)
- `privdId_admin/backend/services/studentService.js` (read directly, full file, 389 lines)
- `privdId_admin/backend/models/Student.js` (read directly, full file, 114 lines)
- `privdId_admin/backend/utils/identityCommitment.js` (read directly, full file, 223 lines)
- `privdId_admin/backend/utils/timing.js` (read directly, full file)
- `privdId_admin/backend/controllers/studentController.js` (read directly, relevant sections, confirms `sanitizeStudent()` is the sole response-shaping chokepoint)
- `privdId_admin/backend/scripts/identityCommitment.test.mjs` (read directly, full file — confirms no test coverage on `ipfsCID`/credential shape)
- `.planning/phases/06-encryption-ciphertext-storage/06-CONTEXT.md` (read directly, full file)
- `.planning/REQUIREMENTS.md`, `.planning/STATE.md` (read directly)
- Live grep across `privdId_admin`, `zkp-backend`, `digital-app` confirming exactly 4 files reference `ipfsCID` (matches CONTEXT.md D-08's claim precisely)

### Secondary (MEDIUM confidence)
None required — all findings for this phase were verifiable directly via Context7-equivalent official docs knowledge (Node.js crypto API is stable, well-documented, training-data-reliable) cross-checked with live code execution, and via direct source file reads.

### Tertiary (LOW confidence)
None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Node native `crypto` AES-256-GCM usage verified by live execution against the actual project runtime, not training-data recall alone
- Architecture: HIGH — all integration points read directly from source; call-site diff scope is exact, not estimated
- Pitfalls: HIGH — derived from this project's own documented history (field-set drift is a real, previously-occurring bug class per `identityCommitment.js` comments and STATE.md blockers), not generic crypto-tutorial pitfalls

**Research date:** 2026-06-19
**Valid until:** 2026-07-19 (30 days — stable domain: Node built-in crypto API and this project's own backend code, both low-churn; re-verify if Node version or the 3 call sites change before planning executes)
