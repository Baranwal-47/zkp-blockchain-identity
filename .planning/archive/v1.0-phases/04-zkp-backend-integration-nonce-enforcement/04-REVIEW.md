---
phase: 04-zkp-backend-integration-nonce-enforcement
reviewed: 2026-06-18T13:09:42Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - zkp-backend/lib/encoding.js
  - zkp-backend/lib/nonceStore.js
  - zkp-backend/lib/predicates.js
  - zkp-backend/lib/witnessBuilder.js
  - zkp-backend/package.json
  - zkp-backend/server.js
  - zkp-backend/test/encoding.test.js
  - zkp-backend/test/generateProof.test.js
  - zkp-backend/test/nonceStore.test.js
  - zkp-backend/test/predicates.test.js
  - zkp-backend/test/verifyFlow.test.js
  - zkp-backend/test/witnessBuilder.test.js
findings:
  critical: 2
  warning: 3
  info: 2
  total: 7
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-06-18T13:09:42Z
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

This phase rewrote `zkp-backend`'s proof-generation path to be field-set-consistent with the admin
backend's issuance commitment and added session-nonce replay protection. The parity-critical pieces
are solid: `lib/encoding.js`'s `hashToField`/`generateSalt`/`generateSalts` are byte-for-byte identical
to `privdId_admin/backend/utils/identityCommitment.js`, `lib/witnessBuilder.js`'s vendored
`PROGRAMME_LEVEL`/`DISCIPLINE` tables match `privdId_admin/backend/constants/enumCodes.js` exactly, and
the circuit's actual public-signal order (`pubHash, nonce, currentDateInt, isOver18, isPostgrad,
revealedValue[7], revealMask[7]`) genuinely matches `server.js`'s use of `publicSignals[0]` (pubHash)
and `publicSignals[1]` (nonce). The full test suite (30 passing, 2 pending/skipped pending live RPC)
exercises the pubHash-parity claim against the real circuit witness and confirms it holds. No dead code
from the deleted 5-field `stringToBigInt` path was found anywhere in the reviewed files.

However, two trust-boundary gaps were found that are in scope for this phase's own routes: `/generate-proof`
has no authentication and accepts fully client-supplied `attrs`, so any caller can mint a valid proof for
an arbitrary (possibly fabricated) identity with no binding to a real, previously-issued, on-chain
commitment — this was flagged as an open/unresolved question in `04-RESEARCH.md` and was never closed in
the implementation. Separately, `/generate-proof` logs the complete raw request body — including a
student's real name, roll number, DOB, and email — to stdout on every call, which is a meaningful privacy
regression for a system whose entire purpose is privacy-preserving identity disclosure.

## Critical Issues

### CR-01: `/generate-proof` accepts unauthenticated, unverified identity attrs — proofs are not bound to any real issued credential

**File:** `zkp-backend/server.js:72-119`
**Issue:** The route builds a witness and produces a cryptographically valid Groth16 proof entirely from
client-supplied `attrs`/`salts`/`reveal`. There is no lookup against the admin backend, IPFS, or on-chain
registry to confirm that the supplied `attrs`+`salts` correspond to an identity that was actually issued.
Combined with `cors()` configured with no origin allowlist (`server.js:14`) and no auth middleware anywhere
in the file, any network caller can request a proof for a fabricated student (e.g., a fake `rollNo`/`name`/
`dob` combination), and `/verify` / `/verify-onchain` will report `{valid:true}` for it — the cryptographic
verification only proves "this witness was computed correctly," not "this is a real, registered student."
`04-RESEARCH.md:337` explicitly flagged this as an unresolved open question ("whether Phase 4's
`/generate-proof` is expected to fetch attrs/salts from the admin backend ... or simply trust whatever the
calling app supplies") and the implementation silently chose the trusting branch without closing the gap
or documenting it as an accepted limitation anywhere in the phase artifacts.
**Fix:** At minimum, document this as an explicit accepted limitation (mirroring how the nonce-store
unbounded-growth limitation was documented in `lib/nonceStore.js`'s header). Better: require the caller to
present something that ties the request to a real credential before generating a proof — e.g., verify the
resulting `pubHash` (computed locally from `attrs`+`salts` before calling `fullProve`) against
`registryContract.getCredentialByHash` and reject with 403/404 if it isn't a registered, non-revoked
credential:
```javascript
const { computeMerkleRoot } = require('../privdId_admin/backend/utils/identityCommitment.js'); // or vendor it
// ... after building `input.attr` / before fullProve:
const pubHash = await computeMerkleRoot(input.attr, salts);
const pubHashBytes32 = ethers.zeroPadValue(ethers.toBeHex(BigInt(pubHash)), 32);
const [, , , exists, revoked] = await registryContract.getCredentialByHash(pubHashBytes32);
if (!exists || revoked) {
  return res.status(403).json({ error: 'attrs do not correspond to a registered, active credential' });
}
```

### CR-02: `/generate-proof` logs full PII (name, rollNo, DOB, email, salts) to stdout on every request

**File:** `zkp-backend/server.js:73`
**Issue:** `console.log('Received input:', req.body)` writes the entire raw request body — including the
student's real name, roll number, date of birth, email, and the per-attribute salts — to the process's
stdout/log stream on every single proof-generation call. In a system whose explicit purpose is
privacy-preserving selective disclosure (CLAUDE.md: "PrivdID is a privacy-preserving student identity
system"), persisting plaintext PII to application logs is a meaningful data-exposure risk: logs are
typically retained, may be shipped to third-party log aggregators, and are a common target/leak vector
that bypasses every privacy guarantee the ZK layer is built to provide.
**Fix:** Remove the PII from the log line, or log only non-identifying metadata:
```javascript
app.post('/generate-proof', async (req, res) => {
  console.log('Received /generate-proof request', { hasAttrs: !!req.body?.attrs, hasSalts: Array.isArray(req.body?.salts) });
  ...
```

## Warnings

### WR-01: `/verify` destructures `req.body` outside the try/catch with no fallback, unlike the other routes

**File:** `zkp-backend/server.js:136-156`
**Issue:** `const { proof, publicSignals, sessionId } = req.body;` (line 137) sits before the `try` block
and has no `|| {}` fallback, unlike `/generate-proof` (line 75-76, `req.body || {}`) and `/verify-onchain`
(line 164, then an explicit guard at 166-168). Under the current `express.json()` middleware, `req.body`
defaults to `{}` for empty/non-JSON bodies in Express 5, so this is not exploitable today, but it is an
inconsistent defensive pattern compared to the sibling routes in the same file, and would crash with an
unhandled `TypeError` (500, no JSON error body) if that middleware default ever changes or this route is
reused behind a different body parser.
**Fix:** Match the pattern used elsewhere in the file:
```javascript
app.post('/verify', async (req, res) => {
  const { proof, publicSignals, sessionId } = req.body || {};
  if (!proof || !Array.isArray(publicSignals)) {
    return res.status(400).json({ error: 'proof and publicSignals are required' });
  }
  try {
    ...
```

### WR-02: `/verify` and `/verify-onchain` leak raw internal error messages to the client

**File:** `zkp-backend/server.js:154`, `zkp-backend/server.js:202`
**Issue:** Both catch blocks return `err.message` verbatim in the JSON response
(`res.status(400).json({ error: err.message })` / `res.status(500).json({ error: 'On-chain verification failed', details: err.message })`).
For malformed input this currently surfaces snarkjs/ethers internals such as
`"Cannot read properties of undefined (reading 'length')"` directly to the caller — not a secret leak, but
an implementation-detail leak that aids an attacker probing the verifier's internals and is inconsistent
with the input-validation-first approach already used in `/generate-proof` and `/verify-onchain`'s length
check.
**Fix:** Validate `proof`/`publicSignals` shape before calling into snarkjs (mirroring the
`/verify-onchain` guard already present at lines 166-171), and log the raw error server-side only:
```javascript
} catch (err) {
  console.error('verify error:', err);
  res.status(400).json({ error: 'Verification failed' });
}
```

### WR-03: `nonceStore.js`'s documented unbounded-growth limitation has no operational mitigation wired up

**File:** `zkp-backend/lib/nonceStore.js:14-20`
**Issue:** This is explicitly called out in the module header as an accepted prototype limitation, and the
phase research/plan documents treat it as a deliberate, deferred decision — so it is not a hidden defect.
Flagging at WARNING (not BLOCKER) because the header itself documents that a periodic sweep is the
intended v2 fix and that this is out of scope for the current milestone. Re-raising here only so it is
visible in the consolidated review record rather than buried in a code comment, since an unbounded
in-memory `Map` keyed by attacker-triggerable `POST /session/nonce` calls is a real (if currently
out-of-scope) DoS vector once this prototype sees real traffic.
**Fix:** No action required for this phase per the documented disposition; tracked for a future hardening
pass (`setInterval` sweep deleting `expiresAt < Date.now()` entries).

## Info

### IN-01: `package.json` test script relies on shell globstar (`**`) without enabling it

**File:** `zkp-backend/package.json:6`
**Issue:** `"test": "mocha test/**/*.test.js --exit"` depends on either the invoking shell having
`globstar` enabled or mocha's own glob expansion supporting `**`. Works today because all 6 test files sit
flat in `test/` (no subdirectories), but if a future commit adds a nested `test/integration/` directory,
this glob may silently miss those files in some shells (bash without `shopt -s globstar` would error
"glob: no match" or pass the literal string through, depending on `nullglob`/`failglob` settings).
**Fix:** Use mocha's own `--recursive` flag or spec config instead of relying on shell glob semantics:
```json
"test": "mocha test/**/*.test.js --recursive --exit"
```

### IN-02: `resolveDobInt` accepts syntactically-valid but calendar-invalid dates (e.g., `"2004-02-30"`)

**File:** `zkp-backend/lib/witnessBuilder.js:88-99`
**Issue:** The regex `^\d{8}$` only validates digit-shape, not calendar validity. A `dob` of
`"2004-02-30"` (February has no 30th) or `"2004-13-01"` (month 13) passes validation and silently feeds an
invalid date into the Merkle leaf and the `computeIsOver18` age check, producing a witness/proof for a
person who was never born on that date. This mirrors the admin-backend's own validation surface (likely
enforced at the Joi validator layer upstream, not duplicated here), so it may be acceptable if the admin
backend is the only legitimate caller — but `/generate-proof` accepts attrs directly from any HTTP caller
(see CR-01), so this zkp-backend copy has no equivalent guard.
**Fix:** Add a calendar-validity check if this endpoint is ever exposed to less-trusted callers than today:
```javascript
const [y, m, d] = [stripped.slice(0,4), stripped.slice(4,6), stripped.slice(6,8)].map(Number);
const dt = new Date(y, m - 1, d);
if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) {
  throw new Error(`witnessBuilder: dob is not a valid calendar date: ${JSON.stringify(dob)}`);
}
```

---

_Reviewed: 2026-06-18T13:09:42Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
