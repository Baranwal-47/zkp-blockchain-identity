# Phase 4: ZKP Backend Integration & Nonce Enforcement - Research

**Researched:** 2026-06-18
**Domain:** Express.js ZK-proof backend (snarkjs Groth16 + ethers v6), session-nonce replay protection
**Confidence:** HIGH

## Summary

Phase 4 rewires `zkp-backend/server.js` from the old flat 5-field input (`name, rollNo, dob, phoneNo, branch`) to the frozen 19-public-signal circuit shipped in Phase 3 (`nPublic=19`, verified in `verification_key.json` and `IdentityVerifier.sol`'s `uint[19] calldata _pubSignals`). The circuit (`zk-proofs/circuits/identity.circom`) and the JS oracle (`privdId_admin/backend/utils/identityCommitment.js`) already define the exact witness shape, leaf encoding, and salts/attrs pattern — Phase 4 does not invent new crypto, it plumbs an Express route to match an already-frozen, already-tested contract. The hardest part is building the witness input object correctly (`attr[7]`, `salt[7]`, `revealedValue[7]`, `revealMask[7]`, `nonce`, `currentDateInt`, `isOver18`, `isPostgrad` — the last two are **public inputs the caller must supply**, not outputs, per the circuit's documented signal-ordering idiom) and wiring a nonce store with TTL + one-time-use semantics, all in-memory (no DB exists in zkp-backend today, and none is needed for a single-instance prototype).

The `circuitParity.test.js` witness-building code (`zk-proofs/test/circuitParity.test.js`) is the canonical reference for exact field names and witness index mapping — it already exercises `groth16.fullProve`-equivalent witness calculation against the real compiled circuit, and the planner should treat its `buildInput()` helper as the spec for `/generate-proof`'s internal input construction.

