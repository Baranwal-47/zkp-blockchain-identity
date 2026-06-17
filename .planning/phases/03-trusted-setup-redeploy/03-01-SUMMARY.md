---
phase: 03-trusted-setup-redeploy
plan: 01
subsystem: infra
tags: [groth16, snarkjs, trusted-setup, circom, hardhat, zk-snark, ceremony]

# Dependency graph
requires:
  - phase: 02-e1-e2-circuit-build (plan 02)
    provides: "CIRCUIT FROZEN identity.circom (build/identity.r1cs at 7891 total constraints, post CR-01 range-check fix), frozen public-signal order [0]pubHash..[12..18]revealMask"
provides:
  - "zk-proofs/build/identity_final.zkey — verified Groth16 proving key (3-contribution + beacon ceremony, gitignored binary)"
  - "zk-proofs/verification_key.json — exported verification key matching identity_final.zkey"
  - "zk-proofs/contracts/IdentityVerifier.sol — freshly exported Groth16Verifier contract with new VK baked in"
  - "zk-proofs/hardhat.config.js circom.ptau updated from stale pot12 to powersOfTau28_hez_final_14.ptau"
  - ".planning/phases/03-trusted-setup-redeploy/CEREMONY_LOG.md — reproducible ceremony record (contributors, beacon, constraint count, no raw entropy)"
  - "Confirmed local-network deploy of Groth16Verifier at 0x5FbDB2315678afecb367f032d93F642f64180aa3 (dry run only, not production)"
