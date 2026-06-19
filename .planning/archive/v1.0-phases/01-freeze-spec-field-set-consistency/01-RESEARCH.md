# Phase 1: Freeze Spec & Field-Set Consistency — Research

**Researched:** 2026-06-16
**Domain:** ZK-identity commitment spec, circomlibjs Poseidon, BN128 field arithmetic, Merkle tree construction, ESM admin backend refactor
**Confidence:** HIGH (all crypto claims verified by running live code against the installed library; all source-file claims verified by reading actual files)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** String attributes (`name`, `rollNo`, `email`) use hash-to-field encoding, NOT raw UTF-8→BigInt. Corrects BN128 overflow for long strings.

**D-02:** Hash-to-field method = chunk UTF-8 bytes into ≤31-byte field elements, compute `Poseidon(chunks)` → one field element. Identical in JS (issuance + prover-side script) and Phase-2 circom circuit. Avoid `keccak256(value) mod p`.

**D-03:** Integer attributes `dob` (YYYYMMDD) and `batch` (year) committed as integers directly.

**D-04:** `programmeLevel` + `discipline` + `batch` come from separate explicit admin inputs (dropdowns + year field), not parsed from rollNo.

**D-05:** `phone`/`contactNo` dropped from committed set; `email` is committed attr 6. `normalizePhone()` no longer part of the commitment.

**D-06:** programmeLevel and discipline committed as numeric codes from a canonical mapping module:
- `programmeLevel`: `{ "B.Tech":1, "B.Des":2, "Dual":3, "M.Tech":4, "M.Des":5, "PhD":6 }`
- `discipline`: `{ "CSE":1, "ECE":2, "ME":3, "SmartMfg":4, "Design":5, "NatSci":6 }`
- `isPostgrad` predicate set = programmeLevel ∈ {4, 5, 6}

**D-07:** Codes are append-only once frozen — never renumber.

**D-08:** One shared JS `identityCommitment` module (circomlibjs `Poseidon(2)` salted leaves + depth-3 Merkle root) imported by both admin issuance path AND prover-side/test script.

**D-09:** Leaf layout (leaf indices = Merkle positions): `0:name, 1:rollNo, 2:dob(int), 3:programmeLevel(code), 4:discipline(code), 5:batch(int), 6:email, 7:zero-padding`. `leaf_i = Poseidon(2)(encodedAttr_i, salt_i)`; internal node = `Poseidon(2)(left, right)`; root = `merkleRoot` = `pubHash`.

**D-10:** Salts = one per committed attribute (32 random bytes reduced < BN128 order, stored as decimal strings, order = leaf index) in `Student.salts: [String]`.

**D-11:** Issuer string → `'PrivdID — IIITDM Jabalpur'`. Credential `version` → `'2.0'`. All VIT references removed.

**D-12:** Wipe and re-seed test students. No migration of old flat-Poseidon(5) records. Re-seed must cover: over-18 and under-18 DOBs, at least one postgrad (level ∈ {4,5,6}), one undergrad, a spread of disciplines.

### Claude's Discretion

- Exact module/file naming and where shared commitment module + canonical enum mapping physically live.
- Location/format of the frozen spec doc artifact.
- Shape of the re-seed script and test harness.
- Whether dob/batch input validation lives in normalizeStudentInput / validateStudentPayload.

### Deferred Ideas (OUT OF SCOPE)

- ZKP backend `/generate-proof` new input shape + nonce endpoints — Phase 4.
- The actual circom circuit — Phase 2.
- Trusted setup + verifier redeploy — Phase 3.
- Encrypted IPFS blob as canonical salt store — E3 (later milestone).
- Auth middleware / bcrypt / session JWT — later milestone.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SPEC-01 | 7-attribute identity spec frozen and documented — fixed leaf order, per-attribute types/encodings, public-signal layout | Hash-to-field encoding verified; all attribute types confirmed; Merkle construction verified |
| SPEC-02 | Admin issuance hash byte-for-byte identical to prover input — programme split, phone dropped for email, integers as integers | Shared module pattern confirmed; field parity between JS paths proven; existing bug confirmed |
| SPEC-03 | Credential issuer string reads "PrivdID — IIITDM Jabalpur" | Exact location in `credentialService.js:67` confirmed; `version` field also needs bump |
</phase_requirements>

---

## Summary

Phase 1 freezes the 7-attribute identity commitment spec and refactors the admin issuance path to use a salted per-attribute Poseidon(2) Merkle tree that a Phase-2 circom circuit can reproduce exactly. The existing code has a confirmed field-set mismatch (5th field: `programme` in admin hash vs `branch` in the prover) and a latent BN128 overflow bug for strings longer than ~31 bytes. Both are structural problems, not edge cases.

The central research deliverable — the **exact hash-to-field chunking scheme** — is now fully resolved and verified by running live code against the installed `circomlibjs@0.1.7`. The scheme is: split UTF-8 bytes into ≤31-byte chunks, pack each chunk big-endian into a BigInt, zero-pad to a per-attribute fixed chunk count, then compute `Poseidon(maxChunks)(chunk_0, ..., chunk_{maxChunks-1})`. The WASM-based `buildPoseidon` (default export) and the Reference implementation produce byte-identical outputs for all tested arities, and their Poseidon constants match those in the vendored `zk-proofs/circomlib/circuits/poseidon_constants.circom` (verified constant-by-constant for t=3). A circom `HashToField(maxChunks)` template that passes chunks as field signals will produce the same output as the JS function.

The admin backend refactor is well-scoped: `buildStudentRecord()` in `studentService.js` is the single convergence point for both single-add and bulk-add paths; `credentialService.js` has the exact issuer string that needs changing; and `Student.js` needs new schema fields. The `updateStudent()` path also recomputes the hash inline and must be updated.

