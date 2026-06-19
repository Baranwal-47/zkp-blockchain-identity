# Phase 3: Trusted Setup & Redeploy - Research

**Researched:** 2026-06-17
**Domain:** Groth16 zk-SNARK trusted setup (snarkjs/circom), Hardhat contract redeploy, Express artifact wiring
**Confidence:** HIGH

## Summary

Phase 3 is a mechanical, irreversible, run-once ceremony: take the frozen `identity.circom` (7891 constraints, confirmed via `docs/current/research/PERFORMANCE_METRICS.md`), run a Groth16 Phase-2 setup against a downloaded Powers-of-Tau file, contribute three rounds of entropy plus a final beacon, verify the resulting `.zkey`, export `verification_key.json` and `IdentityVerifier.sol`, redeploy the verifier contract (local + Sepolia), and copy the three fresh artifacts into `zkp-backend/` so `server.js` picks them up. The exact CLI sequence is already written in `docs/CLAUDE_CODE_BLUEPRINT.md` §4.2 — this research's main contribution is correcting one outdated assumption in that blueprint (the `pot12_final.ptau` filename/size is too small for the actual frozen constraint count) and confirming every file path, env var, and existing script the plan must reuse or extend.

The critical finding: the blueprint's own comment says "target <= 4096 for pot12," but the circuit froze at **7891 constraints** (`docs/current/research/PERFORMANCE_METRICS.md` line 13, post CR-01 fix) — this exceeds pot12's 2^12=4096 cap. The plan must use at minimum `powersOfTau28_hez_final_13.ptau` (2^13=8192, just enough) — `_14` is recommended for headroom and is still a small download (~9-18 MB range, far smaller than higher powers). `hardhat.config.js`'s `circom.ptau: "../build/pot12_final.ptau"` path must be updated to match whatever file is actually downloaded, and the file does not currently exist anywhere in this environment (confirmed via filesystem search) — it must be downloaded fresh.

**Primary recommendation:** Reuse the blueprint's command sequence verbatim, but substitute `powersOfTau28_hez_final_14.ptau` for every `pot12_final.ptau` reference (download URL, hardhat.config.js, and all snarkjs CLI commands), and update `hardhat.config.js` accordingly before running `groth16 setup`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Powers-of-Tau (Phase 1) ceremony file | External/Download | — | Circuit-independent, universal, never regenerated locally — only downloaded once |
| Groth16 Phase-2 setup + contributions + beacon | Build toolchain (zk-proofs/, local CLI) | — | Circuit-specific; snarkjs CLI run locally against the frozen r1cs |
| zkey verify / constraint count recording | Build toolchain (zk-proofs/) | Docs (PERFORMANCE_METRICS.md) | Verification step + research-deliverable record-keeping |
| verification_key.json / IdentityVerifier.sol export | Build toolchain (zk-proofs/) | Solidity / Backend | snarkjs export commands write into zk-proofs/contracts and zk-proofs root |
| Verifier contract deploy (local + Sepolia) | Hardhat (zk-proofs/scripts) | Blockchain (on-chain) | Existing `deployVerifier.js` already does this; only the compiled contract bytecode changes |
| Artifact distribution to ZKP backend | Backend (zkp-backend/) | — | `server.js` loads wasm/zkey/vkey from flat files in its own root via env-var-overridable paths |
| VERIFIER_ADDRESS env update | Backend (zkp-backend/.env) | — | `server.js` reads `process.env.VERIFIER_ADDRESS` with a stale hardcoded fallback that must also be checked |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| snarkjs | 0.7.5 (already installed, `zk-proofs/node_modules/.bin/snarkjs`) [VERIFIED: local install] | Groth16 setup/contribute/beacon/verify/export CLI | Already vendored, used throughout prior phases, matches `package.json` devDependency `^0.7.5` |
| circom2 (circom compiler) | 2.2.2 binary inside the `circom2` npm wrapper 0.2.22, also a system-wide `circom` binary at `/usr/local/bin/circom` [VERIFIED: local install via `node_modules/.bin/circom2 --version` and `circom --version`] | Compiles `identity.circom` to r1cs/wasm/sym | Same compiler used to freeze the circuit in Phase 2; matches `CLAUDE.md` "Circom 2.1.6" note loosely (actual installed version is 2.2.2 — see Pitfalls) |
| Hardhat | 2.24.3 (`package.json` devDependency `^2.24.3`) [VERIFIED: package.json] | Compile/deploy Solidity, run local node, manage networks | Already the project's contract tooling; `deployVerifier.js`/`deployRegistry.js` already exist |
| @nomicfoundation/hardhat-toolbox / hardhat-ethers | ^5.0.0 / ^3.1.3 [VERIFIED: package.json] | ethers v6 integration for deploy scripts | Already in use by existing scripts |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| hardhat-circom | ^3.3.2 (installed, but NOT usable for full setup) [VERIFIED: package.json] | Wraps circom compile + a ptau-driven setup via `npx hardhat circom` | Phase 2 already discovered this task fails when `pot12_final.ptau` is missing — do NOT rely on it for Phase 3; use raw `circom`/`circom2` + raw `snarkjs` CLI commands instead, exactly as Phase 2 did |
| dotenv | ^17.4.2 (zk-proofs), ^17.4.1 (zkp-backend) [VERIFIED: package.json both] | Loads `.env` for `SEPOLIA_RPC_URL`/`PRIVATE_KEY` (zk-proofs) and `VERIFIER_ADDRESS`/paths (zkp-backend) | Already wired; only the values need updating, not the loading code |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw snarkjs CLI commands | `npx hardhat circom` task (hardhat-circom plugin) | Plugin already proven to fail without the exact ptau path configured; raw CLI is what Phase 2 used successfully and gives full control over the 3-contribution + beacon chain, which the plugin doesn't orchestrate anyway |
| Downloaded pot14 ptau | Locally running a fresh Powers-of-Tau ceremony from scratch (`snarkjs powersoftau new`) | Phase 1 of Powers-of-Tau is circuit-independent and universal — re-running it locally adds ceremony risk and is explicitly discouraged by the blueprint ("do NOT re-run it just because the circuit changed") |

