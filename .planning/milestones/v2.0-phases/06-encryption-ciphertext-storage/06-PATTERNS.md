# Phase 6: Encryption & Ciphertext Storage - Pattern Map

**Mapped:** 2026-06-19
**Files analyzed:** 6 (1 new, 5 modified)
**Analogs found:** 6 / 6

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `privdId_admin/backend/crypto/aesgcm.js` (NEW) | utility (crypto module) | transform | `privdId_admin/backend/utils/identityCommitment.js` | role-match (pure-function crypto utility wrapped in `timed()`) |
| `privdId_admin/backend/services/credentialService.js` | service | request-response (HTTP POST to Pinata) + transform | itself (existing `pinToIPFS`/`issueCredentialOnChain`) | exact (modify in place) |
| `privdId_admin/backend/services/studentService.js` | service | CRUD | itself (existing `createStudent`/`insertBulkStudents`/`updateStudent`) | exact (modify in place) |
| `privdId_admin/backend/models/Student.js` | model | CRUD (schema) | itself (existing Mongoose schema) | exact (modify in place) |
| `zkp-backend/server.js` | route/controller | request-response | itself (existing `/credential-info` handler) | exact (mechanical rename only) |
| `digital-app/screens/VerifyProof.js` | component | request-response (render registry data) | itself (existing JSX block) | exact (mechanical rename only) |

All six files are either a brand-new small utility module or in-place modifications of files already serving the exact same role — this phase has no role gaps. The new file (`aesgcm.js`) is structurally closest to `identityCommitment.js`: both are dependency-light crypto/math utility modules, both wrap their core op in `timed()`, both export multiple pure functions consumed by `studentService.js`/`credentialService.js`.

## Pattern Assignments

### `privdId_admin/backend/crypto/aesgcm.js` (NEW — utility, transform)

**Analog:** `privdId_admin/backend/utils/identityCommitment.js` (for `timed()`-wrapping convention) + `privdId_admin/backend/utils/timing.js` (the wrapper itself)

**Imports pattern** (`identityCommitment.js` lines 26-28):
```javascript
import { buildPoseidon } from "circomlibjs";
import crypto from "crypto";
import { timed } from "./timing.js";
```
For `aesgcm.js`, mirror this exact style — relative import of `timed` from the sibling `utils/timing.js` (note: `crypto/aesgcm.js` is one directory level above `utils/`, so the import path is `../utils/timing.js`, not `./timing.js`):
```javascript
import crypto from "crypto";
import { timed } from "../utils/timing.js";
```

**`timed()` wrapper convention** (`timing.js` lines 16-22, consumed at `identityCommitment.js` lines 185-186):
```javascript
// timing.js — the wrapper signature/behavior to target
export async function timed(label, fn) {
  const t0 = performance.now();
  const out = await fn();
  const seconds = (performance.now() - t0) / 1000;
  console.log(`[perf] ${label}: ${seconds.toFixed(3)} s`);
  return { out, seconds };
}

// identityCommitment.js — call-site convention to copy verbatim for encryptCredential
export async function computeMerkleRoot(attrs, salts) {
  if (attrs.length !== 7) {
    throw new Error(`computeMerkleRoot: expected 7 attrs, got ${attrs.length}`);
  }
  // ... input guards BEFORE the timed() call, not inside it ...
  const { out: root } = await timed("computeMerkleRoot", async () => {
    // ... core work ...
  });
  return root;
}
```
Apply identically to `encryptCredential`: validate `dek` length (32 bytes) before entering `timed(...)`, then return only `out` (unwrap the `{ out, seconds }` tuple) so callers in `credentialService.js` get the bare blob, matching how `computeMerkleRoot` returns the bare `root` string, not `{ out, seconds }`.

