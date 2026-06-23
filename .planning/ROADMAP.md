# Roadmap: PrivdID

## Milestones

- ✅ **v1.0 — Circuit Rebuild (E1 + E2)** — Phases 1-5 (shipped 2026-06-18)
- ✅ **v2.0 — E3 Encrypted Holder-Controlled Storage** — Phases 6-8 (shipped 2026-06-20)
- ✅ **v3.0 — Governance & Custody (E5 + E6)** — Phases 9-11 (shipped 2026-06-23, erasure descoped — see Phase 11)

## Phases

<details>
<summary>✅ v1.0 — Circuit Rebuild (E1 + E2) — Phases 1-5 — SHIPPED 2026-06-18</summary>

E1 depth-3 Merkle selective-disclosure circuit + E2 verifier-nonce replay protection. Fresh Groth16 trusted setup, redeployed verifier, ZKP backend integration, nonce lifecycle, benchmarked (mean ± σ, n≥19). Phase artifacts under `.planning/archive/v1.0-phases/`; full detail in `.planning/milestones/v2.0-ROADMAP.md` predecessor notes and `MILESTONES.md`.

</details>

<details>
<summary>✅ v2.0 — E3 Encrypted Holder-Controlled Storage — Phases 6-8 — SHIPPED 2026-06-20</summary>

- [x] Phase 6: Encryption & Ciphertext Storage (3/3 plans) — 2026-06-19
- [x] Phase 7: Student Keypair & Two-Phase Enrollment (4/4 plans) — 2026-06-20
- [x] Phase 8: Daily Access Flow (5/5 plans) — 2026-06-20

Full detail archived in `.planning/milestones/v2.0-ROADMAP.md`; phase dirs in `.planning/milestones/v2.0-phases/`. ERASE-01 (crypto-shredding) was descoped to E6-04 — erasure needs E6's destroyable Shamir custody.

</details>

### ✅ v3.0 — Governance & Custody (E5 + E6) — SHIPPED 2026-06-23

- [x] **Phase 9: Multisig Registry Governance (E5)** - Replace single-EOA registry admin with a Gnosis Safe 2-of-3; issue/revoke go through propose→sign→execute
- [x] **Phase 10: Threshold Custody Primitive (E6 split)** - Shamir-split the DEK 2-of-3 at issuance and store shares across 3 separated custodian stores
- [x] **Phase 11: Recovery (E6 ops)** - Reconstruct DEK from 2 shares to recover/modify credentials. **Crypto-shredding erasure (ERASE-01/02) explicitly descoped** — see Phase 11 notes.

## Phase Details

