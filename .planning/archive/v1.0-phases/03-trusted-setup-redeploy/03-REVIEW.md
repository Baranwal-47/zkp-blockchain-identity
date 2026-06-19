---
phase: 03-trusted-setup-redeploy
reviewed: 2026-06-18T03:45:16Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - docs/current/research/PERFORMANCE_METRICS.md
  - zk-proofs/contracts/IdentityVerifier.sol
  - zk-proofs/hardhat.config.js
  - zk-proofs/test/circuitParity.test.js
  - zk-proofs/verification_key.json
  - zkp-backend/.env
  - zkp-backend/identity.wasm
  - zkp-backend/identity_final.zkey
  - zkp-backend/verification_key.json
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-06-18T03:45:16Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

This phase re-ran the Groth16 trusted-setup ceremony, exported a new `Groth16Verifier` contract,
deployed it to Sepolia, and copied the new circuit artifacts (`identity.wasm`,
`identity_final.zkey`, `verification_key.json`) into `zkp-backend/`. The artifacts in scope are
internally consistent: `nPublic: 19` matches across both copies of `verification_key.json`,
`IdentityVerifier.sol`'s `verifyProof(uint[19] calldata _pubSignals)` matches that count, and the
generated `verifyProof` Yul body is auto-generated snarkjs boilerplate (not hand-edited, low risk
of injected bugs). `identity.wasm`/`identity_final.zkey` are byte-identical between
`zk-proofs/build/` and `zkp-backend/`, confirming the copy step did not silently use a stale
artifact. `zkp-backend/.env` is correctly gitignored and not tracked in git history.

The most significant issue found is **out of the explicit file list for this phase**
(`zkp-backend/server.js`) but is directly load-bearing for whether the artifacts this phase wired
up are actually usable: `/generate-proof` in `server.js` still builds a 5-field flat input
(`name, rollNo, dob, phoneNo, branch`) for `snarkjs.groth16.fullProve`, which does not match the
new circuit's actual public/private input schema (`attr[7]`, `salt[7]`, `nonce`,
`currentDateInt`, `isOver18`, `isPostgrad`, `revealedValue[7]`, `revealMask[7]`). Calling
`fullProve` against the new `identity.wasm` with this old input shape will fail at runtime. This
is flagged as context below since `server.js` is not in this phase's file list, but it should be
tracked as a blocking gap before this phase is considered "done" end-to-end.

Within the files actually in scope, the main findings are: a hardcoded stale fallback verifier
address embedded as a literal default elsewhere in the codebase that the project's own
`CEREMONY_LOG.md` explicitly called out as a risk to verify is dead, a `.env` committed locally
with multiple live-looking secrets (Pinata API key/secret/JWT, an Ethereum private key, and an
Alchemy RPC URL with embedded API key) that must never be committed even though `.gitignore`
currently protects it, and a few minor documentation/test-hygiene items.

## Critical Issues

### CR-01: `zkp-backend/.env` contains multiple live-looking secrets with no rotation/secret-management plan

**File:** `zkp-backend/.env:1-13`
**Issue:** The committed-to-disk `.env` (correctly gitignored, confirmed not tracked in git
history) nonetheless contains a full set of high-value secrets in plaintext:
- `PINATA_APIKEY`, `PINATA_SECRETKEY`, `PINATA_JWT` (long-lived Pinata JWT, decodable and
  containing the account email)
- `PRIVATE_KEY` — a raw Ethereum private key (`208f2fb1...fbfde3be4`), used directly by
  `hardhat.config.js`'s `sepolia` network config to sign real transactions
- `SEPOLIA_RPC_URL` / `BLOCKCHAIN_RPC_URL` — Alchemy RPC URLs with the Alchemy API key embedded
  in the URL path itself (`/v2/Lmv_xbdd0nSBMkbWSz9kk`)

This is flagged as Critical rather than Info because: (1) the private key is used to sign and
broadcast real Sepolia transactions (deploy txs, registry writes) per `hardhat.config.js`, so its
exposure compromises the deployer/admin account; (2) the Alchemy key embedded in a URL is
trivially leaked by any logging, error message, or stack trace that prints the RPC URL (e.g. if
`ethers.JsonRpcProvider` construction ever throws and the error is logged verbatim somewhere
downstream); (3) there is no indication in this phase's artifacts of a secret-rotation step after
this ceremony/deploy, meaning the same key that paid for and authorized the Sepolia deploy is the
one sitting in this plaintext file going forward.