affects: [phase-3-plan-2-sepolia-deploy, phase-4-zkp-backend-wiring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "3-contribution + beacon Groth16 Phase-2 ceremony chain: groth16 setup -> 3x zkey contribute (chained) -> zkey beacon (real block hash) -> zkey verify mandatory gate -> export verificationkey/solidityverifier."
    - "Beacon randomness sourced from a live Ethereum mainnet block hash fetched via a public JSON-RPC endpoint at ceremony time, not invented — recorded with block number for independent re-verification."
    - "Entropy-source-only logging: per-contribution /dev/urandom entropy strings are never written to any tracked file or SUMMARY; only the source description and public contribution hashes are recorded."

key-files:
  created:
    - .planning/phases/03-trusted-setup-redeploy/CEREMONY_LOG.md
  modified:
    - zk-proofs/hardhat.config.js
    - zk-proofs/contracts/IdentityVerifier.sol
    - zk-proofs/verification_key.json
    - zk-proofs/test/circuitParity.test.js
    - docs/current/research/PERFORMANCE_METRICS.md

key-decisions:
  - "Used pot14 (powersOfTau28_hez_final_14.ptau, 2^14=16384) over the tight-minimum pot13, for headroom against the frozen 7891-constraint circuit, per RESEARCH Open Question 1 recommendation."
  - "Beacon value sourced from a live Ethereum mainnet block hash (block 25339596) fetched via https://ethereum-rpc.publicnode.com at ceremony time, rather than a Sepolia block, since a public RPC was readily reachable and mainnet block hashes are equally externally-verifiable."
  - "Updated a stale 'pot12_final.ptau' comment in circuitParity.test.js (the only remaining .js reference) to reflect identity_final.zkey, satisfying the plan's zero-pot12-hits acceptance criterion."

patterns-established:
  - "Ceremony reproducibility logging: CEREMONY_LOG.md records every ceremony parameter (ptau source, contributor names, entropy SOURCE description, beacon hash+block+iterations, verify result, constraint count, deploy address) while never persisting raw secret entropy — the template future re-ceremonies (forced by any circuit edit) should follow."

requirements-completed: [SETUP-01, SETUP-02]

# Metrics
duration: 25min
completed: 2026-06-18
---

# Phase 3 Plan 1: Trusted Setup Ceremony & Local Verifier Deploy Summary

**Ran the irreversible Groth16 Phase-2 trusted-setup ceremony (pot14 + 3 contributions + a live Ethereum block-hash beacon) against the frozen 7891-constraint identity.circom, passed the mandatory `snarkjs zkey verify` gate ("ZKey Ok!"), and exported + compiled + deployed the resulting Groth16Verifier to a local Hardhat dry-run network at `0x5FbDB2315678afecb367f032d93F642f64180aa3`.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-06-17T20:12:00Z (approx, worktree setup)
- **Completed:** 2026-06-17T20:19:23Z
- **Tasks:** 2 completed
- **Files modified:** 5 (1 created, 4 modified, plus gitignored build/node_modules artifacts)

## Accomplishments
- Recompiled `identity.circom` in this fresh worktree (symlinked `node_modules`, lockfile-verified-identical) and confirmed **7891 total constraints** (3770 non-linear + 4121 linear) matches the authoritative frozen count before proceeding
- Downloaded `powersOfTau28_hez_final_14.ptau` (~18.9 MB) from the primary Google Cloud Storage zkEVM mirror, sanity-checked via magic bytes (`ptau` header) and size (>1 MB, real binary not an HTML error page)
- Fixed `zk-proofs/hardhat.config.js`'s stale `pot12_final.ptau` reference to point at the downloaded `powersOfTau28_hez_final_14.ptau`; updated a stale `pot12` comment in `circuitParity.test.js` — zero `pot12` hits remain in `.js` source
- Ran the full ceremony chain: `groth16 setup` → 3 chained `zkey contribute` steps (Utkarsh, Dhruv, D. Singh; entropy from `/dev/urandom`, 64 bytes each, never persisted) → `zkey beacon` using a real Ethereum mainnet block hash (block 25339596, 10 SHA256 iterations) → `identity_final.zkey`
- **SETUP-01 gate passed:** `snarkjs zkey verify build/identity.r1cs <pot14> build/identity_final.zkey` reported `ZKey Ok!`, confirming all 4 contributions (3 contributors + beacon) chain correctly against the frozen r1cs and pot14 ptau
- Exported `verification_key.json` and overwrote `contracts/IdentityVerifier.sol` (contains `contract Groth16Verifier`) from the verified `identity_final.zkey`
- `npx hardhat compile` succeeded against the freshly exported verifier (placeholder non-secret Sepolia env vars supplied inline, no real secrets touched)
- Deployed `Groth16Verifier` to a local `npx hardhat node` dry run: **`0x5FbDB2315678afecb367f032d93F642f64180aa3`** (not production — confirms the exported+compiled contract is deployable before spending real Sepolia gas)
- Wrote `.planning/phases/03-trusted-setup-redeploy/CEREMONY_LOG.md` recording every ceremony parameter (ptau source, contributors, entropy source description, beacon hash/block/iterations, verify result, constraint count, local deploy address) with **no raw entropy strings persisted anywhere**
- Appended a dated Phase-3 line to `docs/current/research/PERFORMANCE_METRICS.md` recording the verified constraint count

## Task Commits

Each task was committed atomically:

1. **Task 1: Download pot14, fix hardhat.config.js, run ceremony, verify (SETUP-01)** - `74c89a5` (feat)
2. **Task 2: Export artifacts, compile, deploy locally, write ceremony log (SETUP-02 local)** - `8869ebf` (feat)

**Plan metadata:** committed separately by this SUMMARY's own commit (worktree mode — STATE.md/ROADMAP.md updates deferred to orchestrator)

## Files Created/Modified
- `.planning/phases/03-trusted-setup-redeploy/CEREMONY_LOG.md` - New: full reproducible ceremony record (ptau source, 3 contributor names, entropy source description, beacon block hash/number/iterations, zkey-verify result, constraint count, local deploy address, hand-off note to plan 03-02)
- `zk-proofs/hardhat.config.js` - `circom.ptau` updated from stale `pot12_final.ptau` to `powersOfTau28_hez_final_14.ptau`
- `zk-proofs/contracts/IdentityVerifier.sol` - Overwritten by `snarkjs zkey export solidityverifier`; contains `contract Groth16Verifier` with the new VK baked in
- `zk-proofs/verification_key.json` - Overwritten by `snarkjs zkey export verificationkey`; matches `identity_final.zkey` (nPublic=19)
- `zk-proofs/test/circuitParity.test.js` - One stale comment line updated (`pot12_final.ptau` → `identity_final.zkey`), no test logic changed
- `docs/current/research/PERFORMANCE_METRICS.md` - Appended dated Phase-3 ceremony verification line

**Not tracked (gitignored, ephemeral to this worktree, per RESEARCH Pitfall 6):** `zk-proofs/build/` (r1cs/sym/wasm, the downloaded ptau, and the full `identity_0000`–`identity_0003`/`identity_final.zkey` chain), `zk-proofs/node_modules` (symlinked from the main repo checkout, lockfile-verified-identical).

## Decisions Made
- Used pot14 over the tight-minimum pot13 for headroom, per RESEARCH recommendation — the cost difference at these powers is small relative to ceremony-redo risk.
- Sourced the beacon from a live Ethereum **mainnet** block hash (via a public RPC, block 25339596) rather than waiting on a Sepolia-specific source — mainnet block hashes are equally externally-verifiable and a public RPC was immediately reachable.
- Updated (rather than left untouched) the one stale `pot12` comment in `circuitParity.test.js`, since the plan explicitly allows trivially-safe updates and the file now references artifacts (`identity_final.zkey`) that actually exist post-ceremony.

## Deviations from Plan

None — plan executed exactly as written, including the worktree node_modules/build symlink-and-recompile precedent explicitly anticipated by the plan's `<action>` text (Task 1, Step "if this runs in a fresh gitignored worktree...").

## Issues Encountered
- `snarkjs zkey beacon` initially rejected the beacon hash with `Invalid Beacon Hash` because the fetched block hash retained its `0x` prefix; stripped the prefix (`sed 's/^0x//'`) and the beacon step succeeded on retry. Not a plan deviation — just a CLI input-format detail not explicitly spelled out in the plan's command template.

## User Setup Required
None - no external service configuration required. This plan deploys only to the local Hardhat network; Sepolia deployment (which needs real funded-deployer secrets) is explicitly deferred to plan 03-02.

## Next Phase Readiness

**Hand-off to plan 03-02 (explicit, per plan `<output>` spec):**
1. Deploy `Groth16Verifier` to **Sepolia** using real secrets from `.env` (this plan only ran the local dry-run deploy).
2. Copy the 3 artifacts (`identity.wasm` from `build/identity_js/`, `identity_final.zkey`, `verification_key.json`) into `zkp-backend/`.
3. Update `zkp-backend/.env`'s `VERIFIER_ADDRESS` to the new Sepolia deploy address, and confirm `server.js`'s hardcoded stale fallback addresses (lines 43-44) are not silently used (RESEARCH Pitfall 3).

No blockers identified for plan 03-02. The verified `identity_final.zkey`, `verification_key.json`, and `IdentityVerifier.sol` are all ready and matched to the frozen circuit; `build/identity_final.zkey` itself is gitignored and ephemeral to this worktree's lifetime — plan 03-02 will need to either reuse this worktree's build/ output (if still present) or re-run the same verified ceremony chain in its own worktree before copying artifacts (consistent with the project's established gitignored-build-artifact pattern across Phase 2's two plans).

---
*Phase: 03-trusted-setup-redeploy*
*Completed: 2026-06-18*