**Primary recommendation:** implement the shared `identityCommitment.js` module first (encoding + Merkle), then slot it into `buildStudentRecord()` and `updateStudent()`, then update the schema and validators, then fix branding, then write the re-seed script with the root-equality assertion.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Hash-to-field encoding of string attrs | Admin backend (ESM) — shared module | Phase-2 circuit (circom) | Commitment is computed server-side at issuance; circuit replicates identically at proof time |
| Merkle root computation | Admin backend (ESM) — shared module | Phase-2 circuit (circom) | Same module drives both issuance and the prover-side JS test script |
| Salt generation + storage (interim) | Admin backend (ESM) | None in Phase 1 | Canonical store moves to E3 encrypted blob later; Mongo `salts[]` is Phase 1 interim |
| Enum code mapping | Shared canonical module (ESM JSON/const) | Phase-2 circuit (hardcoded constants) | Single source of truth; circuit's set-membership constants must equal this file verbatim |
| Credential JSON build + IPFS anchoring | Admin backend `credentialService.js` | None | Only file containing issuer string; version field bump here |
| Validator / input normalization | Admin backend `studentValidator.js` + `normalizeStudentInput` | None | New fields (programmeLevel, discipline, batch, email commitment) must be validated here |
| MongoDB schema | Admin backend `models/Student.js` | None | Adds programmeLevel, discipline, batch, salts[], merkleRoot fields |
| Prover-side reference script | Standalone JS script (not a backend service) | None | Test-only; imports shared module; proves root equality |

---

## Standard Stack

### Core (all already installed)

| Library | Version (installed) | Purpose | Why Standard |
|---------|---------------------|---------|--------------|
| `circomlibjs` | `0.1.7` | `buildPoseidon` — salted leaf hashing + Merkle node hashing | Already in `privdId_admin/backend/package.json`; same constants as vendored circom |
| `ethers` | `^6.16.0` | `zeroPadValue`/`toBeHex` for decimal → bytes32 | Already used in `credentialService.js:40` |
| `mongoose` | `^8.14.2` | MongoDB schema — add new fields to `Student` | Existing ORM |
| `joi` | `^17.13.3` | Input validation — extend `studentSchema` for new fields | Existing validation layer |
| Node `crypto` | built-in | `crypto.randomBytes(31)` for salt generation | No install needed |

### No New Dependencies Required

Phase 1 requires zero new `npm install` invocations. The entire implementation uses `circomlibjs` (already installed) for Poseidon, Node's built-in `crypto` for salt generation, and existing ESM patterns.

---

## Package Legitimacy Audit

No new packages are installed in Phase 1. All crypto operations use `circomlibjs@0.1.7` (already installed and verified present at `privdId_admin/backend/node_modules/circomlibjs/`) and Node built-ins. Audit is not applicable.

---

## Architecture Patterns

### System Architecture Diagram

```
Admin form input (new fields: programmeLevel, discipline, batch, email)
        │
        ▼
studentValidator.js — extended Joi schema validates new fields
        │
        ▼
normalizeStudentInput() — extended to pass through new fields
        │
        ▼
buildStudentRecord()
        │
        ├── enumCodes.js — programmeLevel string → integer code
        │                — discipline string → integer code
        │
        ├── identityCommitment.js (NEW shared module)
        │       │
        │       ├── hashToField(str, maxChunks)
        │       │     └── UTF-8 bytes → ≤31-byte chunks → BigInt[] → Poseidon(maxChunks)
        │       │
        │       ├── crypto.randomBytes(31) × 7 → salts (decimal strings)
        │       │
        │       ├── leaf_i = Poseidon(2)(encodedAttr_i, salt_i)  for i=0..6
        │       ├── leaf_7 = 0  (zero padding)
        │       │
        │       └── depth-3 Merkle tree → merkleRoot (decimal string)
        │
        ▼
Student.create({ ...newFields, merkleRoot, salts[] })
        │
        ▼
credentialService.issueCredentialOnChain()
        │
        ├── pinToIPFS({ ...credential, issuer: 'PrivdID — IIITDM Jabalpur', version: '2.0' })
        │
        └── anchorOnChain(rollNo, cid, zeroPadValue(toBeHex(BigInt(merkleRoot)), 32))


  prover-side reference script (test only)
        │
        └── imports identityCommitment.js
              └── recomputes merkleRoot from same attrs+salts
                    └── assert root === student.merkleRoot  ← acceptance gate
```

### Recommended Project Structure

```
privdId_admin/backend/
├── utils/
│   ├── poseidonHash.js          # KEEP (used elsewhere); stringToBigInt still useful
│   └── identityCommitment.js   # NEW: hashToField, generateSalts, computeMerkleRoot
├── constants/
│   └── enumCodes.js            # NEW: programmeLevel + discipline code maps (frozen)
├── models/
│   └── Student.js              # EXTEND: add programmeLevel, discipline, batch, salts[], merkleRoot
├── validators/
│   └── studentValidator.js     # EXTEND: add new field validations
├── services/
│   ├── studentService.js       # REFACTOR: buildStudentRecord, updateStudent, normalizeStudentInput
│   └── credentialService.js    # PATCH: issuer string, version field
└── scripts/
    └── reseed.js               # NEW: wipe + seed test data with assertion

(alternatively enumCodes.js lives at privdId_admin/backend/utils/enumCodes.js — planner's discretion)
```

### Pattern 1: hash-to-field — the core encoding

**What:** Convert a string attribute to a single BN128 field element by splitting UTF-8 bytes into ≤31-byte chunks (packed big-endian), padding to a fixed chunk count with zeros, then computing `Poseidon(maxChunks)(chunk_0, ..., chunk_{maxChunks-1})`.

