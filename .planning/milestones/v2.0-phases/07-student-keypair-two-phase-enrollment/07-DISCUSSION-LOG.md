# Phase 7: Student Keypair & Two-Phase Enrollment - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-19
**Phase:** 7-Student Keypair & Two-Phase Enrollment
**Areas discussed:** Login → claim routing, eciesjs RN compatibility check, Pubkey endpoint guard

---

## Login → claim routing

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-redirect, fully silent | Login navigates straight into ClaimCredentialScreen which immediately starts keygen + pubkey POST with a loading spinner | ✓ |
| Auto-redirect, explicit confirm step | Same routing, but shows a "Claim your credential" button before triggering keygen | |

**User's choice:** Auto-redirect, fully silent.

**Follow-up — claim failure handling:**

| Option | Description | Selected |
|--------|-------------|----------|
| Retry button, same screen | Error message with "Try again" button re-runs the POST; safe/idempotent since nothing is persisted server-side until POST succeeds | ✓ |
| Kick back to LoginScreen | Log the student out entirely on any failure | |

**User's choice:** Retry button, same screen.
**Notes:** Private key write to SecureStore happens right after on-device generation, before the POST — retries resend the existing pubkey rather than regenerating a new keypair each time.

---

## eciesjs RN compatibility check

| Option | Description | Selected |
|--------|-------------|----------|
| Research step verifies it first | gsd-phase-researcher runs a concrete RN smoke test (import, keygen, encrypt/decrypt) before planning locks in the library; surfaces an alternative if it fails | ✓ |
| Plan with eciesjs, treat as execution risk | Proceed to planning assuming it works; swap libraries during execution if it breaks | |

**User's choice:** Research step verifies it first.

---

## Pubkey endpoint guard

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, reject if already active | One-time claim — 409/400 if enrollmentPhase isn't 'awaiting-keypair'; DEK/envelope untouched | ✓ |
| No guard, last write wins | Endpoint always re-wraps and overwrites regardless of phase | |

**User's choice:** Yes, reject if already active.

---

## Areas not discussed (explicitly skipped)

**Already-active student on a new/wiped device** — user noted no real students are enrolled yet, the database can be freely wiped/reseeded, and explicitly said not to build handling for this edge case now. Captured as deferred (tied to E6 key recovery, not yet in scope).

## Claude's Discretion

- Schema shape for `enrollmentPhase`/`pubKey` (flat fields vs sub-object) — blueprint implies flat fields, no strong reason to deviate.
- Exact `ClaimCredentialScreen` loading/error UI wording — follow existing screen visual patterns.
- Specificity of the pubkey-rejection error message on an already-active account — not user-facing polish that matters given the "no real students yet" context.

## Deferred Ideas

- Shamir 2-of-3 DEK custody (E6) — already deferred to v3+, not re-opened.
- Key recovery for a lost/wiped device with no local private key — belongs with E6 when it ships.
