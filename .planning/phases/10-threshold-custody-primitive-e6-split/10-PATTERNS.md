# Phase 10: Threshold Custody Primitive (E6 split) - Pattern Map

**Mapped:** 2026-06-22
**Files analyzed:** 7
**Analogs found:** 7 / 7

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `privdId_admin/backend/crypto/shamir.js` (NEW) | utility (crypto primitive) | transform | `privdId_admin/backend/crypto/aesgcm.js` | exact |
| `privdId_admin/backend/crypto/rsaShare.js` (NEW, or inlined in shamir.js) | utility (crypto primitive) | transform | `privdId_admin/backend/crypto/ecies.js` | exact |
| `privdId_admin/backend/models/Student.js` (MODIFIED) | model | CRUD | itself (existing `dek` field block) | exact |
| `privdId_admin/backend/services/studentService.js` (MODIFIED — `createStudent`, `claimCredential`) | service | CRUD + transform | itself (existing `createStudent`/`claimCredential`) | exact |
| `privdId_admin/backend/services/custodianService.js` (NEW, if registration endpoint in scope) | service | CRUD | `privdId_admin/backend/services/safeService.js` (lazy external-config pattern) | role-match |
| `privdId_admin/backend/controllers/custodianController.js` + `routes/custodianRoutes.js` (NEW) | controller / route | request-response | `controllers/safeController.js` + `routes/safeRoutes.js` | exact |
| `privdId_admin/backend/scripts/generateCustodianKeys.js` (NEW, dev helper) | utility (dev script) | batch | `zk-proofs/scripts/generateSafeOwners.js` | exact |

## Pattern Assignments

### `privdId_admin/backend/crypto/shamir.js` (utility, transform)

