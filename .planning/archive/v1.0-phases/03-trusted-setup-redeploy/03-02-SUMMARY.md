---
phase: 03-trusted-setup-redeploy
plan: 02
subsystem: infra
tags: [sepolia, deploy, groth16, zkp-backend, verifier]

requires:
  - phase: 03-trusted-setup-redeploy (plan 01)
    provides: "Verified identity_final.zkey, exported verification_key.json (nPublic=19), IdentityVerifier.sol Groth16Verifier"
provides:
  - "Groth16Verifier deployed live on Sepolia at 0x630955e2E7e795B3075BD35c2bB93ceA7cE5ffc4"
  - "zkp-backend/.env VERIFIER_ADDRESS updated to the new Sepolia address"
  - "zkp-backend/identity.wasm, identity_final.zkey, verification_key.json overwritten with the new Merkle/disclosure circuit (nPublic=19)"
affects: [phase-4-zkp-backend-integration]

tech-stack:
  added: []
  patterns:
    - "Sepolia deploy retried with explicit flat maxPriorityFeePerGas (2 gwei) after the default ethers fee estimate produced a near-zero priority fee that stalled in the mempool for >25 minutes; replacement tx at the same nonce confirmed within ~1 minute."

key-files:
  modified:
    - zkp-backend/.env
    - zkp-backend/identity.wasm
    - zkp-backend/identity_final.zkey
    - zkp-backend/verification_key.json

key-decisions:
  - "First deployVerifier.js run used default fee estimation and stalled unmined for ~26 minutes (confirmed via pending/latest nonce gap; RPC itself was healthy and in sync). Killed and resubmitted with an explicit 2 gwei flat maxPriorityFeePerGas, which confirmed within ~1 minute. Recorded here so a future deploy-from-this-account that stalls is recognized as a fee-estimation issue, not an RPC or secrets problem."
  - "server.js hardcoded fallbacks (0x2625C6...) were NOT edited in this phase, per plan scope; smoke-confirmed the env value resolves instead. Flagged as a Phase-4 code-review cleanup candidate."

requirements_covered: [SETUP-02, SETUP-03]
---

## What was built

Deployed the freshly exported `Groth16Verifier` (from plan 03-01's verified ceremony) to Sepolia, then wired the ZKP backend to the new circuit and address.

**Sepolia deploy:** `npx hardhat run scripts/deployVerifier.js --network sepolia` from `zk-proofs/` using the real funded deployer `0xC72B28D68BeA5C4F9Dd2e00877023484f4537071` (balance 0.0708 ETH, confirmed sufficient before the user approved the spend). The first attempt stalled unmined for ~26 minutes — confirmed via `getTransactionCount("pending")` vs `("latest")` showing a 1-nonce gap with no progress, while the RPC itself (`eth-sepolia.g.alchemy.com`) was verified healthy and in sync (4s lag from real time, correct chainId 11155111). Root cause: ethers' default fee estimation produced a near-zero `maxPriorityFeePerGas`. Killed the stalled process and resubmitted with an explicit flat 2 gwei priority fee at the same nonce; the replacement transaction confirmed within ~1 minute.

**Result:** `Verifier deployed to: 0x630955e2E7e795B3075BD35c2bB93ceA7cE5ffc4`

**Backend wiring (Task 1 steps 2-3):**
- Copied `zk-proofs/build/identity_js/identity.wasm`, `zk-proofs/build/identity_final.zkey`, `zk-proofs/verification_key.json` into `zkp-backend/`, overwriting the stale flat-Poseidon(5) versions.
- Verified `verification_key.json` `nPublic === 19` (the frozen circuit's public-signal count) — confirms the new circuit landed, not the old one.
- Edited only the `VERIFIER_ADDRESS` line in `zkp-backend/.env`: `0x86D0BC4c...` → `0x630955e2E7e795B3075BD35c2bB93ceA7cE5ffc4`. No other `.env` lines (including `PRIVATE_KEY`/RPC secrets) were touched.

**Smoke verification (Task 2):**
- `process.env.VERIFIER_ADDRESS || <stale fallback>` resolves to the new address, not the hardcoded `0x2625C6...` fallback or the prior `0x86D0BC4c...` value.
- A boot-equivalent require of `server.js`'s module-load logic (wasm/zkey/vkey paths, verifier ABI, resolved address) ran without error: `vKey.nPublic === 19`, wasm/zkey files exist at the expected paths, ABI loaded, address resolved correctly.
- `server.js` itself was NOT edited — the hardcoded fallback lines (43-44) remain as a flagged Phase-4 cleanup item.

## Verification

```
PASS env+vkey            # VERIFIER_ADDRESS set + nPublic==19
PASS env-not-fallback    # resolved address is neither stale fallback
BOOT SMOKE: PASS         # module-load equivalent of server.js boots clean
```

## Out of scope / Phase-4 notes

- Full end-to-end proof generation/verification against the new 19-signal input shape is Phase 4's integration responsibility — this phase only confirms the backend *loads* the right artifacts and resolves the right address.
- `server.js` lines 43-44 hardcoded fallback addresses (`0x2625C6...`, registry `0xB7a915C7...`) are stale and should be removed or aligned in a Phase-4 code-review pass.
- No secret key or RPC URL is recorded in this file or any tracked file.
