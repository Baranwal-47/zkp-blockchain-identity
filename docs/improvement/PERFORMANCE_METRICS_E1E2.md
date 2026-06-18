# PrivdID E1+E2 Performance Metrics

Phase 5 (benchmarking-metrics) research deliverable. Records statistically rigorous
timings for the rebuilt E1 (depth-3 salted-attribute Merkle tree, selective disclosure,
`isOver18`/`isPostgrad` predicates) + E2 (verifier-nonce replay protection) circuit and
its surrounding ZKP backend operations, plus every other research-relevant number that
fell out of this phase's work for free (constraint count, proof size, public-signal
count, QR payload size, end-to-end latency).

This is a **new standalone file** — it does not replace or edit
`docs/current/research/PERFORMANCE_METRICS.md`, which remains the historical record of
the constraint-count measurements taken during circuit development (Phase 2/3).

## Methodology

- Each of the six measured operations is run **N=20** times.
- The **first run is dropped as a JIT/cache warm-up**; mean and **sample** standard
  deviation (divide by `n-1 = 18`, not population `n`) are computed over the remaining
  **n=19** runs.
- Format (per `docs/CLAUDE_CODE_BLUEPRINT.md` §10.3): `<op>: mean <m> s ± <sd> s (n=19)`.
- **On-chain verify** (`OnChainVerification`) gets the identical full N=20/n=19
  live-Sepolia treatment as every other op — no reduced sample size, no methodology
  exception (D-17). It is a stateless, 0-gas `view` call (`verifierContract.verifyProof`);
  one funded proof is reused across all 20 calls, which is valid because the call
  consumes no on-chain state and burns no nonce.
- `NonceIssue` and `NonceCheck` are measured via **direct function calls** to
  `lib/nonceStore.js` (`issueNonce()` / `validateAndConsume()`) rather than through the
  live HTTP endpoints, to avoid HTTP/Express overhead skewing a sub-millisecond
  operation. `NonceCheck` issues a fresh session per iteration so the one-time-use
  `used` flag never turns iterations 2..20 into `nonce_already_used` no-ops.
- QR payload size is measured **synthetically**: `Buffer.byteLength(JSON.stringify({proof,
  publicSignals}), 'utf8')` from one real proof generated against the live 19-signal
  shape — independent of the (out-of-scope, pre-rebuild-shaped) mobile QR screen.
- Source script: `zkp-backend/bench.js` (run via `npm run bench`).
- Live fixture: rollNo `22BCSD01` (re-issued on-chain this session under the new
  7-attribute Merkle scheme), the same vector used by `zkp-backend/test/verifyFlow.test.js`.

## Timing Results (mean ± sample σ, n=19)

| Operation | Mean (s) | σ (s) | n |
|---|---|---|---|
| MerkleRoot | 0.001 | 0.000 | 19 |
| ProofGeneration | 0.430 | 0.013 | 19 |
| OffChainVerification | 0.010 | 0.001 | 19 |
| OnChainVerification | 0.139 | 0.049 | 19 |
| NonceIssue | 0.000 | 0.000 | 19 |
| NonceCheck | 0.000 | 0.000 | 19 |

Raw console output transcribed verbatim from `npm run bench`:

```
MerkleRoot: mean 0.001 s ± 0.000 s (n=19)
ProofGeneration: mean 0.430 s ± 0.013 s (n=19)
OffChainVerification: mean 0.010 s ± 0.001 s (n=19)
OnChainVerification: mean 0.139 s ± 0.049 s (n=19)
NonceIssue: mean 0.000 s ± 0.000 s (n=19)
NonceCheck: mean 0.000 s ± 0.000 s (n=19)
```

Notes on interpretation:
- `MerkleRoot`, `NonceIssue`, and `NonceCheck` round to `0.000 s` at 3-decimal precision —
  these are genuinely sub-millisecond, pure-CPU operations (a handful of Poseidon
  permutations or a `Map` lookup/insert), consistent with their expected cost.
- `OnChainVerification`'s higher σ (0.049 s) relative to its mean (0.139 s) reflects real,
  reportable network-bound variance from the live Sepolia RPC round-trip — not measurement
  noise to be smoothed over (per D-17, this is accepted as a true characteristic of
  on-chain verification, not a methodology defect).

## Circuit Constraint Count (cited, not recomputed)

**7891 total constraints** (3770 non-linear + 4121 linear), 18 public inputs, 1 public
output, 14 private inputs, 7898 wires.

- **Source:** `.planning/phases/03-trusted-setup-redeploy/CEREMONY_LOG.md` §1 ("Frozen
  Circuit Input"), re-verified immediately before the Phase 3 trusted-setup ceremony via
  `snarkjs r1cs info build/identity.r1cs`, and independently confirmed by
  `snarkjs zkey verify` reporting "ZKey Ok!" against the frozen 7891-constraint r1cs.
  Also recorded in `docs/current/research/PERFORMANCE_METRICS.md` (post-CR-01 entry).
- This figure is **cited from Phase 3, not recomputed** in this phase (D-18) — the circuit
  is frozen and any later edit would force a full new trusted setup, so re-running
  `snarkjs r1cs info` here would only ever reproduce the same frozen number.

## Free Side-Effect Numbers (widened scope, D-18)

These numbers were already produced as a side effect of `bench.js`'s six measured loops
and are recorded here because this doc feeds the team's research paper — no new
measurement surface was built to chase them.

| Metric | Value |
|---|---|
| QR payload size (`JSON.stringify({proof, publicSignals})`) | 981 bytes |
| Proof size (`JSON.stringify(proof)`) | 721 bytes |
| Public-signal count | 19 |
| End-to-end latency (issueNonce → buildWitnessInput → fullProve → groth16.verify) | 0.776 s |

**On-chain gas:** `verifyProof` is a read-only Solidity `view` call — it costs **0 gas**
when called off-chain (as `bench.js` and the ZKP backend both do via `provider.call`/a
read-only `ethers.Contract` bound to a `JsonRpcProvider`, never a signed transaction). No
verifier gas figure is recorded in this document because Phase 3 did not capture one for
this rebuilt circuit/verifier pair. This number is **not fabricated** — if a future phase
needs an on-chain gas cost (e.g. for `issueCredential`/`revokeCredential`, which DO submit
transactions), it must be measured fresh against a real transaction receipt, not estimated
here.

## Footer

- **Run date:** 2026-06-18
- **Source script:** `zkp-backend/bench.js` (`npm run bench`)
- **Live fixture:** Sepolia testnet, rollNo `22BCSD01`, registered under the new
  7-attribute Merkle commitment scheme this session
- **Historical baseline (unchanged by this doc):** `docs/current/research/PERFORMANCE_METRICS.md`
