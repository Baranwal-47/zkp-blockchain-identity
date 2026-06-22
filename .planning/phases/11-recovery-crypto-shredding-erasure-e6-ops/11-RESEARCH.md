# Phase 11: Recovery & Crypto-Shredding Erasure (E6 ops) — Research

**Researched:** 2026-06-23
**Domain:** Express 5 + MongoDB ESM — in-memory recovery session state machine, Shamir reconstruction, ECIES re-wrap, AES-GCM re-encrypt, Pinata unpin, credential re-issuance
**Confidence:** HIGH (all claims verified against live codebase or official docs)

---

## Summary

Phase 11 builds the operational layer on top of Phase 10's custody primitives. Everything needed to reconstruct, operate on, and destroy a student's DEK is already in place as libraries and data structures — this phase wires them together into two endpoint groups: `/api/recovery/*` (reconstruct + operate) and `/api/erasure/*` (destroy).

The recovery flow has two distinct cases driven by the same 2-of-3 Shamir session: **Case B** (device loss) re-wraps the reconstructed DEK to a new student pubkey using the existing `wrapDEK()` + `pinEnvelopeToIPFS()` from Phase 7, and updates `dekEnvelopeCID` in MongoDB — no on-chain transaction. **Case A** (credential modification) decrypts the credential with `decryptCredential()`, edits MongoDB attributes, recomputes the 7-attribute Merkle commitment (same logic as `updateStudent()`), re-encrypts with `encryptCredential()` + re-pins with `encryptAndPinCredential()`, then triggers a Safe propose via `safeService.js` — the credential-modification path already exists in `updateStudent()` minus the DEK; Phase 11 supplies it.

The erasure flow (`$unset custodyShareB + custodyShareC`, keep or also destroy `custodyShareA`) is a simple MongoDB write plus a best-effort Pinata DELETE to `https://api.pinata.cloud/pinning/unpin/{CID}`. All on-chain proof rejection comes from the already-working `revoked` flag — erasure adds no on-chain surface.

The critical design decision is **where recovery session state lives**: an in-memory `Map` (server-side, keyed by `studentId`) vs. a `RecoverySession` MongoDB model. The in-memory Map is the right choice for this project (no separate process, restart drops sessions cleanly, zero schema migration). That decision is the only thing with meaningful architectural consequence for the planner.

**Primary recommendation:** Use an in-memory `Map` for recovery session state. Wire `custodyShareA` (already admin-readable) as one available share. Re-use every existing crypto primitive and service function — write zero new crypto.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Recovery session state | API / Backend (in-memory Map) | — | Single-process Express; sessions must not persist to DB — DEK never leaves memory |
| Custodian authentication | API / Backend (requireAuth JWT) | — | Same `requireAuth` + role-login pattern already gates /api/safe and /api/custodians |
| Share contribution | API / Backend | — | Custodian submits their decrypted Shamir share; backend validates + accumulates |
| DEK reconstruction | API / Backend (shamir.js) | — | `reconstructDEK([s1,s2])` — already exists in crypto/shamir.js |
| Case B: DEK re-wrap | API / Backend (ecies.js) | — | `wrapDEK(newPubKeyHex, dek)` + `pinEnvelopeToIPFS()` — both exist |
| Case A: credential re-encrypt | API / Backend (aesgcm.js + credentialService) | — | `encryptAndPinCredential(student, dek)` already does build+encrypt+pin |
| Case A: on-chain re-anchor | API / Backend (safeService.js) | — | Credential modification needs new Safe proposal — same Phase 9 path |
| Erasure: share destruction | API / Backend (MongoDB $unset) | — | Direct Mongoose update — no crypto needed |
| Erasure: IPFS unpin | API / Backend (Pinata REST) | IPFS | Best-effort DELETE to Pinata API — already using axios + PINATA_JWT |
| New student pubkey delivery (Case B) | Mobile App | — | Student generates keypair on-device; submits new pubKey to initiate endpoint |
| Admin web portal UX | Frontend (React/Vite) | — | Recovery initiation + share submission forms |

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REC-01 | POST /recovery/initiate opens a request; POST /recovery/submit-share accepts custodian shares; DEK reconstructed in memory once 2 arrive; wiped after operation | In-memory Map state machine; reconstructDEK() exists; Buffer.fill(0) wipe pattern |
| REC-02 | Device-loss recovery: reconstructed DEK re-wrapped to student's new pubkey; fresh dekEnvelopeCID pinned; daily access works with new key | wrapDEK() + pinEnvelopeToIPFS() + Student.$set({ dekEnvelopeCID, pubKey }) — all exist |
| REC-03 | Credential-modification: DEK decrypts existing credential, re-encrypts updated attrs (frozen 7-attr set), re-pins; proof still verifies | encryptAndPinCredential() + updateStudent() Merkle logic + safeService.js propose |
| REC-04 | Custodian share submissions authenticated; unauthenticated request rejected | requireAuth middleware (JWT Bearer) — same pattern as /api/safe and /api/custodians |
| ERASE-01 | Governed erasure destroys ≥2 shares; subsequent recovery fails | MongoDB $unset custodyShareB + custodyShareC; reconstructDEK([shareA]) throws (length guard) |
| ERASE-02 | Erasure best-effort unpins ciphertext + envelope from IPFS; flags record erased; on-chain revoked flag remains authoritative for proof rejection | DELETE https://api.pinata.cloud/pinning/unpin/{CID} via axios; Student.$set({ erased: true }) |
</phase_requirements>