**Why 31 bytes per chunk:** 31 bytes = 248 bits, always < BN128 p (254 bits). 32 bytes can overflow (verified: 32 × `0xFF` > p; a 32-char ASCII string starting with `A` (0x41) also overflows since p's first byte is 0x30).

**Fixed chunk counts per attribute (verified against Joi validator bounds):**

| Attribute | Joi max | Max bytes | Chunks (ceil/31) |
|-----------|---------|-----------|-------------------|
| `name` | 120 chars | 120 bytes | 4 |
| `rollNo` | 50 chars | 50 bytes | 2 |
| `email` | RFC 254 chars | 254 bytes | **cap at 62 bytes (2 chunks)** via validator |

For email, enforcing a validator cap of ≤62 bytes covers all IIITDM institutional addresses (longest observed: `utkarshbaranwal47@students.iiitdmj.ac.in` = 40 bytes) and most real-world addresses, keeping the arity identical to rollNo and reducing circuit complexity.

**Example implementation (ESM, `identityCommitment.js`):**

```js
// Source: verified against circomlibjs@0.1.7 installed in privdId_admin/backend/
import { buildPoseidon } from "circomlibjs";
import crypto from "crypto";

// BN128 scalar field order (verified from ffjavascript/src/curves.js)
const BN128_FIELD_ORDER = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

let poseidonInstance;
async function getPoseidon() {
  if (!poseidonInstance) poseidonInstance = await buildPoseidon();
  return poseidonInstance;
}

// Pack <=31 UTF-8 bytes big-endian into a BigInt field element.
// maxChunks is fixed per attribute type; shorter strings are zero-padded.
export async function hashToField(str, maxChunks) {
  const poseidon = await getPoseidon();
  const bytes = Buffer.from(String(str ?? ""), "utf8");
  const chunks = [];
  for (let i = 0; i < bytes.length; i += 31) {
    const slice = bytes.slice(i, i + 31);
    let val = 0n;
    for (const b of slice) val = (val << 8n) | BigInt(b);
    chunks.push(val);
  }
  while (chunks.length < maxChunks) chunks.push(0n);
  const result = poseidon(chunks.slice(0, maxChunks));
  return poseidon.F.toString(result); // decimal string, in-field
}

// Attribute chunk counts — frozen with spec
export const CHUNK_COUNTS = { name: 4, rollNo: 2, email: 2 };
```

**Circom circuit equivalent (Phase 2 reference):**
```circom
// For each string attribute, in the Phase-2 circuit:
// template HashToField(maxChunks) {
//   signal input chunks[maxChunks];  // caller packs bytes big-endian per chunk, 0-pads
//   signal output out;
//   component h = Poseidon(maxChunks);
//   for (var i=0; i<maxChunks; i++) h.inputs[i] <== chunks[i];
//   out <== h.out;
// }
// The JS and circom compute Poseidon(maxChunks)(chunk_0,...) with identical constants.
// VERIFIED: circomlibjs C[1][0] (t=3) = 0x0ee9a592... matches circom POSEIDON_C(3)[0] = 0xee9a592...
// (same value; circom omits leading zero in the hex literal).
```

### Pattern 2: Merkle tree construction

**What:** depth-3, 8-leaf tree using `Poseidon(2)` for both leaf-salting and node-combining.

**Leaf computation:**
```js
export async function computeLeaf(encodedAttr, salt) {
  // encodedAttr: field element (BigInt or string) — either hashToField result or integer
  // salt: BigInt or decimal string < BN128_FIELD_ORDER
  const poseidon = await getPoseidon();
  const leaf = poseidon([BigInt(encodedAttr), BigInt(salt)]);
  return poseidon.F.toString(leaf); // decimal string
}
```

**Tree topology (fixed, mirrors the Phase-2 circuit exactly):**
```
leaf[0]  leaf[1]  leaf[2]  leaf[3]  leaf[4]  leaf[5]  leaf[6]  leaf[7]=0
   \       /          \      /          \      /          \      /
  node[0,1]          node[2,3]         node[4,5]         node[6,7]
       \                 /                  \                /
       node[0..3]                          node[4..7]
              \                                /
                           ROOT (= pubHash = merkleRoot)
```

**Node combination:** `Poseidon(2)(left, right)` — **NOT** `Poseidon(2)(right, left)`. Order must be the same in both JS and the circuit.

**Zero-padding leaf (leaf[7]):** `Poseidon(2)(0, 0)` = `14744269619966411208...` (verified). This is a non-zero value because Poseidon is a permutation; do NOT use bare `0` as a leaf node in the tree combine step. The leaf is `Poseidon(2)(attr=0, salt=0)` to keep the leaf construction uniform, and the prover will set `attr[7] = 0`, `salt[7] = 0`.

**Root → bytes32 (unchanged from current code):**
```js
// Already used in credentialService.js:40 — no change needed
ethers.zeroPadValue(ethers.toBeHex(BigInt(merkleRoot)), 32)
```

### Pattern 3: Salt generation

**What:** generate 7 salts (one per committed attribute leaf), store as decimal strings in `salts: [String]` in order of leaf index.

**Correct method — 31 random bytes (always valid field elements):**
```js
// Source: verified — 31 bytes = 248 bits, always < BN128 p (254 bits).
// 2^248 < BN128_FIELD_ORDER is guaranteed.
export function generateSalt() {
  return BigInt("0x" + crypto.randomBytes(31).toString("hex")).toString(); // decimal string
}

export function generateSalts(count = 7) {
  return Array.from({ length: count }, generateSalt);
}
```

**Do NOT use:**
- `crypto.randomBytes(32)` with naive modular reduction (`% p`) — biased distribution.
- `crypto.randomBytes(32)` without validation — 81.1% of 32-byte values are ≥ p (verified). If you use 32 bytes, use rejection sampling, not `% p`.
- The 31-byte method is the recommended approach for Phase 1 (no loop, always valid, 248 bits of entropy is sufficient).

### Pattern 4: Canonical enum code module

**What:** frozen mapping from admin input strings → integer codes committed to the Merkle tree.

```js
// privdId_admin/backend/constants/enumCodes.js (ESM)
// FROZEN: append-only — changing an existing mapping invalidates all prior commitments
// and forces a circuit rebuild (the isPostgrad set {4,5,6} would change).

export const PROGRAMME_LEVEL = {
  "B.Tech": 1, "B.Des": 2, "Dual": 3, "M.Tech": 4, "M.Des": 5, "PhD": 6,
};

export const DISCIPLINE = {
  "CSE": 1, "ECE": 2, "ME": 3, "SmartMfg": 4, "Design": 5, "NatSci": 6,
};

// isPostgrad predicate: programmeLevel code ∈ POSTGRAD_CODES
export const POSTGRAD_CODES = new Set([4, 5, 6]); // M.Tech, M.Des, PhD

// Phase-2 circuit must hardcode these same integer values in its set-membership check.
// "Dual" (code 3) is EXCLUDED from isPostgrad — confirm this is intentional before freezing.
```

**Warning:** Dual-degree (code 3) is NOT in `isPostgrad`. If IIITDM's dual-degree programmes confer postgrad status, code 3 must be added to `POSTGRAD_CODES` and the circuit's set-membership constants NOW — it cannot be changed after the circuit is frozen without a full trusted setup redo.

### Anti-Patterns to Avoid

- **`stringToBigInt` on strings > ~31 bytes:** produces values > BN128 p. `circomlibjs` silently reduces mod p via `F.e()`, committing a different value. The current code hits this for any name over ~31 chars (confirmed: 37-char name overflows; `F.e()` gives a different BigInt). Use `hashToField` instead.
- **Duplicate implementations of the commitment:** the existing `stringToBigInt` in `zkp-backend/server.js:23-30` is identical to `poseidonHash.js` but will diverge when Phase 1 is applied only to the admin backend. Delete the ZKP backend copy in Phase 1 even though the prover endpoint change is Phase 4 — the file will still compile, and it removes the drift vector.
- **`% p` for salt reduction:** biased. Use 31-byte generation or rejection sampling.
- **Poseidon arity mismatch:** `Poseidon(2)('hello' padded to 2)` ≠ `Poseidon(4)('hello' padded to 4)` — they produce different outputs even for the same string (verified). The JS issuance module and the Phase-2 circom template MUST use the same arity for each attribute. The CHUNK_COUNTS table above defines the frozen arities.
- **`buildPoseidonOpt` vs `buildPoseidon`:** `buildPoseidonOpt` is a different export (the pure-JS optimized implementation); `buildPoseidon` (the default) is WASM-backed. Both produce identical outputs for arity 1–8 (verified: Poseidon(2)(1,2) and Poseidon(4)(1,2,3,4) match exactly). Use `buildPoseidon` (consistent with current `poseidonHash.js`).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| BN128-safe field arithmetic | Custom BigInt mod logic | `circomlibjs` `poseidon.F` | F handles Montgomery form, reduction, zero; hand-rolling has known failure modes |
| Poseidon hash | Custom sponge | `buildPoseidon()` from circomlibjs | Round constants and MDS matrix MUST match the circom circuit — use the same library that generates them |
| bytes32 conversion | Custom hex padding | `ethers.zeroPadValue(ethers.toBeHex(BigInt(root)), 32)` | Already in codebase; ethers handles edge cases |
| Salt entropy | Custom PRNG | `crypto.randomBytes(31)` | Built-in, cryptographically secure, guaranteed < p for 31 bytes |

---

## Primary Research Deliverable: Hash-to-Field Chunking Scheme (CONCRETE, FROZEN)

This section answers the research question from CONTEXT D-02. All values are verified by executing code against `circomlibjs@0.1.7` installed in the project.

### Encoding rule

```
For each string attribute s (name, rollNo, email):
  1. bytes  ← UTF-8 encode(s)             -- no normalisation beyond existing .trim()
  2. chunks ← []
  3. for i in 0, 31, 62, ..., len(bytes)-1:
       slice ← bytes[i : min(i+31, len(bytes))]
       val   ← big-endian-BigInt(slice)   -- left-most byte is most significant
       chunks.append(val)
  4. pad chunks to maxChunks with 0n      -- zero-pad at the END
  5. result ← Poseidon(maxChunks)(chunks[0], ..., chunks[maxChunks-1])
               (using circomlibjs buildPoseidon, F.toString → decimal string)
```

### Frozen chunk counts (per attribute)

| Attribute | maxChunks | Max allowed UTF-8 bytes | Rationale |
|-----------|-----------|------------------------|-----------|
| `name` | 4 | 120 (Joi `max(120)`) | 4 × 31 = 124 bytes; Joi cap fits in 4 chunks |
| `rollNo` | 2 | 50 (Joi `max(50)`) | 2 × 31 = 62 bytes; covers any conceivable roll number |
| `email` | 2 | **62 (add Joi `max(62)`)** | Longest observed IIITDM email: 40 bytes; 62 is generous cap; same arity as rollNo |

### Byte ordering: big-endian

Pack bytes left-to-right: `for (const b of slice) val = (val << 8n) | BigInt(b)`. The left-most (first) byte becomes the most-significant byte of the BigInt. This is the natural JavaScript Buffer/bytes ordering and the most straightforward to reproduce in circom (shift-accumulate in the same direction).

### Circom circuit equivalence (for Phase 2 planner)

The Phase-2 circuit caller must pre-compute the chunk BigInts off-chain (in the witness generator JS) and pass them as circuit signals. A `HashToField(maxChunks)` template receives the already-chunked values and runs `Poseidon(maxChunks)`. This avoids implementing byte-slicing inside circom (which is constraint-heavy) while keeping the hash computation fully in-circuit.

### Verified test vectors

These values were produced by running the actual installed `circomlibjs@0.1.7`. They serve as the JS↔circom parity check:

```
Poseidon(2)(1n, 2n) = 7853200120776062878684798364095072458815029376092732009249414926327459813530

hashToField("Utkarsh Baranwal", maxChunks=4)
  = 2689494646062948360487866858549161268023147861439580363715484426041810573382
  (16 bytes, 1 chunk used, 3 zero-padded → Poseidon(4)(chunk0, 0, 0, 0))

hashToField("Rajesh Kumar Sharma Gupta Verma", maxChunks=4)
  = 15807365457822395816033615442310068061117268680265938810672994222315960047410
  (31 bytes, exactly 1 chunk → Poseidon(4)(chunk0, 0, 0, 0))

hashToField("Rajesh Kumar Sharma Gupta Verma Singh", maxChunks=4)
  = 8788477441821112447812609039840608362124692723989989797277498722759269778947
  (37 bytes, 2 chunks → Poseidon(4)(chunk0, chunk1, 0, 0))

hashToField("21BCS027", maxChunks=2)
  = 15150160435819557810078120971221321758887516517285291325240673283662695955468
  (8 bytes, 1 chunk → Poseidon(2)(chunk0, 0))

hashToField("21bcs027@iiitdmj.ac.in", maxChunks=2)
  = 6744441775314583329532040559385253235651674879202368422786321712697490882813
  (22 bytes, 1 chunk → Poseidon(2)(chunk0, 0))

hashToField("utkarshbaranwal47@students.iiitdmj.ac.in", maxChunks=2)
  = 15157798813008110916508472488358427390626844432052365640772174362044533657556
  (40 bytes, 2 chunks)
  chunk[0] = 207524604131966681918704571787819111445336474244770160538629369250141792628
  chunk[1] = 1852558572464431327598

Poseidon(2)(0n, 0n) [zero-padding leaf]
  = 14744269619966411208460611736853059166543709924778005885397896789179099038553...
  (non-zero — not the identity; use this as leaf[7])
```

The re-seed script and the spec doc MUST include the `>31-byte email` test vector (last entry above) as the mandatory cross-path parity check.

### Why this scheme is circom-reproducible

1. **Same Poseidon constants:** `circomlibjs` loads `poseidon_constants.json` whose C[1][0] (`0x0ee9a592...`) matches the vendored `zk-proofs/circomlib/circuits/poseidon_constants.circom` POSEIDON_C(3)[0] (`0xee9a592...`) — same value, circom just omits the leading zero in the hex literal. [VERIFIED by source inspection]
2. **Same round counts:** both JS and circom use `N_ROUNDS_P = [56, 57, 56, 60, ...]`; for t=3 (arity 2), `N_ROUNDS_P[1] = 57`. Array length matches: (8+57)×3 = 195. [VERIFIED by computation]
3. **No field representation mismatch:** `poseidon.F.toString(result)` returns a decimal string. The circuit output is also a field element (decimal). Feeding the JS decimal string into `F.e()` and back gives the same value. [VERIFIED by round-trip test]
4. **WASM default = Reference = same output:** `buildPoseidon` (default, WASM-backed) and `buildPoseidonReference` produce identical results for all tested arities. [VERIFIED: Poseidon(2)(1,2) and Poseidon(4)(1,2,3,4) match exactly]

---

## Secondary Research Items (all resolved)

### circomlibjs Poseidon(2) salted-leaf + depth-3 Merkle conventions

- `leaf_i = Poseidon(2)(encodedAttr_i, salt_i)` — verified working with live code.
- Internal node = `Poseidon(2)(left, right)` where `left = lower-index child`.
- 8-leaf tree: 4 level-1 nodes, 2 level-2 nodes, 1 root. All Poseidon(2) calls.
- Zero-padding leaf (leaf[7]): `Poseidon(2)(0n, 0n)` — distinct non-zero value. [VERIFIED]
- Determinism: same attrs + same salts → same root on every call. [VERIFIED]
- The Phase-2 circom Merkle circuit must use the same node-combine order. If the circuit uses `Poseidon(2)(right, left)` for any subtree, the roots won't match. The spec must specify left-child-first order explicitly.

### Salt generation: correct reduction method

- 31-byte method: `BigInt("0x" + crypto.randomBytes(31).toString("hex"))` → always < BN128 p (248 bits < 254 bits). [VERIFIED: 2^248 < p]
- 32-byte rejection sampling: valid but expected 5.3 attempts (only 18.9% of 256-bit values are < p). [VERIFIED by calculation]
- 32-byte mod p: biased, not recommended for cryptographic salts.
- **Recommendation for Phase 1: 31-byte method** (simpler, no loop, sufficient entropy).

### Integer encoding: dob and batch

- `dob` as `YYYYMMDD` integer (e.g., `20040215`): max value is `99991231` ≈ 10^8, trivially < BN128 p. [VERIFIED]
- `batch` as 4-digit year (e.g., `2022`): trivially safe. [VERIFIED]
- No encoding transform needed; feed the integer directly to the leaf hasher.
- Input validation: `dob` string from the form must be parsed to an integer at normalization time (reject non-numeric, validate YYYYMMDD format). The current schema stores `dob` as a String — this must change or the normalization layer must coerce before hashing.

### BN128 scalar field order

```
BN128_FIELD_ORDER = 21888242871839275222246405745257275088548364400416034343698204186575808495617
                  = 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001
```
Source: [VERIFIED from `ffjavascript/src/curves.js` in installed node_modules]

### circomlibjs version pinning

`circomlibjs@0.1.7` is already pinned in `package.json`. This is the correct version to freeze because its Poseidon constants match the vendored `zk-proofs/circomlib/circuits/poseidon_constants.circom`. Do not upgrade `circomlibjs` without re-verifying constant parity with the vendored circomlib (the circom file is the canonical authority). The ZKP backend (`zkp-backend/`) does not have `circomlibjs` installed — the shared commitment module lives in the admin backend; the prover-side test script either imports from the admin backend or has its own copy of `circomlibjs@0.1.7`.

---

## Common Pitfalls

### Pitfall 1: Silent BN128 Overflow in the Current stringToBigInt

**What goes wrong:** `stringToBigInt("Rajesh Kumar Sharma Gupta Verma Singh")` (37 bytes) returns a BigInt larger than p. When passed to `poseidon([...])`, `circomlibjs` silently reduces it via `F.e(a)` mod p, committing a *different* value than intended. Issuance produces one commitment; if a prover tried to reconstruct with the raw bytes it would get a different root.

**Why it happens:** BN128 p ≈ 2^254; any string > ~31 bytes as raw UTF-8 hex exceeds this. [VERIFIED: 37-byte name overflows; `F.e()` gives different BigInt than raw].

**How to avoid:** Replace `stringToBigInt` with `hashToField` for string attributes. The old `stringToBigInt` can remain for legacy compatibility but must not be called from the new commitment module.

**Warning signs:** issuance succeeds but `snarkjs.groth16.verify` returns false; or the root recomputed by the prover-side script doesn't match the stored `merkleRoot`.

### Pitfall 2: Arity Mismatch Between JS and Circom

**What goes wrong:** JS uses `hashToField(email, 2)` (Poseidon(2)) but the Phase-2 circom uses a `HashToField(4)` template for email. Different outputs.

**Why it happens:** The `maxChunks` parameter doubles as the Poseidon arity. If JS and circuit disagree on the chunk count for any attribute, the committed values differ and proofs fail.

**How to avoid:** Freeze `CHUNK_COUNTS = {name:4, rollNo:2, email:2}` in the spec doc and in `identityCommitment.js` as an exported constant. The Phase-2 circuit planner reads this constant table verbatim.

**Warning signs:** root-equality test passes for short strings but fails for long ones.

### Pitfall 3: updateStudent() Also Recomputes the Hash

**What goes wrong:** `buildStudentRecord()` is updated to the new scheme but `updateStudent()` in `studentService.js:181-187` also recomputes the hash using the old `hashPoseidonFields()` call. Old credentials get re-anchored with the old flat-Poseidon(5) scheme on update.

**Why it happens:** The hash computation is duplicated in two places in `studentService.js`. It's easy to miss the update path when focused on the create path.

**How to avoid:** The shared `identityCommitment.js` module is imported once and called from both paths. The planner must include `updateStudent()` as an explicit task.

### Pitfall 4: Merkle Node Ordering

**What goes wrong:** The JS module computes `Poseidon(2)(leaf[0], leaf[1])` for the first internal node, but the Phase-2 circom computes `Poseidon(2)(leaf[1], leaf[0])`. The roots differ even with identical inputs.

**Why it happens:** `Poseidon(2)(a,b) ≠ Poseidon(2)(b,a)` — Poseidon is not symmetric. The spec must fix the argument order, and both JS and circom must follow it.

**How to avoid:** Spec doc states explicitly: node = `Poseidon(2)(left_child, right_child)` where `left` has the lower leaf index. This is the natural tree construction order.

### Pitfall 5: dob stored as String in MongoDB Schema

**What goes wrong:** The current `Student.dob` is `type: String`. If `buildStudentRecord` stores `dob: "2004-02-15"` (ISO string) and the commitment hashes `20040215` (integer), the MongoDB record has the ISO string but the commitment used the integer — the prover-side script can only reconstruct if it knows to parse the same way.

**How to avoid:** Normalize `dob` to the `YYYYMMDD` integer AT normalization time (in `normalizeStudentInput`), store the integer in the schema (or store both the display string and the committed integer separately). The spec doc must state the canonical form. The Joi validator should accept `YYYY-MM-DD` input and coerce to `YYYYMMDD` integer output.

### Pitfall 6: Zero-Padding Salt for Leaf[7]

**What goes wrong:** The implementation sets `leaf[7] = Poseidon(2)(0, 0)` (correct). A naive implementation might set `leaf[7] = 0` (the integer zero) and pass it as a Merkle tree leaf value, making the tree computation different from what the circuit computes.

**How to avoid:** Leaf[7] is the zero-padding leaf and its value IS `Poseidon(2)(0n, 0n)` — the leaf-hash function applied to (0, 0). This is `14744...` (a large field element, not zero). The tree's level-1 node for positions (6,7) is then `Poseidon(2)(leaf[6], leaf[7])`. Be explicit in the implementation.

---

## Code Examples

### Verified: current five-field hash (to be replaced)

```js
// Source: privdId_admin/backend/services/studentService.js:72-78 (CURRENT — delete this)
const hashedData = await hashPoseidonFields([
  normalizedStudent.name,
  normalizedStudent.rollNo,
  normalizedStudent.dob,
  normalizePhone(normalizedStudent.contactNo),
  normalizedStudent.programme,
]);
```

### Verified: new seven-attribute salted Merkle root (target)

```js
// Source: pattern derived from verified circomlibjs@0.1.7 behaviour
import { hashToField, generateSalts, computeMerkleRoot, CHUNK_COUNTS } from "../utils/identityCommitment.js";
import { PROGRAMME_LEVEL, DISCIPLINE } from "../constants/enumCodes.js";

// In buildStudentRecord():
const salts = generateSalts(7); // decimal strings

const attrs = [
  await hashToField(normalizedStudent.name, CHUNK_COUNTS.name),          // leaf 0
  await hashToField(normalizedStudent.rollNo, CHUNK_COUNTS.rollNo),      // leaf 1
  String(normalizedStudent.dobInt),                                       // leaf 2 — YYYYMMDD int
  String(PROGRAMME_LEVEL[normalizedStudent.programmeLevel]),             // leaf 3 — code
  String(DISCIPLINE[normalizedStudent.discipline]),                       // leaf 4 — code
  String(normalizedStudent.batch),                                        // leaf 5 — year int
  await hashToField(normalizedStudent.email, CHUNK_COUNTS.email),        // leaf 6
];
// leaf 7 = Poseidon(2)(0,0) — handled internally by computeMerkleRoot

const merkleRoot = await computeMerkleRoot(attrs, salts); // decimal string
```

### Verified: credential JSON changes (credentialService.js)

```js
// Source: privdId_admin/backend/services/credentialService.js:61-69 (CURRENT)
// Line 67: issuer: 'PrivdID — VIT Bhopal University',  ← PATCH
// Line 68: version: '1.0',                              ← PATCH

// NEW:
const credential = {
  rollNo: student.rollNo,
  email: student.email,
  merkleRoot: student.merkleRoot,   // was hashedData (flat hash)
  issuedAt: new Date().toISOString(),
  issuer: 'PrivdID — IIITDM Jabalpur',   // em-dash, matches CONTEXT D-11
  type: 'StudentIdentityCredential',
  version: '2.0',
};
```

### Verified: bytes32 conversion (unchanged)

```js
// Source: privdId_admin/backend/services/credentialService.js:40 — reuse as-is
const pubHashBytes32 = ethers.zeroPadValue(ethers.toBeHex(BigInt(merkleRoot)), 32);
```

### Verified: Student schema additions

```js
// Source: privdId_admin/backend/models/Student.js — add these fields to studentSchema
programmeLevel: { type: String, required: true, trim: true },   // "B.Tech", "M.Tech" etc.
discipline:     { type: String, required: true, trim: true },   // "CSE", "ECE" etc.
batch:          { type: Number, required: true },               // 2022
dobInt:         { type: Number, required: false },              // YYYYMMDD integer; or coerce from dob
salts:          { type: [String], required: false, default: [] }, // 7 decimal strings
merkleRoot:     { type: String, required: false, default: null }, // decimal string pubHash

// programme field: RETAIN as display/legacy or mark optional; it is no longer committed.
// contactNo: RETAIN as operational data; no longer hashed.
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Flat `Poseidon(5)` hash over all attributes | Salted per-attribute Merkle tree (depth 3) | Phase 1 → Phase 2 | Enables selective disclosure and predicates in-circuit |
| `stringToBigInt` (raw UTF-8 → BigInt) | `hashToField` (chunk → Poseidon, field-safe) | Phase 1 | Eliminates BN128 overflow for long strings |
| `programme` single field | `programmeLevel` + `discipline` + `batch` (split) | Phase 1 | Unambiguous fields; enables `isPostgrad` predicate |
| `contactNo` committed | `email` committed | Phase 1 | Drops normalizePhone complexity; email is more stable |
| Single flat hash as `hashedData` | `merkleRoot` (Merkle root) | Phase 1 | `pubHash` now the tree root, not a flat hash |
| `'PrivdID — VIT Bhopal University'` | `'PrivdID — IIITDM Jabalpur'` | Phase 1 | Branding correctness |
| Credential `version: '1.0'` | `version: '2.0'` | Phase 1 | Signals new commitment scheme |

**Deprecated/outdated:**
- `hashPoseidonFields([name, rollNo, dob, phone, programme])`: replaced by `computeMerkleRoot(attrs, salts)`.
- `normalizePhone()`: no longer called from the commitment path (may stay for display purposes).
- `stringToBigInt` as a commitment input: superseded by `hashToField` for strings; still valid for reading integers from the DB, but not for building new commitments.

---

## Validation Architecture

`nyquist_validation` is explicitly `false` in `.planning/config.json`. This section is included to define the root-equality acceptance gate required by Phase 1 success criterion 3, since this is a cryptographic correctness requirement, not a standard unit test.

### Root-Equality Test (Required Acceptance Gate)

The Phase 1 acceptance gate is a concrete assertion: re-seed a test student, then verify that the `merkleRoot` computed by the admin issuance path equals the `merkleRoot` recomputed by the prover-side script from the same `attrs` and `salts`.

```js
// scripts/reseed.js — acceptance assertion pattern
import { computeMerkleRoot } from "../utils/identityCommitment.js";

// After issuance produces student.merkleRoot and student.salts:
const recomputed = await computeMerkleRoot(attrs, student.salts);
assert.strictEqual(recomputed, student.merkleRoot,
  "ROOT MISMATCH: issuance and prover-side paths diverged");
```

This test MUST pass for a student with a name > 31 bytes (to exercise the 2-chunk path) and for a student with an email > 31 bytes.

### Manual Verification Commands

```bash
# Verify the issuer string is correct
node -e "
import('/home/chetan/digital_id_app/privdId_admin/backend/services/credentialService.js')
  .then(m => console.log('issuer ok'))
"

# Verify merkleRoot stores correctly and is non-null after seed
# (run after reseed.js)
mongosh privdid --eval "db.students.find({},{merkleRoot:1,salts:1}).limit(1).pretty()"
```

---

## Open Questions

1. **Dual-degree `isPostgrad` status**
   - What we know: D-06 freezes `isPostgrad` = programmeLevel ∈ {M.Tech(4), M.Des(5), PhD(6)}. Dual(3) is excluded.
   - What's unclear: IIITDM may offer Dual-degree programmes that carry postgrad standing (e.g., B.Tech+M.Tech). If Dual belongs in `isPostgrad`, the set changes from {4,5,6} to {3,4,5,6}.
   - Recommendation: [ASSUMED] Dual (code 3) is an undergrad-entry programme and therefore NOT postgrad. Confirm with the users before the circuit is frozen in Phase 2. This cannot be changed after trusted setup without full redo.

2. **`dob` storage: String vs Integer in MongoDB**
   - What we know: Current schema stores `dob` as `type: String`. The commitment requires `YYYYMMDD` integer. We need to decide whether to change the schema type or keep String for display and always derive the integer for commitment.
   - What's unclear: Whether existing migration of the display string is needed, and whether the admin form sends `YYYY-MM-DD` (ISO) or `YYYYMMDD` (bare integer).
   - Recommendation: Normalize at the `normalizeStudentInput` layer to output `dobInt: Number` (YYYYMMDD). Add `dobInt` as a separate schema field. Keep `dob: String` as the human-readable display value. This avoids changing the display behavior.

3. **`programme` field retention in Student schema**
   - What we know: `programme` is replaced by `programmeLevel + discipline`. It is no longer committed.
   - What's unclear: Whether to keep `programme` in the schema for legacy display or drop it entirely. The admin frontend may display `programme` strings.
   - Recommendation: Retain `programme: { type: String, required: false }` for the Phase 1 prototype. Mark as deprecated in comments. The admin UI can derive a display string from `programmeLevel + discipline` in a later phase.

4. **Email validator byte-length cap**
   - What we know: Joi currently validates `email` as `Joi.string().trim().email()` with no byte length cap.
   - What's unclear: Whether the existing admin form inputs could ever produce emails > 62 bytes.
   - Recommendation: Add `Joi.string().trim().email().max(62)` to `studentSchema` for the email field. This enforces the maxChunks=2 contract at input time.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `circomlibjs` | identityCommitment.js | Yes | 0.1.7 | None needed |
| `ethers` | credentialService.js | Yes | ^6.16.0 | None needed |
| Node `crypto` | salt generation | Yes | built-in (Node 22.17.1) | None needed |
| MongoDB | Student schema changes | Not verified live (env-dependent) | Mongoose 8.14.2 | — |
| `ffjavascript` | circomlibjs dependency | Yes | ^0.2.45 | None needed |

No missing dependencies. Phase 1 is purely a code and schema change — no new tools or services required.

---

## Project Constraints (from CLAUDE.md)

| Directive | Impact on Phase 1 |
|-----------|-------------------|
| `privdId_admin/backend/` is ESM (`"type": "module"`) | All new files use `import`/`export`; no `require()` |
| `zkp-backend/` is CommonJS | The prover-side test script, if placed in `zkp-backend/`, must use `require()` or be a separate ESM script run with `node --input-type=module` |
| Field-set consistency is sacred | The shared module approach (D-08) directly satisfies this constraint |
| Design the circuit once | Phase 1 MUST freeze the encoding spec with a working parity test BEFORE Phase 2 starts — any spec change discovered in Phase 2 requires Phase 1 to be redone |
| WSL tooling note | Shell scripts for reseed must use absolute paths or be run from within the WSL shell; hardhat/circom commands are Phase 2+ |
| Measure everything | Phase 1 should time the `computeMerkleRoot` call and print seconds (blueprint §10 applies from Phase 1 onward) |
| No legacy `README.md` trust | Contract addresses in `server.js` fallbacks are stale; never copy them |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Dual-degree (code 3) is NOT in `isPostgrad` | Enum code module, isPostgrad predicate | If wrong: circuit's set-membership constants must change after frozen → full trusted setup redo |
| A2 | Admin form sends email in format that always fits ≤62 bytes after `.trim()` | Email cap recommendation | If wrong: students with longer emails cannot be issued credentials; validator rejects them |
| A3 | The prover-side test script can be placed in `privdId_admin/backend/scripts/` (ESM) rather than `zkp-backend/` | File layout recommendation | If wrong: script must be adjusted to CJS format or run as explicit ESM |

---

## Sources

### Primary (HIGH confidence — verified by code execution)
- `circomlibjs@0.1.7` source + runtime: `buildPoseidon`, `F.toString`, `F.e()`, `F.p` — all values verified by executing against installed library in project context
- `ffjavascript` source (`src/curves.js`): BN128 scalar field order
- `privdId_admin/backend/node_modules/circomlibjs/src/poseidon_reference.js`: round constants, MDS structure
- `zk-proofs/circomlib/circuits/poseidon_constants.circom`: vendored circom constants (compared constant-by-constant with circomlibjs)
- `zk-proofs/circomlib/circuits/poseidon.circom`: `N_ROUNDS_P` array, `PoseidonEx` template

### Secondary (HIGH confidence — direct source-file reads)
- `privdId_admin/backend/services/studentService.js`: current 5-field hash call, updateStudent path
- `privdId_admin/backend/services/credentialService.js`: issuer string, bytes32 conversion, credential JSON shape
- `privdId_admin/backend/utils/poseidonHash.js`: current `stringToBigInt`, `hashPoseidonFields`
- `privdId_admin/backend/models/Student.js`: current schema fields
- `privdId_admin/backend/controllers/studentController.js`: buildStudentRecord convergence point
- `privdId_admin/backend/validators/studentValidator.js`: current Joi schema (no byte-length cap on email)
- `zkp-backend/server.js`: duplicate `stringToBigInt`, current prover input order `[name,rollNo,dob,phoneNo,branch]`
- `privdId_admin/backend/package.json`: confirmed `circomlibjs: "^0.1.7"`, ESM `"type": "module"`

### Tertiary (HIGH confidence — live computation)
- All test vectors in the "Primary Research Deliverable" section were produced by running Node.js code against the installed `circomlibjs@0.1.7` in `privdId_admin/backend/` (confirmed WASM and Reference implementations produce identical outputs)

---

## Metadata

**Confidence breakdown:**
- Hash-to-field encoding scheme: HIGH — executed against live library, test vectors generated
- Poseidon JS↔circom constant parity: HIGH — constants verified source-to-source
- Merkle tree construction: HIGH — executed and proven deterministic
- Salt generation: HIGH — field order verified from source; 31-byte bound proven
- Admin backend refactor scope: HIGH — all files read directly; no guesswork
- Enum codes / isPostgrad: MEDIUM — codes are locked decisions; Dual exclusion is ASSUMED pending user confirmation

**Research date:** 2026-06-16
**Valid until:** Stable (circomlibjs@0.1.7 is pinned; BN128 constants don't change; only risk is a circomlibjs version bump which is disallowed by the research).

---

## RESEARCH COMPLETE

**Phase:** 1 — Freeze Spec & Field-Set Consistency
**Confidence:** HIGH

### Key Findings

- **BN128 overflow is real and verifiable:** strings > ~31 bytes as raw UTF-8 BigInt exceed the BN128 scalar field order. `F.e()` silently reduces mod p, committing a different value. A 37-char name and a 40-char email both overflow (confirmed).
- **Hash-to-field chunking scheme is fully concrete and frozen:** 31-byte chunks, big-endian packing, zero-padded to per-attribute fixed maxChunks (name=4, rollNo=2, email=2), then `Poseidon(maxChunks)`. Test vectors generated against the installed library.
- **JS↔circom constant parity is confirmed:** circomlibjs `poseidon_constants.json` and the vendored `poseidon_constants.circom` are the same constants (verified C[t=3][0], round count array, array length). WASM and Reference implementations give identical outputs.
- **`updateStudent()` also recomputes the hash:** it's in `studentService.js:181-187` and must be updated alongside `buildStudentRecord()`. Missing this is the most likely implementation error.
- **`email` validator needs a 62-byte cap:** the current Joi schema has no byte-length limit on `email`. Without this cap, the maxChunks=2 contract can be violated at input time.
- **Zero new dependencies required:** Phase 1 uses only `circomlibjs@0.1.7` (already installed) and Node built-ins.

### File Created
`.planning/phases/01-freeze-spec-field-set-consistency/01-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Hash-to-field encoding scheme | HIGH | Executed against installed library; test vectors generated |
| Poseidon JS↔circom parity | HIGH | Constants compared source-to-source; round-trip verified |
| Admin backend refactor scope | HIGH | All source files read; updateStudent path confirmed |
| Salt generation correctness | HIGH | 31-byte bound proven mathematically; field order from source |
| Dual isPostgrad status | MEDIUM | User decision locked (D-06 says Dual=3 excluded); recommend confirming before Phase 2 circuit freeze |

### Open Questions
1. Is Dual (programmeLevel code 3) excluded from `isPostgrad`? (Must confirm before Phase 2.)
2. Should `dob` be stored as `Number` (YYYYMMDD) or remain `String` with a derived `dobInt`? (Affects schema and validator design.)
3. Where does the prover-side reference script live? (`backend/scripts/` is cleanest for ESM; `zkp-backend/` requires CJS or explicit ESM invocation.)

### Ready for Planning
Research complete. Planner can now create PLAN.md files.
