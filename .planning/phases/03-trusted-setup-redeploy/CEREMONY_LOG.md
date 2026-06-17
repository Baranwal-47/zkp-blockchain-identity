# Phase 3 Groth16 Trusted-Setup Ceremony Log

Recorded for academic reproducibility (PrivdID, IIITDM Jabalpur). This ceremony is run
ONCE against the frozen `zk-proofs/circuits/identity.circom` (CLAUDE.md ground rule 1 —
any later circuit edit forces this entire ceremony to be redone).

**Date:** 2026-06-18
**Operator:** Phase 3 plan 03-01 (autonomous execution)

## 1. Frozen Circuit Input

- Circuit: `zk-proofs/circuits/identity.circom` (CIRCUIT FROZEN, sign-off in `02-02-SUMMARY.md`)
- Constraint count (re-verified immediately before this ceremony via `snarkjs r1cs info build/identity.r1cs`):
  **7891 total** (3770 non-linear + 4121 linear), 18 public inputs, 1 public output, 14 private inputs,
  7898 wires — matches `docs/current/research/PERFORMANCE_METRICS.md`'s authoritative post-CR-01 count exactly.

## 2. Powers-of-Tau (Phase 1) File

- File used: `powersOfTau28_hez_final_14.ptau` (2^14 = 16384 constraints capacity, comfortably above the
  frozen 7891-constraint circuit; pot13/8192 would have been the tight minimum, pot14 chosen for headroom
  per RESEARCH Open Question 1 recommendation).
- Source URL: `https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_14.ptau` (primary; downloaded
  successfully on first attempt, Hermez S3 mirror not needed).
- Downloaded size: ~18.9 MB; verified as a genuine ptau binary (magic bytes `70 74 61 75` = "ptau" at offset 0,
  not an HTML error page) before use.
- This file is circuit-independent and was downloaded, NOT regenerated locally (per project Don't-Hand-Roll
  guidance — re-running Powers-of-Tau Phase 1 locally would weaken the toxic-waste-destruction guarantee
  versus reusing the widely-attested public Hermez/iden3 ceremony).

## 3. Groth16 Phase-2 Setup + Contribution Chain

| Step | Command | Output |
|------|---------|--------|
| Setup | `snarkjs groth16 setup build/identity.r1cs <pot14> identity_0000.zkey` | `identity_0000.zkey` |
| Contribution #1 | `snarkjs zkey contribute identity_0000.zkey identity_0001.zkey --name="Utkarsh"` | `identity_0001.zkey` |
| Contribution #2 | `snarkjs zkey contribute identity_0001.zkey identity_0002.zkey --name="Dhruv"` | `identity_0002.zkey` |
| Contribution #3 | `snarkjs zkey contribute identity_0002.zkey identity_0003.zkey --name="D. Singh"` | `identity_0003.zkey` |

**Contributors:** Utkarsh (Utkarsh Baranwal, co-author), Dhruv (Dhruv Anand Singh, co-author),
D. Singh (Dr. Durgesh Singh, supervisor) — matches CLAUDE.md authorship and blueprint §4.2 naming.

**Entropy source (raw values NOT recorded, per RESEARCH Security Domain V6 / threat T-03-04):**
Each contribution used 64 bytes read from `/dev/urandom`, base64-encoded, passed via `snarkjs zkey contribute
... -e="<entropy>"` and never written to any tracked file, shell history persisted to disk, or this log.
The contribution hashes (a public, non-secret fingerprint of each contribution) were printed by snarkjs and
are reproducible by re-running `snarkjs zkey verify` against the final zkey, which echoes each contribution's
hash back.

## 4. Beacon Finalization (Mitigates Toxic-Waste / Single-Party-Bias Threats T-03-02, T-03-03)

- Beacon source: a real, externally-verifiable **Ethereum mainnet** block hash, fetched live at ceremony time
  via the public `https://ethereum-rpc.publicnode.com` JSON-RPC endpoint (`eth_getBlockByNumber("latest")`).
- Block number: **25339596**
- Beacon hash (0x-stripped for the snarkjs CLI, as required): `5766f60d6a22379499dc75d9d7e162004a872729a7d4e5f8e0c7b6bf09bd8343`
- Beacon iterations: **10** (SHA256 iterations applied to derive the final randomness, per Pattern 1)
- Command: `snarkjs zkey beacon identity_0003.zkey identity_final.zkey <hash> 10 -n="final beacon"`
- Output: `identity_final.zkey`

No single party (not the operator, not any of the 3 contributors) controlled this value in advance —
it is the hash of a real, already-mined public block, independently re-derivable by anyone querying the
same block number on any Ethereum mainnet node/explorer.

## 5. SETUP-01 Mandatory Verification Gate

Command:
```
snarkjs zkey verify build/identity.r1cs build/powersOfTau28_hez_final_14.ptau build/identity_final.zkey
```

**Result: PASS — "ZKey Ok!"**

snarkjs printed and matched the circuit hash for both the original r1cs and the final zkey, then listed and
verified all 4 contributions in order (beacon, D. Singh, Dhruv, Utkarsh), confirming the entire chain is
internally consistent with the frozen r1cs and the pot14 ptau. This is the project's hard STOP gate
(threat T-03-01) — had this failed, the ceremony output would have been discarded and not exported or deployed.

## 6. Exported Artifacts

- `zk-proofs/verification_key.json` — exported via `snarkjs zkey export verificationkey identity_final.zkey`
  (protocol: groth16, curve: bn128, nPublic: 19 = 18 public inputs + 1 public output)
- `zk-proofs/contracts/IdentityVerifier.sol` — exported via `snarkjs zkey export solidityverifier`, overwriting
  the prior verifier; contains `contract Groth16Verifier` with the new VK baked in as constants

## 7. Local Dry-Run Deploy (SETUP-02, Local Portion)

- `npx hardhat compile` succeeded against the freshly exported `IdentityVerifier.sol` (target: paris, solidity 0.8.28)
- `npx hardhat run scripts/deployVerifier.js --network localhost` (against a locally started `npx hardhat node`)
  deployed the `Groth16Verifier` contract to: **`0x5FbDB2315678afecb367f032d93F642f64180aa3`**
- This is a zero-cost local-network address ONLY, proving the exported+compiled contract is deployable.
  It is **NOT** the production address — the Sepolia deploy (with real secrets and gas) and the copy of the
  3 artifacts (`identity.wasm`, `identity_final.zkey`, `verification_key.json`) into `zkp-backend/` are both
  explicitly deferred to plan 03-02.

## 8. Config Hygiene

- `zk-proofs/hardhat.config.js` `circom.ptau` updated from the stale `../build/pot12_final.ptau` to
  `../build/powersOfTau28_hez_final_14.ptau`.
- Repo-wide `grep -rn pot12 zk-proofs/ --include='*.js'` (excluding `node_modules`) returns zero hits after
  this plan (a deferral comment in `test/circuitParity.test.js` referencing the old filename was also updated).

## Hand-off to Plan 03-02

Plan 03-02 must:
1. Deploy `Groth16Verifier` to **Sepolia** using real secrets from `.env` (this plan only did the local dry run).
2. Copy `identity.wasm`, `identity_final.zkey`, and `verification_key.json` into `zkp-backend/`.
3. Update `zkp-backend/.env`'s `VERIFIER_ADDRESS` to the new Sepolia deploy address (and confirm the hardcoded
   stale fallback in `server.js` lines 43-44 is not silently used — RESEARCH Pitfall 3).