---

## Standard Stack

### Core (no new packages — all already in package.json)

| Library | Version (installed) | Purpose | Why Standard |
|---------|---------------------|---------|--------------|
| `secrets.js-grempe` | 2.0.0 | `reconstructDEK([s1,s2])` — already written in shamir.js | Phase 10 primitive |
| `eciesjs` | ^0.5.0 | `wrapDEK(pubKeyHex, dek)` — re-wrap DEK to new pubkey (Case B) | Phase 7 primitive |
| Node built-in `crypto` | (Node.js) | AES-GCM decrypt via aesgcm.js `decryptCredential()` | Phase 6 primitive |
| `axios` | ^1.17.0 | Pinata unpin DELETE call (same client used for pinToIPFS) | Already in credentialService.js |
| `jsonwebtoken` | ^9.0.2 | `requireAuth` JWT verification for custodian sessions | Phase 9 primitive |
| `mongoose` | ^8.14.2 | `Student.findOneAndUpdate` for share destruction + flag writes | Existing ORM |
| `express` | ^5.1.0 | New route files `/api/recovery` and `/api/erasure` | Existing framework |

[VERIFIED: npm registry — all packages confirmed in privdId_admin/backend/package.json]

**No new npm packages required.** Phase 11 is pure wiring of existing primitives.

### No Alternatives Considered

Every primitive needed (Shamir reconstruct, ECIES wrap, AES-GCM decrypt/encrypt, Pinata pin/unpin, JWT auth, Mongoose update) is already installed and used in production paths. Adding any new package would be a regression.

---

## Package Legitimacy Audit

No new packages installed in this phase. All libraries were audited in Phases 6–10.

---

## Architecture Patterns

### System Architecture Diagram: Recovery Session State Machine

```
POST /recovery/initiate
  │  body: { studentId, operationType: "device-loss"|"credential-mod", newPubKey? }
  │  auth: requireAuth (any role)
  ▼
recoverySessionMap.set(sessionId, { studentId, operationType, shares: [], newPubKey })
  → 200 { sessionId }

POST /recovery/submit-share
  │  body: { sessionId, shareHex }   ← custodian has already RSA-OAEP unwrapped their share
  │  auth: requireAuth (registrar | dean | acadadmin)
  ▼
session.shares.push({ role: req.user.role, shareHex })
  │
  ├─ shares.length < 2 → 202 { status:"pending", sharesReceived: N }
  │
  └─ shares.length >= 2 ──────────────────────────────────────────────────┐
                                                                           ▼
                                                               dek = await reconstructDEK([s1, s2])
                                                                           │
                                          ┌────────────────────────────────┤
                                          │                                │
                              operationType="device-loss"    operationType="credential-mod"
                                          │                                │
                          wrapDEK(newPubKey, dek)          decryptCredential(ciphertextCID, dek)
                          pinEnvelopeToIPFS(...)            edit attrs + recomputeMerkleRoot()
                          Student.$set({ dekEnvelopeCID,   encryptAndPinCredential(student, dek)
                                         pubKey: newPubKey }) safeService.relayProposal(...)
                                          │                                │
                                          └────────────────────────────────┘
                                                           │
                                                  dek.fill(0)  ← WIPE
                                                  recoverySessionMap.delete(sessionId)
                                                           │
                                                    200 { status:"complete" }

POST /erasure/initiate
  │  body: { studentId }
  │  auth: requireAuth (any role — or restrict to specific roles, see Open Q5)
  ▼
Student.findByIdAndUpdate(studentId, {
  $unset: { custodyShareB: "", custodyShareC: "" },
  $set:   { erased: true }
})
  │
  ├─ best-effort: DELETE https://api.pinata.cloud/pinning/unpin/{ciphertextCID}
  ├─ best-effort: DELETE https://api.pinata.cloud/pinning/unpin/{dekEnvelopeCID}
  └─ 200 { status:"erased", unpinResults: {...} }
```

### Recommended Project Structure

