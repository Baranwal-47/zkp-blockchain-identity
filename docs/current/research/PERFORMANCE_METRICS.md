# PrivdID Performance Metrics

Raw measurements captured during implementation, for Phase 5 benchmarking to build on. Each entry is a concrete recorded number, not a vague note, per CLAUDE.md ground rule 5 ("Measure everything").

## Circuit Constraint Counts

Phase 2 E1+E2 circuit nConstraints (non-linear + linear): 7825 (3706 non-linear + 4119 linear) (recorded 2026-06-17)

- Source: `snarkjs r1cs info build/identity.r1cs` against the rebuilt `zk-proofs/circuits/identity.circom` (depth-3 salted-leaf Merkle + selective disclosure + isOver18/isPostgrad predicates + nonce binding).
- Other r1cs info fields: 7834 wires, 14 private inputs, 18 public inputs, 1 public output, 11606 labels.
- This is the raw count only; Phase 5 owns full proof-generation/verification timing benchmarks.