**Core pattern — module shape** (no direct analog has AES-GCM; this is genuinely new crypto logic, but the *module organization* — multiple named pure-function exports, no class, no shared mutable state — directly mirrors `identityCommitment.js`'s `hashToField()` / `generateSalts()` / `computeMerkleRoot()` triplet):
```javascript
// generateSalts() in identityCommitment.js is the closest sibling pattern for
// "generate cryptographically random material" — confirms crypto.randomBytes
// is already the project's established CSPRNG choice (not Math.random, not a new package)
export function generateSalts(count) {
  const salts = [];
  for (let i = 0; i < count; i++) {
    salts.push(BigInt('0x' + crypto.randomBytes(31).toString('hex')).toString());
  }
  return salts;
}
```
Use `crypto.randomBytes(32)` for `generateDEK()` and `crypto.randomBytes(12)` for the IV inside `encryptCredential()` — same `crypto` import, same CSPRNG call already proven safe in this codebase.

**Error handling pattern**: No try/catch inside the crypto module itself — `identityCommitment.js`'s `computeMerkleRoot` throws plain `Error` for invariant violations (length checks) and lets the caller's try/catch (in `studentService.js`) handle it. Mirror this: `encryptCredential`/`decryptCredential` throw on malformed input/auth-tag mismatch; do not swallow errors inside the crypto module.

---

### `privdId_admin/backend/services/credentialService.js` (service, request-response + transform)

**Analog:** itself — modify `issueCredentialOnChain()` in place; `pinToIPFS()` and `anchorOnChain()` are reused verbatim.

**Imports pattern to add** (current lines 1-5):
```javascript
import axios from 'axios';
import { ethers } from 'ethers';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
```
Add: `import { encryptCredential } from '../crypto/aesgcm.js';`

**Existing `pinToIPFS()` pattern — REUSE VERBATIM** (lines 17-32):
```javascript
async function pinToIPFS(credential) {
  const response = await axios.post(
    'https://api.pinata.cloud/pinning/pinJSONToIPFS',
    {
      pinataContent: credential,
      pinataMetadata: { name: `privid-credential-${credential.rollNo}` },
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.PINATA_JWT}`,
        'Content-Type': 'application/json',
      },
    }
  );
  return response.data.IpfsHash;
}
```
No changes needed to this function's internals — it already accepts an arbitrary JSON object (`credential` param). The encrypted blob `{iv, authTag, ciphertext}` is still valid JSON, so `pinToIPFS(encryptedBlob)` works unmodified. Per CONTEXT.md's discretion note, only the Pinata metadata `name` should change from `privid-credential-${rollNo}` to `privid-ciphertext-${rollNo}` to reflect the new content type — this requires either a second param or reusing `credential.rollNo` if the caller still passes `rollNo` alongside the blob (recommend passing `{ rollNo, blob }` or adding a second `pinName` arg).

**Current `issueCredentialOnChain()` — the function to modify** (lines 60-76):
```javascript
export async function issueCredentialOnChain(student) {
  const credential = {
    rollNo: student.rollNo,
    email: student.email,
    merkleRoot: student.merkleRoot,
    issuedAt: new Date().toISOString(),
    issuer: 'PrivdID — IIITDM Jabalpur',
    type: 'StudentIdentityCredential',
    version: '2.0',
  };

  const cid = await pinToIPFS(credential);
  const { txHash, blockNumber } = await anchorOnChain(student.rollNo, cid, student.merkleRoot);

  console.log(`[credential] Anchored ${student.rollNo} → IPFS: ${cid} | Tx: ${txHash}`);
  return { cid, txHash, blockNumber };
}
```
This is the exact integration point named in CONTEXT.md/RESEARCH.md — build the full §E3.2 JSON (add `name`, `dobInt`, `programmeLevel`, `discipline`, `batch`, `salts`), accept/generate the `dek`, call `encryptCredential(json, dek)`, pin the resulting blob instead of the plaintext `credential` object, and return `dek` alongside `{cid, txHash, blockNumber}` so `studentService.js` can persist it. `anchorOnChain()` itself (lines 34-46) is unchanged — still anchors `merkleRoot` + CID.

**Logging discipline to preserve** (line 74, and `revokeCredentialOnChain` line 56): only `rollNo`, `cid`/`txHash` are logged — never log `dek`, the plaintext credential JSON, or the full encrypted blob. Apply this same restraint to any new log lines added for the encrypt step.

---

### `privdId_admin/backend/services/studentService.js` (service, CRUD)

**Analog:** itself — modify `createStudent()`, `insertBulkStudents()`, `updateStudent()`, and `sanitizeStudent()` in place.

**`sanitizeStudent()` allowlist pattern — the D-02 enforcement point** (lines 43-62):
```javascript
export function sanitizeStudent(student) {
  return {
    id: student._id.toString(),
    name: student.name,
    email: student.email,
    rollNo: student.rollNo,
    programme: student.programme,
    contactNo: student.contactNo,
    dob: student.dob,
    hashedData: student.hashedData,
    emailSent: student.emailSent,
    emailSentAt: student.emailSentAt,
    createdAt: student.createdAt,
    ipfsCID: student.ipfsCID ?? null,
    onChainTxHash: student.onChainTxHash ?? null,
    onChainBlock: student.onChainBlock ?? null,
    revoked: student.revoked ?? false,
    revokedAt: student.revokedAt ?? null,
  };
}
```
This is already an explicit allowlist (safest pattern — new fields are excluded by default). Rename `ipfsCID` → `ciphertextCID` here (line 56). **Do NOT add a `dek` line** — its absence from this object IS the D-02 fix; no action needed beyond not adding it.

**`createStudent()` — first issuance, fresh DEK (D-06)** (lines 128-166, anchoring block at 148-161):
```javascript
// Anchor credential on IPFS + Sepolia — non-blocking, student is saved regardless
try {
  const { cid, txHash, blockNumber } = await issueCredentialOnChain({
    rollNo: student.rollNo,
    email: student.email,
    merkleRoot: student.merkleRoot,
  });
  student.ipfsCID = cid;
  student.onChainTxHash = txHash;
  student.onChainBlock = blockNumber;
  await student.save();
} catch (err) {
  console.error('[credential] On-chain anchoring failed for', student.rollNo, ':', err.message);
}
```
Preserve the non-blocking try/catch structure exactly. Pass the full student record (not just `rollNo`/`email`/`merkleRoot`) since `issueCredentialOnChain` now needs `name`, `dobInt`, `programmeLevel`, `discipline`, `batch`, `salts` too. Persist `student.dek = dek` (base64) alongside `student.ciphertextCID = cid` inside the try block — first issuance only.

**`insertBulkStudents()` — loop variant, same fresh-DEK policy** (lines 179-208, anchoring loop at 188-201):
```javascript
for (const student of insertedStudents) {
  try {
    const { cid, txHash, blockNumber } = await issueCredentialOnChain({
      rollNo: student.rollNo,
      email: student.email,
      merkleRoot: student.merkleRoot,
    });
    await Student.updateOne(
      { _id: student._id },
      { ipfsCID: cid, onChainTxHash: txHash, onChainBlock: blockNumber }
    );
  } catch (err) {
    console.error('[credential] On-chain anchoring failed for', student.rollNo, ':', err.message);
  }
}
```
Same pattern — rename `ipfsCID` to `ciphertextCID` in the `updateOne` patch object (line 197), and add `dek` to that same patch object (this call site uses `updateOne` directly instead of `.save()`, unlike the other two — preserve that asymmetry, just extend the patch object).

**`updateStudent()` — re-issuance, REUSE existing DEK (D-04)** (lines 210-287, anchoring block at 271-284):
```javascript
// Re-issue credential — new IPFS pin + overwrites on-chain CID for this rollNo
try {
  const { cid, txHash, blockNumber } = await issueCredentialOnChain({
    rollNo: student.rollNo,
    email: student.email,
    merkleRoot: student.merkleRoot,
  });
  student.ipfsCID = cid;
  student.onChainTxHash = txHash;
  student.onChainBlock = blockNumber;
  await student.save();
} catch (err) {
  console.error("[credential] Re-anchoring failed for", student.rollNo, ":", err.message);
}
```
Per RESEARCH.md Pitfall 3, make the reuse explicit and loud on failure: read `student.dek`, and if missing/null, throw/log loudly rather than silently falling back to a fresh `generateDEK()`. Rename `ipfsCID` → `ciphertextCID` (line 278).

**Shared field-set-drift risk (Pitfall 1)**: `createStudent` (lines 109-117) and `updateStudent` (lines 257-265) already duplicate the 7-element `attrs` array construction verbatim:
```javascript
const attrs = [
  await hashToField(normalizedStudent.name, CHUNK_COUNTS.name),
  await hashToField(normalizedStudent.rollNo, CHUNK_COUNTS.rollNo),
  String(normalizedStudent.dobInt),
  String(programmeLevelCode),
  String(disciplineCode),
  String(normalizedStudent.batch),
  await hashToField(normalizedStudent.email, CHUNK_COUNTS.email),
];
```
The new §E3.2 credential JSON has even more fields than this `attrs` array — CONTEXT.md flags centralizing this as in-scope discretion. RESEARCH.md recommends placing `buildCredentialJson(student)` in `credentialService.js` (next to `issueCredentialOnChain`), called identically from all 3 sites in `studentService.js`.

---

### `privdId_admin/backend/models/Student.js` (model, CRUD schema)

**Analog:** itself — extend the existing Mongoose schema in place.

**Field-definition pattern to copy** (lines 55-66, the `ipfsCID`/`onChainTxHash`/`onChainBlock` trio):
```javascript
ipfsCID: {
  type: String,
  default: null,
},
onChainTxHash: {
  type: String,
  default: null,
},
onChainBlock: {
  type: Number,
  default: null,
},
```
Rename `ipfsCID` → `ciphertextCID` (keep `type: String, default: null` — identical shape, just the key name changes). Add a new `dek` field using the exact same shape convention (`type: String, default: null`) — matches RESEARCH.md's Open Question 1 recommendation (base64 string, not Mongoose `Buffer` type) and matches how `salts` (also semantically binary) is stored as `[String]` elsewhere in this same schema (lines 96-100).

```javascript
dek: {
  type: String,
  default: null,
},
```

---

### `zkp-backend/server.js` (route/controller, request-response)

**Analog:** itself — mechanical rename only, no logic change.

**Current `/credential-info` handler — destructure + response shape** (lines 207-235, rename targets at 216, 218, 225, 228):
```javascript
app.post('/credential-info', async (req, res) => {
  const { pubHash } = req.body;
  if (!pubHash) {
    return res.status(400).json({ error: 'pubHash is required' });
  }
  try {
    const pubHashBytes32 = ethers.zeroPadValue(ethers.toBeHex(BigInt(pubHash)), 32);
    const [rollNo, ipfsCID, issuedAt, exists, revoked] = await registryContract.getCredentialByHash(pubHashBytes32);

    if (!exists || !ipfsCID) {
      return res.json({ found: false, message: 'Credential not found in registry' });
    }

    res.json({
      found: true,
      rollNo,
      ipfsCID,
      issuedAtMs: Number(issuedAt) * 1000,
      revoked,
      ipfsUrl: `https://gateway.pinata.cloud/ipfs/${ipfsCID}`,
      etherscanUrl: `https://sepolia.etherscan.io/address/${registryAddress}`,
    });
  } catch (err) {
    console.error('Credential info lookup failed:', err);
    res.status(500).json({ error: 'Registry lookup failed', details: err.message });
  }
});
```
This destructures the on-chain registry tuple positionally (the on-chain contract's struct/return order is unaffected by this phase — only the *off-chain JS variable name* `ipfsCID` needs renaming to `ciphertextCID` at all 4 occurrences: the destructure (216), the `!exists || !ipfsCID` guard (218), the response key (225), and the gateway URL interpolation (228). No change to the contract call itself, no change to error handling.

---

### `digital-app/screens/VerifyProof.js` (component, request-response render)

**Analog:** itself — mechanical rename only, no logic change.

**Current JSX block reading the registry response** (lines 226-231):
```javascript
{result.registry.found && !result.registry.revoked && (
  <>
    <Text style={styles.registryRow}>
      <Text style={styles.registryLabel}>IPFS CID:  </Text>
      <Text style={styles.registryValue}>{result.registry.ipfsCID?.slice(0, 20)}...</Text>
    </Text>
```
Rename `result.registry.ipfsCID` → `result.registry.ciphertextCID` (line 230) to match the renamed key now coming from `zkp-backend/server.js`'s `/credential-info` response. The display label text "IPFS CID:" can stay as-is (it's still a content identifier on IPFS — the rename is about the underlying field name for ciphertext-vs-plaintext clarity, not user-facing copy) or optionally be left to executor discretion; no other JSX/logic changes needed.

---

## Shared Patterns

### Benchmark wrapping (`timed()`)
**Source:** `privdId_admin/backend/utils/timing.js` (full file, 22 lines), consumed at `privdId_admin/backend/utils/identityCommitment.js` lines 185-186
**Apply to:** `crypto/aesgcm.js::encryptCredential()` (mandated by CLAUDE.md ground rule 5 — "every new crypto op prints seconds")
```javascript
export async function timed(label, fn) {
  const t0 = performance.now();
  const out = await fn();
  const seconds = (performance.now() - t0) / 1000;
  console.log(`[perf] ${label}: ${seconds.toFixed(3)} s`);
  return { out, seconds };
}
```
Call convention: `const { out } = await timed("encryptCredential", async () => { ... }); return out;` — unwrap before returning so callers never see the `{out, seconds}` tuple (matches `computeMerkleRoot`'s exact convention).

### Non-blocking anchor/encrypt try/catch
**Source:** `privdId_admin/backend/services/studentService.js` lines 148-161 (`createStudent`), 188-201 (`insertBulkStudents`), 271-284 (`updateStudent`)
**Apply to:** All 3 call sites — the encrypt+pin step must stay inside the existing try/catch so a Pinata/crypto failure never blocks the student record save.
```javascript
try {
  const { cid, txHash, blockNumber } = await issueCredentialOnChain(student /* + dek */);
  student.ciphertextCID = cid;
  student.dek = dek; // first issuance only
  student.onChainTxHash = txHash;
  student.onChainBlock = blockNumber;
  await student.save();
} catch (err) {
  console.error('[credential] On-chain anchoring failed for', student.rollNo, ':', err.message);
}
```

### Sanitization allowlist (`sanitizeStudent()`)
**Source:** `privdId_admin/backend/services/studentService.js` lines 43-62
**Apply to:** No code change required beyond the `ipfsCID`→`ciphertextCID` rename — the allowlist's existing structure means `dek` is excluded by default. This is the D-02 enforcement point; confirm no other `res.json()` path in `studentController.js` bypasses `sanitizeStudent()` when adding test/manual verification for this phase.

### Restrained logging (never log secrets)
**Source:** `privdId_admin/backend/services/credentialService.js` line 74 (`console.log('[credential] Anchored ...')`), line 56 (`console.log('[credential] Revoked ...')`); `studentService.js` lines 160, 200, 283 (`console.error(...)`)
**Apply to:** Any new log statement added around the encrypt/DEK-generate step — log only `rollNo`, `cid`, `txHash`, `err.message`. Never log `dek`, the plaintext §E3.2 JSON, or the full `{iv, authTag, ciphertext}` blob.

### CSPRNG via `crypto.randomBytes` (never `Math.random`)
**Source:** `privdId_admin/backend/utils/identityCommitment.js` `generateSalts()` (uses `crypto.randomBytes(31)`) — confirms the project's established pattern for secure random generation
**Apply to:** `aesgcm.js::generateDEK()` (`crypto.randomBytes(32)`) and the IV inside `encryptCredential()` (`crypto.randomBytes(12)`).

## No Analog Found

None. All 6 files in scope have an exact or near-exact analog already in the codebase — this phase is a clean refactor/extension of existing patterns, not new architecture.

## Metadata

**Analog search scope:** `privdId_admin/backend/` (services, models, utils), `zkp-backend/` (server.js), `digital-app/screens/` (VerifyProof.js)
**Files scanned:** `credentialService.js`, `studentService.js`, `Student.js`, `identityCommitment.js`, `timing.js`, `server.js` (zkp-backend), `VerifyProof.js`, plus graphify-traversed neighbors (`studentController.js`, `appError.js`, `poseidonHash.js`, `enumCodes.js`) for context confirmation
**Pattern extraction date:** 2026-06-19