This file is correctly excluded from git (verified via `git ls-files` and full history scan), so
the immediate risk is local-disk exposure / accidental `git add -f` / accidental inclusion in a
support bundle, screen share, or backup — not a public leak today. Still, given this is a
deployer key with on-chain write access (per CLAUDE.md, the admin backend performs on-chain
writes), it should be treated as critical hygiene debt.

**Fix:**
- Confirm this specific private key is a dedicated, low-value Sepolia testnet key with no mainnet
  reuse, and rotate it if it has ever been pasted into a chat log, ticket, or screenshare.
- Move secrets to a secrets manager (or at minimum a `.env` outside the repo working tree) before
  any production-adjacent deployment; testnet-only is a mitigating factor but not a long-term
  answer.
- Scrub the Alchemy API key out of logs: ensure no code path logs `rpcUrl` or the constructed
  `JsonRpcProvider` object (e.g. via `console.error(err)` on a provider-construction failure, which
  could include the URL in `err.message`).

## Warnings

### WR-01: Stale hardcoded verifier/registry address fallbacks contradict this phase's redeploy and were explicitly flagged as a risk by this phase's own ceremony log

**File:** `zkp-backend/.env:12-13` (cross-referenced against `zkp-backend/server.js:43-44`, out of
this phase's file list but directly dependent on the values this phase set)
**Issue:** `zkp-backend/.env` sets `VERIFIER_ADDRESS=0x630955e2E7e795B3075BD35c2bB93ceA7cE5ffc4`
and `REGISTRY_ADDRESS=0x600E178030402E117672439e2026A82c627B5527` — presumably the new Sepolia
addresses from this phase's redeploy. However, `zkp-backend/server.js` (not in this phase's file
list, but the sole consumer of these env vars) defines hardcoded fallback literals
(`'0x2625C6fDBEDcCD572836FfbFA391D2C25de7ae26'` and `'0xB7a915C78C546A1082CB66bA294fAFee52E4EB07'`)
that activate via `||` whenever the env var is unset or empty. This phase's own
`.planning/phases/03-trusted-setup-redeploy/CEREMONY_LOG.md` explicitly calls this out under
"Hand-off to Plan 03-02" as something that "must" be confirmed "is not silently used" — but
nothing in the reviewed file set demonstrates that confirmation happened, and the dead fallback
literals were never removed. If `.env` is ever missing, malformed, or fails to load (e.g.
`dotenv` silently no-ops if the file path resolution differs in a different deployment
environment), the server will silently fall back to the **stale pre-redeploy** verifier/registry
addresses with no warning, causing on-chain verification calls to hit the wrong (possibly
non-existent or outdated) contract.
**Fix:** Remove the hardcoded fallback addresses entirely and fail fast at startup if
`VERIFIER_ADDRESS` / `REGISTRY_ADDRESS` are not set:
```js
const verifierAddress = process.env.VERIFIER_ADDRESS;
const registryAddress = process.env.REGISTRY_ADDRESS;
if (!verifierAddress || !registryAddress) {
  throw new Error('VERIFIER_ADDRESS and REGISTRY_ADDRESS must be set in the environment');
}
```
This converts a silent wrong-network footgun into a loud boot-time failure, which is much safer
for a contract address that changes every time the trusted setup is redone (CLAUDE.md ground rule
1).

### WR-02: `hardhat.config.js` does not validate `SEPOLIA_RPC_URL` / `PRIVATE_KEY` before constructing the network config, producing a confusing malformed-account error instead of a clear "missing env var" error

