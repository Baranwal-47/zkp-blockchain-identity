# PrivdID — Circuit Rebuild (E1 + E2)

## What This Is

PrivdID is a privacy-preserving student identity verification system for IIITDM Jabalpur, built on ZK-SNARKs, IPFS, and Ethereum. A working prototype exists across 5 services (mobile app, admin web, admin backend, ZKP backend, ZK/chain). **This milestone rebuilds the cryptographic core**: replacing the current flat `Poseidon(5)` circuit with an E1 depth-3 Merkle tree of per-attribute salted commitments plus E2 verifier-nonce replay protection, then redeploying the verifier and wiring the new artifacts through the ZKP backend. This is the critical path of a larger enhancement plan (E1–E6) and a research deliverable for the authors' thesis.

## Core Value

A verifier can cryptographically confirm a student's **selectively-disclosed** identity attributes and predicates (e.g. "over 18", "is postgrad") against an on-chain Merkle-root commitment, with **replay-proof freshness** — hidden attributes never leak, and a captured proof QR cannot be reused. If everything else fails, this circuit + verify loop must work end-to-end.

## Requirements

### Validated

<!-- Inferred from existing codebase (see .planning/codebase/). These ship today. -->

- ✓ Mobile app: student login, server-side proof generation, QR share, 3-phase verify, embedded admin screens — existing
- ✓ Admin backend (Express 5 + MongoDB, ESM): student CRUD, Poseidon hash, Pinata pin, on-chain issuance/revocation writes — existing
- ✓ ZKP backend (snarkjs + ethers v6): `/generate-proof`, `/verify`, `/verify-onchain`, `/credential-info` — existing
- ✓ Smart contracts: `CredentialRegistry.sol` (admin-gated issue/revoke/lookup) + snarkjs `IdentityVerifier.sol`, deployable to Sepolia/local — existing
- ✓ ZK toolchain: Circom 2.1.6 + hardhat-circom build of flat `Poseidon(5)` `identity.circom` — existing

### Active

<!-- This milestone: the E1+E2 circuit critical path. -->

- [ ] Freeze the 7-attribute identity spec (name, rollNo, dob-int, programmeLevel, discipline, batch-int, email) with fixed leaf order, encodings, and public-signal layout
- [ ] Resolve the §1.4 field-set inconsistency: admin issuance hash must be byte-for-byte identical to the prover's input (list, order, encoding)
- [ ] E1: rebuild `identity.circom` as depth-3 Merkle tree of `Poseidon(2)(attr_i, salt_i)` salted leaves → `merkleRoot` = `pubHash`
- [ ] E1: selective-disclosure binding in-circuit (`revealMask` boolean per attr; revealed value bound to its leaf; hidden attrs never in public signals)
- [ ] E1: predicates in-circuit — `isOver18` (age from dob-int vs session date) and `isPostgrad` (programmeLevel set membership)
- [ ] E2: verifier nonce as a bound public input (replay protection); proof for nonce A rejected against nonce B
- [ ] Fresh Groth16 trusted setup (3-contribution chain + beacon), export + redeploy `IdentityVerifier.sol`, wire new wasm/zkey/vkey into ZKP backend
- [ ] ZKP backend: new `/generate-proof` input shape; E2 nonce endpoints (`/session/nonce` + verify-time enforcement: match + 5-min freshness + one-time use)
- [ ] Re-measure: constraint count, proof-gen, off-chain/on-chain verify, nonce ops, QR payload size (mean ± σ, n≥19)

### Out of Scope

- E3 encrypted holder-controlled IPFS storage (AES-GCM + ECIES + on-device keypair) — deferred to next milestone
- E5 Gnosis Safe 2-of-3 governance + registry admin transfer — deferred
- E6 Shamir 2-of-3 key recovery — deferred
- E4 post-quantum — explicitly out of scope for the entire project
- UI redesign / theme token system (§9) — deferred
- Auth/bcrypt/session-JWT/rate-limit hardening (§12.3–5) — deferred, EXCEPT nonce-endpoint rate limiting which pairs with E2
- Data migration of old flat-`Poseidon(5)` credentials — for the prototype, wipe and re-seed test students instead

## Context

- **Single source of truth:** `docs/CLAUDE_CODE_BLUEPRINT.md` (the full engineering plan). This milestone implements Phase 0 + Phase 1 of that blueprint (§3, §4, E2, plus §1.4/§12.2 field-set fix and §12.1 branding cleanup as it touches issuance).
- **Codebase map:** `.planning/codebase/` (STACK, ARCHITECTURE, STRUCTURE, INTEGRATIONS, CONVENTIONS, TESTING, CONCERNS).
- **Highest-risk inconsistency:** the current circuit's 5th signal is `branch` while admin issuance hashes `programme`; the rebuild eliminates this by writing both issuance hash and prover against the frozen 7-attribute §3 spec verbatim.
- **Trusted-setup discipline:** Phase 1 (Powers of Tau / `.ptau`) is circuit-independent — download, don't regenerate. Phase 2 (`.zkey`) is circuit-specific — run the contribution+beacon ceremony ONCE, only after the circuit is frozen. Any later circuit edit invalidates the `.zkey` and forces redeploy.
- **WSL tooling:** repo is on a `\\wsl.localhost\...` path; run circom/hardhat/snarkjs from a real WSL shell with relative paths.
- **Existing build artifacts** (`zkp-backend/identity.wasm`, `identity_final.zkey`, `verification_key.json`) are all regenerated in this milestone. `pot12_final.ptau` is not in the repo and must be downloaded (or a larger ptau if constraints exceed 4096).

## Constraints

- **Tech stack**: Circom 2.1.6, snarkjs (Groth16), circomlib (poseidon/comparators/bitify), Solidity 0.8.28, hardhat-circom, ethers v6, Express, MongoDB. Do not introduce a different proving system.
- **Crypto correctness**: field-set consistency between issuance and prover is non-negotiable — any mismatch causes silent on-chain verification failure.
- **Design-once**: the circuit must be frozen before the trusted setup; rework forces a full new setup + redeploy. E1 and E2 are built together, never split.
- **Timeline**: hard deadline, weeks out (exact date TBD) — favor coarse phases and demonstrable §4.5 acceptance over polish.
- **Performance**: every new crypto op prints elapsed seconds; benchmarks report mean ± σ over n≥19 runs (research deliverable).
- **Network**: Sepolia testnet (and local Hardhat for dev). Treat freshly deployed addresses recorded in `.env` as canonical; ignore stale README/docs addresses.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| This milestone = circuit critical path only (Phase 0 + Phase 1) | Circuit is the design-once critical path; deadline is tight; E3/E5/E6 can't block it | — Pending |
| 7 committed attributes, depth-3 Merkle, 1 reserved leaf | Per-attribute salted leaves enable hiding even when rollNo is revealed; reserved leaf leaves room for future attrs | — Pending |
| Split `programme` → `programmeLevel` + `discipline`; drop `phone` for `email` | Enables `isPostgrad` predicate + "is CSE"; email is the verifiable contact handle; fixes the §1.4 branch/programme bug at the root | — Pending |
| Enrollment status is on-chain only (not a committed attribute) | "Active" = proof verifies AND not-revoked; lifecycle can change without re-issuing the credential | — Pending |
| Proof generation stays server-side | On-device Groth16 in Expo is heavy; DEK/private key still never leave device (relevant next milestone) | — Pending |
| E5/E6 mechanism realism (sim vs real) decided per-phase later | Those phases are deferred; keep them mechanism-agnostic until provisioning status is known | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-16 after initialization*
