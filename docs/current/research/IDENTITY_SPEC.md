# PrivdID Identity Commitment Spec (SPEC-01)

**Status: FROZEN**
**Version: 1.0**
**Frozen: 2026-06-16**
**Authors: Utkarsh Baranwal & Dhruv Anand Singh**

> This document is the single source of truth for the 7-attribute identity commitment scheme. Every downstream artifact — the `identityCommitment.js` module (plan 02), the admin issuance refactor (plan 03), the Phase-2 circom circuit, and the re-seed script (plan 04) — MUST mirror this spec verbatim. A spec change discovered after the Phase-2 circuit is frozen forces a full Groth16 trusted-setup redo. Do not alter this document without version-bumping and updating all dependent artifacts.

---

## 1. Leaf Layout (Fixed)

Leaf indices are Merkle tree positions. Order is frozen; never insert, reorder, or remove leaves.

| Leaf Index | Attribute | Type | Encoding | Source (admin form) |
|-----------|-----------|------|----------|---------------------|
| 0 | `name` | String | hash-to-field (maxChunks=4) | Name text field |
| 1 | `rollNo` | String | hash-to-field (maxChunks=2) | Roll number text field |
| 2 | `dob` | Integer | YYYYMMDD integer directly | Date-of-birth field (parsed from YYYY-MM-DD) |
| 3 | `programmeLevel` | Integer code | enum code from enumCodes.js | Programme-level dropdown |
| 4 | `discipline` | Integer code | enum code from enumCodes.js | Discipline dropdown |
| 5 | `batch` | Integer | 4-digit year integer directly | Batch/admission-year field |
| 6 | `email` | String | hash-to-field (maxChunks=2) | Email text field (max 62 bytes enforced) |
| 7 | zero-padding | — | `Poseidon(2)(0, 0)` = `14744269619966411208460611736853059166543709924778005885397896789179099038553` | Reserved; no admin input |

**Leaves 0–6** are committed attributes. **Leaf 7** is reserved zero-padding with `attr=0, salt=0`; it is a non-zero field element because Poseidon is a permutation (not the identity). Do NOT use bare `0` as the leaf value in the Merkle combine step.

---

## 2. String Encoding Rule (Hash-to-Field) — D-01 / D-02

Applies to: `name` (leaf 0), `rollNo` (leaf 1), `email` (leaf 6).

### Algorithm

```
For attribute s (string):
  1. bytes  ← UTF-8 encode(s)                         -- no normalisation beyond .trim()
  2. chunks ← []
  3. for i in 0, 31, 62, ..., len(bytes)-1:
       slice ← bytes[i : min(i+31, len(bytes))]
       val   ← big-endian-BigInt(slice)               -- left-most byte is most significant
       chunks.append(val)
  4. pad chunks with 0n at the END to reach maxChunks -- right-zero-pad, NOT left
  5. result ← Poseidon(maxChunks)(chunks[0], ..., chunks[maxChunks-1])
               (circomlibjs buildPoseidon; result via poseidon.F.toString() = decimal string)
```

**Why 31 bytes per chunk:** 31 bytes = 248 bits, always strictly less than the BN128 scalar field order (254 bits). A 32-byte chunk can exceed the field order; `circomlibjs` silently reduces mod p via `F.e()`, committing a different value. Use 31 bytes to prevent overflow without field reduction.

**AVOID:** `keccak256(value) mod p`. This is correct in JS but expensive and awkward inside the circom circuit. The chunk-then-Poseidon scheme is reproducible identically in both JS and circom.

**AVOID:** `stringToBigInt` (raw UTF-8 → hex → BigInt) for commitment inputs. This produces values larger than the field order for strings longer than ~31 bytes.

### Frozen Chunk Counts (= Poseidon arities)