**File:** `zk-proofs/hardhat.config.js:21-24`
**Issue:**
```js
sepolia: {
  url: process.env.SEPOLIA_RPC_URL,
  accounts: [`0x${process.env.PRIVATE_KEY}`]
}
```
If `PRIVATE_KEY` is unset (e.g. a contributor clones the repo without copying `.env`, or runs in
CI without secrets configured), `accounts` becomes `["0xundefined"]`. Hardhat/ethers will reject
this with an opaque "invalid private key" style error rather than telling the developer that
`PRIVATE_KEY` is missing from their environment. Similarly an unset `SEPOLIA_RPC_URL` resolves to
`url: undefined`, which fails with a generic network-config error far from the actual root cause.
This is low-severity (the failure is loud, not silent — it just costs debugging time) but worth
fixing given this file gates every future redeploy after a circuit change (CLAUDE.md ground rule
1 guarantees `hardhat.config.js` will be exercised again).
**Fix:**
```js
const { SEPOLIA_RPC_URL, PRIVATE_KEY } = process.env;
if (!SEPOLIA_RPC_URL || !PRIVATE_KEY) {
  console.warn('SEPOLIA_RPC_URL or PRIVATE_KEY not set — sepolia network unusable');
}
// ...
sepolia: {
  url: SEPOLIA_RPC_URL || "",
  accounts: PRIVATE_KEY ? [`0x${PRIVATE_KEY}`] : []
}
```

### WR-03: `circuitParity.test.js` re-imports the ESM oracle module a second time inside a single test instead of reusing the `before()`-cached reference

**File:** `zk-proofs/test/circuitParity.test.js:177-179`
**Issue:** The `before()` hook (lines 57-63) already dynamically imports
`identityCommitment.js` once and caches `computeMerkleRoot` on the outer `let` binding. The
"zero-padding leaf sanity" test (lines 170-189) re-runs `await import(...)` itself to grab
`computeLeaf`, duplicating the import logic and the relative path string
(`"../../privdId_admin/backend/utils/identityCommitment.js"`) instead of extending the `before()`
hook to also cache `computeLeaf`. This is not a correctness bug (dynamic ESM imports of an
already-loaded module are cached by Node and cheap), but it is a maintainability smell: the
relative path is now duplicated in two places in the same file, and if the module's exports are
refactored, only one of the two call sites might get updated.
**Fix:** Hoist `computeLeaf` into the `before()` hook alongside `computeMerkleRoot`:
```js
before(async function () {
  const oracle = await import(
    "../../privdId_admin/backend/utils/identityCommitment.js"
  );
  computeMerkleRoot = oracle.computeMerkleRoot;
  computeLeaf = oracle.computeLeaf;
  // ...
});
```
and reference the cached `computeLeaf` at line 180 instead of re-importing.

## Info

### IN-01: `PERFORMANCE_METRICS.md`'s Phase 3 entry omits proof-generation/verification timing despite the file's own stated purpose

**File:** `docs/current/research/PERFORMANCE_METRICS.md:18-21`
**Issue:** The file's intro states "Each entry is a concrete recorded number... per CLAUDE.md
ground rule 5." The Phase 3 entry records only the `snarkjs zkey verify` constraint-count
re-confirmation, with a note that "Phase 5 owns full proof-generation/verification timing
benchmarks" — which is a reasonable deferral, but the entry doesn't record how long the trusted
setup itself took (ceremony duration, per-contribution time), which is the kind of "measure
everything" data point CLAUDE.md asks for and is most likely to be lost once this phase's
ephemeral execution context is gone.
**Fix:** If ceremony timing was captured anywhere (terminal output, CI logs), append it to this
entry now while it's still recoverable; otherwise note explicitly that ceremony wall-clock time
was not measured, so a future reader doesn't assume the omission means "negligible."

### IN-02: `verification_key.json` is duplicated byte-for-byte across two directories with no single source of truth or build step enforcing sync

**File:** `zk-proofs/verification_key.json`, `zkp-backend/verification_key.json`
**Issue:** Confirmed both files are currently identical (diff exit 0), but they are two
independently-writable copies of the same generated artifact with no symlink, build script, or
test asserting they stay in sync. A future redeploy that regenerates
`zk-proofs/verification_key.json` (per CLAUDE.md ground rule 1, this happens on every circuit
change) could easily forget to re-copy it into `zkp-backend/`, silently leaving the backend
verifying against a stale key while the on-chain verifier contract uses the new one — a
hard-to-diagnose verification mismatch.
**Fix:** Either symlink `zkp-backend/verification_key.json -> ../zk-proofs/verification_key.json`,
or add a `postdeploy`/`copy-artifacts` npm script that copies all three artifacts
(`identity.wasm`, `identity_final.zkey`, `verification_key.json`) from `zk-proofs/build` /
`zk-proofs/` into `zkp-backend/` as part of the standard redeploy procedure, and reference that
script from this phase's runbook so it isn't a manual, easily-forgotten step next time.

---

_Reviewed: 2026-06-18T03:45:16Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
