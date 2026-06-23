# Milestones

## v3.0 Governance & Custody — E5 + E6 (Shipped: 2026-06-23)

**Phases completed:** 3 phases, 12 plans. Erasure (ERASE-01/02) explicitly descoped — see below.

**Key accomplishments:**

- **E5 — Multisig Registry Governance:** `CredentialRegistry` admin moved from a single deployer EOA to a real Gnosis Safe 2-of-3 (3 official owners: AcadAdmin, Asst. Registrar, Dean) via a 2-step `transferAdmin`/`acceptAdmin` handoff. `services/safeService.js` wraps propose→confirm→execute (`@safe-global/protocol-kit`/`api-kit`); issue/revoke now both require 2 of 3 signatures — no single official can mutate registry state. Live Safe deployed and verified on Sepolia at `0xC0c5D7E08631A0f8552e03F388732162896Ae6F5`; full propose/sign/execute walkthrough done with MetaMask and real gas costs measured (`safeExecute`: ~82k–146k gas).
- **E6 — Threshold Custody Split:** `crypto/shamir.js` (secrets.js-grempe, 2-of-3) splits every issued DEK into 3 shares across separated custodian stores at issuance — the admin alone never holds ≥2 shares, closing v2.0's documented single-custody interim gap. Custodian onboarding (dev keygen + `POST /api/custodians/register-key` + client-side WebCrypto keygen page) keeps each custodian's private key device-local.
- **E6 — Recovery:** `POST /recovery/initiate` + `/submit-share` reconstruct the DEK in memory only once 2-of-3 authenticated custodian shares arrive, wiping it immediately after use. Case A (credential modification) is triggered transparently from the existing Edit-flow's 409 and re-anchors through the new Safe governance path. Case B (student device loss) is student-driven via a new mobile `RecoverDeviceScreen` that submits only a freshly-generated public key; completion fires on whichever of "shares" or "pubkey" arrives second (either order).
- **Descoped:** Governed erasure / crypto-shredding (ERASE-01, ERASE-02 — destroy ≥2 shares + best-effort IPFS unpin) was explicitly deferred mid-session by the user (time-constrained before a demo) and never implemented; no `erasureService.js`/controller/routes exist. No security gap results — the existing on-chain `revoked` flag already independently blocks proof verification for a revoked credential, so erasure was defense-in-depth storage cleanup, not a runtime-security requirement. Remains a valid candidate for a future milestone; `11-03-PLAN.md`'s original must-haves are unstarted and still accurate.

---

## v2.0 E3 Encrypted Holder-Controlled Storage (Shipped: 2026-06-20)

**Phases completed:** 3 phases, 12 plans, 23 tasks

**Key accomplishments:**

- New `crypto/aesgcm.js` module (generateDEK/encryptCredential/decryptCredential, Node built-in crypto, timed()-benchmarked) plus `Student` schema updated with a `dek` field and `ipfsCID` renamed to `ciphertextCID` — the foundation contracts Plan 02 wires into the issuance flow.
- `issueCredentialOnChain` now builds the §E3.2 credential JSON via a shared `buildCredentialJson()` helper, encrypts it with the caller-supplied DEK, and pins only the ciphertext blob; `studentService.js` applies a fresh-on-create/reuse-on-update DEK policy across all 3 issuance call sites and `sanitizeStudent()` excludes `dek` while exposing the renamed `ciphertextCID`.
- Renamed the off-chain `ipfsCID` JS identifier to `ciphertextCID` in zkp-backend's `/credential-info` handler and digital-app's VerifyProof screen, completing 2 of the 4 D-08 rename targets with zero on-chain or contract logic changes.
- New `crypto/ecies.js` module (wrapDEK/unwrapDEK, eciesjs@0.5.0) plus `pubKey`/`dekEnvelopeCID`/`enrollmentPhase` Student schema fields, closing ENROLL-01 (new students default to `awaiting-keypair`).
- `claimCredential()` orchestration that ECIES-wraps the escrowed DEK, pins the envelope to IPFS, and atomically wipes `dek`/sets `dekEnvelopeCID`/flips `enrollmentPhase` to `active` in a single `findOneAndUpdate`, closing the TOCTOU window on repeat claims with a 409.
- Installed `eciesjs`, `expo-secure-store`, and `react-native-get-random-values` in `digital-app`; wired the RNG polyfill as the first line of `index.js`; created `utils/keypair.js` with `generateAndStoreKeypair()`/`getStoredPublicKeyHexForRetry()`. The on-device Hermes RNG smoke test (Task 2's human-check) has since been run and PASSED — confirmed in a later session. The temporary smoke-test probe has now been removed from `App.js`.
- Created `ClaimCredentialScreen.js` (auto-triggered keypair generation + claim POST, with loading/error/retry states) and wired it into the navigation graph: registered in `App.js` with back-navigation disabled, and added the D-01 routing branch in `LoginScreen.js` so any `awaiting-keypair` student is redirected into it automatically on login. Tasks 1 and 2 (both code/automated-verify tasks) are complete and committed. Task 3 — the full on-device end-to-end human-verify checkpoint — is deferred to the end of the next session per explicit user instruction, batched with Phase 8's new device checkpoint, rather than blocking phase closure now.
- Added a rollNo-keyed credential-blobs lookup endpoint to the admin backend and widened the zkp-backend nonce-session TTL from 5 to 15 minutes to support a real two-phone QR verification round trip.
- On-device ECIES DEK-unwrap (eciesjs + SecureStore) and AES-256-GCM credential decrypt (@noble/ciphers), mirroring the server-side ecies.js/aesgcm.js blob and envelope shapes exactly.
- 3-button Dashboard hub plus the first end-to-end exercise of the daily-access decrypt pipeline (fetch blobs -> IPFS gateway -> unwrapDEK -> decryptCredentialBlob -> display) with a live on-chain Blockchain Status badge that degrades gracefully on network failure.
- Built the Generate Proof screen — selective-disclosure checklist (the checklist IS consent, D-10) + manual verifier challenge nonce field, wired to the exact unmodified zkp-backend /generate-proof contract (dobInt->dob remap, explicit salts passthrough), rendering the resulting proof as a 220px QR with a 15-minute expiry notice and no persistence.
- Two-hop QR challenge/response Verify Proof screen built and the entire app rewired off the legacy IdentityForm/HomeScreen/ShowProof/StudentProfile flow onto the new Dashboard-centric daily-access stack — Task 3's on-device two-phone verification has NOT been run and the plan is not yet complete.

---

## v1.0 — Circuit Rebuild (E1 + E2)

**Completed:** 2026-06-18

E1 depth-3 Merkle selective-disclosure circuit + E2 verifier-nonce replay protection. Fresh Groth16 trusted setup, redeployed verifier, ZKP backend integration, nonce lifecycle enforcement, and benchmarked end-to-end (mean ± σ, n≥19).

Phases: 01-freeze-spec-field-set-consistency, 02-e1-e2-circuit-build, 03-trusted-setup-redeploy, 04-zkp-backend-integration-nonce-enforcement, 05-benchmarking-metrics. Archived under `.planning/archive/v1.0-phases/`.
