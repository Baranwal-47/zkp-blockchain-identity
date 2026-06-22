# Phase 10: Threshold Custody Primitive (E6 split) - Context

**Gathered:** 2026-06-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the Shamir **2-of-3 threshold custody primitive** for the credential DEK. At
issuance, split the 32-byte DEK into 3 shares and distribute them across **separated
custodian stores** (Share A admin-readable; Shares B/C encrypted to dedicated
Registrar/Dean public keys), and **remove the single-custody plaintext `student.dek`**
so the Shamir shares become the sole custodial recovery copy.

**In scope:** the split + hybrid custody storage at issuance, the `crypto/shamir.js`
primitive, and removing single-custody.
**Out of scope (Phase 11):** the actual recovery/modification operations (Case A & Case
B), `/recovery/*` endpoints, the admin-gated `updateCredential` registry function, and
crypto-shredding erasure.
</domain>

<decisions>
## Implementation Decisions

### Shamir primitive (CUST-01)
- **D-01:** `privdId_admin/backend/crypto/shamir.js` exports `splitDEK(dek) → [A,B,C]`
  (threshold 2) and `reconstructDEK([s1,s2]) → dek` over the 32-byte DEK. Any single
  share reveals nothing about the DEK; any 2 of 3 reconstruct it exactly.

### Custodian store separation — HYBRID (CUST-02)
- **D-02:** Hybrid model. **Share A** stored admin-readable (plaintext) in Mongo.
  **Shares B and C** stored ENCRYPTED so the admin process holds only ciphertext. All 3
  may live in the same collection, e.g.
  `{ studentId, shareA: "S1", shareB: "ENC_REGISTRAR(S2)", shareC: "ENC_DEAN(S3)" }`.
- **D-03:** Share↔official mapping: **A → AcadAdmin, B → Registrar, C → Dean** (the same
  three officials as the E5 Safe owners).
