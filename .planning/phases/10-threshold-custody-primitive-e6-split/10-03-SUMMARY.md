---
phase: 10-threshold-custody-primitive-e6-split
plan: 03
type: summary
status: complete
commit: 324cb13
---

# Plan 10-03 Summary — Custodian Onboarding (Dev Keygen + Register-Key + UI)

## What was built

**scripts/generateCustodianKeys.js** — ESM dev-only script; generates throwaway RSA-2048 keypairs for Registrar + Dean, writes public PEMs to configured paths (REGISTRAR_PUBLIC_KEY_PATH / DEAN_PUBLIC_KEY_PATH), private PEMs to gitignored `./keys/`. No AcadAdmin key (D-03). SECURITY WARNING block + Next steps included.

**services/custodianService.js** — `registerCustodianPublicKey(role, pem)`: armor check (SPKI required, private armor rejected) + parse-as-private probe (`createPrivateKey` succeeds → reject) + RSA-2048 modulus check → `fs.writeFileSync`. D-10: private key material provably rejected before any write.

**controllers/custodianController.js** — `registerCustodianKey`: role-ownership enforced (`req.user.role !== role` → 403); `getCustodianStatus`: per-role file-exists check for UI state.

**routes/custodianRoutes.js** — `requireAuth`-gated; `GET /status` + `POST /register-key` mounted at `/api/custodians` in app.js.

**CustodianOnboardingPage.jsx** — WebCrypto RSA-2048 keygen in browser; private PEM downloaded locally via Blob; only `publicKeyPem` in POST body (Network-tab verified); loads registered state on mount; shows green "✓ Custodian keypair registered" card when key already on server.

**PendingApprovalsPage.jsx** — "Custodian Key" nav button for Registrar/Dean with green/amber status dot; links to `/custodian-onboarding`.

## Human checkpoint (Task 4) — APPROVED

1. Dev keygen script wrote `registrar_public.pem` + `dean_public.pem` ✓
2. Browser onboarding: private PEM downloaded; Network tab confirmed POST body contains only `{ role, publicKeyPem }` — no private key ✓
3. Cross-role 403: registrar session → `role:"dean"` returned 403 ✓
4. Bad PEM 400: malformed / 1024-bit / private PEM all rejected ✓

## Requirements met
- CUST-02 setup: custodian public PEMs registered and readable by custodianKeys.js loader
- D-08: one-time registration surface exists
- D-10: keypair born client-side in browser; private key never transmitted (armor + parse-as-private probe enforced server-side as defence-in-depth)
- T-10-08: private-key exfiltration via server-side keygen mitigated
- T-10-09: replay/overwrite by wrong role blocked (403 role-ownership)
- T-10-10: malformed / undersized / private PEM all rejected 400
- T-10-11: unauthenticated registration blocked (requireAuth)