### Phase 9: Multisig Registry Governance (E5)
**Goal**: All sensitive on-chain writes to `CredentialRegistry` (issue, revoke) require 2-of-3 Safe consensus from the three officials (AcadAdmin, Asst. Registrar, Dean) — no single key can mutate registry state.
**Depends on**: Nothing (first phase of v3.0; independent of the Shamir/custody track)
**Requirements**: GOV-01, GOV-02, GOV-03, GOV-04
**Success Criteria** (what must be TRUE):
  1. `CredentialRegistry` admin has been transferred via the new 2-step `transferAdmin`/`acceptAdmin` flow from the deployer EOA to a Gnosis Safe address — calling either function from a non-pending-admin account reverts.
  2. Calling `issueCredential` or `revoke` directly as the deployer EOA (or any single official's wallet) reverts with the registry's `onlyAdmin` check; the same call only succeeds when proposed and executed through the Safe with 2 signatures.
  3. `services/safeService.js` exposes the propose → confirm → execute flow (`@safe-global/protocol-kit` + `api-kit`) and is the code path the admin backend's issue/revoke handlers call — no direct unsigned `ethers` write to the registry remains in that flow.
  4. A real Safe 2-of-3 (3 named owner addresses, threshold 2) is deployed and verifiable on Sepolia (Safe address resolvable via the Safe Transaction Service / Etherscan); the identical propose/sign/execute sequence is reproducible locally against 3 Hardhat keys for dev/test.
**Plans**: 6 plans (6 waves) — grew from 5 to 6 during execution
- [x] 09-01-PLAN.md — CredentialRegistry 2-step admin transfer + local Safe 2-of-3 deploy script + Hardhat tests (GOV-01, GOV-04 local)
- [x] 09-02-PLAN.md — safeService.js propose/confirm/execute + credentialService redirect + pendingRegistryAction status (GOV-02, GOV-03)
- [x] 09-03-PLAN.md — backend per-role login + /api/safe routes/controller + app.js mount (GOV-03, GOV-04 control surface)
- [x] 09-04-PLAN.md — web admin UI: role login, Pending Approvals + MetaMask, dashboard indicator, token-collision fix (GOV-02, GOV-03)
- [x] 09-05-PLAN.md — Sepolia Safe deploy + live 2-of-3 MetaMask propose/sign/execute walkthrough (GOV-04 Sepolia) — completed; real Safe deployed at `0xC0c5D7E08631A0f8552e03F388732162896Ae6F5` on Sepolia
- [x] 09-06-PLAN.md — Governance live end-to-end + issuance rework

### Phase 10: Threshold Custody Primitive (E6 split)
**Goal**: Every credential's DEK is split 2-of-3 at issuance and distributed across three independently-credentialed custodian stores, so the admin alone never holds enough material to reconstruct it — closing v2.0's single-custody interim gap.
**Depends on**: Nothing functionally (independent of Phase 9's Safe track), but ships after Phase 9 in sequence since Phase 11 needs both
**Requirements**: CUST-01, CUST-02, CUST-03
**Success Criteria** (what must be TRUE):
  1. `crypto/shamir.js` exports `splitDEK(dek) → [A, B, C]` and `reconstructDEK([s1, s2]) → dek`; reconstructing from any 2 of the 3 shares recovers the exact original 32-byte DEK, and a single share alone (fed into any reconstruction attempt) fails or yields no usable key.
  2. At issuance, the DEK is split and the 3 shares are written to 3 separated stores with independent access credentials (Share A in the admin-readable store; Shares B and C in stores the admin process's own credentials cannot read) — inspecting the admin DB/connection alone never yields 2+ shares.
  3. No code path remaining in the issuance flow holds the plaintext DEK in backend memory/short-lived storage as a substitute for real custody (the v2.0 documented interim gap is gone) — the Shamir-split shares are the sole custodial recovery copy of the DEK going forward.
**Plans**: 3 plans (2 waves)
- [x] 10-01-PLAN.md — crypto/shamir.js (Shamir 2-of-3 split/reconstruct) + crypto/rsaShare.js (RSA-2048-OAEP wrap/unwrap) primitives + smoke tests (CUST-01)
- [x] 10-02-PLAN.md — split-and-store at issuance, remove single-custody `dek` field, pendingDek claim-window field, custodianKeys.js lazy loader (CUST-02, CUST-03)
- [x] 10-03-PLAN.md — custodian onboarding: dev keygen script + requireAuth register-key endpoint (role-ownership + PEM/modulus-2048 validation) + client-side WebCrypto onboarding page (CUST-02 setup, D-10)

### Phase 11: Recovery (E6 ops)
**Goal**: Custodians can jointly reconstruct a student's DEK to recover device-loss access or modify a credential, gated on 2-of-3 authenticated custodian participation.
**Depends on**: Phase 10 (Shamir split/reconstruct primitive and separated custodian stores must exist); device-loss and modification flows also call the Phase 9 Safe path where an on-chain update is required (credential modification re-issuance)
**Requirements**: REC-01, REC-02, REC-03, REC-04. ~~ERASE-01, ERASE-02~~ — **descoped 2026-06-23** (see below).
**Success Criteria** (what must be TRUE):
  1. `POST /recovery/initiate` opens a recovery request for a student, and `POST /recovery/submit-share` accepts one authenticated custodian share at a time; the DEK is reconstructed in memory only once 2 valid shares have arrived, and is wiped immediately after the triggering operation (re-wrap or re-encrypt) completes — it is never persisted or logged.
  2. Device-loss recovery (Case B): after 2-of-3 share submission, the reconstructed DEK is re-wrapped (ECIES) to the student's newly-generated on-device public key and a fresh `dekEnvelopeCID` is pinned and recorded; daily access (decrypt + proof generation) works again on the new device using only the new key, with no on-chain transaction involved.
  3. Credential-modification recovery (Case A): after 2-of-3 share submission, an official can decrypt the existing credential, edit attributes, and re-encrypt with the same DEK; the re-pinned ciphertext still contains the frozen 7-attribute field set in the frozen order/encoding, so a proof generated afterward still verifies on-chain via the unmodified circuit. Re-anchoring now routes through the Phase 9 Safe 2-of-3 path rather than a direct EOA write.
  4. A custodian share submission without valid authentication (no custodian login / invalid signed payload) is rejected by `/recovery/submit-share` and does not count toward the 2-of-3 threshold.
**Plans**: 3 plans (2 waves) — 11-03 redirected from erasure to Safe-governance integration (see note)
- [x] 11-01-PLAN.md — Recovery session Map + /initiate + /submit-share + auth/duplicate-role guards (REC-01, REC-04)
- [x] 11-02-PLAN.md — Case A (credential-mod re-issuance) + Case B (device-loss re-wrap) operations wired into session completion, redesigned for student-driven Case B + either-order completion gate (REC-02, REC-03)
- [x] 11-03-PLAN.md — **Repurposed**: original scope (governed erasure, ERASE-01/02) was explicitly deferred mid-session by the user (time-constrained before a demo) and never built — no `erasureService.js`/controller/routes exist. The slot was used instead for unplanned but valuable work: routing Case A re-anchoring through Safe 2-of-3 governance (commit `7b271d6`) and an awaiting-proposal discovery panel + issuer-nonce startup guard (commit `c0b95dc`).

**Erasure descoping note (2026-06-23):** ERASE-01/ERASE-02 (destroy ≥2 Shamir shares + best-effort IPFS unpin for irreversible crypto-shredding) are cut from v3.0 scope. The existing on-chain `revoked` flag already independently blocks proof verification for a revoked credential, so erasure was a defense-in-depth storage-layer cleanup, not a security gap — descoping it does not reopen any runtime-security hole. If revisited, `11-03-PLAN.md`'s original must-haves (atomic `$unset` of shares B+C, best-effort Pinata unpin, irreversibility guarantee) remain valid and unstarted.

## Progress

| Phase | Milestone | Plans | Status | Completed |
|-------|-----------|-------|--------|-----------|
| 1-5 (E1+E2 circuit) | v1.0 | — | Complete | 2026-06-18 |
| 6. Encryption & Ciphertext Storage | v2.0 | 3/3 | Complete | 2026-06-19 |
| 7. Student Keypair & Two-Phase Enrollment | v2.0 | 4/4 | Complete | 2026-06-20 |
| 8. Daily Access Flow | v2.0 | 5/5 | Complete | 2026-06-20 |
| 9. Multisig Registry Governance (E5) | v3.0 | 6/6 | Complete | 2026-06-23 |
| 10. Threshold Custody Primitive (E6 split) | v3.0 | 3/3 | Complete | 2026-06-23 |
| 11. Recovery (E6 ops) | v3.0 | 3/3 | Complete (erasure descoped) | 2026-06-23 |