| Attribute | maxChunks | Max allowed UTF-8 bytes | Rationale |
|-----------|-----------|------------------------|-----------|
| `name` | **4** | 120 (Joi `max(120)`) | 4 × 31 = 124 bytes; covers all realistic names |
| `rollNo` | **2** | 50 (Joi `max(50)`) | 2 × 31 = 62 bytes; covers any conceivable roll number |
| `email` | **2** | **62** (add Joi `max(62)`) | Longest observed IIITDM email = 40 bytes; 62 is generous; same arity as rollNo |

The email validator MUST cap at 62 bytes (not RFC 254 chars) to enforce the maxChunks=2 contract at input time.

---

## 3. Integer Encoding Rule — D-03

Applies to: `dob` (leaf 2), `batch` (leaf 5), `programmeLevel` (leaf 3), `discipline` (leaf 4).

- `dob` is committed as a **YYYYMMDD integer** (e.g., `20040215`). Max value ≈ 10^8, trivially less than the BN128 field order. The admin form sends `YYYY-MM-DD`; normalization strips hyphens and converts to integer before hashing.
- `batch` is committed as a **4-digit year integer** (e.g., `2022`). Fed directly to the leaf hasher as a BigInt.
- `programmeLevel` and `discipline` are committed as their **integer enum codes** from `enumCodes.js` (see Section 5).

No string encoding (no chunking, no Poseidon wrapping) for these attributes. Pass the integer directly as the `encodedAttr` argument to the leaf hasher.

---

## 4. Leaf and Node Hashing (Merkle Construction) — D-09

### Leaf computation

```
leaf_i = Poseidon(2)(encodedAttr_i, salt_i)    for i = 0 .. 6
leaf_7 = Poseidon(2)(0, 0)                      (zero-padding — non-zero value)
```

`encodedAttr_i` is either the hash-to-field output (decimal string → BigInt) or the integer directly (for dob/batch/programmeLevel/discipline). `salt_i` is a random BigInt < BN128_FIELD_ORDER (see Section 6).

### Internal node computation

```
node = Poseidon(2)(left_child, right_child)
```

**CRITICAL: The left argument has the LOWER leaf index.** `Poseidon(2)(a, b) ≠ Poseidon(2)(b, a)` — Poseidon is NOT symmetric. Both the JS module and the Phase-2 circom circuit MUST use `Poseidon(2)(left, right)` with identical argument order or the roots will not match.

### Tree topology (depth-3, 8-leaf)

```
leaf[0]  leaf[1]  leaf[2]  leaf[3]  leaf[4]  leaf[5]  leaf[6]  leaf[7]=Poseidon(2)(0,0)
   \       /          \      /          \      /          \      /
  node01              node23            node45            node67
       \                 /                  \                /
       node0123                            node4567
              \                                /
                           ROOT = merkleRoot = pubHash (decimal string)
```

Level-1 nodes: `node01 = Poseidon(2)(leaf[0], leaf[1])`, `node23 = Poseidon(2)(leaf[2], leaf[3])`, `node45 = Poseidon(2)(leaf[4], leaf[5])`, `node67 = Poseidon(2)(leaf[6], leaf[7])`.

Level-2 nodes: `node0123 = Poseidon(2)(node01, node23)`, `node4567 = Poseidon(2)(node45, node67)`.

Root: `root = Poseidon(2)(node0123, node4567)`.

**Zero-padding leaf value (leaf[7]):** `Poseidon(2)(0n, 0n)` = `14744269619966411208460611736853059166543709924778005885397896789179099038553`. This is non-zero. The prover will set `attr[7] = 0`, `salt[7] = 0` and compute the leaf hash identically. Do NOT use bare `0` as the leaf value passed into `node67`; it must be the Poseidon output.

### Root → bytes32 conversion

```js
ethers.zeroPadValue(ethers.toBeHex(BigInt(merkleRoot)), 32)
```

This is the `pubHashBytes32` stored on-chain. The root is a decimal string; no field reduction needed (it is already a valid field element).

---

## 5. Enum Codes — D-06 / D-07

**Executable source of truth:** `privdId_admin/backend/constants/enumCodes.js`