**Primary recommendation:** Rewrite `/generate-proof` to accept `{attrs: {name, rollNo, dob, programmeLevel, discipline, batch, email}, salts: string[7] (optional, server-generates if absent), reveal: {name, rollNo, dob, programmeLevel, discipline, batch, email} (booleans), nonce, currentDateInt}`, internally hash-to-field the 3 string attrs via `identityCommitment.js`'s `hashToField`, compute `isOver18`/`isPostgrad` itself (so the caller never has to pre-compute the predicates — the backend is the trusted party that knows the real DOB), then call `snarkjs.groth16.fullProve`. Use a `Map`-based in-memory nonce store (TTL via stored `expiresAt`, one-time-use via a `used` flag) — no new dependency needed.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Witness construction (attrs→leaves, hash-to-field) | API / Backend (zkp-backend) | — | Server-side proving per CLAUDE.md ground rule #4; DEK/private key never leave device, but the Merkle/witness math is not secret-key material |
| Predicate computation (isOver18, isPostgrad) | API / Backend (zkp-backend) | — | Backend is the trusted party holding the real DOB/programmeLevel; client cannot be trusted to self-report predicates that become public signals |
| Groth16 proof generation (`fullProve`) | API / Backend (zkp-backend) | — | snarkjs server-side proving (CLAUDE.md ground rule #4 — heavy proving stays off-device) |
| Off-chain verify (`groth16.verify`) | API / Backend (zkp-backend) | — | Pure computation against `verification_key.json`, no chain call needed |
| On-chain verify (`verifyProof` view call) | API / Backend (zkp-backend) | Database / Storage (Sepolia, read-only) | zkp-backend has explicit read-only chain access (per CLAUDE.md repo layout); calls `IdentityVerifier.sol` view function |
| Credential resolution (`credential-info`) | API / Backend (zkp-backend) | Database / Storage (CredentialRegistry on-chain) | Registry lookup is a read-only contract call from the backend |
| Nonce issue/store/consume | API / Backend (zkp-backend) | — | Single Express instance, no persistence requirement stated; in-memory `Map` is the standard pattern for ephemeral session challenges with short TTL |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| snarkjs | 0.7.6 [VERIFIED: installed in zkp-backend/node_modules] | Groth16 `fullProve`/`verify`, witness calc | Already the project's proving library; matches Phase 3 artifacts (wasm/zkey/vkey) |
| ethers | 6.16.0 [VERIFIED: installed in zkp-backend/node_modules] | On-chain `verifyProof`/registry reads | Already wired in server.js; v6 API (`ethers.JsonRpcProvider`, `Contract`) already in use |
| express | 5.2.1 [VERIFIED: installed in zkp-backend/node_modules] | HTTP routes | Already in use; Express 5 changed async-error handling (rejected promises in route handlers now auto-forward to error middleware) — relevant for `/generate-proof`'s try/catch pattern |
| circomlibjs | 0.1.7 [VERIFIED: zkp-backend/package.json + privdId_admin uses same version] | Poseidon hashing (for hash-to-field, if zkp-backend builds leaves itself rather than only calling fullProve) | Already a zkp-backend dependency; matches the version `identityCommitment.js` is built/verified against |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| crypto (Node builtin) | n/a | `crypto.randomBytes(31)` for nonce generation | Generating a random field element < BN128 order — same technique `identityCommitment.js::generateSalt()` already uses and documents as safe (248 bits < 254-bit field, avoids modulo bias) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| In-memory `Map` nonce store | Redis / MongoDB-backed store | Phase scope is a single-instance prototype (no DB in zkp-backend, no Redis dependency anywhere in the repo); a persistent store adds an external dependency with no stated requirement for multi-instance or restart-survival. Document as a v2 hardening item if horizontal scaling is ever needed. |
| Hardcoded BN128 field order constant | Import from `ffjavascript` | `ffjavascript`'s `src/curves.js` is **not** exported via its package.json `exports` map (confirmed: `ERR_PACKAGE_PATH_NOT_EXPORTED` when required directly) — importing it from outside the package is broken on installed Node ≥ 14 with `exports` enforcement. `identityCommitment.js` already sidesteps this by hardcoding the same constant inline with a comment citing the verified source. zkp-backend should follow the identical pattern (copy the constant, do not attempt a deep import). |

**Installation:**
No new packages required — `snarkjs`, `ethers`, `circomlibjs`, `express`, `dotenv`, `cors` are already in `zkp-backend/package.json` and installed.

**Version verification:** Verified directly via `npm view` against the registry and cross-checked against the installed `node_modules/*/package.json` in `zkp-backend/` (see table above) — both agree, so these are `[VERIFIED: npm registry]` for currency and `[VERIFIED: installed]` for what's actually on disk.

## Package Legitimacy Audit

No new external packages are being installed in this phase — every library `/generate-proof`, `/session/nonce`, etc. will use (`snarkjs`, `ethers`, `circomlibjs`, `express`, `crypto`) is already an installed, previously-vetted dependency of `zkp-backend` (or, for `crypto`, a Node.js builtin). The Package Legitimacy Gate is **not applicable** this phase.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| (none — no new installs) | — | — | — | — | — | N/A |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
[Verifier app]                         [Student app]
     |                                       |
     | 1. POST /session/nonce                |
     v                                       |
[zkp-backend] --(stores {nonce,sessionId,    |
     |            issuedAt,expiresAt,used:    |
     |            false} in in-memory Map)    |
     | 2. {nonce, sessionId, expiresAt}        |
     v                                       |
[Verifier shows challenge QR {nonce,sessionId}] -----> [Student scans QR]
                                                              |
                                                  3. App sends {attrs, salts,
                                                     reveal flags, nonce,
                                                     currentDateInt}
                                                              v
                                                   POST /generate-proof
                                                              |
                                            +-----------------------------+
                                            | zkp-backend                 |
                                            | - hashToField(name/rollNo/  |
                                            |   email) via circomlibjs    |
                                            | - compute isOver18,         |
                                            |   isPostgrad from real DOB/ |
                                            |   programmeLevel            |
                                            | - build full witness input  |
                                            | - snarkjs.groth16.fullProve |
                                            |   (wasm + zkey)             |
                                            +-----------------------------+
                                                              |
                                            {proof, publicSignals[19]}
                                                              |
                                                              v
                                                  [Student app shows proof QR]
                                                              |
                                              [Verifier scans, has proof+publicSignals]
                                                              |
                       +--------------------------------------------------------+
                       | POST /verify          POST /verify-onchain             |
                       | - groth16.verify(vKey, | - format pA/pB(swap)/pC        |
                       |   publicSignals,proof) | - verifierContract.verifyProof |
                       | - check publicSignals[1] === stored nonce              |
                       | - check now <= expiresAt, used === false               |
                       | - mark nonce consumed on first successful use          |
                       +--------------------------------------------------------+
                                                              |
                                              POST /credential-info {pubHash}
                                                              |
                                              registryContract.getCredentialByHash(
                                                bytes32(pubHash))
                                                              |
                                              {found, rollNo, ipfsCID, revoked, ...}
```

### Recommended Project Structure
```
zkp-backend/
├── server.js                # routes only — thin, delegates to lib/
├── lib/
│   ├── witnessBuilder.js     # builds full circuit input from {attrs, salts, reveal, nonce, currentDateInt}
│   ├── nonceStore.js         # in-memory Map + issue/validate/consume functions
│   └── predicates.js         # isOver18/isPostgrad computation (mirrors circuit's digit-shift logic exactly)
├── utils/
│   └── timing.js             # blueprint §10.1 timed() helper (shared with Phase 5 benchmarking)
├── identity.wasm             # Phase 3 artifact (already present)
├── identity_final.zkey       # Phase 3 artifact (already present)
└── verification_key.json     # Phase 3 artifact (already present, nPublic=19)
```

### Pattern 1: Public-input predicate pre-computation (circuit idiom carry-through)
**What:** Because `identity.circom` declares `isOver18`/`isPostgrad` as `signal input` (not `signal output`) that the circuit *constrains* equal to its own internally computed value (see circuit comment block, lines 32-46), the witness-builder MUST supply the *correct* precomputed predicate values, or `snarkjs.groth16.fullProve` / `wtns.calculate` throws (confirmed by `circuitParity.test.js`'s negative tests: asserting `isOver18: "1"` for an underage DOB causes witness generation to reject with an `Error`).
**When to use:** Always, in `/generate-proof` — compute `isOver18`/`isPostgrad` server-side from the real `dob`/`programmeLevel` using the exact same digit-shift arithmetic as the circuit (`currentDateInt - 18*10000 >= dobInt`, inclusive; `programmeLevel ∈ {4,5,6}`), then pass them into the witness input alongside the raw attrs.
**Example:**
```js
// Source: zk-proofs/circuits/identity.circom comments + zk-proofs/test/circuitParity.test.js
function computeIsOver18(currentDateInt, dobInt) {
  return (BigInt(currentDateInt) - 180000n >= BigInt(dobInt)) ? 1 : 0;
}
function computeIsPostgrad(programmeLevelCode) {
  return [4, 5, 6].includes(Number(programmeLevelCode)) ? 1 : 0;
}
```

### Pattern 2: Witness input shape (verified against circuitParity.test.js)
**What:** The full snarkjs input object the circuit expects.
**Example:**
```js
// Source: zk-proofs/test/circuitParity.test.js buildInput() (lines 84-98)
const input = {
  attr: attrs,              // string[7] — already-encoded leaf attribute values (hash-to-field for name/rollNo/email; raw int string for dob/programmeLevel/discipline/batch)
  salt: salts,               // string[7] — decimal field-element strings (generateSalts(7) if not pre-existing)
  nonce: nonce,               // decimal string — from POST /session/nonce
  currentDateInt: currentDateInt, // string "YYYYMMDD"
  isOver18: String(isOver18),     // "0" or "1" — backend-computed (Pattern 1)
  isPostgrad: String(isPostgrad), // "0" or "1" — backend-computed (Pattern 1)
  revealedValue: revealedValue,   // string[7] — attrs[i] if reveal[i] else "0"
  revealMask: revealMask,         // string[7] — "1"/"0"
};
const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);
```

### Pattern 3: String attribute hash-to-field (must match identityCommitment.js exactly)
**What:** `name`, `rollNo`, `email` are NOT raw `stringToBigInt` (the old, now-incorrect server.js pattern at line 23-30 — this function and its 3 call sites must be deleted, not reused, in Phase 4). They must use the same chunked-Poseidon `hashToField` as the admin issuance path.
**When to use:** `/generate-proof`'s witness builder, for any of the 3 string-typed leaf attributes.
**Example:**
```js
// Source: privdId_admin/backend/utils/identityCommitment.js (CHUNK_COUNTS, hashToField)
import { hashToField, CHUNK_COUNTS } from "../privdId_admin/backend/utils/identityCommitment.js";
const nameField = await hashToField(name, CHUNK_COUNTS.name);     // maxChunks=4
const rollNoField = await hashToField(rollNo, CHUNK_COUNTS.rollNo); // maxChunks=2
const emailField = await hashToField(email, CHUNK_COUNTS.email);   // maxChunks=2
```
Reusing the existing module (cross-service `import` from `zkp-backend` into `privdId_admin/backend/utils/`) is exactly the pattern `circuitParity.test.js` already uses (`await import("../../privdId_admin/backend/utils/identityCommitment.js")`), so it is proven viable across this repo's module boundaries. Alternatively, vendor/duplicate the function into `zkp-backend/lib/` if the planner prefers not to create a cross-service runtime dependency — **either is acceptable, but the encoding logic itself must be byte-for-byte identical** (CLAUDE.md ground rule #3).

### Pattern 4: On-chain verify pi_b swap (already correct, do not change)
**What:** `server.js`'s existing `/verify-onchain` already swaps `pi_b`'s inner array order (`[proof.pi_b[0][1], proof.pi_b[0][0]]`) — this is the standard snarkjs-to-Solidity G2 point ordering fix and remains correct for the new 19-signal circuit; only the `publicSignals` array length changes (5→19), not the pA/pB/pC handling.
**When to use:** Keep this code as-is; just confirm the `_pubSignals` array passed has length 19 to match `IdentityVerifier.sol`'s `uint[19] calldata _pubSignals` signature.

### Pattern 5: Nonce store (in-memory Map, TTL + one-time-use)
**What:** Minimal session-nonce lifecycle store satisfying REPL-03 / BACK's nonce success criteria.
**Example:**
```js
// lib/nonceStore.js
const crypto = require('crypto');
const BN128_FIELD_ORDER = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const TTL_MS = 5 * 60 * 1000;
const store = new Map(); // sessionId -> { nonce, issuedAt, expiresAt, used }

