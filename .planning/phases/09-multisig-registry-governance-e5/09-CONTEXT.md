# Phase 9: Multisig Registry Governance (E5) - Context

**Gathered:** 2026-06-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace `CredentialRegistry`'s single-EOA admin with a Gnosis Safe 2-of-3 (AcadAdmin, Asst. Registrar, Dean). All sensitive registry writes (`issueCredential`, `revokeCredential`) must go through a Safe propose→sign→execute flow — no single key can mutate registry state. Covers GOV-01 through GOV-04.

</domain>

<decisions>
## Implementation Decisions

### Signer identity & key custody
- **D-01:** Signing is manual via MetaMask, not backend-automated. The backend never holds the 3 officials' private keys.
- **D-02:** Generate 3 brand-new throwaway keypairs to serve as the Safe's 3 owners (AcadAdmin, Asst. Registrar, Dean) — do not reuse the user's existing personal MetaMask accounts as owners.
- **D-03:** The current/existing wallet (already in use) remains the **deployer EOA only**: it deploys the Safe and calls the registry's `transferAdmin`, then is never an owner and never signs issue/revoke again. Deployer role and Safe-owner role are kept separate.
- **D-04:** Officials must feel like genuinely separate identities, not just 3 keys the same operator clicks through (see D-08/D-09 for how this is implemented without building full auth hardening).

### Propose→sign→execute UX
- **D-05:** A **custom "Pending Approvals" screen** is built in the admin portal (not delegated to Safe{Wallet}'s own app) — officials connect MetaMask there and sign in-app.
- **D-06:** Execute is an **explicit manual step** — after 2 signatures exist, a deliberate "Execute" action is required (not auto-fired the instant threshold is met).
- **D-07:** The admin dashboard gets a **read-only pending-status indicator** (e.g. "Revoke requested for 22BCSD01, awaiting 1 more signature") sourced from Safe Transaction Service / safeService.js — admin doesn't sign, just sees status.

### Admin UI surface
- **D-08:** Pending Approvals lives in the **web admin portal only** (`privdId_admin/frontend`) — not in the mobile app's embedded admin screens. Browser-based MetaMask connection (wagmi/ethers) is the integration point.
- **D-09:** Each official authenticates with a **lightweight per-role password login** (fixed accounts: acadadmin / registrar / dean) before reaching Pending Approvals — this is a simple password check, explicitly NOT bcrypt/JWT/session infra (HARD-01 stays deferred). It exists purely to gate "who is signing" with a distinct identity, separate from wallet connection. After role login, the connected MetaMask address is checked against that role's expected owner address.

### Local Hardhat vs Sepolia sequencing
- **D-10:** Build and unit-test `safeService.js`'s propose/execute logic and the Safe deployment script against **local Hardhat first**, using raw private keys as signers (no MetaMask needed, fast iteration).
- **D-11:** Once that's solid, deploy the **real Safe on Sepolia** and do the actual MetaMask-based Pending-Approvals walkthrough there — that's the environment where the manual-signing UX actually needs to be verified (per GOV-04's dual requirement).

### Claude's Discretion
- Exact UI layout/styling of the Pending Approvals screen.
- Whether the per-role password check lives as a tiny dedicated middleware/route or inline in the existing admin auth path — implementation detail, not a user-facing decision.
- Polling vs webhook mechanism for surfacing pending-tx status to the dashboard indicator (D-07).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Spec / Blueprint
- `docs/CLAUDE_CODE_BLUEPRINT.md` §E5 — full E5 governance design (referenced by PROJECT.md/REQUIREMENTS.md)
- `docs/CLAUDE_CODE_BLUEPRINT.md` §16.2 — locked decision context

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` — GOV-01..04 (full acceptance criteria)
- `.planning/ROADMAP.md` — Phase 9 goal + success criteria

### Existing code this phase replaces/extends
- `zk-proofs/contracts/CredentialRegistry.sol` — current single-EOA `onlyAdmin` modifier (L23-26), `issueCredential` (L32), `revokeCredential` (L51) — needs the 2-step `transferAdmin`/`acceptAdmin` addition
- `privdId_admin/backend/services/credentialService.js` — `anchorOnChain()` (L44) and `revokeCredentialOnChain()` (L58) currently sign directly with `process.env.PRIVATE_KEY` via a raw `ethers.Wallet` — this is the unsigned write path GOV-03 must replace with `safeService.js`'s propose/execute calls

No other external specs apply — requirements fully captured in decisions above and REQUIREMENTS.md.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `privdId_admin/backend/services/credentialService.js` — `anchorOnChain`/`revokeCredentialOnChain` are the two call sites to redirect through `safeService.js`; keep their function signatures stable so `studentService.js` callers don't need to change.
- Existing admin login pattern in the admin backend — reuse its shape for the 3 new lightweight role logins (D-09) rather than inventing a new auth mechanism.

### Established Patterns
- Contract ABI is loaded from the Hardhat artifact JSON at a relative path (`credentialService.js` L11-16) — the same pattern should be reused for any new Safe-related contract interaction if needed.
- `ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL)` + `ethers.Wallet` is the existing chain-connection pattern; `safeService.js` will use `@safe-global/protocol-kit` + `api-kit` instead for the Safe-specific calls per GOV-03.

### Integration Points
- `privdId_admin/backend/services/studentService.js` calls into `credentialService.js`'s on-chain functions — this is the boundary where issue/revoke now becomes "propose" instead of "execute immediately."
- `privdId_admin/frontend` — new Pending Approvals screen + per-role login need a route/nav entry point here.
- No `@safe-global/*` packages or Safe-deployment scripts exist yet in either `privdId_admin/backend/package.json` or `zk-proofs/` — these are new dependencies/scripts this phase introduces.

</code_context>

<specifics>
## Specific Ideas

- User explicitly wants the 3 official identities to feel real/separate during testing, even though one person (the user) will operate all 3 in this thesis-demo context — hence manual MetaMask signing + per-role login rather than backend auto-signing.
- "let say the current wallet address is the deployer... then we need 3 separate wallet addresses and they all 3 will have to go to the metamask wallet and approve the sign in final production check" — confirms deployer/owner separation and that final verification must be a real multi-account MetaMask walkthrough on Sepolia.

</specifics>

<deferred>
## Deferred Ideas

- Full auth hardening (bcrypt/JWT/sessions) for official logins — stays deferred to HARD-01; Phase 9 uses only a lightweight password check (D-09).
- Embedded admin screens in the mobile app (`digital-app`) getting a Pending Approvals view — out of scope for this phase (D-08), could be a future polish item.

### Reviewed Todos (not folded)
None — discussion stayed within phase scope.

</deferred>

---

*Phase: 9-Multisig Registry Governance (E5)*
*Context gathered: 2026-06-21*