- **D-04:** B/C encryption uses **dedicated custodian keypairs — RSA-2048 (RSA-OAEP via
  Node's built-in `crypto`)**, generated once at deployment as PEM files
  (`registrar_{public,private}.pem`, `dean_{public,private}.pem`). This **SUPERSEDES** the
  earlier "officials' MetaMask keys" idea — MetaMask's `eth_decrypt`/`eth_getEncryptionPublicKey`
  are deprecated; dedicated RSA keypairs are cleaner and dependency-free.
- **D-05 (CRITICAL — makes the security claim real):** **Real separation, not
  co-located.** The backend stores ONLY the PUBLIC keys (`registrar_public.pem`,
  `dean_public.pem`) — enough to *encrypt* B/C at issuance — plus Share A. The PRIVATE
  keys are held by the respective officials and are **never readable by the admin
  process**. This is what makes "no single authority can reconstruct alone"
  cryptographically true rather than merely asserted. Custodian PEMs are gitignored; the
  backend never holds a private custodian key.

### Daily-access DEK — remove single custody (CUST-03)
- **D-06 (canonical DEK lifecycle — "plaintext DEK exists only during the issuance
  ceremony"):**
  1. **Generate DEK** — admin backend generates a random 32-byte AES-256 key.
  2. **Encrypt credential** — AES-GCM encrypt credential JSON → pin ciphertext to IPFS
     (ciphertext CID in Mongo).
  3. **Shamir SSS split** — 3 shares: **A → MongoDB (admin), B → Registrar, C → Dean**;
     2-of-3 reconstructs (shares distributed).
  4. **Wrap DEK (student pubKey)** — ECIES: DEK encrypted with the student's on-device
     public key → DEK envelope pinned to IPFS (envelope CID in Mongo).
  5. **Delete DEK** — plaintext DEK wiped from the backend. **Only remaining copies: the
     3 Shamir shares + the encrypted envelope.**
  Steps 3 and 4 both consume the same live plaintext DEK (two independent outputs) before
  step 5 deletes it. The persistent `student.dek` field is removed — it is never the
  custodial copy. (Timing in the current two-phase enrollment: step 4's wrap is gated on
  the student's pubkey, so the DEK lives until the student's first claim, then is wrapped
  and deleted; the planner resolves exact step-3-at-issuance vs at-claim ordering.)
- **D-07:** No per-student 2-of-3 ceremony at enrollment — the wrap uses the transient
  ceremony DEK, not a reconstruction.

### Recovery auth (forward-looking; shapes storage, implemented in Phase 11)
- **D-08:** Custodian share submission (Phase 11) is authenticated by **MetaMask-signed
  payloads** (reuses E5 wallet identity = same Safe owners). This is SEPARATE from share
  decryption: the official decrypts their RSA-wrapped share with their private key on
  their own side, then submits the plaintext share with a MetaMask signature.
- **D-09 (official private-key custody):** The RSA private key is **NOT** in MetaMask
  (MetaMask only holds the secp256k1/Ethereum key — it stays as identity/auth only). The
  official keeps their private `.pem` on their own device (never on the admin server). At
  recovery the official **loads their PEM into the recovery page and decryption happens
  client-side in the browser (WebCrypto RSA-OAEP)** — only the plaintext share + MetaMask
  signature is sent back; the RSA private key never touches the backend or the network.
- **D-10 (custodian keygen — NEVER transmit a private key):** Custodian keypairs are
  **generated client-side on the official's own device** via a one-time browser onboarding
  (WebCrypto generates the RSA-2048 keypair; the **private `.pem` downloads locally and is
  never transmitted**; only the **public** key is POSTed to the backend and stored). The
  private key is never generated centrally and never "distributed" — it is born where it
  lives. This mirrors the student's on-device keygen (D-02 invariant) and makes "the admin
  server never holds a private custodian key" cryptographically true, not just asserted.
  (Setup deps: a one-time custodian-onboarding page + a backend endpoint to register each
  official's public key — Phase 10 setup work.)

### Claude's Discretion
- Shamir library selection + share serialization (hex/base64).
- Exact Mongo schema (new `custody` collection vs fields on the Student doc).
- Note (paper accuracy): in Case B the **student** generates the new keypair on-device;
  the backend only re-wraps the DEK to the student's new public key.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### E6 spec + governance
- `docs/CLAUDE_CODE_BLUEPRINT.md` §15 — E6 rationale; locked Shamir 2-of-3 (AcadAdmin / Registrar / Dean). Read before writing crypto.
- `.planning/ROADMAP.md` — Phase 10 goal + success criteria (1–3); Phase 11 dependency.
- `.planning/REQUIREMENTS.md` — CUST-01, CUST-02, CUST-03 (this phase); REC-*/ERASE-* (Phase 11 awareness).
- `.planning/phases/09-multisig-registry-governance-e5/09-06-SUMMARY.md` — E5 governance, the 3 Safe owners, registry issuer/admin split (Phase 11's Case A `updateCredential` builds on this).

### Code touchpoints
- `privdId_admin/backend/crypto/aesgcm.js` — `generateDEK`, `encryptCredential`.
- `privdId_admin/backend/crypto/ecies.js` — `wrapDEK` (ECIES to student pubkey).
- `privdId_admin/backend/services/credentialService.js` — encrypt/pin/anchor + `pinEnvelopeToIPFS`.
- `privdId_admin/backend/services/studentService.js` — `createStudent` (split here), `claimCredential` (wrap + split-delete here).
- `privdId_admin/backend/models/Student.js` — `dek` field (`select:false`) to remove; add custody storage.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `crypto/aesgcm.js` `generateDEK` — the 32-byte DEK source fed into `splitDEK`.
- `crypto/ecies.js` `wrapDEK` + `pinEnvelopeToIPFS` — the claim-time student-envelope path that D-06 hooks split-and-delete into.
- Node built-in `crypto` (RSA-OAEP) covers D-04 — no new dependency for share encryption.

### Established Patterns
- Two-phase enrollment (issuance → student claim) — split-and-delete attaches at the claim step (D-06).
- `student.dek` is the single-custody field being replaced (success criterion 3).

### Integration Points
- `studentService.createStudent`: generate DEK → encrypt+pin credential → split DEK → store (A plaintext, B/C RSA-encrypted) → keep transient DEK until claim.
- `studentService.claimCredential`: wrap DEK to student's new pubkey → pin envelope → delete the transient plaintext DEK (shares remain as custody).
</code_context>

<specifics>
## Specific Ideas

The user's 3-case E6 vision: revocation (= E5, done); **Case B** lost-key recovery
(Shamir-only, NO Ethereum/Sepolia); **Case A** record modification (Shamir → then Safe
`updateCredential` on-chain). Phase 10 is the issuance-side split + custody foundation
both cases depend on. Concrete share-record shape provided by the user:
`{ studentId, shareA:"S1", shareB:"ENC_REGISTRAR(S2)", shareC:"ENC_DEAN(S3)" }`.
Custodian keypairs: RSA-2048 PEMs, public-only on the backend.
</specifics>

<deferred>
## Deferred Ideas (Phase 11 / later)

- **Case B recovery** (Shamir-only, NO Ethereum): reconstruct DEK from 2 shares →
  re-wrap to the student's new on-device public key → new `dekEnvelopeCID`.
- **Case A modification** (Shamir → then chain): reconstruct → decrypt → edit attributes
  → re-encrypt with the SAME DEK → new IPFS CID + new `pubHash` → Safe-governed
  `updateCredential(studentId, newPubHash)` on Sepolia.
- `POST /recovery/initiate` + `POST /recovery/submit-share` (2-of-3 authenticated
  submission; DEK reconstructed in memory only, wiped after the operation).
- New admin-gated `updateCredential(studentId, newPubHash)` on `CredentialRegistry`
  (Safe `onlyAdmin`) for Case A — contract change + redeploy.
- Crypto-shredding erasure (destroy ≥2 shares → irreversible recoverability) — ERASE-01/02.
- Client-side custodian tool for officials to decrypt their RSA-wrapped share at recovery.

### Reviewed Todos (not folded)
None — no pending todos matched this phase.
</deferred>

---

*Phase: 10-threshold-custody-primitive-e6-split*
*Context gathered: 2026-06-22*