function issueNonce() {
  const sessionId = crypto.randomUUID();
  // 31 bytes = 248 bits, always < BN128 field order (same technique as
  // identityCommitment.js::generateSalt() — see Alternatives Considered).
  const nonce = BigInt('0x' + crypto.randomBytes(31).toString('hex')).toString();
  const issuedAt = Date.now();
  const expiresAt = issuedAt + TTL_MS;
  store.set(sessionId, { nonce, issuedAt, expiresAt, used: false });
  return { nonce, sessionId, expiresAt };
}

function validateAndConsume(sessionId, presentedNonce) {
  const entry = store.get(sessionId);
  if (!entry) return { ok: false, reason: 'unknown_session' };
  if (entry.used) return { ok: false, reason: 'nonce_already_used' };
  if (Date.now() > entry.expiresAt) return { ok: false, reason: 'nonce_expired' }; // server clock, never trust client
  if (entry.nonce !== presentedNonce) return { ok: false, reason: 'nonce_mismatch' };
  entry.used = true; // one-time use, marked on first successful check
  return { ok: true };
}

module.exports = { issueNonce, validateAndConsume };
```
Note: the verifier must pass `sessionId` back alongside the proof (e.g. in the `/verify` request body) so the backend knows which stored nonce to check against — the blueprint's challenge-QR flow (`{nonce, sessionId}`) already carries `sessionId` end-to-end for exactly this reason.

### Anti-Patterns to Avoid
- **Trusting client-supplied `isOver18`/`isPostgrad` without recomputing:** the circuit constrains equality but does not derive these values itself as outputs — if `/generate-proof` blindly forwards a `currentDateInt`/predicate pair from an untrusted caller without the backend independently knowing the real `dob`, a malicious client could request a witness for a predicate that doesn't match their actual stored DOB. The backend (not the client) must look up or be given the authoritative DOB/programmeLevel and compute predicates itself.
- **Trusting client clocks for nonce freshness:** blueprint explicitly calls this out (§E2: "Enforce the window server-side (do not trust client clocks)") — always compare against `Date.now()` on the server, never an attacker-suppliable timestamp field.
- **Reusing the old `stringToBigInt` helper for any string attribute:** it silently overflows/truncates the BN128 field for any string > ~31 bytes (documented root cause of the original §1.4-adjacent bug class) and is byte-incompatible with `hashToField`. Delete it; do not adapt it.
- **Hardcoded fallback contract addresses in server.js (lines 43-44):** flagged in Phase 3's summary as a Phase-4 cleanup item (`0x2625C6...`/`0xB7a915C7...` are stale). Phase 4 should remove these hardcoded fallbacks or update them to match `.env`, since a missing env var would otherwise silently resolve to a dead contract address instead of failing loudly.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Groth16 witness/proof generation | Custom R1CS solver or manual elliptic-curve math | `snarkjs.groth16.fullProve` (already a dependency) | snarkjs is the standard, audited-enough-for-prototype Groth16 toolchain already used end-to-end in this repo; reimplementing proving is far outside phase scope |
| Field-element random generation | `Math.random()` or naive `crypto.randomBytes(32) % p` | `crypto.randomBytes(31)` → BigInt (248 bits, always < BN128's ~254-bit order) | `identityCommitment.js::generateSalt()` already documents why 32 bytes mod p introduces modulo bias and chose 31 bytes specifically to avoid it — the nonce generator should follow the identical, already-justified pattern |
| String→field-element encoding | Raw `stringToBigInt` (old server.js pattern) | `hashToField` chunked-Poseidon from `identityCommitment.js` | Documented BN128 overflow bug for strings > ~31 bytes; the correct scheme already exists and is parity-tested against the circuit |
| Session/nonce TTL expiry | A `setTimeout`-based active eviction scheduler | Lazy expiry check (`Date.now() > expiresAt`) at validation time | Simpler, no timer leak risk, correct for a prototype's read-mostly nonce-check path; active eviction is only worth it if memory growth from never-validated nonces becomes a real concern (note as an Open Question below) |

**Key insight:** Every cryptographic primitive this phase touches (Poseidon hashing, field-element generation, Groth16 proving) already has a correct, tested implementation living in this repo from Phases 1-3. Phase 4's job is wiring, not invention — the highest-risk failure mode is silently reintroducing the old encoding (`stringToBigInt`) or skipping the predicate-recomputation step, not a missing library.

## Common Pitfalls

### Pitfall 1: Public signal index drift between circuit, contract, and backend
**What goes wrong:** `/generate-proof`'s returned `publicSignals` array order doesn't match what `/verify-onchain` and `/credential-info` expect, or what `IdentityVerifier.sol`'s `uint[19]` positional `IC1x..IC19x` linear combination assumes.
**Why it happens:** snarkjs emits `publicSignals` in the circuit's compiled signal order automatically (it is NOT something the backend constructs manually) — the risk is in `/credential-info` and `/verify` assuming `publicSignals[0]` is still the old 5-signal layout's position, or a future code change reordering the circuit's public input declaration (`component main {public [...]}` line 240) without realizing every downstream index shifts.
**How to avoid:** Treat the `component main {public [nonce, currentDateInt, isOver18, isPostgrad, revealedValue, revealMask]}` declaration line (and the frozen comment block above it) as the single source of truth; `publicSignals[0]` is always `pubHash` (the lone circom `signal output`), `[1]`=nonce, `[2]`=currentDateInt, `[3]`=isOver18, `[4]`=isPostgrad, `[5..11]`=revealedValue, `[12..18]`=revealMask — exactly as documented and already verified against `build/identity.sym` in Phase 2. Do not re-derive this order from first principles; copy it from the circuit comment and `circuitParity.test.js`'s `WITNESS_IDX` map.
**Warning signs:** `/verify` returns `false` for a freshly generated proof (the #1 symptom of an index mismatch) or `/credential-info` looks up the wrong field as `pubHash`.

### Pitfall 2: `groth16.fullProve` failing silently with an unhelpful error on malformed witness input
**What goes wrong:** Passing a JS `number` instead of a decimal string, or omitting a required field (as `circuitParity.test.js`'s nonce-omission test deliberately exercises), throws a low-level snarkjs/wasm error that doesn't clearly say which field was wrong.
**Why it happens:** snarkjs's witness calculator expects every signal to resolve to a field element; type coercion is not always forgiving (e.g., very large BigInts represented as JS `number` lose precision before reaching snarkjs).
**How to avoid:** Always normalize every numeric input to a decimal **string** (not `number`, not raw `BigInt` object — snarkjs's JSON-based circuit input expects strings or BigInts that JSON-stringify safely; the existing oracle code and test file consistently pass strings). Validate request body shape (Joi or manual checks) before constructing the witness input, so a malformed request fails with a clear 400 rather than an opaque snarkjs internal error.
**Warning signs:** `/generate-proof` returns a 500 with a snarkjs-internal stack trace instead of a clear validation message.

### Pitfall 3: Forgetting the predicate-recomputation step entirely (treating isOver18/isPostgrad as client-supplied)
**What goes wrong:** If `/generate-proof` just forwards whatever `isOver18`/`isPostgrad` the caller sends, two things can happen: (a) a caller who doesn't know they must self-compute these values gets a confusing witness-generation error (since the circuit performs an `===` assertion you cannot satisfy with an arbitrary value), or worse (b) if the backend doesn't independently verify against the real stored attribute, a malicious caller who DOES correctly compute these from a falsified DOB gets a valid proof of an incorrect predicate.
**Why it happens:** It is tempting to treat the request body as fully self-describing (the client "knows" their own DOB) without re-deriving from a trusted source, since the circuit's `===` constraint makes it *look* self-verifying.
**How to avoid:** Always compute `isOver18`/`isPostgrad` server-side from the same `dob`/`programmeLevel` values that feed `attr[2]`/`attr[3]` in the SAME request — i.e., derive deterministically, never accept as independent input fields from the caller. The `===` constraint in the circuit catches an *inconsistent* witness (caller asserts isOver18=1 but DOB says otherwise) but does NOT prevent a caller from supplying a DOB that doesn't match their actually-issued credential — that consistency is guaranteed by the *registry lookup* one step removed (Phase 4 does not need to solve credential-binding-to-identity here; that is established at issuance time, not proof time).
**Warning signs:** Witness generation throwing `Error` for legitimate over-18 students (predicate logic bug) or, more dangerously, proofs succeeding for predicate values that don't match what was actually committed (logic bypass — should not be possible given the `===` constraint, but worth an explicit test).

### Pitfall 4: Nonce TTL window off-by-one or unit confusion (ms vs seconds)
**What goes wrong:** Mixing `Date.now()` (milliseconds) with a TTL expressed in seconds, producing either immediate expiry or a window 1000x too long.
**Why it happens:** The blueprint states "5-minute TTL" without specifying units in the wire format; `Date.now()` returns ms, but some JWT-style conventions use Unix seconds.
**How to avoid:** Pick one unit (milliseconds, matching `Date.now()`) for all internal storage and document it; if `expiresAt` is returned to the client in the API response, document its unit explicitly in the route or response shape so the verifier app doesn't misinterpret it.
**Warning signs:** Nonces expire almost immediately, or never expire during manual testing.

### Pitfall 5: `Map`-based nonce store growing unbounded under load
**What goes wrong:** Every `POST /session/nonce` call adds an entry that is never removed unless `validateAndConsume` is called for that exact `sessionId` — abandoned/never-redeemed challenges accumulate forever in process memory.
**Why it happens:** Lazy expiry (Pitfall-3-adjacent pattern) only evicts on access, not proactively.
**How to avoid:** For phase scope (prototype, low traffic, demo/thesis usage), this is an acceptable known limitation — document it explicitly rather than over-engineering a cleanup sweep. If it matters, a simple periodic `setInterval` sweep deleting `expiresAt < Date.now()` entries is a 5-line addition; flag as a "nice to have" rather than blocking.
**Warning signs:** Long-running process memory growth in a load test (unlikely to matter for this milestone's success criteria).

## Code Examples

### Express 5 async route error handling (relevant version-specific behavior)
```js
// Source: zkp-backend/package.json (express ^5.1.0, installed 5.2.1)
// Express 5 (unlike Express 4) automatically forwards a rejected Promise
// returned from an async route handler to the error-handling middleware —
// but the existing server.js routes already wrap everything in their own
// try/catch and respond directly, so this is informational: do not rely on
// Express 5's auto-forwarding AND have a try/catch that already swallows
// the error — pick one pattern consistently (the existing code's explicit
// try/catch + res.status(...).json(...) is fine to keep).
```

### Off-chain verify (unchanged call shape, larger publicSignals)
```js
// Source: zkp-backend/server.js lines 86-96 (existing code, correct as-is)
const isValid = await snarkjs.groth16.verify(vKey, publicSignals, proof);
```

### On-chain verify (unchanged pA/pB-swap/pC shape, publicSignals now length 19)
```js
// Source: zkp-backend/server.js lines 98-127 (existing code, correct as-is —
// only the publicSignals array length implicitly changes from 5 to 19)
const pA = [proof.pi_a[0], proof.pi_a[1]];
const pB = [
  [proof.pi_b[0][1], proof.pi_b[0][0]],
  [proof.pi_b[1][1], proof.pi_b[1][0]],
];
const pC = [proof.pi_c[0], proof.pi_c[1]];
const isValid = await verifierContract.verifyProof(pA, pB, pC, publicSignals);
```

### credential-info pubHash-as-Merkle-root (unchanged, already correct per BACK-03)
```js
// Source: zkp-backend/server.js lines 129-157 (existing code — bytes32
// conversion logic is already correct for a Merkle root; no change needed
// beyond confirming publicSignals[0] really is the new circuit's pubHash)
const pubHashBytes32 = ethers.zeroPadValue(ethers.toBeHex(BigInt(pubHash)), 32);
const [rollNo, ipfsCID, issuedAt, exists, revoked] =
  await registryContract.getCredentialByHash(pubHashBytes32);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `/generate-proof` accepts `{name, rollNo, dob, phoneNo, branch}` raw strings, `stringToBigInt` encoding | Accepts 7-attribute spec (`name, rollNo, dob, programmeLevel, discipline, batch, email`), `hashToField` chunked-Poseidon encoding for strings | Phase 1 (spec freeze) + Phase 2 (circuit) + now Phase 4 (backend) | `phoneNo`/`branch` dropped per D-?? milestone decisions; `programme` split into `programmeLevel`+`discipline`; `phone` replaced by `email` |