**Installation:**
No new packages required — snarkjs, circom2, and Hardhat tooling are already installed in `zk-proofs/node_modules`. The only external download needed is the `.ptau` file itself (not an npm package).

```bash
# from zk-proofs/build/ (or wherever hardhat.config.js's ptau path points)
curl -L -o build/powersOfTau28_hez_final_14.ptau \
  https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_14.ptau
# Alternative (Hermez S3, same naming convention, also commonly cited):
# https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_14.ptau
```

**Version verification:** Confirmed via direct CLI invocation in this environment (not npm registry lookup, no install needed):
```bash
cd zk-proofs && node_modules/.bin/snarkjs --version    # snarkjs@0.7.5
node_modules/.bin/circom2 --version                     # circom2 npm package 0.2.22 / circom compiler 2.2.2
```

## Package Legitimacy Audit

**Not applicable — this phase installs no new npm packages.** All required tooling (`snarkjs`, `circom2`, Hardhat, `dotenv`, `ethers`) is already present in `zk-proofs/node_modules` and `zkp-backend/node_modules` from prior phases. The only external artifact fetched is a `.ptau` binary file from a non-npm source (Google Cloud Storage / Hermez S3), which is outside the scope of the slopcheck/npm-registry protocol. The planner should still gate the `.ptau` download behind a verification step (file size/hash sanity check) since it is a large untrusted binary, but this is a different risk category than a hallucinated package name.

**Packages removed due to slopcheck [SLOP] verdict:** none (no packages evaluated — none needed)
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
[Frozen identity.circom + identity.r1cs/.sym/.wasm]  (Phase 2 output, already exists)
        |
        v
[Download powersOfTau28_hez_final_14.ptau]  (external, circuit-independent, one-time)
        |
        v
[snarkjs groth16 setup]  --r1cs + ptau--> identity_0000.zkey
        |
        v
[snarkjs zkey contribute x3]  (3 entropy contributions, chained)
        identity_0000.zkey -> _0001 -> _0002 -> _0003.zkey
        |
        v
[snarkjs zkey beacon]  -> identity_final.zkey  (deterministic finalization)
        |
        v
[snarkjs zkey verify]  (sanity gate: r1cs + ptau + final.zkey all agree) --PASS/FAIL-->
        |
        v
   +----+----------------------------------+
   |                                        |
   v                                        v
[export verificationkey]              [export solidityverifier]
   |                                        |
   v                                        v