```
privdId_admin/backend/
├── routes/
│   ├── recoveryRoutes.js       # NEW: /recovery/initiate + /submit-share
│   └── erasureRoutes.js        # NEW: /erasure/initiate
├── controllers/
│   ├── recoveryController.js   # NEW: initiate + submitShare handlers
│   └── erasureController.js    # NEW: erasure handler
├── services/
│   └── recoveryService.js      # NEW: in-memory Map + reconstruct + operate logic
├── models/
│   └── Student.js              # MODIFY: add `erased` Boolean field
└── app.js                      # MODIFY: mount /api/recovery + /api/erasure
```

### Pattern 1: In-Memory Recovery Session Map

**What:** Server-side `Map` keyed by `sessionId` (random UUID-style hex), holding shares + operation type + expiry. Zero schema, zero migration, automatically cleared on restart.

**When to use:** Single-process Express backend where session loss on restart is acceptable. Sessions are short-lived (minutes) — requiring human custodians to re-submit is a safe fallback.

**Example:**
```javascript
// services/recoveryService.js
import crypto from "crypto";

// sessionId → { studentId, operationType, newPubKey, shares: [{role, shareHex}], expiresAt }
const sessions = new Map();
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

export function initiateRecovery({ studentId, operationType, newPubKey }) {
  const sessionId = crypto.randomBytes(16).toString("hex");
  sessions.set(sessionId, {
    studentId, operationType, newPubKey: newPubKey ?? null,
    shares: [], expiresAt: Date.now() + SESSION_TTL_MS
  });
  return sessionId;
}

export function getSession(sessionId) {
  const s = sessions.get(sessionId);
  if (!s) return null;
  if (Date.now() > s.expiresAt) { sessions.delete(sessionId); return null; }
  return s;
}

export function deleteSession(sessionId) {
  sessions.delete(sessionId);
}
```

[ASSUMED — exact session TTL value; 30 minutes is a reasonable default for a human-custodian flow]

### Pattern 2: DEK Wipe After Use

**What:** Zero-fill the DEK Buffer immediately after the operation, then delete the session.

**Why critical:** The reconstructed DEK must never persist in memory longer than the one operation. This is the primary security invariant of REC-01.

```javascript
// In recoveryService.js — after the operation completes:
let dek = await reconstructDEK([shares[0].shareHex, shares[1].shareHex]);
try {
  await performOperation(session, dek, student); // Case A or Case B
} finally {
  dek.fill(0); // ALWAYS wipe — even if operation throws
  deleteSession(sessionId);
}
```

[VERIFIED: Buffer.fill() is the standard Node.js pattern for zeroing sensitive key material]

### Pattern 3: Custodian Share A as Admin-Readable Input

**What:** `custodyShareA` is stored as plaintext in MongoDB (per the Phase 10 locked design). The backend already holds Share A — for reconstruction, the admin can provide Share A from the DB directly without a custodian submission.

**Consequence for submit-share:** The session only needs ONE custodian to submit their decrypted share (B or C) if the admin is co-initiating. OR the admin submits their own Share A by fetching it from `Student.findById(id).select('+custodyShareA')`, making the session require one additional custodian (Registrar or Dean).

**Recommended approach:** When initiating, the backend automatically loads `custodyShareA` from MongoDB and places it in the session. The session then requires exactly **one** external custodian share (B or C) to reach threshold 2. This simplifies the flow significantly: the Registrar OR the Dean alone can complete recovery alongside the AcadAdmin's DB-accessible share.

```javascript
// In initiateRecovery — preload Share A:
const student = await Student.findById(studentId).select('+custodyShareA');
if (!student.custodyShareA) throw new AppError("Share A missing for this student.", 409);
sessions.set(sessionId, {
  studentId, operationType, newPubKey: newPubKey ?? null,
  shares: [{ role: "acadadmin", shareHex: student.custodyShareA }], // preloaded
  expiresAt: Date.now() + SESSION_TTL_MS
});
```

[VERIFIED: custodyShareA is select:false in Student.js; must use .select('+custodyShareA')]

### Pattern 4: Pinata Unpin (Best-Effort)

**What:** `DELETE https://api.pinata.cloud/pinning/unpin/{CID}` with `Authorization: Bearer ${PINATA_JWT}`.

**Important:** Unpinning is best-effort — IPFS nodes can cache content and the CID remains accessible through other gateways. The security guarantee of erasure comes from destroying the Shamir shares, not from IPFS unpin success. Never fail the erasure transaction because unpin fails.