**Analog:** `privdId_admin/backend/crypto/aesgcm.js` (and `crypto/ecies.js` for the second function's shape)

**Imports pattern** (`aesgcm.js` lines 27-28):
```javascript
import crypto from "crypto";
import { timed } from "../utils/timing.js";
```
For shamir.js, swap `crypto` for the SSS library:
```javascript
import secrets from "secrets.js-grempe";
import { timed } from "../utils/timing.js";
```

**Module-level constant + sanity guard pattern** (`aesgcm.js` lines 30-38):
```javascript
const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

if (ALGO !== "aes-256-gcm") {
  throw new Error("aesgcm.js: ALGO constant drifted from aes-256-gcm");
}
```
Mirror with `DEK_LENGTH = 32`, `THRESHOLD = 2`, `TOTAL_SHARES = 3` constants at the top of `shamir.js` — no drift-guard needed here since there's only one constant set, but DO keep the length constant named and validated against on every call (see next pattern).

**Synchronous validation BEFORE entering `timed()`** (`aesgcm.js` lines 64-67, `ecies.js` lines 56-61):
```javascript
export async function encryptCredential(plaintextObj, dek) {
  if (!Buffer.isBuffer(dek) || dek.length !== KEY_LENGTH) {
    throw new Error(`encryptCredential: expected a ${KEY_LENGTH}-byte Buffer dek`);
  }
  const { out } = await timed("encryptCredential", async () => { /* ... */ });
  return out;
}
```
Copy this exact shape into `splitDEK(dek)` / `reconstructDEK(shares)` — validate `Buffer.isBuffer(dek) && dek.length === 32` (split) and `Array.isArray(shares) && shares.length >= 2` (reconstruct) synchronously, THEN wrap the actual library call in `timed("splitDEK", ...)` / `timed("reconstructDEK", ...)`. This is also explicitly given as a worked example in RESEARCH.md's Pattern 1 (lines 137-171) — use that code verbatim as the starting point, it already follows this exact convention.

**Return shape convention** — `timed()` returns `{ out, seconds }`; callers always do `const { out } = await timed(...); return out;` (see `aesgcm.js` line 69/84, `ecies.js` line 63/72). Apply identically in `shamir.js`.

**Doc-comment convention** (`aesgcm.js` lines 1-25, `ecies.js` lines 1-37) — every crypto module opens with: canonical blueprint §-reference, a one-paragraph description of what's frozen/not-frozen, and a `THREAT MITIGATIONS` block keyed to `T-XX-YY` IDs referencing the phase's plan. `shamir.js` should follow this exact doc-comment shape, citing the Phase 10 plan ID once tasks are written and noting: SSS information-theoretic guarantee (single share reveals nothing), never logging share/DEK material, and the "doesn't throw on insufficient shares" pitfall flagged in RESEARCH.md Common Pitfall 1 — document it directly in the doc-comment as a warning to future readers, not just in RESEARCH.md.

**Never-log-secrets convention** (`ecies.js` lines 32-36, T-07-03) — only the `[perf]` line from `timed()` is logged; the DEK, shares, and PEM key material are never passed to `console.log`/`console.error`. Apply identically.

---

### `privdId_admin/backend/crypto/rsaShare.js` (or wrapShare/unwrapShare inlined in shamir.js)

**Analog:** `privdId_admin/backend/crypto/ecies.js` (`wrapDEK`/`unwrapDEK` pair shape)

**Core wrap/unwrap pair pattern** (`ecies.js` lines 44-103) — one function wraps (server-callable), one function unwraps (client-side counterpart, included for completeness, no server caller). Mirror this exactly:
```javascript
// wrapShare(publicKeyPem, shareHexString) -> string (base64) — server-callable, used in createStudent
// unwrapShare(privateKeyPem, wrappedBase64) -> string (plaintext share) — NO server caller (D-09/D-10: admin never holds a custodian private key); included only for symmetry/documentation, exercised client-side in the Phase 11 recovery page.
```

**RSA-OAEP call pattern** — verified directly in RESEARCH.md Pattern 2 (lines 173-189); use that code verbatim:
```javascript
import crypto from "crypto";

export function wrapShare(publicKeyPem, shareHexString) {
  const buf = Buffer.from(shareHexString, "utf8");
  return crypto.publicEncrypt(
    { key: publicKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    buf
  ).toString("base64");
}
```

**Length-guard convention before the crypto call** — same as `wrapDEK`'s `pubKeyHex` non-empty-string guard (`ecies.js` lines 59-61): validate `publicKeyPem` is a non-empty PEM-looking string and `shareHexString` is non-empty before calling `crypto.publicEncrypt`.

**Lazy-load custodian public keys with a clear error** — Pitfall 4 in RESEARCH.md explicitly directs reuse of the Phase 9 `safeService.js` lazy-getter pattern (`getApiKit()`) to avoid crashing the backend at import time if a custodian `.pem` is missing. Locate and mirror that lazy-getter shape when loading `registrar_public.pem`/`dean_public.pem` (read lazily inside the function that needs it, throw a descriptive `AppError`/`Error` like `"Registrar public key not configured — run custodian onboarding first"` rather than letting a raw `fs`/OpenSSL error propagate).

---

### `privdId_admin/backend/models/Student.js` (model, CRUD)

**Analog:** itself — the existing `dek` field block (lines 49-53) is the direct precedent being replaced.

**Field being removed** (lines 49-53):
```javascript
dek: {
  type: String,
  default: null,
  select: false, // never returned unless explicitly .select('+dek')'d — D-02 hard requirement
},
```

**Replacement field shape** (per CONTEXT.md D-02 + RESEARCH.md Code Examples section, lines 248-268) — apply `select: false` to ALL three new fields (Pitfall 3: conservative, consistent, costs nothing):
```javascript
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
Follow the exact same inline-comment convention used for every other field in this schema (see `pubKey` line 56, `dekEnvelopeCID` line 60 — short comment explaining intent/security rationale directly above or beside the field).

---

### `privdId_admin/backend/services/studentService.js` — `createStudent` (service, CRUD + transform)

**Analog:** itself, lines 122-168 (current implementation)

**Current DEK-persist pattern being replaced** (lines 144-149):
```javascript
const dek = generateDEK();
try {
  const cid = await encryptAndPinCredential(student, dek);
  student.dek = dek.toString('base64');
  student.ciphertextCID = cid;
  await student.save();
```
Replace `student.dek = dek.toString('base64')` with the Shamir split + RSA-wrap-and-store sequence: `splitDEK(dek)` → `[shareA, shareB, shareC]` → `student.custodyShareA = shareA`, `student.custodyShareB = wrapShare(registrarPub, shareB)`, `student.custodyShareC = wrapShare(deanPub, shareC)`. Preserve the existing try/catch/non-blocking-anchor structure (lines 144-163) verbatim — only the DEK-persistence line changes; the on-chain anchor logic, `anchorPending`/`lastAnchorError` fallback, and `console.error` logging convention (line 159: `console.error('[credential] Issuance failed for', student.rollNo, ':', err.message)`) all stay as-is.

**Same pattern repeats in `insertBulkStudents`** (lines 196-217) — `dek.toString('base64')` is written via `Student.updateOne(...)` at line 202; apply the identical split-and-store substitution there too (this is the bulk-issuance twin of `createStudent`'s single-row path, and RESEARCH.md's file list implies both call sites need the same fix since both currently write `student.dek`).

---

### `privdId_admin/backend/services/studentService.js` — `claimCredential` (service, CRUD + transform)

**Analog:** itself, lines 335-378 (current implementation)

**Current dek-read + wipe pattern** (lines 336-352, 359-367):
```javascript
const student = await Student.findById(id).select("+dek");
// ...
if (!student.dek) {
  throw new AppError("No DEK is on file for this student; cannot complete claim.", 500);
}
const dekBuffer = Buffer.from(student.dek, "base64");
const envelopeBase64 = await wrapDEK(pubKeyHex, dekBuffer);
// ...
const updated = await Student.findOneAndUpdate(
  { _id: id, enrollmentPhase: "awaiting-keypair" },
  {
    $set: { pubKey: pubKeyHex, dekEnvelopeCID, enrollmentPhase: "active" },
    $unset: { dek: "" },
  },
  { new: true }
);
```
Per D-06/Pitfall 2 (Open Question #1 in RESEARCH.md — flag this resolution explicitly in the plan): the transient plaintext DEK still needs to exist between issuance and claim to be ECIES-wrapped here, but it must NOT be reintroduced under the name `dek`. The `.select('+dek')`, the `AppError(..., 500)` "no DEK on file" guard, the `Buffer.from(..., "base64")` decode, and the atomic `findOneAndUpdate` with `$set`/`$unset` + TOCTOU re-check filter are ALL reusable verbatim — only the field name changes (e.g. a clearly-relabeled transient field, NOT `dek`, NOT `custodyShareX`). The `$unset` line is exactly the "wipe it now that it's no longer needed" step CUST-03 requires — keep that semantic, just retarget the field name.

**Error-handling convention** — `AppError(message, statusCode)` is the uniform error type across this whole file (see lines 338, 339, 344, 349, 374) — any new validation in the custody flow (missing custodian public key, malformed share, etc.) should throw `AppError` with an appropriate 4xx/5xx code, never a bare `Error` or silent `null` return, to stay consistent with this controller layer's `asyncHandler` → `AppError` → JSON error response chain.

---

### `privdId_admin/backend/controllers/custodianController.js` + `routes/custodianRoutes.js` (NEW)

**Analog:** `privdId_admin/backend/controllers/safeController.js` + `routes/safeRoutes.js`

**Route file shape** (`routes/safeRoutes.js`, full file, 18 lines):
```javascript
import express from "express";

import { getPendingApprovals, buildProposal, submitProposal, rejectProposal, signPendingTx, executePendingTx } from "../controllers/safeController.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = express.Router();

router.use(requireAuth);

router.get("/pending", getPendingApprovals);
router.post("/propose-build", buildProposal);
// ...

export default router;
```
Mirror exactly for `custodianRoutes.js`: `router.use(requireAuth)` at the top (gates the whole router behind a valid JWT — matches ASVS V2/V4 guidance in RESEARCH.md), then one `router.post("/register-key", registerCustodianKey)` route.

**Controller shape** (`controllers/safeController.js` lines 1-34) — every handler wrapped in `asyncHandler(async (req, res) => { ... })`, validates `req.body` fields with explicit regex/type checks and throws `AppError(message, 400)` on failure BEFORE calling the service layer, then `res.json({ status: "success", ...data })`:
```javascript
import * as safeService from "../services/safeService.js";
import Student from "../models/Student.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import AppError from "../utils/appError.js";

export const buildProposal = asyncHandler(async (req, res) => {
  const { action, rollNo } = req.body;
  const spec = safeService.PROPOSABLE_ACTIONS[action];
  if (!spec) {
    throw new AppError("Unknown action. Expected 'revoke' or 'acceptAdmin'.", 400);
  }
  // ... validate, then delegate to service
  const built = await safeService.buildUnsignedRegistryTx(spec.fnName, args);
  res.json({ status: "success", ...built });
});
```
For `registerCustodianKey`: validate `role` is one of `["registrar", "dean"]` (or similar enum, matching `enumCodes.js` convention), validate `publicKeyPem` is a non-empty PEM string, and per V4 Access Control in RESEARCH.md, cross-check `req.user.role` (set by `requireAuth` via `req.user = decoded` in `middleware/requireAuth.js` line 19) against the requested `role` so a Registrar session cannot register the Dean's key — throw `AppError("...", 403)` on mismatch.

**Auth middleware** (`middleware/requireAuth.js`, full file) — reuse verbatim, no new auth mechanism:
```javascript
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return next(new AppError("Authentication required.", 401));
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "privid-admin-secret");
    req.user = decoded;
    return next();
  } catch (_error) {
    return next(new AppError("Invalid or expired session.", 401));
  }
}
```

**Async error propagation** (`middleware/asyncHandler.js`, full file, 3 lines) — reuse verbatim, every controller export wraps its handler in this:
```javascript
export function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}
```

---

### `privdId_admin/backend/scripts/generateCustodianKeys.js` (NEW dev helper)

**Analog:** `zk-proofs/scripts/generateSafeOwners.js` (full file, 87 lines)

**Header/doc-comment + safety-warning convention** (lines 1-19):
```javascript
// Generates 3 brand-new throwaway keypairs for the Sepolia Safe 2-of-3 owners
// (AcadAdmin, Asst. Registrar, Dean) — D-02. ...
//
// Usage: node scripts/generateSafeOwners.js
//
// Output is printed to stdout only — ... ;
//
// SECURITY WARNING: these are throwaway Sepolia-testnet-only keys.
//   - Do NOT commit the printed private keys anywhere ...
//   - This script writes NOTHING to disk — keys exist only in this terminal's
//     stdout ...
```
Mirror this exact structure for `generateCustodianKeys.js`: a header doc-comment naming the locked decision ID it implements (D-10's dev-mode equivalent, per RESEARCH.md Open Question #2), an explicit `SECURITY WARNING` block, and an explicit "writes NOTHING to disk" or equivalent disk-write disclosure (this script WILL need to write `.pem` files for local dev unlike the Safe-owners script, since RSA keys can't be "imported into MetaMask" the way ECDSA keys can — so the doc-comment should instead say something like "writes registrar_private.pem/dean_private.pem to <path> for LOCAL DEV ONLY — never commit these, never use in any deployed environment").

**Role/label loop + structured printed-output convention** (lines 23-49, 51-70):
```javascript
function main() {
  const roles = [
    { label: "AcadAdmin", envKey: "SAFE_OWNER_ACADADMIN" },
    { label: "Asst. Registrar", envKey: "SAFE_OWNER_REGISTRAR" },
    { label: "Dean", envKey: "SAFE_OWNER_DEAN" },
  ];
  console.log("=".repeat(72));
  console.log("PrivdID — Sepolia Safe 2-of-3 throwaway owner keypairs (D-02)");
  console.log("=".repeat(72));
  // ...
  const wallets = roles.map((role) => {
    const wallet = ethers.Wallet.createRandom();
    return { ...role, wallet };
  });
  wallets.forEach(({ label, wallet }) => {
    console.log("-".repeat(72));
    console.log(`Role:        ${label}`);
    console.log(`Address:     ${wallet.address}`);
    console.log(`Private key: ${wallet.privateKey}`);
  });
  // ... copy-pasteable .env block printed at the end, plus a numbered "Next steps" block
}
main();
```
Mirror with `[{ label: "Asst. Registrar", envKey: "REGISTRAR_PUBLIC_KEY_PATH" }, { label: "Dean", envKey: "DEAN_PUBLIC_KEY_PATH" }]`, generate RSA-2048 keypairs via `crypto.generateKeyPairSync("rsa", { modulusLength: 2048, ... })`, write the PUBLIC PEMs to a `.pem` path the backend will load (gitignored), print the PRIVATE PEMs to stdout only (matching the "never written to disk for the real flow" spirit) or write them to a separate clearly-dev-only gitignored path with a loud warning — and close with the same numbered "Next steps" block style (copy public key path into `.env`, never commit the private key, etc.).

**Module-system note:** this script is CommonJS (`require("ethers")`, no `import`) — check whether `privdId_admin/backend/scripts/` (if that's the chosen location instead of `zk-proofs/scripts/`) is ESM (the backend's `package.json` likely has `"type": "module"` like the rest of `privdId_admin/backend`, given `crypto/aesgcm.js`/`ecies.js` use `import`/`export`) — if so, write the new script using ESM import syntax (`import crypto from "crypto"`) to match its actual host directory's module system, NOT a blind copy of `generateSafeOwners.js`'s CommonJS syntax.

---

## Shared Patterns

### Crypto module shape (aesgcm.js / ecies.js convention)
**Source:** `privdId_admin/backend/crypto/aesgcm.js`, `privdId_admin/backend/crypto/ecies.js`
**Apply to:** `crypto/shamir.js`, `crypto/rsaShare.js`
- Synchronous input-length/type validation BEFORE the `timed()` call, throwing a plain `Error` (not `AppError` — crypto modules are framework-agnostic and don't import `AppError`).
- Every exported async crypto function wraps its core work in `timed(label, async () => {...})` and returns `out` from the `{ out, seconds }` result.
- Doc-comment header citing the canonical blueprint section + a `THREAT MITIGATIONS` block with `T-XX-YY` IDs.
- Never `console.log`/`console.error` secret material (DEK, shares, private keys) — only the `[perf]` line from `timed()`.

### Authentication
**Source:** `privdId_admin/backend/middleware/requireAuth.js`
**Apply to:** `routes/custodianRoutes.js` (via `router.use(requireAuth)`)
```javascript
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) return next(new AppError("Authentication required.", 401));
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "privid-admin-secret");
    req.user = decoded;
    return next();
  } catch (_error) {
    return next(new AppError("Invalid or expired session.", 401));
  }
}
```

### Error handling
**Source:** `privdId_admin/backend/utils/appError.js` + `middleware/asyncHandler.js`
**Apply to:** all new controller/service files
```javascript
// appError.js
export default class AppError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
    this.details = details;
    this.isOperational = true;
  }
}

