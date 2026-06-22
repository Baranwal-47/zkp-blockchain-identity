# Phase 09 — Plan 06 Summary: Governance Live End-to-End + Issuance Rework

**Status:** ✅ COMPLETE (E5 Gnosis Safe registry governance operational on Sepolia)
**Date:** 2026-06-22
**Scope:** This plan extended/completed Phase 09 beyond the original 09-01…09-05 setup
plans. It split the registry permission model, made issuance a direct write,
rebuilt revocation as a MetaMask-driven 2-of-3 flow, merged admin auth, added gas
metrics, and verified all contracts on Etherscan.

---

## 1. Core architectural decision: two-role registry (issuer vs admin)

The original Phase 09 routed **all** registry writes (issue AND revoke) through the
Safe. In practice, routine student issuance through a 2-of-3 multisig is operationally
wrong — issuance is a high-frequency, low-risk admin action; only state changes
(revoke / graduate / attribute edits) warrant governance.

**Decision (D-09-06-A):** `CredentialRegistry` gains a second role.
- `issuer` (separate from `admin`): `issueCredential` is now `onlyIssuer` — a DIRECT
  on-chain write by the acad-admin backend EOA. No Safe involvement.
- `admin` = the Gnosis Safe 2-of-3: `revokeCredential` stays `onlyAdmin`.
- `setIssuer(address) onlyAdmin` allows the Safe to rotate the issuer.
- Constructor sets `admin = issuer = deployer`, so issuance works immediately at
  deploy; admin is then handed to the Safe via `transferAdmin` + `acceptAdmin`.

This required a **contract change + redeploy** (registry is NOT the frozen circuit).

---

## 2. Active Sepolia deployment (current source of truth)

| Contract | Address | Etherscan name | Verified |
|---|---|---|---|
| CredentialRegistry (NEW) | `0x1e0176059A62ad3d0CD64b299cCdD2D79c8d6A9f` | `CredentialRegistry` | ✅ |
| Groth16Verifier (frozen, v1.0) | `0x630955e2E7e795B3075BD35c2bB93ceA7cE5ffc4` | `Groth16Verifier` | ✅ |
| Gnosis Safe (2-of-3) | `0xC0c5D7E08631A0f8552e03F388732162896Ae6F5` | `SafeProxy` | ✅ (standard) |
| Old registry (ABANDONED) | `0x4E523d08fB94B982132E74f2Cf1195A91Ad0E5d0` | — | — |

- **Issuer / deployer / executor EOA:** `0xC72B28D68BeA5C4F9Dd2e00877023484f4537071`
  (funded ~0.06 ETH; NOT a Safe owner — it can issue + pay execute gas, but cannot approve).
- **Safe owners (2-of-3):** AcadAdmin `0x585Bf4bCBE6864C5dFfD3872E87d2a4df64AEa37`,
  Asst. Registrar `0xeeFAbE4F86d6482666857FcfE4e6934a3BAd9107`,
  Dean `0x990fe108E15b9F8a6c27503F9A69c6986b0B12BE` (throwaway Sepolia keys, MetaMask-held).
- On-chain verified: `registry.admin()` == Safe, `registry.issuer()` == EOA, `pendingAdmin` == 0.
- `REGISTRY_ADDRESS` updated in `zk-proofs/.env`, `zkp-backend/.env`, `privdId_admin/backend/.env`.

---

## 3. Issuance flow (DIRECT, decoupled)

`studentService.createStudent` → `credentialService`:
1. `generateDEK()`
2. `encryptAndPinCredential()` → AES-GCM encrypt + Pinata IPFS pin → CID. **Persist DEK + CID first.**
3. `anchorCredentialOnChain()` → direct `registry.issueCredential(rollNo, cid, pubHash)` via issuer EOA.

**Decision (D-09-06-B):** DEK/ciphertext/CID are saved BEFORE the chain write, so a
chain-write failure can never discard the encrypted credential (the prior all-or-nothing
try/catch was the "no DEK / no IPFS" bug). `anchorPending` / `lastAnchorError` are surfaced
in the API response and the mobile add-student UI. Covers single add, bulk upload, and
update re-issue (all funnel through `issueCredentialOnChain`).

---

## 4. Revocation flow (MetaMask-driven Safe 2-of-3)

**Decision (D-09-06-C):** No owner key ever lives on the backend (D-01/D-03). The
proposer's first signature comes from their MetaMask, not a server key.

- `POST /safe/propose-build` → `buildUnsignedRegistryTx(action, args)` returns the unsigned
  SafeTx (no server signing).
- Frontend signs the SafeTx EIP-712 digest in MetaMask → `POST /safe/propose` →
  `relayProposal()` relays the signature to the Safe Tx Service.
