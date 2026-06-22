# Phase 9: Multisig Registry Governance (E5) - Research

**Researched:** 2026-06-21
**Domain:** EVM multisig governance (Gnosis Safe / Safe{Core} SDK) integrated into an existing Express + Hardhat + React admin stack
**Confidence:** HIGH for Safe SDK API surface (verified against installed package type definitions, equivalent to official docs); MEDIUM for exact UI wiring details; LOW/ASSUMED flagged explicitly where training-only

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Signer identity & key custody
- **D-01:** Signing is manual via MetaMask, not backend-automated. The backend never holds the 3 officials' private keys.
- **D-02:** Generate 3 brand-new throwaway keypairs to serve as the Safe's 3 owners (AcadAdmin, Asst. Registrar, Dean) — do not reuse the user's existing personal MetaMask accounts as owners.
- **D-03:** The current/existing wallet (already in use) remains the **deployer EOA only**: it deploys the Safe and calls the registry's `transferAdmin`, then is never an owner and never signs issue/revoke again. Deployer role and Safe-owner role are kept separate.
- **D-04:** Officials must feel like genuinely separate identities, not just 3 keys the same operator clicks through (see D-08/D-09 for how this is implemented without building full auth hardening).

#### Propose→sign→execute UX
- **D-05:** A **custom "Pending Approvals" screen** is built in the admin portal (not delegated to Safe{Wallet}'s own app) — officials connect MetaMask there and sign in-app.
- **D-06:** Execute is an **explicit manual step** — after 2 signatures exist, a deliberate "Execute" action is required (not auto-fired the instant threshold is met).
- **D-07:** The admin dashboard gets a **read-only pending-status indicator** (e.g. "Revoke requested for 22BCSD01, awaiting 1 more signature") sourced from Safe Transaction Service / safeService.js — admin doesn't sign, just sees status.

#### Admin UI surface
- **D-08:** Pending Approvals lives in the **web admin portal only** (`privdId_admin/frontend`) — not in the mobile app's embedded admin screens. Browser-based MetaMask connection (wagmi/ethers) is the integration point.
- **D-09:** Each official authenticates with a **lightweight per-role password login** (fixed accounts: acadadmin / registrar / dean) before reaching Pending Approvals — this is a simple password check, explicitly NOT bcrypt/JWT/session infra (HARD-01 stays deferred). It exists purely to gate "who is signing" with a distinct identity, separate from wallet connection. After role login, the connected MetaMask address is checked against that role's expected owner address.

#### Local Hardhat vs Sepolia sequencing
- **D-10:** Build and unit-test `safeService.js`'s propose/execute logic and the Safe deployment script against **local Hardhat first**, using raw private keys as signers (no MetaMask needed, fast iteration).
- **D-11:** Once that's solid, deploy the **real Safe on Sepolia** and do the actual MetaMask-based Pending-Approvals walkthrough there — that's the environment where the manual-signing UX actually needs to be verified (per GOV-04's dual requirement).

### Claude's Discretion
- Exact UI layout/styling of the Pending Approvals screen.
- Whether the per-role password check lives as a tiny dedicated middleware/route or inline in the existing admin auth path — implementation detail, not a user-facing decision.
- Polling vs webhook mechanism for surfacing pending-tx status to the dashboard indicator (D-07).

### Deferred Ideas (OUT OF SCOPE)
- Full auth hardening (bcrypt/JWT/sessions) for official logins — stays deferred to HARD-01; Phase 9 uses only a lightweight password check (D-09).
- Embedded admin screens in the mobile app (`digital-app`) getting a Pending Approvals view — out of scope for this phase (D-08), could be a future polish item.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GOV-01 | `CredentialRegistry` gains a 2-step admin transfer (`transferAdmin`/`acceptAdmin`); registry admin is transferred from the deployer EOA to a Gnosis Safe 2-of-3 address | See Architecture Patterns Pattern 4 (minimal 2-step admin transfer, verified against OZ `Ownable2Step` v5.6.1 source) and Recommended Project Structure (`CredentialRegistry.sol` diff) |
| GOV-02 | Sensitive registry writes (`issueCredential`, `revoke`) succeed only through a Safe 2-of-3 transaction — one official acting alone cannot mutate registry state | See Architecture Patterns Pattern 2 (propose→confirm→execute flow) and System Architecture Diagram — `onlyAdmin` now gates on the Safe address set via GOV-01, so direct EOA calls revert |
| GOV-03 | Backend `services/safeService.js` wraps the Safe propose → confirm → execute flow (`@safe-global/protocol-kit` + `api-kit`) and is the path the admin issue/revoke flow uses | See Standard Stack (verified package versions/API), Architecture Patterns Patterns 1-3, Code Examples (credentialService.js redirect), Open Question #1 (propose-vs-execute return semantics needs planner decision) |
| GOV-04 | A real Safe 2-of-3 (3 official owner addresses, threshold 2) is deployed on Sepolia; local dev exercises the same propose/sign/execute flow with 3 Hardhat keys | See Pattern 1 (Safe.init with predictedSafe deployment), Common Pitfalls #1 (local Hardhat has no Safe Transaction Service — recommended protocol-kit-only local path) and Open Question #2/#3 (chainId/keypair sourcing for local vs Sepolia) |
</phase_requirements>

## Summary

Phase 9 replaces `CredentialRegistry`'s single-EOA admin with a Gnosis Safe 2-of-3. Three new pieces of work compose the phase: (1) a minimal `Ownable2Step`-style two-step admin transfer added to `CredentialRegistry.sol` without touching the frozen `identity.circom`/`IdentityVerifier.sol`; (2) a `safeService.js` in the admin backend wrapping `@safe-global/protocol-kit` (v7.2.0) + `@safe-global/api-kit` (v4.2.0) for propose/confirm/execute, replacing the two raw `ethers.Wallet`-signed call sites in `credentialService.js`; (3) a new web-only UI surface (per-role login + Pending Approvals + dashboard indicator) per the already-approved `09-UI-SPEC.md`.

The Safe SDK's actual current API (verified directly against the npm-published `.d.ts` files, not training-data recall) centers on `Safe.init(config)` as the static entry point (replacing the deprecated `EthersAdapter`-based `Safe.create()` flow from protocol-kit v1/v2), `createTransaction()` to build a `SafeTransaction`, `signTransaction()` to add a signature locally, and `executeTransaction()` to submit on-chain once threshold is met. `SafeApiKit` (api-kit) is the Safe Transaction Service client: `proposeTransaction()` stores the first signature server-side, `confirmTransaction(safeTxHash, signature)` adds subsequent ones, and `getPendingTransactions(safeAddress)` / `getTransaction(safeTxHash)` surface confirmation counts for the dashboard indicator and Pending Approvals screen. This matches the GOV-03 requirement's named architecture exactly.

**Primary recommendation:** Use `@safe-global/protocol-kit@^7.2.0` + `@safe-global/api-kit@^4.2.0` (current major versions, NOT the deprecated `safe-core-sdk`/`EthersAdapter` v1-v2 API many tutorials still show) for `safeService.js`; add a minimal `Ownable2Step`-pattern (`transferAdmin`/`acceptAdmin`) directly to `CredentialRegistry.sol` (do not import OpenZeppelin's `Ownable2Step` wholesale — the existing contract isn't `Ownable`-based and a from-scratch two-function addition is a smaller diff); for local Hardhat dev, deploy the Safe with `predictedSafe` config against the `hardhat`/`localhost` network using its 20 deterministic test accounts as the 3 owners; for Sepolia, deploy with real MetaMask-connected addresses and use the public Safe Transaction Service (`https://safe-transaction-sepolia.safe.global` via `txServiceUrl` or just `chainId` against the default `api.safe.global`).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Safe deployment (3 owners, threshold 2) | API/Backend (script) | — | One-time governance setup script, run via Hardhat task or standalone Node script, not a runtime API endpoint |
| `transferAdmin`/`acceptAdmin` on registry | Database/Storage (on-chain contract state) | API/Backend (deployer EOA calls it) | Contract-level access control; the deployer EOA calls `transferAdmin`, the Safe (via `acceptOwnership`-equivalent flow, itself a Safe tx) calls `acceptAdmin` |
| Propose/confirm/execute Safe transactions | API/Backend (`safeService.js`) | Browser/Client (MetaMask signs) | Backend builds & relays to Safe Transaction Service; actual cryptographic signing happens client-side in MetaMask per D-01 — backend never holds official private keys |
| Pending-tx status polling | API/Backend (proxy to Safe Tx Service) | Browser/Client (poll/display) | Backend should proxy `api-kit` calls (keeps API keys/config server-side) rather than have the frontend hit Safe Transaction Service directly |
| Per-role password gate (D-09) | API/Backend (new lightweight route) | Browser/Client (role selector UI) | Mirrors existing `adminLogin` pattern exactly — simple password compare + JWT issue, no new auth infra |
| Pending Approvals screen, dashboard indicator | Browser/Client (`privdId_admin/frontend`) | — | D-08 — web admin portal only, not the mobile app |
| Wallet connection (MetaMask) | Browser/Client | — | `ethers` v6 `BrowserProvider` + `window.ethereum`, no `wagmi`/web3modal per UI-SPEC |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@safe-global/protocol-kit` | `^7.2.0` [VERIFIED via npm registry + official package `.d.ts` inspection] | Build/sign/execute Safe transactions, deploy new Safes | Official Safe SDK, the only supported library for programmatic Safe interaction; GOV-03 names it explicitly |
| `@safe-global/api-kit` | `^4.2.0` [VERIFIED via npm registry + official package `.d.ts` inspection] | Client for Safe Transaction Service (propose, confirm, query pending txs) | Official companion package; required to coordinate off-chain signature collection before execution |
| `@safe-global/types-kit` | `^3.1.0` [VERIFIED via npm registry] | Shared TS types (`SafeTransaction`, `MetaTransactionData`, `SafeMultisigTransactionResponse`, etc.) used by both kits | Peer dependency of protocol-kit/api-kit; pulled in transitively but worth pinning explicitly since `safeService.js` will reference its types/JSDoc |
| `ethers` | `^6.16.0` (already installed, do not change) [VERIFIED: existing package.json] | Provider/wallet glue, ABI calls outside Safe-specific flows | Already the project's sole chain library; protocol-kit v7 wraps `viem` internally but accepts an ethers-style external signer/provider via its `SafeProviderConfig` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@openzeppelin/contracts` | `^5.6.1` [VERIFIED via npm registry] | Reference-only — DO NOT add as a Solidity import for this phase; see Architecture Patterns below | Only if a future phase wants the full `Ownable2Step` abstract contract; this phase's minimal diff doesn't need the dependency at all |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@safe-global/protocol-kit` v7 (`Safe.init`) | Older `@safe-global/protocol-kit` v1/v2 + `@safe-global/safe-ethers-lib` (`EthersAdapter`) | Deprecated API surface — `EthersAdapter` and `Safe.create()` were removed; using the old pattern would not match what's actually published on npm today. Many tutorials/training data still show this old shape — flagged explicitly so the planner doesn't accidentally generate v1-style code. |
| Importing OZ's `Ownable2Step` directly into `CredentialRegistry.sol` | Hand-written 2-function `transferAdmin`/`acceptAdmin` pair (recommended) | OZ's `Ownable2Step` extends `Ownable` (renames `admin`→`owner()`, requires constructor changes) — bigger diff to a frozen-adjacent contract than the project needs; the canonical_refs explicitly call for adding just `transferAdmin`/`acceptAdmin` to the existing `admin` variable, not a full `Ownable` migration |
| Backend-proxied Safe Tx Service queries | Frontend calling Safe Transaction Service directly via `api-kit` in the browser | D-07/D-05's dashboard+approvals UI could call api-kit client-side (it's a public read API), but backend-proxy keeps a single source of truth for "is this our Safe" config and avoids duplicating `SAFE_ADDRESS`/chainId across frontend env vars |

**Installation:**
```bash
# privdId_admin/backend
npm install @safe-global/protocol-kit @safe-global/api-kit @safe-global/types-kit

# zk-proofs — only if choosing the OZ-import alternative (NOT recommended, see above)
# npm install @openzeppelin/contracts
```

**Version verification:** Verified directly against npm registry on 2026-06-21:
- `@safe-global/protocol-kit` → latest `7.2.0`, package created 2023-04-11, last published 2026-05-26, repo `github.com/safe-global/safe-core-sdk`
- `@safe-global/api-kit` → latest `4.2.0`, same repo/publish cadence
- `@safe-global/types-kit` → latest `3.1.0`, created 2024-10-02 (split out of protocol-kit in a later refactor), last published 2026-03-27
- `@openzeppelin/contracts` → latest `5.6.1`, package created 2019-07-26, last published 2026-02-27

## Package Legitimacy Audit

slopcheck v0.6.1 is installed and was run against the npm registry (not pypi — ecosystem flag set explicitly to `npm`).

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `@safe-global/protocol-kit` | npm | ~3 yrs (created 2023-04-11) | not directly queried — actively published, official org scope | github.com/safe-global/safe-core-sdk | [OK] | Approved |
| `@safe-global/api-kit` | npm | ~3 yrs (created 2023-04-11) | not directly queried — actively published, official org scope | github.com/safe-global/safe-core-sdk | [OK] | Approved |
| `@safe-global/types-kit` | npm | ~1.7 yrs (created 2024-10-02, later split from protocol-kit) | not directly queried | github.com/safe-global/safe-core-sdk | [OK] | Approved |
| `@openzeppelin/contracts` | npm | ~6.9 yrs (created 2019-07-26) | not directly queried — well known | github.com/OpenZeppelin/openzeppelin-contracts | [OK] | Approved, but **not recommended for use this phase** (see Alternatives Considered) |

**Packages removed due to slopcheck [SLOP] verdict:** none (the initial `[SLOP]` verdicts were a false-positive caused by slopcheck defaulting to the `pypi` ecosystem for these npm-scoped package names — re-running with `--ecosystem npm` returned `[OK]` for all four; this is a documented cross-ecosystem-detection gotcha, not a real legitimacy issue)
**Packages flagged as suspicious [SUS]:** none

Note for the planner: `slopcheck install` (no dry-run flag exists in v0.6.1) actually executes `npm install` as a side effect of the legitimacy check. During this research session it modified `privdId_admin/backend/package.json`/`package-lock.json` and `zk-proofs/package.json`/`package-lock.json` — these were reverted via `git checkout` immediately after verification since research should not mutate dependency manifests. The actual `npm install @safe-global/protocol-kit @safe-global/api-kit @safe-global/types-kit` must be a real execute-phase task step.

## Architecture Patterns

### System Architecture Diagram

```
[Official's browser: MetaMask]
        |
        | 1. role login (POST /admin/role-login {role, password}) -> JWT
        | 2. connect wallet (BrowserProvider.send("eth_requestAccounts"))
        v
[Pending Approvals screen, privdId_admin/frontend]
        |
        | GET  /api/safe/pending           -- list pending Safe txs + confirmation counts
        | POST /api/safe/sign {safeTxHash} -- relay signature after MetaMask signs
        | POST /api/safe/execute {safeTxHash}
        v
[privdId_admin/backend: safeService.js]
        |                                  \
        | api-kit: getPendingTransactions   \  protocol-kit: Safe.init(), createTransaction(),
        | api-kit: confirmTransaction()      \ signTransaction() (with injected signer),
        | api-kit: proposeTransaction()       \ executeTransaction()
        v                                      v
[Safe Transaction Service]              [Safe contract on-chain: CredentialRegistry's new admin]
  (api.safe.global / Sepolia)                  |
                                                | onlyAdmin-gated calls once threshold met
                                                v
                                     [CredentialRegistry.sol: issueCredential / revokeCredential]


Issue/revoke origination (existing flow, now redirected):
[studentService.js] -> credentialService.js::anchorOnChain()/revokeCredentialOnChain()
        -> (NEW) safeService.js::proposeIssue()/proposeRevoke()
              -> builds MetaTransactionData{ to: REGISTRY_ADDRESS, data: encoded issueCredential/revokeCredential call }
              -> api-kit.proposeTransaction() with deployer-or-first-official signature
              -> returns safeTxHash immediately (does NOT wait for execution)
              -> studentService.js stores safeTxHash as "pending" state, NOT a completed on-chain write
```

### Recommended Project Structure
```
privdId_admin/backend/
├── services/
│   ├── credentialService.js     # MODIFIED: anchorOnChain/revokeCredentialOnChain now call safeService.propose* instead of direct ethers.Wallet signing
│   └── safeService.js           # NEW: Safe.init() singleton/factory, proposeTransaction, confirmTransaction, executeTransaction, getPendingTransactions wrappers
├── controllers/
│   ├── adminController.js       # MODIFIED or sibling: add roleLogin (acadadmin/registrar/dean) alongside existing adminLogin
│   └── safeController.js        # NEW: routes consumed by Pending Approvals screen (GET pending, POST sign, POST execute)
├── routes/
│   ├── adminRoutes.js           # MODIFIED: add POST /role-login
│   └── safeRoutes.js            # NEW: /api/safe/* routes
└── .env                          # NEW vars: SAFE_ADDRESS, SAFE_OWNER_ACADADMIN, SAFE_OWNER_REGISTRAR, SAFE_OWNER_DEAN, ACADADMIN_PASSWORD, REGISTRAR_PASSWORD, DEAN_PASSWORD

zk-proofs/
├── contracts/
│   └── CredentialRegistry.sol    # MODIFIED: add pendingAdmin storage var, transferAdmin(), acceptAdmin()
└── scripts/
    └── deploySafe.js              # NEW: deploys a 3-owner/threshold-2 Safe via protocol-kit, then calls registry.transferAdmin(safeAddress)

privdId_admin/frontend/src/
├── pages/
│   ├── RoleLoginPage.jsx          # NEW: "Official sign-in" per UI-SPEC
│   └── PendingApprovalsPage.jsx   # NEW: identity banner + tx cards + Sign/Execute
└── components/
    └── PendingTxCard.jsx          # NEW: one card per pending Safe tx
```

### Pattern 1: Safe.init() with predictedSafe (deployment)
**What:** The current protocol-kit API deploys a new Safe by first computing its deterministic address (`predictedSafe`), then calling `createSafeDeploymentTransaction()` and sending it.
**When to use:** One-time setup script for both local Hardhat and Sepolia (per D-10/D-11 sequencing).
**Example:**
```javascript
// Source: @safe-global/protocol-kit v7.2.0 published .d.ts (verified locally, npm pack)
import Safe from '@safe-global/protocol-kit'

const protocolKit = await Safe.init({
  provider: RPC_URL,           // string RPC URL or EIP-1193 provider
  signer: DEPLOYER_PRIVATE_KEY, // deployer EOA — per D-03, deployer ≠ owner
  predictedSafe: {
    safeAccountConfig: {
      owners: [acadAdminAddr, registrarAddr, deanAddr], // 3 brand-new throwaway keypairs per D-02
      threshold: 2
    }
    // safeDeploymentConfig.saltNonce optional — omit for default deterministic salt
  }
})

const deploymentTransaction = await protocolKit.createSafeDeploymentTransaction()
// send deploymentTransaction via the underlying provider/signer, then:
const deployedSafeAddress = await protocolKit.getAddress()
```

### Pattern 2: Propose -> confirm -> execute (the GOV-03 core flow)
**What:** `protocol-kit` builds and signs the Safe transaction locally; `api-kit` persists the proposal + each signature to Safe Transaction Service; once `confirmations.length >= confirmationsRequired`, any owner calls `executeTransaction`.
**When to use:** Every `issueCredential`/`revokeCredential` call, replacing the raw `ethers.Wallet` signing in `credentialService.js`.
**Example:**
```javascript
// Source: @safe-global/protocol-kit + api-kit v7.2.0/4.2.0 published .d.ts (verified)
import Safe from '@safe-global/protocol-kit'
import SafeApiKit from '@safe-global/api-kit'

const apiKit = new SafeApiKit({ chainId: 11155111n }) // Sepolia; use 31337n for local hardhat (api-kit has no public service for local — see Pitfall below)

// --- Propose (first official signs) ---
const protocolKit = await Safe.init({ provider, signer: officialPrivateKeyOrBrowserSigner, safeAddress: SAFE_ADDRESS })
const safeTransaction = await protocolKit.createTransaction({
  transactions: [{ to: REGISTRY_ADDRESS, value: '0', data: encodedIssueCredentialCall }]
})
const safeTxHash = await protocolKit.getTransactionHash(safeTransaction) // implicit in signTransaction below in v7; hash also derivable via util
const signedTx = await protocolKit.signTransaction(safeTransaction)
await apiKit.proposeTransaction({
  safeAddress: SAFE_ADDRESS,
  safeTransactionData: signedTx.data,
  safeTxHash,
  senderAddress: officialAddress,
  senderSignature: signedTx.getSignature(officialAddress).data
})

// --- Confirm (second official signs) ---
const protocolKit2 = await Safe.init({ provider, signer: secondOfficial, safeAddress: SAFE_ADDRESS })
const txToConfirm = await apiKit.getTransaction(safeTxHash)
const signed2 = await protocolKit2.signTransaction(txToConfirm)
await apiKit.confirmTransaction(safeTxHash, signed2.getSignature(secondOfficialAddress).data)

// --- Execute (explicit step per D-06, never auto-fired) ---
const txReadyToExecute = await apiKit.getTransaction(safeTxHash)
const executeResult = await protocolKit.executeTransaction(txReadyToExecute)
await executeResult.transactionResponse?.wait?.()
```

### Pattern 3: Query pending transactions (GOV-04 / D-07 dashboard indicator)
**What:** `api-kit.getPendingTransactions(safeAddress)` returns a `SafeMultisigTransactionListResponse` whose `results[]` entries carry `confirmations?: SafeMultisigConfirmationResponse[]` and `isExecuted`. `confirmationsRequired` itself is NOT on the transaction object — fetch it once via `apiKit.getSafeInfo(safeAddress).threshold`.
**When to use:** Backend polling for both the Pending Approvals list and the read-only dashboard summary widget.
**Example:**
```javascript
// Source: @safe-global/api-kit v4.2.0 published .d.ts (verified)
const safeInfo = await apiKit.getSafeInfo(SAFE_ADDRESS) // { threshold, owners, nonce, ... }
const pending = await apiKit.getPendingTransactions(SAFE_ADDRESS)
// pending.results[i].confirmations.length  vs  safeInfo.threshold
for (const tx of pending.results) {
  const signedCount = tx.confirmations?.length ?? 0
  const awaiting = safeInfo.threshold - signedCount
  // "Awaiting {awaiting} more signature{s}" -- exact D-07 copy
}
```

### Pattern 4: CredentialRegistry's minimal 2-step admin transfer
**What:** Add `pendingAdmin` storage + two functions, mirroring `Ownable2Step`'s shape but scoped to the existing `admin` variable — no inheritance change, no constructor change.
**When to use:** GOV-01. Keep `identity.circom`/`IdentityVerifier.sol` completely untouched; this only touches `CredentialRegistry.sol`.
**Example:**
```solidity
// New additions to zk-proofs/contracts/CredentialRegistry.sol — pattern verified against
// OpenZeppelin Ownable2Step.sol v5.6.1 source (github.com/OpenZeppelin/openzeppelin-contracts,
// fetched directly, not from training recall) and adapted to the existing `admin` var instead of `owner()`.
address public pendingAdmin;

event AdminTransferStarted(address indexed previousAdmin, address indexed newAdmin);
event AdminTransferred(address indexed previousAdmin, address indexed newAdmin);

function transferAdmin(address newAdmin) external onlyAdmin {
    pendingAdmin = newAdmin;
    emit AdminTransferStarted(admin, newAdmin);
}

function acceptAdmin() external {
    require(msg.sender == pendingAdmin, "Not pending admin");
    emit AdminTransferred(admin, pendingAdmin);
    admin = pendingAdmin;
    pendingAdmin = address(0);
}
```
Deploy flow: deployer EOA calls `transferAdmin(safeAddress)`, then a Safe transaction (the Safe itself, via `acceptAdmin()` called as `msg.sender == safeAddress`) completes the handoff — this second call is itself the *first* real Safe-governed transaction and should go through the propose/confirm/execute flow as a smoke test before any `issueCredential`/`revokeCredential` is attempted through the Safe.

### Anti-Patterns to Avoid
- **Using `EthersAdapter`/`Safe.create()`:** This was protocol-kit v1/v2's API and is not present in the installed v7.2.0 package (`grep` of the published `.d.ts` confirms no `EthersAdapter` export). Training data frequently shows this old pattern — do not use it.
- **Auto-executing on threshold met:** D-06 explicitly requires Execute to be a separate, deliberate UI action. Do not call `executeTransaction()` automatically inside the `confirmTransaction` handler.
- **Backend holding official private keys:** D-01/D-02 forbid this. `safeService.js`'s sign-side functions must accept an externally-supplied signer (MetaMask-injected on Sepolia, raw Hardhat key only in local dev per D-10) — never read `process.env.PRIVATE_KEY` for official signing (that var stays reserved for the deployer EOA only, per D-03).
- **Importing full `Ownable2Step`/`Ownable` into `CredentialRegistry.sol`:** Bigger diff than needed; would require renaming `admin`→constructor-based `owner()` everywhere `onlyAdmin` and existing tests reference it.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Off-chain multisig signature coordination/storage | A custom Mongo collection storing partial signatures + your own quorum-counting logic | `@safe-global/api-kit`'s `proposeTransaction`/`confirmTransaction`/`getPendingTransactions` against Safe Transaction Service | Signature aggregation, EIP-712 hashing, and nonce management for Safe txs are exactly what the Safe Transaction Service already does correctly; a hand-rolled equivalent risks signature-malleability or replay bugs |
| Multisig contract logic itself | A custom 2-of-3 Solidity multisig bolted onto `CredentialRegistry.sol` | Gnosis Safe (already battle-tested, audited, the GOV-01..04 requirements name it explicitly) | This is literally what GOV-01 asks for — Safe is the standard, do not write a custom multisig contract |
| Two-step ownership transfer | A single-step `setAdmin(address)` "good enough" function | The `pendingAdmin`/`acceptAdmin` two-step pattern (OZ `Ownable2Step`-equivalent) | Single-step transfer to a typo'd or wrong Safe address is irreversible and would brick the registry; two-step requires the new admin to actively claim it |

**Key insight:** Everything Safe-SDK-related in this phase is glue code around an existing, audited multisig infrastructure (the Safe contracts + Transaction Service) — the only genuinely new logic this phase writes is the registry's 6-line two-step transfer addition and the request/response wiring in `safeService.js`/the new routes.

## Common Pitfalls

### Pitfall 1: No public Safe Transaction Service for local Hardhat
**What goes wrong:** `api-kit`'s `getPendingTransactions`/`proposeTransaction` calls a real HTTPS API (`api.safe.global` or a self-hosted instance) — there is no Safe Transaction Service running against `localhost:8545`/chain ID 31337 by default.
**Why it happens:** Safe Transaction Service is an indexer service that watches a real chain; Hardhat's local network has no public indexer.
**How to avoid:** Per D-10, local Hardhat dev should test the `protocol-kit`-only half of the flow (createTransaction/signTransaction/executeTransaction with the 3 owners directly collecting signatures and constructing a multi-sig transaction in-process — `executeTransaction` accepts a `SafeTransaction` object directly without needing the api-kit at all) and skip `api-kit`'s service calls until the Sepolia stage (D-11), OR run `safe-global/safe-transaction-service` locally via Docker (heavier option, likely overkill for a thesis-demo). Recommend: local Hardhat tests exercise protocol-kit signature-collection directly (in-memory, no api-kit), Sepolia exercises the full api-kit-backed propose/confirm/execute + Pending Approvals UI flow.
**Warning signs:** `api-kit` calls failing with network/404 errors when pointed at a `chainId: 31337n` with no `txServiceUrl` override.

### Pitfall 2: protocol-kit v7 dropped `EthersAdapter`
**What goes wrong:** Code written from memory/tutorials using `new EthersAdapter({ ethers, signerOrProvider })` + `Safe.create({ ethAdapter, safeAddress })` will fail — that class/method no longer exists in the installed v7.2.0 package.
**Why it happens:** protocol-kit migrated to a `viem`-based internal provider abstraction and unified initialization under `Safe.init({ provider, signer, safeAddress })`, where `provider` can be a plain RPC URL string or an EIP-1193 object (works directly with `window.ethereum` for the MetaMask flow).
**How to avoid:** Always use `Safe.init()` (confirmed in `dist/src/Safe.d.ts`); pass `provider: window.ethereum` directly for the browser/MetaMask case, and `provider: SEPOLIA_RPC_URL` (string) for backend/script use with a raw private-key signer.
**Warning signs:** Any code referencing `EthersAdapter`, `Safe.create(`, or `@safe-global/safe-ethers-lib`/`@safe-global/safe-web3-lib` (the old adapter packages) should be flagged for rewrite.

### Pitfall 3: `confirmationsRequired` is not on the transaction object
**What goes wrong:** Code assumes `SafeMultisigTransactionResponse` has a `confirmationsRequired` field to compute "awaiting N more" — it doesn't (verified: the type only has `confirmations?: SafeMultisigConfirmationResponse[]`, no `confirmationsRequired` field).
**Why it happens:** The threshold is a property of the *Safe*, not of an individual transaction (it can change between proposal and execution if owners are swapped, though that's out of scope here).
**How to avoid:** Fetch `threshold` once via `apiKit.getSafeInfo(safeAddress)` and compute `threshold - (tx.confirmations?.length ?? 0)` per pending tx, as shown in Pattern 3 above.

### Pitfall 4: MetaMask connected address must be checked against the expected Safe owner (D-09)
**What goes wrong:** A logged-in official's MetaMask could be connected to the wrong account (e.g., still on the deployer EOA, or a leftover personal wallet) and the UI would silently let them attempt to sign with a non-owner address, producing a confusing Safe Transaction Service rejection ("Sender is not an owner").
**Why it happens:** Browser wallet state is independent of the app's role-login state.
**How to avoid:** After `eth_requestAccounts`, compare the connected address against a per-role expected-owner-address map (env-configured `SAFE_OWNER_ACADADMIN`/`SAFE_OWNER_REGISTRAR`/`SAFE_OWNER_DEAN`) and show the UI-SPEC's mismatch banner before allowing Sign.
**Warning signs:** `api-kit.proposeTransaction`/`confirmTransaction` throwing "Sender is not an owner" — this should be caught client-side before the call, not just surfaced as a generic API error.

### Pitfall 5: Encoding the registry call data correctly
**What goes wrong:** `MetaTransactionData.data` must be the ABI-encoded function call (e.g., `registry.interface.encodeFunctionData('issueCredential', [rollNo, cid, pubHashBytes32])`), not a raw object — passing the wrong shape produces a transaction that proposes successfully but reverts on execute.
**Why it happens:** `createTransaction()` expects raw `{ to, value, data }` MetaTransactionData, unlike `ethers.Contract.populateTransaction` shortcuts some tutorials show.
**How to avoid:** Reuse the existing `registryArtifact.abi` already loaded in `credentialService.js` (the same Hardhat-artifact-JSON pattern) with `new ethers.Interface(registryArtifact.abi).encodeFunctionData(...)` to build `data`, then wrap in `{ to: REGISTRY_ADDRESS, value: '0', data }` for `createTransaction`.

## Code Examples

### Backend: redirecting credentialService.js through safeService.js (minimal-diff)
```javascript
// privdId_admin/backend/services/credentialService.js — MODIFIED anchorOnChain
// Source: pattern derived from verified protocol-kit/api-kit API + existing file structure
import { proposeRegistryWrite } from './safeService.js'

async function anchorOnChain(rollNo, cid, merkleRoot) {
  const pubHashBytes32 = ethers.zeroPadValue(ethers.toBeHex(BigInt(merkleRoot)), 32)
  // Function signature stays stable (rollNo, cid, merkleRoot) -> {txHash, blockNumber}
  // but now resolves once the Safe tx is EXECUTED, not immediately proposed — caller
  // contract (studentService.js) must treat the awaited return as "executed", and the
  // propose-only path (most calls) needs its own status surfaced via the Pending Approvals screen.
  return proposeRegistryWrite('issueCredential', [rollNo, cid, pubHashBytes32])
}
```
**Open design question (see Open Questions):** whether `anchorOnChain`/`revokeCredentialOnChain` should now return immediately after *propose* (with `{ safeTxHash, status: 'pending' }`) or block until *execute*. The CONTEXT.md's D-06 ("Execute is an explicit manual step") implies issue/revoke calls from `studentService.js` can no longer complete synchronously — they become "proposed, awaiting signatures" by default. This is a real signature-shape decision the planner must make explicit (see Open Questions #1), not something this research can resolve unilaterally since it changes `studentService.js`'s calling contract.

### Backend: role-login route addition (mirrors existing adminLogin exactly)
```javascript
// privdId_admin/backend/controllers/adminController.js — NEW export, same file/shape as adminLogin
export const roleLogin = asyncHandler(async (req, res) => {
  const { role, password } = req.body // role: 'acadadmin' | 'registrar' | 'dean'
  const rolePasswordEnvKey = { acadadmin: 'ACADADMIN_PASSWORD', registrar: 'REGISTRAR_PASSWORD', dean: 'DEAN_PASSWORD' }[role]
  if (!rolePasswordEnvKey) throw new AppError('Select your role first.', 400)
  const expected = process.env[rolePasswordEnvKey]
  if (!expected) throw new AppError(`${role} authentication is not configured.`, 500)
  if (!password || password !== expected) throw new AppError('Incorrect password for this role. Try again.', 401)

  const token = jwt.sign({ role }, process.env.JWT_SECRET || 'privid-admin-secret', { expiresIn: '24h' })
  res.json({ status: 'success', token, role })
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `safe-core-sdk` v1/v2 with `EthersAdapter`/`Safe.create({ ethAdapter })` | `@safe-global/protocol-kit` v7.x with `Safe.init({ provider, signer })` | protocol-kit v4 (2024) consolidated adapters; v7 (2025-2026) moved to viem-internal abstraction | Any tutorial or training-data example using `EthersAdapter` is stale; must use `Safe.init` |
| `@safe-global/safe-core-sdk-types` | `@safe-global/types-kit` | Split out as its own package (created on npm 2024-10-02) | Type imports moved packages; `safeTransactionData`/`SafeTransaction` etc. now come from `types-kit`, re-exported by protocol-kit/api-kit |

**Deprecated/outdated:**
- `@safe-global/safe-ethers-lib`, `@safe-global/safe-web3-lib` — old adapter packages, superseded by protocol-kit's built-in provider handling
- `Safe.create()` — replaced by `Safe.init()`

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | OpenZeppelin `Ownable2Step`'s general two-step pattern shape (pendingOwner/transferOwnership/acceptOwnership) is well-established training knowledge, but the exact source was independently re-verified via direct GitHub fetch in this session — not purely assumed. Marking residual risk: future OZ minor versions could rename internals (low likelihood, pattern has been stable since v4.9). | Architecture Patterns (Pattern 4) | Low — the project doesn't import OZ directly, only mirrors the pattern shape |
| A2 | Safe Transaction Service has no local/Hardhat-network indexer by default, and api-kit cannot be used against `chainId: 31337n` without a self-hosted instance | Common Pitfalls #1 | Medium — if wrong (e.g., a public test indexer exists for Hardhat's default chain ID), the local-dev plan could use api-kit fully instead of protocol-kit-only; the recommended fallback (protocol-kit direct signature collection) is verified-correct regardless |
| A3 | `studentService.js`'s calling contract for `anchorOnChain`/`revokeCredentialOnChain` needs to change from synchronous "completed write" to "proposed, pending" semantics, and this is a planner-level decision, not yet resolved by CONTEXT.md | Code Examples, Open Questions #1 | High if unaddressed — this affects email-send timing (sendCredentialsEmail), student status display, and re-issue/update flows; must be explicitly decided during planning |

## Open Questions

1. **Does `anchorOnChain`/`revokeCredentialOnChain` return after propose or after execute?** _(RESOLVED — D-12 + plan 09-02: issue/revoke return immediately after PROPOSE as `{ ..., safeTxHash, status: 'pending' }`; studentService records `pendingRegistryAction { safeTxHash, type }` and defers the terminal issued/revoked flip to the execute-confirmation path in 09-03. Propose-and-return-pending; the HTTP request never blocks on manual multisig execution.)_
   - What we know: D-06 mandates execute is a separate manual step; the existing functions are awaited synchronously by `studentService.js` (`createStudent`, `updateStudent`, `revokeStudent`) and used to email students / flip Mongo state immediately after a successful tx.
   - What's unclear: CONTEXT.md doesn't specify whether issuance/revocation now becomes a 2-phase student lifecycle (propose now, "credentialed" only after a human executes later) or whether the existing synchronous student-record flow needs a new `pending`/`awaiting-safe-execution` status analogous to the existing `awaiting-keypair` enrollment phase.
   - Recommendation: Planner should treat this as a first-class design decision for Phase 9 — likely needs a new Student/credential status (e.g., `pendingRegistryAction: { safeTxHash, type: 'issue'|'revoke' }`) so the dashboard indicator (D-07) and existing Students table can both reflect "proposed but not yet executed" state. This was not explicitly resolved in `09-CONTEXT.md`'s decisions and should probably go back through `/gsd:discuss-phase` follow-up or be flagged for the planner to decide with a clear default (recommend: propose-and-return-pending, do not block the existing student-creation HTTP request on manual multisig execution, which could take hours/days in real usage even though this is a thesis demo).

2. **Local Hardhat network's `chainId` for api-kit, if used at all** _(RESOLVED — plan 09-01: local dev uses the protocol-kit-only path, no api-kit, for chainId 31337; the full api-kit + Safe Tx Service stack is exercised only on Sepolia in plan 09-05.)_
   - What we know: Hardhat's default in-memory network reports `chainId: 31337`.
   - What's unclear: Whether the team wants to attempt a self-hosted Safe Transaction Service (Docker) for full local parity, or accept the protocol-kit-only local-dev path (no api-kit) recommended in Pitfall 1.
   - Recommendation: Default to the lighter path (protocol-kit-only for local dev, full api-kit stack only on Sepolia) unless the user explicitly wants full local parity — this matches D-10/D-11's sequencing intent ("once that's solid, deploy the real Safe on Sepolia").

3. **Where do the 3 new throwaway keypairs (D-02) get generated and stored for local Hardhat dev?** _(RESOLVED — plan 09-01 uses 3 of Hardhat's deterministic test accounts as local Safe owners; genuinely-fresh throwaway keypairs (D-02) are generated for Sepolia in plan 09-05 via generateSafeOwners.js.)_
   - What we know: D-02 says generate 3 brand-new throwaway keypairs as Safe owners; D-10 says local dev uses raw Hardhat private keys as signers (no MetaMask).
   - What's unclear: Whether "raw Hardhat private keys" means literally using 3 of Hardhat's 20 well-known deterministic test accounts (fastest, zero setup, but NOT secret/throwaway in the D-02 sense since they're publicly known) versus generating 3 fresh random keypairs and funding them on the local Hardhat network.
   - Recommendation: For local dev, use 3 of Hardhat's deterministic accounts (simplicity, zero risk since it's a local-only ephemeral chain) — D-02's "throwaway keypairs" requirement should be satisfied at the Sepolia stage (D-11) with genuinely freshly generated keys, since that's the environment where key identity actually matters for the "officials feel separate" requirement (D-04).

## Project Constraints (from CLAUDE.md)

- The frozen circuit/contracts: `identity.circom` and `IdentityVerifier.sol` must NOT be touched by this phase — confirmed not needed; only `CredentialRegistry.sol` changes.
- 7-attribute field-set consistency (`name, rollNo, dob, programmeLevel, discipline, batch, email`) is unaffected by this phase — Safe governance changes *who* can call `issueCredential`/`revokeCredential`, not the credential JSON shape itself. `buildCredentialJson()` in `credentialService.js` is untouched.
- Proof generation stays server-side; DEK/student keys never leave device — unaffected, this phase is purely registry-admin governance.
- "Measure everything" — benchmark crypto ops with console.log mean±σ: not directly applicable (no new crypto primitive introduced; Safe signing is MetaMask-side, not a benchmarkable backend op), but Safe transaction gas costs could reasonably get the same `console.log` treatment as the existing `Registry.js` gas-cost test pattern (zk-proofs/test/Registry.js) if the planner wants test coverage for the new `transferAdmin`/`acceptAdmin` functions.
- WSL tooling: continue running Hardhat/Safe deployment scripts from a real WSL shell with relative paths — no change needed, all new scripts are plain Node/Hardhat scripts.
- Locked decision (CLAUDE.md): E5 = Gnosis Safe 2-of-3 (AcadAdmin, Asst. Registrar, Dean) as registry admin — exactly what this phase implements.
- Locked decision (CLAUDE.md): UI = light modern indigo/neutral theme — superseded for this phase by the already-approved `09-UI-SPEC.md`'s explicit deviation (dark zinc/blue, matches the actually-shipped `privdId_admin/frontend`), flagged there as a future `UI-01` item, not a Phase 9 concern.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Sepolia RPC (Alchemy, existing `SEPOLIA_RPC_URL`) | GOV-04 Sepolia Safe deployment + propose/execute | ✓ (confirmed live via `eth_chainId` -> `0xaa36a7`) | — | — |
| Safe Transaction Service, Sepolia (`api.safe.global/tx-service/sep`) | GOV-03/GOV-04 propose/confirm/getPendingTransactions on Sepolia | ✓ (confirmed HTTP 200 on `/about/`) | — | — |
| Safe Transaction Service, local Hardhat (chainId 31337) | Would be needed only for full api-kit-backed local dev | ✗ (no public indexer for local/ephemeral chains) | — | Use protocol-kit-only signature collection locally (no api-kit) — see Common Pitfalls #1 |
| Hardhat (project-local) | Local dev deployment/testing, GOV-04 local path | ✓ | 2.28.6 (matches `^2.24.3` pinned in `zk-proofs/package.json`) | — |
| Node.js | All backend/script work | ✓ | v22.17.1 | — |
| npm | Package installation | ✓ | 10.9.2 | — |
| MetaMask browser extension | D-01/D-08/D-09 official signing UX | Not verifiable from this environment (client-side browser extension) — assume user has it installed per existing project usage (already required for the existing admin wallet/deployer flow) | — | — |

**Missing dependencies with no fallback:** none.

**Missing dependencies with fallback:**
- Safe Transaction Service for local Hardhat — no public indexer exists for ephemeral local chains; the documented fallback (protocol-kit-only signature collection, no api-kit calls) is viable and is the recommended local-dev path per D-10.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | yes | Per-role password check (D-09) mirrors existing `adminLogin` shape (`ADMIN_PASSWORD` env compare + JWT). This is explicitly a lightweight control per D-09/HARD-01 deferral, NOT bcrypt-hashed — document this as an accepted interim gap, same posture as the existing `ADMIN_PASSWORD` plaintext-env-var pattern already in production use. Do not silently "upgrade" this to bcrypt without a discuss-phase decision, since D-09 explicitly scopes it out. |
| V3 Session Management | yes | Reuses existing `jsonwebtoken` (`JWT_SECRET`, 24h expiry) — same library/pattern as `adminController.js`'s `adminLogin`, no new session mechanism introduced |
| V4 Access Control | yes | On-chain: `onlyAdmin` modifier now gates on the Safe address (GOV-01/GOV-02) instead of a single EOA — this *is* the access-control upgrade this phase delivers. Off-chain: the new `/api/safe/*` routes must require the role-login JWT (reuse whatever middleware currently protects `/api/admin/*` or `/api/students/*`) and additionally verify the connected MetaMask address matches the expected owner for that role (D-09) before allowing sign/execute calls to even reach api-kit/protocol-kit |
| V5 Input Validation | yes | `safeTxHash`/address inputs on new `/api/safe/*` routes should be validated as well-formed hex (existing project uses `joi` — reuse it for the new route bodies) before passing to `api-kit`, which will otherwise surface raw "Invalid safeTxHash"/"Checksum address validation failed" errors |
| V6 Cryptography | yes | All actual signing (ECDSA over the Safe transaction's EIP-712 hash) is delegated entirely to MetaMask + `protocol-kit`'s `signTransaction()` — never hand-roll signature construction; this is exactly the "Don't Hand-Roll" item already called out |

### Known Threat Patterns for Safe-governed registries

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Wrong/typo'd address passed to a single-step admin transfer, bricking the registry permanently | Tampering / Denial of Service | The 2-step `transferAdmin`/`acceptAdmin` pattern (GOV-01) — the new admin must actively `acceptAdmin()`, so a typo'd address can never silently take over or strand the contract |
| Role-login password compromise allowing an attacker to reach the Pending Approvals UI (but not actually sign, since MetaMask is separate) | Spoofing | Layered defense already inherent to the design: role-login alone cannot execute a Safe transaction without also controlling the corresponding MetaMask private key (D-01) — compromising the lightweight password only grants UI visibility, not signing capability |
| Replayed/duplicate `proposeTransaction` calls for the same logical issue/revoke action (e.g., double-click) | Tampering | Safe Transaction Service's nonce-based transaction model — each `SafeTransaction` carries the Safe's current `nonce`; a duplicate `createTransaction()` call with the same nonce produces the same `safeTxHash`, so `proposeTransaction` is naturally idempotent for identical payloads. Backend `safeService.js` should still avoid re-proposing if a pending tx for the same `(rollNo, action)` already exists (UX, not just security) |
| Backend leaking `SAFE_OWNER_*` private keys via misconfigured local-dev fallback | Information Disclosure | D-01/D-02/D-03 already forbid the backend from holding official private keys in production (Sepolia); ensure any local-Hardhat-only signer-injection code path is clearly gated (e.g., `NODE_ENV !== 'production'` or a dedicated `USE_LOCAL_SIGNERS` flag) so it can never accidentally activate against Sepolia |

## Sources

### Primary (HIGH confidence)
- `@safe-global/protocol-kit@7.2.0` published TypeScript declarations — `npm pack` + direct inspection of `dist/src/Safe.d.ts`, `dist/src/index.d.ts`, `dist/src/types/safeConfig.d.ts`, `dist/src/types/transactions.d.ts`
- `@safe-global/api-kit@4.2.0` published TypeScript declarations — `npm pack` + direct inspection of `dist/src/SafeApiKit.d.ts`, `dist/src/types/safeTransactionServiceTypes.d.ts`
- `@safe-global/types-kit@3.1.0` published TypeScript declarations — `npm pack` + direct inspection of `dist/src/types.d.ts`
- `raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v5.6.1/contracts/access/Ownable2Step.sol` — fetched directly via curl, confirmed `pragma solidity ^0.8.20` (compatible with project's `0.8.28`)
- npm registry (`npm view`) — version, publish dates, repository URLs for all four packages
- Project source files: `zk-proofs/contracts/CredentialRegistry.sol`, `privdId_admin/backend/services/credentialService.js`, `privdId_admin/backend/controllers/adminController.js`, `privdId_admin/backend/routes/adminRoutes.js`, `privdId_admin/backend/.env`, `privdId_admin/backend/package.json`, `privdId_admin/frontend/src/pages/LoginPage.jsx`, `privdId_admin/frontend/src/services/api.js`, `zk-proofs/hardhat.config.js`, `zk-proofs/scripts/deployRegistry.js`, `zk-proofs/test/Registry.js`, `zk-proofs/package.json`

### Secondary (MEDIUM confidence)
- slopcheck v0.6.1 legitimacy scan, run locally against the npm registry (`--ecosystem npm`)

### Tertiary (LOW confidence)
- None — WebSearch and WebFetch tools were unreliable/redirected in this session; all claims above were either verified against locally-inspected package artifacts/official GitHub raw source, or explicitly flagged `[ASSUMED]` in the Assumptions Log.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions and API surface verified directly against published package `.d.ts` files (npm pack), not training recall
- Architecture: HIGH for Safe propose/confirm/execute flow (verified API); MEDIUM for the student-lifecycle "pending registry action" status design (Open Question #1, genuinely unresolved by CONTEXT.md)
- Pitfalls: HIGH for protocol-kit API-surface pitfalls (verified); MEDIUM for the local-Hardhat/Safe-Transaction-Service gap (reasoned from how Safe Transaction Service is documented to work — an indexer service — combined with absence of any public local-network Safe Tx Service)

**Research date:** 2026-06-21
**Valid until:** ~30 days (Safe SDK is actively developed — protocol-kit/api-kit published a new version within the last month as of this research; re-verify versions if planning is delayed past mid-July 2026)
</content>