// asyncHandler.js
export function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}
```
Service-layer functions throw `AppError` directly (never caught locally unless recovering); controller exports are always wrapped in `asyncHandler` so thrown errors reach Express's error middleware automatically.

### Performance instrumentation (mandatory per CLAUDE.md ground rule 5)
**Source:** `privdId_admin/backend/utils/timing.js`
**Apply to:** `crypto/shamir.js`, `crypto/rsaShare.js` (every new crypto op)
```javascript
export async function timed(label, fn) {
  const t0 = performance.now();
  const out = await fn();
  const seconds = (performance.now() - t0) / 1000;
  console.log(`[perf] ${label}: ${seconds.toFixed(3)} s`);
  return { out, seconds };
}
```

### Mongoose `select: false` for sensitive fields
**Source:** `privdId_admin/backend/models/Student.js` (`dek` field, lines 49-53; `sanitizeStudent()` allowlist, `services/studentService.js` lines 28-56)
**Apply to:** `custodyShareA`/`B`/`C` field definitions in `Student.js`
- Defense in depth: `select: false` on the schema field (first line of defense) AND omission from `sanitizeStudent()`'s explicit allowlist (second line of defense) — both must be applied to every new custody field, exactly as `dek` was handled before removal.

## No Analog Found

None — every file in RESEARCH.md's touchpoint list has a strong existing analog in this codebase (the project's consistent module-shape conventions across `crypto/`, `services/`, `controllers/`, `routes/`, and `scripts/` made this phase unusually well-covered).

## Metadata

**Analog search scope:** `privdId_admin/backend/{crypto,services,controllers,routes,middleware,models,utils}/`, `zk-proofs/scripts/`
**Files scanned:** `crypto/aesgcm.js`, `crypto/ecies.js`, `utils/timing.js`, `utils/appError.js`, `middleware/asyncHandler.js`, `middleware/requireAuth.js`, `services/studentService.js`, `services/credentialService.js`, `models/Student.js`, `routes/safeRoutes.js`, `controllers/safeController.js`, `zk-proofs/scripts/generateSafeOwners.js`
**Pattern extraction date:** 2026-06-22