```javascript
// In erasureController.js
async function bestEffortUnpin(cid) {
  if (!cid) return { status: "skipped", reason: "no CID" };
  try {
    await axios.delete(`https://api.pinata.cloud/pinning/unpin/${cid}`, {
      headers: { Authorization: `Bearer ${process.env.PINATA_JWT}` }
    });
    return { status: "ok" };
  } catch (err) {
    console.warn(`[erasure] Pinata unpin ${cid} failed (best-effort):`, err.message);
    return { status: "failed", error: err.message };
  }
}
```

[VERIFIED: Pinata REST API — DELETE https://api.pinata.cloud/pinning/unpin/{CID}, Bearer auth — confirmed via official Pinata docs]

### Pattern 5: Case A Credential Re-Encryption

**What:** Decrypt the existing ciphertext from IPFS, update attributes, recompute Merkle root, re-encrypt with the SAME DEK, re-pin. The DEK is NEVER rotated (D-04/D-05).

**Key insight:** `encryptAndPinCredential(student, dek)` already does exactly build+encrypt+pin. The only additions are: (1) fetch the ciphertext from IPFS to decrypt it (to verify current attributes before editing), (2) update student fields in MongoDB, and (3) trigger a Safe propose for the on-chain merkleRoot update.

```javascript
// Case A flow in recoveryService.js (simplified):
import { encryptAndPinCredential, anchorCredentialOnChain } from "./credentialService.js";
import { decryptCredential } from "../crypto/aesgcm.js";
import { safeService } from "./safeService.js";