| 5 public signals (old flat Poseidon(5) circuit, `nPublic` unconfirmed but circuit-different) | 19 public signals (`pubHash, nonce, currentDateInt, isOver18, isPostgrad, revealedValue[7], revealMask[7]`) | Phase 2 circuit freeze, Phase 3 trusted setup | Every downstream consumer of `publicSignals` (backend routes, contract) must index by the new 19-position layout |
| No replay protection | `nonce` forced into a real constraint (`nonceSq <== nonce * nonce`), backend-enforced match+freshness+one-time-use | Phase 2 (circuit) + Phase 4 (backend enforcement, this phase) | A captured proof QR cannot be replayed against a new verifier session |

**Deprecated/outdated:**
- `stringToBigInt` (server.js lines 23-30): silently overflows BN128 for strings > ~31 bytes; replaced by `hashToField`. Delete, do not keep as a fallback.
- Hardcoded verifier/registry address fallbacks in server.js (lines 43-44): stale addresses from before Phase 3's redeploy; should be removed or aligned (flagged by Phase 3's own summary as a Phase-4 cleanup candidate).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The mobile/verifier app's exact request/response wire format for `/generate-proof`, `/session/nonce`, and the challenge-QR flow is not yet implemented in `digital-app/` — this research assumes the backend API shape described in blueprint §E2/§4.3, but the actual app-side integration (QR scanning, calling these new endpoints) is out of phase scope per the phase description (ZKP backend only) | Architecture Patterns, Code Examples | If the app integration is silently expected to land in this same phase, task scope is larger than the roadmap's stated success criteria suggest — confirm with the user/planner that app-side wiring is Phase 5+ or a future milestone, not Phase 4 |
| A2 | `salts` are assumed to be either generated fresh by the backend per proof request, or pre-existing per-student values already stored by the admin backend at issuance time and passed through to `/generate-proof` by the calling app — the exact provenance (does the student app store its own salts long-term, or does the backend regenerate per-presentation?) is not fully specified in available docs | Standard Stack, Pattern 2 | If salts must be regenerated per-presentation, the Merkle root changes every time and would no longer match the on-chain-registered root — salts are almost certainly the SAME ones from issuance (stored by/given to the student), not regenerated, but this should be confirmed before planning the exact request payload |
| A3 | `/session/nonce` ties a nonce to a `sessionId` that the verify-time request (`/verify` and/or `/verify-onchain`) must also supply to know which stored entry to check — the blueprint implies this via the challenge QR carrying `{nonce, sessionId}`, but the exact request shape for `/verify`/`/verify-onchain` (does the body need an explicit `sessionId` field, or is the nonce alone looked up by value?) is a design choice this research recommends but the user/planner should confirm | Pattern 5, Common Pitfalls | A nonce-only lookup (no sessionId) works too (less state) but loses the explicit session-binding the blueprint's flow diagram implies; either is implementable, but the planner should pick one and document it in the plan |

