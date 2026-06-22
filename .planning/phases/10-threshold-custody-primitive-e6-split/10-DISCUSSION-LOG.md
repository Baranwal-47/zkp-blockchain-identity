# Phase 10 — Discussion Log

**Date:** 2026-06-22 · Mode: discuss · Human-reference only (not consumed by downstream agents)

## Areas discussed (user selected all 4)

### 1. Custodian store separation model
- Options: hybrid (A plaintext, B/C encrypted) / all-3-encrypted / 3 separate DB stores.
- **Chosen:** Hybrid — Share A admin-readable; B/C encrypted so admin holds only ciphertext. → D-02.

### 2. Encrypt-to-official mechanism
- Options: officials' MetaMask keys / dedicated custodian keypairs.
- Initial pick MetaMask, **then revised by user** to **dedicated RSA-2048 PEM keypairs** generated at deployment (MetaMask eth_decrypt deprecated). → D-04.
- Cipher: **RSA-2048 (RSA-OAEP)** chosen over EC/ECIES. → D-04.

### 3. Private-key separation (security-critical)
- Raised: if both private PEMs sit on the admin server, the admin can reconstruct alone (breaks the property).
- **Chosen:** Real separation — backend holds **only public keys** + Share A; private keys held by officials. → D-05.
- Custody/usage: **RSA PEM file held on the official's own device; client-side (browser WebCrypto) decryption at recovery**; MetaMask is identity/auth only (can't hold RSA). → D-09.

### 4. Daily-access DEK (removing single-custody student.dek)
- Options: hold-until-claim-then-split / split-at-issuance-with-2of3-ceremony-per-claim.
- **Chosen:** Hold the plaintext DEK only until the student's first claim (wrap to on-device key), then split into shares + delete. Shares are sole custody afterward. → D-06/D-07.

### Recovery auth (forward-looking)
- **Chosen:** MetaMask-signed share submission (Phase 11). → D-08.

## Scope guardrails applied
- Recovery/modification operations (Case A & B), `/recovery/*` endpoints, the admin-gated
  `updateCredential` registry function, and crypto-shredding erasure were redirected to
  **Phase 11** (captured under Deferred Ideas in CONTEXT.md).

## Clarifications captured for research-paper accuracy
- "No Ethereum/Sepolia" applies to **Case B (lost-key recovery)** only — **Case A
  (record modification)** still needs the Safe `updateCredential` on-chain step.
- In Case B the **student** generates the new keypair on-device; the backend only
  re-wraps the DEK to the student's new public key.