async function performCaseA(session, dek, student, attributeUpdates) {
  // 1. Apply attribute updates + recompute commitment (same as updateStudent logic)
  Object.assign(student, attributeUpdates);
  // recompute salts, merkleRoot (copy from updateStudent() lines 296-307)

  // 2. Re-encrypt + re-pin with the SAME DEK (frozen field set enforced by buildCredentialJson)
  const newCid = await encryptAndPinCredential(student, dek);
  student.ciphertextCID = newCid;
  await student.save();

  // 3. Propose Safe tx for on-chain merkleRoot update (Case A requires Gnosis — blueprint §7)
  await safeService.relayProposal(student);
}
```

[VERIFIED: Blueprint §7 Case A explicitly requires Shamir THEN Gnosis; updateStudent() in studentService.js lines 295-338 is the pattern to copy for commitment recomputation]

### Anti-Patterns to Avoid

- **Persisting the reconstructed DEK to MongoDB:** The whole point of the session model is that the DEK lives only in memory for the duration of one operation. Never write it to `pendingDek` or any other field.
- **Relying on a single-share reconstructDEK call:** `secrets.combine()` on one share silently returns garbage (documented in shamir.js WARNING comment). The share-count guard in `reconstructDEK()` throws on < 2 shares, but the session must also enforce uniqueness — don't let the same custodian submit twice to fake 2-of-3.
- **Using `custodyShareA` select default:** `custodyShareA` has `select: false` in Student.js. Always use `.select('+custodyShareA')` when loading it for reconstruction.
- **Failing the erasure transaction on Pinata error:** Pinata unpin is best-effort. Log the failure, return it in the response, but never throw from the erasure endpoint because of an IPFS failure.
- **Destroying all 3 shares:** Destroying `custodyShareB` + `custodyShareC` ($unset) while keeping `custodyShareA` is correct — this guarantees ≥2 destroyed while leaving a clear audit trail. Destroying `custodyShareA` too is acceptable but unnecessary; the single remaining share cannot reconstruct. [ASSUMED — final decision on whether to also $unset custodyShareA at erasure time is not locked; destroying all 3 is cleaner]
- **Duplicate role share submission:** Guard against a custodian submitting the same role twice to reach the 2-share threshold fraudulently. Check `session.shares.find(s => s.role === req.user.role)` and reject (409 "This role has already submitted a share for this session").

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Shamir reconstruction | Any GF(256) polynomial interpolation | `reconstructDEK()` in crypto/shamir.js | Already written, audited, timed; secrets.combine() on bad input returns garbage without this guard |
| ECIES DEK re-wrap | Any custom asymmetric encryption | `wrapDEK(pubKeyHex, dek)` in crypto/ecies.js | Has the critical Uint8Array→Buffer.from() fix (Rule 1 bug); already timed |
| AES-GCM re-encryption | Any custom symmetric encryption | `encryptCredential()` / `encryptAndPinCredential()` in credentialService.js | Already handles 12-byte IV + 16-byte auth tag concatenation |
| IPFS re-pin | Direct Pinata SDK | `pinToIPFS()` / `encryptAndPinCredential()` in credentialService.js | Existing function with timed() wrapper and correct Pinata JWT usage |
| Session ID generation | Incrementing counter or UUID lib | `crypto.randomBytes(16).toString("hex")` | Built-in, no new dependency |
| JWT auth | Custom token scheme | `requireAuth` middleware (requireAuth.js) | Already validates Bearer JWT; req.user.role already populated |

**Key insight:** Phase 11 is assembly, not invention. Every cryptographic operation has a named function in the codebase. The only new code is the session state machine and the HTTP endpoints.

---

## Common Pitfalls

### Pitfall 1: secrets.combine() silent garbage on 1 share
**What goes wrong:** If only one share is in the session and reconstruction is attempted, `secrets.combine([oneShare])` returns a hex string that decodes to 32 bytes of garbage — no exception. AES-GCM decryption then fails with an auth-tag mismatch, not a "wrong DEK" error, which is confusing.
**Why it happens:** GF(256) polynomial interpolation with only 1 point is indeterminate — any value is equally valid.
**How to avoid:** `reconstructDEK()` already throws if `shares.length < 2`. The session state machine must enforce minimum 2 shares BEFORE calling reconstructDEK. The preloaded Share A pattern means one external submission reaches 2 total.
**Warning signs:** "auth-tag mismatch" or "unexpected DEK length" errors during decryption — these indicate wrong shares, not a crypto bug.

### Pitfall 2: Same-role duplicate share faking 2-of-3
**What goes wrong:** If the Registrar submits twice (or the same token is replayed), the session.shares array contains 2 items with `role: "registrar"`, and the threshold appears met — but it's only 1 unique custodian.
**Why it happens:** The session Map doesn't inherently enforce role uniqueness.
**How to avoid:** In `submitShare`, check `if (session.shares.some(s => s.role === req.user.role))` and return 409. Enforce this BEFORE pushing to the array.

### Pitfall 3: DEK in memory after operation throws
**What goes wrong:** If `performOperation()` throws mid-way (e.g., IPFS pin fails during Case B), the DEK Buffer remains in the V8 heap reachable from the session object.
**Why it happens:** Forgetting the `finally { dek.fill(0); deleteSession(id) }` pattern.
**How to avoid:** Always wipe in a `finally` block. The operation failing is recoverable (retry the recovery session); a leaked DEK is not.

### Pitfall 4: updateStudent() throws for claimed students
**What goes wrong:** The existing `updateStudent()` in studentService.js throws a 409 for any `active` student because `pendingDek` is null — it deliberately defers to Phase 11. For Case A, Phase 11 must NOT call `updateStudent()` — it must replicate the relevant subset of its logic with the reconstructed DEK.
**Why it happens:** `updateStudent()` line 323: `if (!student.pendingDek) throw new AppError(...)`.
**How to avoid:** In Case A, write a new `reissueWithDEK(studentId, attributeUpdates, dek)` service function that copies the commitment-recomputation + `encryptAndPinCredential()` logic from `updateStudent()` but takes the DEK as a parameter rather than reading `pendingDek`.

### Pitfall 5: Case A requires a Safe proposal — not a direct chain write
**What goes wrong:** Calling `anchorCredentialOnChain()` directly for a credential modification bypasses the Gnosis Safe 2-of-3 governance introduced in Phase 9.
**Why it happens:** Blueprint §7 Case A step 4 specifies `issueCredential/update` must go through the Safe. `anchorCredentialOnChain()` does a direct EOA write.
**How to avoid:** After re-encrypting and re-pinning, call `safeService.relayProposal()` (or equivalent) to create the Safe proposal. The on-chain write completes when officials sign+execute via the existing Phase 9 UI. This means the credential's `ciphertextCID` + `merkleRoot` are updated in MongoDB immediately, but `onChainTxHash` and the chain state update asynchronously.

### Pitfall 6: custodyShareA requires .select('+custodyShareA')
**What goes wrong:** `Student.findById(id)` returns null for `custodyShareA` because of `select: false` in the schema. The session is initialized with `shareHex: null`, reconstruction gets `[null, shareB]`, secrets.combine returns garbage.
**Why it happens:** Mongoose `select: false` excludes the field from all queries by default.
**How to avoid:** Always `Student.findById(id).select('+custodyShareA +custodyShareB +custodyShareC')` when you need custody fields.

### Pitfall 7: Erasure must set `erased` flag even if Pinata unpin fails
**What goes wrong:** If the erasure endpoint throws when Pinata fails, the shares get destroyed in MongoDB but the `erased` flag is never set — the admin can't tell the record has been erased.
**Why it happens:** Treating Pinata unpin as a synchronous prerequisite rather than a best-effort side effect.
**How to avoid:** Destroy shares + set `erased: true` in MongoDB FIRST. Then attempt unpin in `try/catch`, log the result, include it in the response body. Never let an IPFS failure roll back the MongoDB mutation.

---

## Code Examples

### Recovery Initiation (Preload Share A)
```javascript
// routes/recoveryRoutes.js
import express from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { initiateRecovery, submitShare } from "../controllers/recoveryController.js";
const router = express.Router();
router.use(requireAuth);
router.post("/initiate", initiateRecovery);
router.post("/submit-share", submitShare);
export default router;
```

### Erasure Handler (Share Destruction + Best-Effort Unpin)
```javascript
// controllers/erasureController.js (sketch)
import { asyncHandler } from "../middleware/asyncHandler.js";
import AppError from "../utils/appError.js";
import Student from "../models/Student.js";
import axios from "axios";