This spec references `enumCodes.js` as the canonical machine-readable definition. The tables below are informational copies; in case of any discrepancy, the `.js` module governs.

### programmeLevel codes

| String | Integer Code |
|--------|-------------|
| `"B.Tech"` | 1 |
| `"B.Des"` | 2 |
| `"Dual"` | 3 |
| `"M.Tech"` | 4 |
| `"M.Des"` | 5 |
| `"PhD"` | 6 |

### discipline codes

| String | Integer Code |
|--------|-------------|
| `"CSE"` | 1 |
| `"ECE"` | 2 |
| `"ME"` | 3 |
| `"SmartMfg"` | 4 |
| `"Design"` | 5 |
| `"NatSci"` | 6 |

### isPostgrad predicate set

`isPostgrad = true` iff `programmeLevel` code ∈ **{4, 5, 6}** (M.Tech, M.Des, PhD).

**Dual (code 3) is EXCLUDED from isPostgrad.** If IIITDM dual-degree programmes confer postgrad standing, code 3 must be added to both `POSTGRAD_CODES` in `enumCodes.js` AND the Phase-2 circuit's set-membership constants NOW — it cannot be changed after trusted setup. See Section 9, open question #1.

### Append-only rule — D-07

Codes are frozen after this document. **Never renumber an existing mapping.** Renumbering invalidates every prior commitment and forces a Phase-2 circuit rebuild + trusted-setup redo. New programmes or disciplines get the next free integer (7 onwards).

---

## 6. Salt Rule — D-10

One salt per committed attribute (leaves 0 through 6). Leaf 7 uses `salt=0`.

- **Generation:** `BigInt("0x" + crypto.randomBytes(31).toString("hex"))` → decimal string. 31 bytes = 248 bits, always strictly less than BN128_FIELD_ORDER (guaranteed: 2^248 < p).
- **Format:** decimal string representation of a BigInt (as returned by `.toString()`).
- **Storage:** `Student.salts: [String]` array in MongoDB, indexed by leaf order (i.e., `salts[0]` = salt for leaf 0, ..., `salts[6]` = salt for leaf 6).
- **Count:** 7 salts for 7 committed attributes.
- **Do NOT use:** `crypto.randomBytes(32)` with `% p` reduction (biased). Use 31 bytes (no loop, sufficient entropy) or rejection sampling for 32 bytes.

> NOTE: The canonical salt store moves to the E3 encrypted IPFS blob in a later milestone. The MongoDB `salts[]` field is the Phase-1 interim store.

---

## 7. Public Signal Layout

`pubHash` = the Merkle root = a decimal string field element.

**Signal [0]:** `pubHash` (the Merkle root, decimal string).

`bytes32` form for on-chain storage:
```js
ethers.zeroPadValue(ethers.toBeHex(BigInt(root)), 32)
```

The full public-signal ordering for selective disclosure, predicates, and nonce binding is frozen in Phase 2. This document fixes `pubHash` as public signal [0] only. No other signals are defined at Phase-1 time.

---

## 8. BN128 Scalar Field Order

```
21888242871839275222246405745257275088548364400416034343698204186575808495617
```

In hex: `0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001`

Source: `ffjavascript/src/curves.js` (verified from installed node_modules in `privdId_admin/backend/`).

All field elements (salt values, hash outputs, encoded attribute values) MUST be strictly less than this order. The `circomlibjs` `poseidon.F.toString()` output is always a valid decimal string within this range.

---

## 9. Cross-Path Parity Oracle (Verified Test Vectors)

These vectors were generated by executing code against `circomlibjs@0.1.7` installed in `privdId_admin/backend/`. They are the mandatory parity check that the re-seed script (plan 04) MUST reproduce exactly. Any deviation indicates a mismatch between the JS module and the specification.