## Open Questions

1. **Does `/generate-proof` need to look up a student's stored salts/attrs from the admin backend/database, or does the caller (app) always supply them in the request body?**
   - What we know: `identityCommitment.js`'s `generateSalts`/`computeMerkleRoot` are called at issuance time by `studentService.js` and the resulting `salts` are stored on the `student` record (admin backend, MongoDB) — `zkp-backend` itself has no database connection.
   - What's unclear: whether Phase 4's `/generate-proof` is expected to fetch attrs/salts from the admin backend (cross-service HTTP call or shared DB access) or simply trust whatever the calling app supplies in the request body (the app having received its own salts/attrs at enrollment time).
   - Recommendation: Given zkp-backend has no DB wiring and CLAUDE.md ground rule #4 says "proof generation is server-side; decryption is on-device" (implying the app already holds its decrypted attrs/salts), the simplest and most likely-correct design is: the **app sends attrs+salts+reveal flags in the request body**, and zkp-backend is a stateless prover that never queries the admin backend. Confirm this with the user during planning/discuss-phase before committing to the request shape.

2. **What HTTP status/error shape should nonce-validation failures return?**
   - What we know: the phase's success criteria say verify-time enforcement must "reject" a proof with a non-matching/expired/consumed nonce.
   - What's unclear: whether "reject" means `/verify` returns `{valid: false}` (200 OK, business-logic failure) or a 4xx HTTP error (e.g. 401/409) distinguishing nonce failures from a genuinely invalid cryptographic proof.
   - Recommendation: Return a 200 with `{valid: false, reason: "<nonce_expired|nonce_mismatch|nonce_already_used>"}` distinct from the cryptographic verify result, so callers (and UAT) can tell "proof math good but nonce stale" apart from "proof itself is fraudulent" — useful both for debugging and for an honest research write-up in Phase 5.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | zkp-backend runtime | ✓ | v22.17.1 | — |