export const initiateErasure = asyncHandler(async (req, res) => {
  const { studentId } = req.body;
  if (!studentId) throw new AppError("studentId is required.", 400);
  
  const student = await Student.findById(studentId).select('+custodyShareA +custodyShareB +custodyShareC');
  if (!student) throw new AppError("Student not found.", 404);
  if (student.erased) throw new AppError("This credential has already been erased.", 409);

  // FIRST: destroy shares + set erased flag (must succeed before unpin attempts)
  await Student.findByIdAndUpdate(studentId, {
    $unset: { custodyShareB: "", custodyShareC: "" },
    $set:   { erased: true }
  });

  // THEN: best-effort IPFS unpin (never throws)
  const unpinResults = {
    ciphertextCID: await bestEffortUnpin(student.ciphertextCID),
    dekEnvelopeCID: await bestEffortUnpin(student.dekEnvelopeCID),
  };

  res.json({ status: "erased", studentId, unpinResults });
});
```

### Student Schema Addition
```javascript
// In Student.js — add to studentSchema:
erased: {
  type: Boolean,
  default: false,
},
erasedAt: {
  type: Date,
  default: null,
},
```

---

## Runtime State Inventory

This phase does not rename or refactor strings. No runtime state inventory required.

---

## Environment Availability

No new external dependencies. All env vars already present in `.env`:
- `PINATA_JWT` — already used by `credentialService.js` for pinToIPFS
- `JWT_SECRET` — already used by `requireAuth`
- `REGISTRAR_PUBLIC_KEY_PATH`, `DEAN_PUBLIC_KEY_PATH` — set by Phase 10 onboarding

No new env vars needed for Phase 11.

---

## State of the Art

| Old Approach | Current Approach | Impact on Phase 11 |
|--------------|------------------|---------------------|
| `updateStudent()` reads `pendingDek` | Phase 11 supplies DEK from Shamir session | Must NOT call updateStudent() for Case A — write reissueWithDEK() instead |
| Single-custody DEK in memory (v2.0 gap) | Shamir 2-of-3 split (Phase 10) | Phase 11's foundation; all 3 shares exist in DB for active students |
| Direct EOA on-chain writes | Safe 2-of-3 propose/sign/execute (Phase 9) | Case A must use safeService, not anchorCredentialOnChain |

**Note:** `updateStudent()` in studentService.js already has a `TODO(Phase 11)` comment at line 318 and deliberately throws 409 for claimed students. This is the explicit hand-off point.

---

## Answered Research Questions

1. **Recovery session state machine — in-memory Map or MongoDB RecoverySession?**
   **Answer: In-memory Map.** This is an ESM Express backend with no multi-process deployment in scope. A MongoDB RecoverySession schema would require migration, adds complexity, and makes it harder to ensure DEK material never touches disk. Sessions are short-lived (< 30 min for a human-driven flow); losing sessions on restart is acceptable and safe (custodians just re-submit). The Map pattern is the laziest solution that works.

2. **How does custodian authentication work for /recovery/submit-share?**
   **Answer: Existing requireAuth + role-login JWT, no change.** The Phase 9 per-role login (`POST /api/admin/role-login` with `{ role, password }`) issues a JWT with `{ role }` payload. `requireAuth` verifies it and sets `req.user.role`. This is exactly what gates `/api/safe` and `/api/custodians`. Recovery uses the same pattern: the custodian logs in first (they already have the role-login page), then POSTs to `/recovery/submit-share` with their Bearer token. No new auth mechanism needed.

3. **Case B: how does the new public key arrive at the backend?**
   **Answer: Student submits it in `POST /recovery/initiate`.** The initiate endpoint accepts `{ studentId, operationType: "device-loss", newPubKey: "<compressed secp256k1 hex>" }`. The student generates a new keypair on-device (same flow as Phase 7 `ClaimCredentialScreen`) and the new pubKey is included when the admin initiates recovery on their behalf. The `newPubKey` is stored in the session map until reconstruction is complete.

4. **Case A: who triggers it, what attributes can change?**
   **Answer: Admin triggers initiation; custodian(s) submit shares.** The same 5 fields as `updateStudent()` (name, programmeLevel, discipline, batch, dob) can change. The frozen 7-attribute field set and order are enforced by `buildCredentialJson()` which `encryptAndPinCredential()` calls — there is no way to accidentally break the field set because the build function reads from the student doc, not from a free-form payload. `email` and `rollNo` are not updatable (same restriction as `updateStudent()`).

5. **Erasure: destroy 2 or all 3 shares?**
   **Answer: Destroy custodyShareB + custodyShareC ($unset both); keep custodyShareA.**
   Rationale: custodyShareA is the admin-accessible share. After erasure, reconstructDEK([shareA]) fails (< 2 shares → throws), satisfying ERASE-01. Keeping Share A allows an audit trail (the admin can see a share exists but cannot reconstruct without B or C, which are gone). Destroying all 3 is also acceptable and marginally cleaner — this is left as Claude's discretion and should be decided at plan time. Either satisfies the requirement.
   [ASSUMED — "keep A vs destroy all 3" is not locked in blueprint or REQUIREMENTS.md]

6. **Pinata unpin API endpoint?**
   **Answer: `DELETE https://api.pinata.cloud/pinning/unpin/{CID}` with `Authorization: Bearer ${PINATA_JWT}`.**
   Returns 200 on success. Use the existing `PINATA_JWT` env var and axios. Already used for pinToIPFS in credentialService.js — the same axios import and auth header pattern applies.
   [VERIFIED: Pinata official docs — https://docs.pinata.cloud/api-reference/endpoint/ipfs/unpin-file]

7. **RecoverySession MongoDB model needed?**
   **Answer: No.** See answer to Q1. An in-memory Map is sufficient, simpler, and correctly ensures the DEK never touches persistent storage.

---

## Open Questions

1. **Who can initiate a recovery session — any authenticated admin, or only specific roles?**
   - What we know: `/recovery/initiate` needs requireAuth (JWT). The current JWT roles are `acadadmin | registrar | dean`.
   - What's unclear: Should the Registrar or Dean be able to open a recovery session, or only the AcadAdmin (since Share A is automatically loaded from their DB)?
   - Recommendation: Allow any authenticated role to initiate (the initiate endpoint loads Share A from DB but doesn't require the AcadAdmin to be the HTTP caller). This matches the least-privilege principle — a Registrar could initiate a recovery and submit their own share B in a single session if no one else is available.

2. **Who can initiate erasure — any admin, or require 2-of-3?**
   - What we know: ERASE-01 says "a governed erasure operation" — the word "governed" implies more than one person.
   - What's unclear: Must erasure itself require 2-of-3 share submission (like a mini recovery session that then destroys), or can any authenticated admin trigger it unilaterally?
   - Recommendation: For simplicity (CLAUDE.md: prefer the laziest solution that works), make erasure a single authenticated-admin endpoint (no share submission required for erasure itself). The requirement says the *result* must be ≥2 shares destroyed; it doesn't mandate a multi-party ceremony for the destroy operation. This is a judgment call for the user to confirm.
   [ASSUMED — ERASE-01 does not specify who initiates erasure or whether it requires multi-party input]

3. **Case A: should the Case A flow wait for Safe execution before responding?**
   - What we know: Safe propose → sign → execute is async (the second official signs via the web portal separately).
   - What's unclear: Should `/recovery/submit-share` (at the 2-share threshold) return "complete" and let Safe signing happen out-of-band, or block until the Safe executes?
   - Recommendation: Return "complete" after re-encryption + re-pin + Safe proposal is created. The MongoDB state is correct immediately. The Safe execution is tracked via the existing `pendingRegistryAction` field (Phase 9 pattern). Blocking for Safe execution would hang the HTTP response indefinitely.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js inline smoke scripts (`.smoke.mjs`) — same pattern as Phases 10-01/02/03 |
| Config file | none — ad-hoc ESM scripts |
| Quick run command | `node privdId_admin/backend/recovery.smoke.mjs` |
| Full suite command | all `.smoke.mjs` scripts in sequence |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REC-01 | Session created; 2 shares → reconstruct; DEK wiped | unit/smoke | `node recovery.smoke.mjs` | No — Wave 0 |
| REC-01 | Unauthenticated submit-share → 401 | integration | `curl -X POST /recovery/submit-share` without token | Device checkpoint |
| REC-02 | Case B: dekEnvelopeCID updated; new pubkey stored | smoke | `node recovery.smoke.mjs` (Case B path) | No — Wave 0 |
| REC-03 | Case A: new ciphertextCID pinned; 7 attrs intact | smoke | `node recovery.smoke.mjs` (Case A path) | No — Wave 0 |
| REC-04 | Duplicate-role rejection (same role submits twice) | smoke | in recovery.smoke.mjs | No — Wave 0 |
| ERASE-01 | After erase: reconstructDEK([shareA]) throws | smoke | `node erasure.smoke.mjs` | No — Wave 0 |
| ERASE-02 | erased: true in DB; unpin attempted (best-effort) | smoke | `node erasure.smoke.mjs` | No — Wave 0 |

### Wave 0 Gaps
- `privdId_admin/backend/recovery.smoke.mjs` — covers REC-01 through REC-04
- `privdId_admin/backend/erasure.smoke.mjs` — covers ERASE-01 and ERASE-02
- Human checkpoint: end-to-end browser test (role-login → initiate → submit-share → verify dekEnvelopeCID updated / ciphertextCID updated)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | requireAuth (JWT Bearer) — same as Phase 9/10 |
| V3 Session Management | yes | In-memory Map with expiry; session deleted after use |
| V4 Access Control | yes | Role check: reject duplicate-role share submission |
| V5 Input Validation | yes | shareHex must be a valid hex string; studentId must exist in DB |
| V6 Cryptography | yes — inherit from primitives | reconstructDEK (shamir.js) + wrapDEK (ecies.js) + encryptAndPinCredential — never hand-roll |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Same custodian submits share twice to fake 2-of-3 | Elevation of Privilege | `session.shares.some(s => s.role === req.user.role)` → 409 reject |
| Unauthenticated share submission | Spoofing | `requireAuth` JWT gate on the entire router |
| DEK retained in memory after operation | Information Disclosure | `dek.fill(0)` in `finally` block; session deleted immediately |
| Erasure soft-failure: share $unset fails mid-write | Tampering | Use `findByIdAndUpdate` (atomic); only attempt Pinata unpin AFTER DB write succeeds |
| Reconstructing DEK from garbage (1 share) | Information Disclosure | `reconstructDEK()` throws on < 2 shares; additionally validate buffer length (already in shamir.js) |
| Case A bypassing Safe governance (direct chain write) | Tampering / Elevation | Use `safeService.relayProposal()`, not `anchorCredentialOnChain()` |
| Recovery session left open indefinitely | Denial of Service | Session TTL (30 min expiry); check on every `getSession()` call |

---

## Sources

### Primary (HIGH confidence)
- Live codebase — `crypto/shamir.js`, `crypto/rsaShare.js`, `crypto/ecies.js`, `crypto/aesgcm.js`, `services/credentialService.js`, `services/studentService.js`, `middleware/requireAuth.js`, `models/Student.js`, `controllers/adminController.js`, `app.js`, `routes/custodianRoutes.js`
- `docs/CLAUDE_CODE_BLUEPRINT.md` §E6, §7 — operational case sequences (Cases A, B, C)
- `privdId_admin/backend/package.json` — installed package versions
- Pinata REST API docs — `DELETE https://api.pinata.cloud/pinning/unpin/{CID}` [CITED: https://docs.pinata.cloud/api-reference/endpoint/ipfs/unpin-file]

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` — accumulated decisions D-03/D-04/D-05/D-09/D-10
- `.planning/REQUIREMENTS.md` — REC-01 through ERASE-02 text
- `.planning/ROADMAP.md` — Phase 11 success criteria

### Tertiary (LOW confidence)
- Session TTL value (30 minutes) — [ASSUMED]; reasonable default for human-custodian ceremony
- "Keep custodyShareA vs destroy all 3" — [ASSUMED]; either satisfies ERASE-01

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Session TTL of 30 minutes is appropriate for a human-custodian 2-of-3 ceremony | Pattern 1, Open Q1 | Too short: custodians time out before submitting; too long: orphaned sessions accumulate |
| A2 | Any authenticated role can initiate a recovery session | Open Q1 | If only AcadAdmin should initiate, the controller needs an extra role check |
| A3 | Erasure requires only single-admin auth (not 2-of-3 ceremony) | Open Q2 | If erasure must itself be 2-of-3 governed, it needs its own share-submission session |
| A4 | custodyShareA is kept (not $unset) after erasure | Open Q5 answers section | Cosmetically cleaner to destroy all 3; functionally equivalent either way |
| A5 | Case A responds "complete" after propose, not after Safe execute | Open Q3 | If the UX requires waiting for execution, the endpoint must poll or use a webhook |

**If this table is empty:** Not applicable — 5 assumptions flagged above require user confirmation at plan time.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all libraries verified in package.json
- Architecture patterns: HIGH — all primitives verified in live source files
- Session state design: HIGH — single-process Express, in-memory Map is the correct pattern
- Pitfalls: HIGH — most derived from existing code comments (shamir.js WARNING, updateStudent TODO, ecies.js Rule 1 bug history)
- Open questions: MEDIUM — 3 of 5 are policy/UX decisions that require user input

**Research date:** 2026-06-23
**Valid until:** Phase 11 completion (stable codebase; no fast-moving dependencies)