- `getPendingTransactions` joins the Student collection by `pendingRegistryAction.safeTxHash`
  so the approver UI shows "Revoke — &lt;rollNo&gt;" instead of a raw hash.
- 2nd official signs (`/safe/sign` → `confirmTransaction`); acad-admin executes
  (`/safe/execute` → `executeTransaction`, gas paid by the funded executor EOA).
- "Reject" = off-chain dismiss (clears `pendingRegistryAction`); the orphaned Safe proposal expires.

UX: web dashboard Revoke → navigates to Pending Approvals with auto-propose banner. Mobile
is read-only (no MetaMask on RN) and points officials to the web portal. A one-time
"Finish admin handoff" button proposes `acceptAdmin` through the same flow.

**Deferred:** attribute-change re-issuance through Safe + Shamir (E6) — currently still a
direct re-issue, flagged in code.

---

## 5. Admin auth merge (web + mobile)

**Decision (D-09-06-D):** Retired the legacy generic `ADMIN_PASSWORD` login. The
**Academic Admin role** is now the full registry admin. Single role-based login
(`/admin/role-login`): acadadmin → full dashboard + approvals; registrar/dean →
approvals only. Single `officialToken`; role decoded from JWT. Mobile mirrors this
(role picker on login; officials get a read-only approvals screen). Logout/login UX
added across web + mobile.

---

## 6. Performance metrics instrumentation (for the research paper)

- **`[perf]` (timing, blueprint §10):** `computeMerkleRoot`, `encryptCredential`,
  `pinCiphertextToIPFS`, `issueCredentialOnChain` — each prints `{label}: {seconds} s`.
- **`[gas]` (new, `utils/gas.js`):** every on-chain tx logs `gasUsed @ gwei = ETH cost`.
  Wired into the only two gas-spending paths: `issueCredential` (issuance) and
  `executeTransaction` (Safe execute of revoke/acceptAdmin). Gas figures are also returned
  in API result objects for later aggregation.
- **Gasless by design (no `[gas]` line):** proposing + signing Safe txs (off-chain Tx
  Service), DEK gen, encryption, IPFS pinning.

---

## 7. Bug fixes resolved this session (operational notes)

| Symptom | Root cause | Fix |
|---|---|---|
| "no DEK / no encryption / no IPFS" on add-student | issuance proposed to Safe; all-or-nothing try/catch discarded DEK/CID on propose failure | direct issuance + decouple (save DEK/CID before chain write) |
| Safe propose 400 "Bad Request" | personal_sign instead of EIP-712 SafeTx | `signTypedData` over SafeTx struct |
| Safe propose generic 422 "Unprocessable" | error extraction read `err.response.data`; api-kit puts body on `err.data` | fixed extraction → real error surfaced |
| Safe propose `{"sender":["not checksumed"]}` | MetaMask lowercase address; service needs EIP-55 | `ethers.getAddress(senderAddress)` before relay |
| signing rejected / wrong-network | EIP-712 domain chainId taken from MetaMask's active network | pin domain to Sepolia `11155111` + auto `wallet_switchEthereumChain` |
| Dean/Registrar "wallet does not match" | `eth_requestAccounts` returns already-permitted account | `wallet_requestPermissions` forces account picker; `accountsChanged` listener |
| card falsely shows "Signed" | mismatched wallet still set walletAddress | guard `alreadySigned` with `!addressMismatch` |
| execute "Do not know how to serialize a BigInt" | protocol-kit (viem) returns BigInt `blockNumber` | coerce to Number before `res.json()` |
| execute "replacement transaction underpriced" | execute sent underpriced; stuck tx blocked the executor nonce | bump execute fees ~2x; cleared the stuck nonce |

---

## 8. Cleanup

Removed the now-dead server-side revoke path (superseded by the MetaMask flow):
`DELETE /students/:id`, `revokeStudentById`, `revokeStudent`, `revokeCredentialOnChain`,
`proposeRegistryWrite`, `proposeSafeTransaction`.

---

## 9. Verification (manual, end-to-end on Sepolia)

- Add student → direct issuance: DEK + ciphertext + CID persisted, `CredentialIssued` on-chain. ✅
- Negative: old EOA / non-issuer `issueCredential` reverts `Not issuer`. ✅
- `acceptAdmin` handoff: AcadAdmin propose → Registrar sign → execute → `registry.admin()` == Safe. ✅
- Revoke `22BCSD01`: propose → 2-of-3 sign → execute → `CredentialRevoked` (pending final execute confirmation by user). ✅ flow proven.
- All three contracts verified on Etherscan. ✅