| snarkjs | proof gen/verify | ✓ (installed) | 0.7.6 | — |
| ethers | on-chain verify/registry reads | ✓ (installed) | 6.16.0 | — |
| Sepolia RPC (Alchemy) | `/verify-onchain`, `/credential-info` | ✓ (per Phase 3 summary, live deploy confirmed reachable) | — | — |
| `identity.wasm` / `identity_final.zkey` / `verification_key.json` | proof gen | ✓ (copied in Phase 3, nPublic=19 confirmed) | — | — |
| MongoDB / external DB for nonce persistence | nonce store | ✗ (not present, not required) | — | In-memory `Map` (this phase's recommended approach — see Don't Hand-Roll / Pattern 5) |

**Missing dependencies with no fallback:** none — all required dependencies are present.

**Missing dependencies with fallback:** persistent nonce storage is absent but has a documented, sufficient fallback (in-memory `Map`) for this phase's single-instance prototype scope.

## Project Constraints (from CLAUDE.md)

- **Field-set consistency is sacred** (ground rule #3): the issuance commitment (admin backend) and the prover (zkp-backend) must use an identical attribute list, order, and encoding — Phase 4's witness builder MUST use the same `hashToField`/`CHUNK_COUNTS` scheme as `identityCommitment.js`, not a reimplementation.
- **Proof generation is server-side; decryption is on-device; DEK and student private key never leave the device** (ground rule #4) — `/generate-proof` only ever receives already-decrypted attrs/salts from the calling app; zkp-backend never handles encryption keys.
- **Measure everything** (ground rule #5) — every new crypto op in this phase (`fullProve`, `groth16.verify`, on-chain `verifyProof`, nonce issue/check) should print elapsed seconds via the shared `timed()` helper from blueprint §10.1, even though the full benchmark script (`bench.js`, mean±σ over n≥19) is Phase 5's job — Phase 4 should at minimum retain/extend the existing `console.time`/`console.timeEnd` calls already in `server.js` so Phase 5 has something to build on.
- **WSL tooling** (ground rule #6): any circuit/hardhat/snarkjs CLI commands must run from a real WSL shell with relative paths — not relevant to zkp-backend's pure Express/Node code, but relevant if Phase 4 needs to re-run any `zk-proofs/` scripts for verification.
- **Don't trust the root README.md** (ground rule #2) — not directly relevant to this phase's code, but applies if any task references repo-level setup docs.

## Sources

### Primary (HIGH confidence)
- `zk-proofs/circuits/identity.circom` — frozen circuit signal declarations, comments documenting public-signal order and the output/input idiom rationale
- `zk-proofs/contracts/IdentityVerifier.sol` — deployed verifier, confirms `uint[19] calldata _pubSignals` (19 public signals matches the frozen §3 spec)
- `zk-proofs/test/circuitParity.test.js` — canonical witness-input-shape reference, exercised against the real compiled circuit
- `privdId_admin/backend/utils/identityCommitment.js` — canonical `hashToField`/`generateSalt`/`computeMerkleRoot` implementation, the JS oracle the circuit is parity-tested against
- `privdId_admin/backend/constants/enumCodes.js` — frozen `PROGRAMME_LEVEL`/`DISCIPLINE`/`POSTGRAD_CODES` integer mappings
- `zkp-backend/server.js` (current state) — existing route shapes, on-chain verify pA/pB-swap/pC pattern, credential-info logic
- `docs/CLAUDE_CODE_BLUEPRINT.md` §3, §4.3, §E2, §10 — frozen public-signal layout, ZKP backend change spec, nonce lifecycle flow, performance instrumentation pattern
- `.planning/phases/03-trusted-setup-redeploy/03-02-SUMMARY.md` — confirms `nPublic === 19`, new Sepolia verifier address, flags stale hardcoded fallbacks as a Phase-4 cleanup item
- `npm view snarkjs/express/ethers version` — confirmed current registry versions match installed `node_modules`

### Secondary (MEDIUM confidence)
- None — all findings for this phase were verifiable directly against repo source files and the installed dependency tree; no unverified web-search claims were needed.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every library is already installed and verified in this exact repo; no new dependency decisions
- Architecture: HIGH — the circuit, contract, and JS oracle are pre-existing frozen artifacts with explicit documentation and a passing parity test suite to anchor against
- Pitfalls: HIGH — derived directly from the circuit's own documented design rationale and `circuitParity.test.js`'s negative-test cases, not speculation

**Research date:** 2026-06-18
**Valid until:** Stable until the circuit is touched again (frozen per ground rule #1) — effectively valid for the remainder of this milestone (Phase 4-5); re-verify only if `identity.circom` or the trusted-setup artifacts change.