verification_key.json                IdentityVerifier.sol (zk-proofs/contracts/)
   |                                        |
   |                                        v
   |                              [npx hardhat compile]
   |                                        |
   |                                        v
   |                         [deployVerifier.js --network local/sepolia]
   |                                        |
   |                                        v
   |                              new Groth16Verifier address
   |                                        |
   v                                        v
[copy 3 artifacts into zkp-backend/] <--- [update zkp-backend/.env VERIFIER_ADDRESS]
   identity.wasm, identity_final.zkey,
   verification_key.json
        |
        v
[zkp-backend/server.js loads via WASM_PATH/ZKEY_PATH/VKEY_PATH env-or-default paths]
        |
        v
[POST /generate-proof uses snarkjs.groth16.fullProve(input, wasmPath, zkeyPath)]
```

### Recommended Project Structure
No new directories needed. Existing layout is reused as-is:
```
zk-proofs/
├── circuits/identity.circom       # frozen, do not touch
├── build/                         # gitignored — r1cs/sym/wasm (exist) + .ptau + .zkey chain (new, this phase)
├── contracts/IdentityVerifier.sol # OVERWRITTEN by `zkey export solidityverifier`
├── scripts/deployVerifier.js      # reused as-is, no changes needed
├── hardhat.config.js              # EDIT: circom.ptau path must point at the new ptau filename
zkp-backend/
├── identity.wasm                  # OVERWRITTEN (copy target)
├── identity_final.zkey            # OVERWRITTEN (copy target)
├── verification_key.json          # OVERWRITTEN (copy target)
├── .env                           # EDIT: VERIFIER_ADDRESS updated to new deploy address
```

### Pattern 1: 3-Contribution + Beacon Trusted Setup Chain
**What:** A Groth16 Phase-2 ceremony is not a single command — it is `groth16 setup` (creates `_0000.zkey` from the r1cs+ptau) followed by N independent entropy contributions (each producing a new `.zkey` derived from the previous), followed by a `beacon` step that deterministically finalizes the chain using a public, verifiably-unbiased random value (e.g. a recent block hash), followed by `zkey verify` as a sanity check that the whole chain is internally consistent with the original r1cs and ptau.
**When to use:** Exactly once per circuit, only after the circuit is frozen (already done — see `02-02-SUMMARY.md` "CIRCUIT FROZEN").
**Example:**
```bash
# Source: docs/CLAUDE_CODE_BLUEPRINT.md §4.2 (already written for this exact project)
npx snarkjs groth16 setup build/identity.r1cs build/powersOfTau28_hez_final_14.ptau build/identity_0000.zkey
npx snarkjs zkey contribute build/identity_0000.zkey build/identity_0001.zkey --name="Utkarsh"  -e="<entropy 1>"
npx snarkjs zkey contribute build/identity_0001.zkey build/identity_0002.zkey --name="Dhruv"    -e="<entropy 2>"
npx snarkjs zkey contribute build/identity_0002.zkey build/identity_0003.zkey --name="D. Singh" -e="<entropy 3>"
npx snarkjs zkey beacon     build/identity_0003.zkey build/identity_final.zkey <beaconHash> 10 -n="final beacon"
npx snarkjs zkey verify     build/identity.r1cs build/powersOfTau28_hez_final_14.ptau build/identity_final.zkey
```
The `<beaconHash>` should be a real, independently-verifiable public random value (e.g. a recent Ethereum/Sepolia block hash at ceremony time) and `10` is the number of `SHA256` iterations applied to derive the final randomness — both values, plus the actual entropy strings used, must be recorded in PERFORMANCE_METRICS.md or a ceremony log so "the paper describes the ceremony as actually performed" (blueprint §4.2 comment).

### Pattern 2: Export-Then-Redeploy
**What:** `snarkjs zkey export solidityverifier` literally overwrites `zk-proofs/contracts/IdentityVerifier.sol` with a freshly generated Solidity file containing the new verification key baked in as constants. The contract name inside that file is `Groth16Verifier` (confirmed: `deployVerifier.js` calls `ethers.getContractFactory("Groth16Verifier")`), not `IdentityVerifier` — the filename and the contract name differ.
**When to use:** Every time the `.zkey` changes (i.e., this phase, and any future circuit change that forces a redo).
**Example:**
```bash
# Source: zk-proofs/scripts/deployVerifier.js (existing script, reused verbatim)
npx snarkjs zkey export verificationkey build/identity_final.zkey verification_key.json
npx snarkjs zkey export solidityverifier build/identity_final.zkey contracts/IdentityVerifier.sol
npx hardhat compile
npx hardhat run scripts/deployVerifier.js --network localhost   # local Hardhat node
npx hardhat run scripts/deployVerifier.js --network sepolia     # Sepolia testnet
```

### Anti-Patterns to Avoid
- **Re-running Powers-of-Tau Phase 1 locally:** The `.ptau` file is circuit-independent and should be downloaded once, never regenerated, per the blueprint's explicit warning.
- **Reusing `pot12_final.ptau` as a filename/size without checking the actual constraint count:** The blueprint's own example assumed ≤4096 constraints; the frozen circuit needs ≥8192. Always re-derive the required power from `docs/current/research/PERFORMANCE_METRICS.md`'s recorded `nConstraints`, not from a stale comment.
- **Using `npx hardhat circom`:** Already proven broken in this repo when the ptau is missing/misconfigured (Phase 2 plan 1 deviation). Use raw `circom2`/`snarkjs` CLI commands instead.
- **Forgetting the hardcoded fallback addresses in `server.js`:** `server.js` line 43-44 has hardcoded fallback `verifierAddress`/`registryAddress` values used `if process.env.VERIFIER_ADDRESS` is unset. If `.env` is not actually loaded at runtime (e.g., wrong working directory), the server will silently fall back to a stale address rather than failing loudly.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Groth16 trusted setup ceremony | Custom MPC ceremony scripts | `snarkjs zkey contribute`/`beacon`/`verify` | snarkjs already implements the full Groth16 Phase-2 protocol correctly; hand-rolling MPC randomness mixing is a severe cryptographic foot-gun |
| Solidity verifier contract | Hand-write the Groth16 pairing-check verifier | `snarkjs zkey export solidityverifier` | The exported contract embeds the exact verification key as constants matched to the `.zkey`; a hand-written verifier risks subtle pairing/curve-point encoding bugs |
| Powers-of-Tau ceremony file | Run `snarkjs powersoftau new` + many local contributions | Download an existing, widely-attested `.ptau` (Hermez/iden3 ceremony) | The public Hermez ceremony already has many real-world contributors and is the de facto standard trusted ptau source for BN128/Groth16 projects; a freshly-generated local one has only the contributions you personally make, weakening the toxic-waste-destruction guarantee |

**Key insight:** Every cryptographic step in this phase has an existing, audited snarkjs CLI command. The only judgment calls are (a) picking the correct ptau power for the actual constraint count, and (b) choosing real, independently-verifiable entropy/beacon values worth documenting in the paper.

## Common Pitfalls

### Pitfall 1: Wrong ptau power for the frozen constraint count
**What goes wrong:** Using `pot12_final.ptau` (the blueprint's literal example, sized for ≤4096 constraints) against a circuit with 7891 constraints causes `snarkjs groth16 setup` to fail outright (ptau too small for the r1cs).
**Why it happens:** The blueprint §4.2 comment was written before the circuit was finalized in Phase 2; CR-01's range-check fix pushed the count from 7825 to 7891, still far above 4096.
**How to avoid:** Before running `groth16 setup`, read the recorded `nConstraints` (7891, per `docs/current/research/PERFORMANCE_METRICS.md` line 13) and pick the smallest power-of-two ≥ that count. `2^13 = 8192` is the minimum sufficient power; download `powersOfTau28_hez_final_13.ptau` or `_14.ptau` (extra headroom, still a manageable download), then update `hardhat.config.js`'s `circom.ptau` field to match the actual downloaded filename.
**Warning signs:** `snarkjs groth16 setup` errors with something like "circuit too big for this power of tau" or an assertion about `domainSize`/`power` mismatch.

### Pitfall 2: Stale `hardhat.config.js` ptau path
**What goes wrong:** `hardhat.config.js` line 11 hardcodes `ptau: "../build/pot12_final.ptau"`. If the plan downloads a differently-named file (e.g. `powersOfTau28_hez_final_14.ptau`) but forgets to update this config, `npx hardhat circom` (if ever invoked, e.g. by accident or by a future contributor) will look for the wrong file. Since this phase uses raw CLI commands and bypasses `hardhat-circom` entirely, this mismatch will not break the setup itself — but it leaves the repo in an inconsistent, confusing state for future maintainers.
**Why it happens:** The config was written speculatively before the actual constraint count was known.
**How to avoid:** Update `hardhat.config.js`'s `circom.ptau` value to the actual filename used, even though the raw CLI path doesn't read this config.
**Warning signs:** Grep for `pot12` across the repo after the phase completes — any remaining reference is stale documentation/config drift.

### Pitfall 3: Hardcoded stale fallback addresses in `zkp-backend/server.js`
**What goes wrong:** `server.js` lines 43-44 fall back to hardcoded addresses (`0x2625C6...`, `0xB7a915...`) if `VERIFIER_ADDRESS`/`REGISTRY_ADDRESS` env vars are unset. These are neither the current `.env` values (`0x86D0BC4c...`/`0x600E1780...`) nor will they be the new redeployed addresses — they're leftover from an even earlier deploy. A future redeploy that updates `.env` but is run from a working directory where `.env` doesn't load (e.g. wrong cwd, missing `dotenv.config()` call order) will silently use one of these doubly-stale addresses instead of failing loudly.
**Why it happens:** Defensive fallback values were added at some point and never removed/updated as the project evolved.
**How to avoid:** After redeploying, update `.env`'s `VERIFIER_ADDRESS` (and confirm `REGISTRY_ADDRESS` is correct too, even though Phase 3's scope is the verifier only) and verify via the running server's logs or a quick `console.log(verifierAddress)` smoke check that the env var — not the fallback — is actually in effect. Consider flagging the hardcoded fallback as a code-review follow-up (out of this phase's strict scope, but worth a note).
**Warning signs:** On-chain verify calls succeed/fail unexpectedly after a "successful" redeploy; the contract address logged by the server doesn't match the freshly deployed address from `deployVerifier.js`'s console output.

### Pitfall 4: `circom` vs `circom2` version drift from CLAUDE.md's stated version
**What goes wrong:** `CLAUDE.md` states "Circom 2.1.6" but the actually-installed compiler in this environment is `circom2` npm wrapper 0.2.22 / underlying compiler 2.2.2 (confirmed via `node_modules/.bin/circom2 --version` and the system `circom --version`). This is a documentation/reality mismatch, not a blocker — Phase 2 already compiled and froze the circuit successfully with this exact toolchain — but the plan should compile with the SAME binary Phase 2 used (the project-local `node_modules/.bin/circom2`), not assume a system-wide circom matching CLAUDE.md's stated version, since a different major/minor circom version could in theory produce a different r1cs.
**Why it happens:** CLAUDE.md was written at project inception; the installed toolchain version was not re-verified against it.
**How to avoid:** Recompile with `zk-proofs/node_modules/.bin/circom2` (same binary as Phase 2, per `02-01-SUMMARY.md`'s explicit choice to avoid `npx hardhat circom`), and re-verify the constraint count matches 7891 exactly before running `groth16 setup` — any mismatch means the build/ directory's r1cs is stale or was compiled with a different toolchain, and Phase 3 must not proceed until it's reconciled.
**Warning signs:** `snarkjs r1cs info build/identity.r1cs` reports a constraint count other than 7891.

### Pitfall 5: WSL/gitignored node_modules across worktrees
**What goes wrong:** If Phase 3 executes in a fresh git worktree (as Phase 2's plans did), `zk-proofs/node_modules` and `build/` (both gitignored) will be absent, breaking every `node_modules/.bin/circom2`/`snarkjs` invocation and the `.env`-dependent Hardhat config validation.
**Why it happens:** Documented twice already in `02-01-SUMMARY.md` and `02-02-SUMMARY.md` — worktrees don't inherit gitignored directories.
**How to avoid:** Verify `zk-proofs/package-lock.json` is byte-identical to the main checkout, then symlink `node_modules` from the main repo rather than running `npm install` fresh (same precedent both Phase 2 plans used). For Hardhat config validation (`HH8` errors), supply placeholder non-secret `SEPOLIA_RPC_URL`/`PRIVATE_KEY` env vars inline on the command line if running tests/compiles that don't actually touch Sepolia — but for the REAL Sepolia redeploy step, real secrets from the actual `.env` are required (this is the one step that cannot use placeholders).
**Warning signs:** `Cannot find module` errors for `circom2`/`snarkjs`, or `HH8` Hardhat config validation errors before any task-specific code runs.

### Pitfall 6: `.gitignore`'d build artifacts mean Phase 3's outputs may not persist across worktree boundaries
**What goes wrong:** `build/identity_0000.zkey` through `identity_final.zkey`, and the downloaded `.ptau`, are large binary files that should NOT be committed to git (consistent with `build/` already being gitignored) — but they also must not be silently lost if Phase 3 runs in an ephemeral worktree that gets cleaned up before the artifacts are copied into `zkp-backend/`.
**Why it happens:** The execute-phase worktree pattern (noted in user's own memory: "execute-phase worktree agents fork off origin/main, not the feature branch holding .planning commits") creates isolated working directories.
**How to avoid:** The actual deliverables that MUST be committed are the three files copied into `zkp-backend/` (`identity.wasm`, `identity_final.zkey`, `verification_key.json`) plus `contracts/IdentityVerifier.sol` (also git-tracked, not gitignored) plus the updated `.env`/`hardhat.config.js`. The intermediate `_0000`–`_0003.zkey` chain and the `.ptau` file itself can remain gitignored/ephemeral — but the plan should explicitly copy the final artifacts out of `build/` into their permanent tracked locations as a task step, not assume they'll persist.
**Warning signs:** `git status` after the phase shows `zkp-backend/identity_final.zkey` etc. as modified/untracked (expected, should be committed) but `zk-proofs/contracts/IdentityVerifier.sol` unchanged (would indicate the export step didn't actually run or wasn't picked up).

## Code Examples

### Constraint count verification (re-check before setup)
```bash
# Source: docs/current/research/PERFORMANCE_METRICS.md + Phase 2 SUMMARY precedent
cd zk-proofs
node_modules/.bin/snarkjs r1cs info build/identity.r1cs
# Expect: 7891 total (3770 non-linear + 4121 linear), 18 public inputs, 1 public output
```

### Full artifact copy (existing blueprint pattern, file paths confirmed against actual repo)
```bash
# Source: docs/CLAUDE_CODE_BLUEPRINT.md §4.2 step 5, paths confirmed against actual zkp-backend/ root layout
cp build/identity_js/identity.wasm  ../zkp-backend/identity.wasm
cp build/identity_final.zkey        ../zkp-backend/identity_final.zkey
cp verification_key.json            ../zkp-backend/verification_key.json
```

### zkp-backend artifact loading (existing code, unchanged by this phase — confirms WHERE the new files must land)
```javascript
// Source: zkp-backend/server.js lines 32-44 (read directly from repo)
const wasmPath = process.env.WASM_PATH || path.join(__dirname, 'identity.wasm');
const zkeyPath = process.env.ZKEY_PATH || path.join(__dirname, 'identity_final.zkey');
const vKeyPath = process.env.VKEY_PATH || path.join(__dirname, 'verification_key.json');
// ...
const verifierAddress = process.env.VERIFIER_ADDRESS || '0x2625C6fDBEDcCD572836FfbFA391D2C25de7ae26'; // STALE fallback — see Pitfall 3
const registryAddress = process.env.REGISTRY_ADDRESS || '0xB7a915C78C546A1082CB66bA294fAFee52E4EB07'; // STALE fallback
```

### Existing deploy script (reused verbatim, no changes needed)
```javascript
// Source: zk-proofs/scripts/deployVerifier.js (full file, 13 lines)
const { ethers } = require("hardhat");
async function main() {
  const Verifier = await ethers.getContractFactory("Groth16Verifier");
  const verifier = await Verifier.deploy();
  await verifier.waitForDeployment();
  console.log("Verifier deployed to:", await verifier.getAddress());
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Flat Poseidon(5) circuit, single-level hash, no Merkle/disclosure/predicates/nonce | Depth-3 salted-leaf Merkle root + selective disclosure + age/postgrad predicates + nonce binding (frozen Phase 2) | Phase 2 (2026-06-17) | Old `zkp-backend/identity.wasm`/`identity_final.zkey`/`verification_key.json` are now stale and must be fully replaced, not patched — this phase's entire purpose |
| `pot12_final.ptau` referenced in hardhat.config.js | Must use `powersOfTau28_hez_final_13.ptau` minimum (8192 ≥ 7891 constraints), `_14.ptau` recommended | Discovered this research session (constraint count grew past Phase 2's CR-01 fix) | hardhat.config.js's `circom.ptau` field is stale and must be updated as part of this phase's config changes |

**Deprecated/outdated:**
- `pot12_final.ptau`: too small (4096 < 7891 constraints) for the frozen circuit; superseded by pot13/pot14.
- The old flat-Poseidon(5) `zkp-backend/identity.wasm`/`identity_final.zkey`/`verification_key.json`: fully superseded, must be overwritten not merged.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | `powersOfTau28_hez_final_14.ptau` is downloadable from `https://storage.googleapis.com/zkevm/ptau/` or the Hermez S3 mirror with that exact filename pattern | Standard Stack / Installation | If the URL/filename pattern has changed or the host is unavailable, the planner needs a fallback mirror or a different download source — flag for a `checkpoint:human-verify` before relying on a hardcoded URL in a task action |
| A2 | A recent Sepolia (or Ethereum mainnet) block hash is an acceptable, sufficiently public/unbiased `beaconHash` for the `zkey beacon` step | Architecture Patterns / Pattern 1 | If reviewers/examiners require a more formal beacon source (e.g. drand), the ceremony's randomness justification in the paper may be challenged — low technical risk, but a documentation/rigor risk for the academic writeup |

**A1 and A2 are both training-knowledge-based (no Context7 entry exists for snarkjs/ptau hosting), cross-checked via WebSearch only — tag as `[ASSUMED]` per provenance rules. The blueprint itself (`docs/CLAUDE_CODE_BLUEPRINT.md` line 195) independently asserts the same Hermez/iden3 ptau source, which raises confidence to MEDIUM but does not constitute official-docs verification.**

## Open Questions

1. **Should the ptau be pot13 (tight minimum) or pot14 (headroom)?**
   - What we know: Frozen circuit needs ≥8192 (2^13). pot13 is the absolute minimum; pot14 (16384) costs a larger download but leaves margin if any subsequent recompile (e.g. toolchain version drift, see Pitfall 4) nudges the constraint count up slightly without anyone noticing before re-running setup.
   - What's unclear: Exact file sizes for pot13 vs pot14 in this hosting scheme weren't independently confirmed (WebSearch couldn't return precise byte sizes), so the "small download" framing is an estimate, not a measured fact.
   - Recommendation: Default to pot14 for safety margin; the cost difference between small truncated ptau files at these powers is minor compared to ceremony risk of needing to redo everything if pot13 turns out exactly insufficient.

2. **Where should the intermediate `.zkey` chain and `.ptau` file live — committed, or purely ephemeral build artifacts?**
   - What we know: `build/` is already gitignored; Phase 2's r1cs/wasm/sym were never committed either.
   - What's unclear: Whether the project wants a permanent record of the ceremony (entropy strings, beacon hash, intermediate zkeys) for academic reproducibility/audit purposes, vs. treating them as pure build output.
   - Recommendation: Record the ceremony parameters (contributor names, entropy source description — not the raw secret entropy itself, beacon hash, beacon iteration count) as text in PERFORMANCE_METRICS.md or a new ceremony log doc, but leave the binary `.zkey`/`.ptau` files themselves gitignored, matching existing project convention.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| circom2 (project-local) | Recompile sanity-check before setup | Yes | 0.2.22 wrapper / 2.2.2 compiler [VERIFIED: local CLI check] | system `circom` at `/usr/local/bin/circom` (also 2.2.2) |
| snarkjs (project-local) | All Groth16 setup/contribute/beacon/verify/export commands | Yes | 0.7.5 [VERIFIED: local CLI check] | none needed — already matches package.json |
| Hardhat | Compile + deploy verifier (local + Sepolia) | Yes | 2.24.3 [VERIFIED: package.json] | none needed |
| Powers-of-Tau file (`powersOfTau28_hez_final_13/14.ptau`) | `groth16 setup` | No — confirmed absent via filesystem-wide search | — | Must download; no viable local fallback (cannot be regenerated cheaply/safely per Don't-Hand-Roll guidance) |
| Sepolia RPC + funded deployer key | Sepolia redeploy step | Present in `zk-proofs/.env` and `zkp-backend/.env` (both contain live `SEPOLIA_RPC_URL`/credentials) [VERIFIED: grep of actual .env contents, values redacted in this doc] | — | Local Hardhat network (`--network localhost`) as a dry-run before spending real Sepolia gas |

**Missing dependencies with no fallback:**
- The `.ptau` file itself — must be downloaded fresh; no safe local alternative per the Don't-Hand-Roll guidance against re-running Powers-of-Tau locally.

**Missing dependencies with fallback:**
- None beyond the ptau (all other tooling already present).

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|---------------------|
| V2 Authentication | No | Out of scope — this phase touches build tooling and contract deploy scripts, not user-facing auth |
| V3 Session Management | No | Nonce session lifecycle is Phase 4 (REPL-03), not this phase |
| V4 Access Control | No | No access-control logic changes in this phase |
| V5 Input Validation | No | No new user input surfaces introduced |
| V6 Cryptography | Yes | Groth16 trusted setup itself IS the cryptographic operation — never hand-roll; use `snarkjs` exclusively (see Don't Hand-Roll). The entropy contributed at each `zkey contribute` step and the beacon value must be treated as security-relevant: entropy strings must be unpredictable/private until contributed, and the beacon value must be public and attributable to a real, verifiable source. |

### Known Threat Patterns for Groth16 Trusted Setup

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Toxic waste retention (a contributor keeps the secret randomness used in their `zkey contribute` step) | Tampering | Multi-party contribution chain (3 contributors here) — as long as at least one contributor honestly destroys their secret, the final zkey's soundness holds; the final `beacon` step adds a final, unpredictable-in-advance value that no single party controls |
| Predictable/weak beacon value chosen by the deployer | Tampering | Use a real, externally-verifiable public randomness source (e.g. an actual recent block hash, fetched at ceremony time, not invented) and record it for paper reproducibility |
| Stale/wrong ptau silently producing a `.zkey` that doesn't match the actual circuit | Tampering / Repudiation | `snarkjs zkey verify` against the exact r1cs + ptau + final.zkey is a mandatory gate (SETUP-01 success criterion) — never skip it |
| Verifier contract redeployed but old address left wired in a consuming service (`.env` not updated, or stale hardcoded fallback used) | Repudiation / Tampering | Explicit post-deploy verification: confirm `zkp-backend/.env`'s `VERIFIER_ADDRESS` matches the just-deployed address, and check `server.js`'s code path doesn't silently fall back to a hardcoded stale address (Pitfall 3) |

## Sources

### Primary (HIGH confidence)
- `docs/CLAUDE_CODE_BLUEPRINT.md` §4.2 — exact snarkjs CLI sequence, written for this exact project, already validated by the project authors
- `docs/current/research/PERFORMANCE_METRICS.md` — authoritative, dated, recorded frozen constraint count (7891)
- `zk-proofs/hardhat.config.js`, `zk-proofs/scripts/deployVerifier.js`, `zk-proofs/scripts/deployRegistry.js`, `zk-proofs/package.json` — read directly from repo
- `zkp-backend/server.js`, `zkp-backend/.env.example`, `zkp-backend/.env`, `zkp-backend/package.json` — read directly from repo
- `.planning/phases/02-e1-e2-circuit-build/02-01-SUMMARY.md`, `02-02-SUMMARY.md`, `02-SECURITY.md` — direct project history, freeze sign-off
- Local CLI version checks: `node_modules/.bin/snarkjs --version` (0.7.5), `node_modules/.bin/circom2 --version` (compiler 2.2.2), `circom --version` (system, 2.2.2)
- Filesystem-wide search confirming no `.ptau` file exists anywhere in this environment

### Secondary (MEDIUM confidence)
- WebSearch results on `powersOfTau28_hez_final_NN.ptau` naming convention and Hermez/iden3 hosting — cross-confirmed by the blueprint's own independent assertion of the same source (line 195), raising this from LOW to MEDIUM

### Tertiary (LOW confidence)
- None retained as standalone LOW-confidence claims — both ptau-source assumptions are logged in the Assumptions table above

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all tooling versions confirmed via direct CLI invocation in this exact environment, zero new packages needed
- Architecture: HIGH — every file path, script, and env var confirmed by direct file reads against the actual repo, not inferred
- Pitfalls: HIGH — five of six pitfalls are drawn directly from this project's own Phase 2 SUMMARY deviations (already happened once, will recur); the ptau-size pitfall is a freshly-discovered, concretely-verified mismatch (constraint count vs. blueprint's stale comment)

**Research date:** 2026-06-17
**Valid until:** 30 days (stable — Groth16/snarkjs tooling is mature and slow-moving; the only fast-moving risk is ptau hosting URL availability, worth re-verifying at execution time)
