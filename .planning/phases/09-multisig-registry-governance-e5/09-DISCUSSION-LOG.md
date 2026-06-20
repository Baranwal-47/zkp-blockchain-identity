# Phase 9: Multisig Registry Governance (E5) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-21
**Phase:** 9-Multisig Registry Governance (E5)
**Areas discussed:** Signer identity & key custody, Propose→sign→execute UX, Admin UI surface, Local Hardhat vs Sepolia sequencing

---

## Signer identity & key custody

| Option | Description | Selected |
|--------|-------------|----------|
| Backend holds all 3 keys | Fully automated demo signing, still cryptographically real 2-of-3 | |
| Manual MetaMask signing per official | Each signature requires switching MetaMask accounts | ✓ |

**User's choice:** Manual MetaMask signing per official.

| Option | Description | Selected |
|--------|-------------|----------|
| Generate 3 fresh keypairs | New EOAs as Safe owners, keys can live in .env safely | ✓ |
| Reuse existing 3 MetaMask accounts | Use personal accounts directly as owners | |

**User's choice:** Generate 3 fresh keypairs.

| Option | Description | Selected |
|--------|-------------|----------|
| Deployer stays separate from the 3 Safe owners | Deployer only deploys + transfers admin, never signs again | ✓ (per user's own phrasing) |
| Deployer doubles as one of the 3 Safe owners | Reuse funded deployer key as e.g. Dean | |

**User's choice:** "let say the current wallet address is the deployer then he or she can be the deployer, then we need 3 separate wallet addresses and they all 3 will have to go to the metamask wallet and approve the sign in final production check" — confirms deployer/owner separation.

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — cryptographic correctness is the goal | 2-of-3 mechanism is real regardless of who holds keys today | |
| No — want to simulate 3 separate identities more strictly | Wants some access-control gating distinct identities | ✓ |

**User's choice:** No — wants stricter identity simulation. Led directly into the Admin UI surface discussion (per-role login).

---

## Propose→sign→execute UX

| Option | Description | Selected |
|--------|-------------|----------|
| Backend proposes, officials sign via Safe{Wallet} app | No new UI, Safe's own interface collects signatures | |
| Custom 'Pending Approvals' screen in admin portal | New frontend scope, more integrated UX | ✓ |

**User's choice:** Custom Pending Approvals screen.

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-execute once threshold met | No manual step after 2nd signature | |
| Explicit manual execute step | Deliberate checkpoint before on-chain submission | ✓ |

**User's choice:** Explicit manual execute step.

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — show pending status in admin dashboard | Read-only indicator of in-flight proposals | ✓ |
| No — admin just fires the request and waits | No visibility until executed | |

**User's choice:** Yes, show pending status.

---

## Admin UI surface

| Option | Description | Selected |
|--------|-------------|----------|
| Web admin portal only | Browser MetaMask connection, matches existing Issue/Revoke trigger location | ✓ |
| Both web and mobile embedded admin screens | More reach, but WalletConnect/deep-linking complexity | |

**User's choice:** Web admin portal only.

| Option | Description | Selected |
|--------|-------------|----------|
| Wallet address is the identity | No separate login; connected address matched to known owner addresses | |
| Separate official login per role | Real per-role accounts in addition to wallet connection | ✓ |

**User's choice:** Separate official login per role — flagged against HARD-01 deferral, followed up with a depth-of-auth question.

| Option | Description | Selected |
|--------|-------------|----------|
| Lightweight: simple password per role | Reuses existing simple admin-login pattern, no JWT/bcrypt | ✓ |
| Full auth: proper login system for officials | Pulls HARD-01 forward into this phase | |

**User's choice:** Lightweight simple password per role.

---

## Local Hardhat vs Sepolia sequencing

| Option | Description | Selected |
|--------|-------------|----------|
| Local Hardhat for safeService.js logic, Sepolia for the real signing flow | Fast iteration locally, real MetaMask UX verified on Sepolia | ✓ |
| Sepolia-first for everything | One environment, slower iteration | |

**User's choice:** Local Hardhat first, then Sepolia for the real signing walkthrough.

---

## Claude's Discretion

- Exact UI layout/styling of the Pending Approvals screen.
- Whether the per-role password check is a dedicated middleware/route or inline in existing admin auth path.
- Polling vs webhook mechanism for the dashboard pending-status indicator.

## Deferred Ideas

- Full bcrypt/JWT/session auth hardening for official logins (stays under HARD-01).
- Pending Approvals view in the mobile app's embedded admin screens.