```
--- Poseidon primitives ---

Poseidon(2)(1n, 2n)
  = 7853200120776062878684798364095072458815029376092732009249414926327459813530

Poseidon(2)(0n, 0n)   [zero-padding leaf — leaf[7] value]
  = 14744269619966411208460611736853059166543709924778005885397896789179099038553
  NOTE: this is NON-ZERO; do not substitute bare 0 in the Merkle combine step.

--- hashToField — single-chunk (all bytes fit in one 31-byte chunk) ---

hashToField("Utkarsh Baranwal", maxChunks=4)
  = 2689494646062948360487866858549161268023147861439580363715484426041810573382
  [16 bytes → 1 chunk used, 3 zero-padded → Poseidon(4)(chunk0, 0, 0, 0)]

hashToField("Rajesh Kumar Sharma Gupta Verma", maxChunks=4)
  = 15807365457822395816033615442310068061117268680265938810672994222315960047410
  [31 bytes → exactly 1 chunk → Poseidon(4)(chunk0, 0, 0, 0)]

hashToField("21BCS027", maxChunks=2)
  = 15150160435819557810078120971221321758887516517285291325240673283662695955468
  [8 bytes → 1 chunk → Poseidon(2)(chunk0, 0)]

hashToField("21bcs027@iiitdmj.ac.in", maxChunks=2)
  = 6744441775314583329532040559385253235651674879202368422786321712697490882813
  [22 bytes → 1 chunk → Poseidon(2)(chunk0, 0)]

--- hashToField — multi-chunk (MANDATORY for parity; exercises the 2-chunk path) ---

hashToField("Rajesh Kumar Sharma Gupta Verma Singh", maxChunks=4)
  = 8788477441821112447812609039840608362124692723989989797277498722759269778947
  [37 bytes → 2 chunks → Poseidon(4)(chunk0, chunk1, 0, 0)]

hashToField("utkarshbaranwal47@students.iiitdmj.ac.in", maxChunks=2)
  = 15157798813008110916508472488358427390626844432052365640772174362044533657556
  [40 bytes → 2 chunks (>31-byte email: mandatory parity check)]
  chunk[0] = 207524604131966681918704571787819111445336474244770160538629369250141792628
  chunk[1] = 1852558572464431327598
```

**Parity check requirement:** The re-seed script (plan 04) MUST assert that running the implemented `hashToField` and `computeMerkleRoot` functions against these exact input strings produces the exact decimal strings above. The two multi-chunk vectors (37-byte name and 40-byte email) are the critical parity checks — they exercise the path where more than one 31-byte chunk is used.

---

## 10. Phase-2 Forward Contract

The Phase-2 circom circuit MUST mirror the following verbatim:

1. **Leaf order:** indices 0–7 as defined in Section 1.
2. **Chunk arities:** `name=4`, `rollNo=2`, `email=2` as defined in Section 2.
3. **Node-combine order:** `Poseidon(2)(left, right)` where `left` has the lower leaf index, as defined in Section 4.
4. **Enum codes:** same integer values as `enumCodes.js` for `programmeLevel` and `discipline` (Section 5).
5. **isPostgrad set:** `{4, 5, 6}` for the in-circuit set-membership predicate; Dual (3) EXCLUDED.

**Open confirmation required before Phase-2 circuit is frozen:**

1. **Dual-degree `isPostgrad` status:** Is IIITDM's Dual-degree programme (code 3) considered postgrad? If yes, code 3 must be added to `POSTGRAD_CODES` and the circuit's set-membership constants NOW. This cannot be changed after the trusted setup without a full redo.

---

## Appendix: Related Files

| File | Role |
|------|------|
| `privdId_admin/backend/constants/enumCodes.js` | Canonical executable enum code maps (source of truth for codes) |
| `privdId_admin/backend/utils/identityCommitment.js` | JS implementation of hash-to-field, leaf hashing, Merkle root (plan 02) |
| `privdId_admin/backend/scripts/reseed.js` | Test data wipe + re-seed with parity assertion (plan 04) |
| `zk-proofs/circuits/identity.circom` | Phase-2 circuit (must mirror this spec verbatim) |

---

*Spec frozen: 2026-06-16 | PrivdID — IIITDM Jabalpur*
