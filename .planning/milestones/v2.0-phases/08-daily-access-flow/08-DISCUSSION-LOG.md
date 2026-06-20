# Phase 8 Discussion Log

**Date:** 2026-06-19

## Area: Phase 8 scope
**Question:** Does Phase 8 own the Dashboard/View Credentials/Generate Proof/Verify-by-ID end-to-end, or split?
**Options presented:** (1) Everything through Generate Proof, Verify-by-ID split off [recommended] (2) Everything including Verify-by-ID (3) Just current backend-only wording, no new UI
**Selected:** (1) Everything through Generate Proof; Verify-by-ID is its own phase
**Notes:** Recorded as D-01.

## Area: Legacy screens
**Question:** What happens to HomeScreen.js / StudentProfileScreen.js / IdentityForm.js / old ShowProof.js this phase?
**Options presented:** (1) Delete and replace now (2) Build alongside, delete later
**Selected:** (1) Delete and replace now
**Notes:** Recorded as D-04.

## Area: "Blockchain Status: Verified" meaning
**Question:** What should the View Credentials screen's verified check mean?
**Options presented:** (1) On-chain revocation check [recommended] (2) Local/off-chain only
**Selected:** (1) On-chain revocation check
**Notes:** Recorded as D-05.

## Area: Proof-ID persistence timing
**Question:** Build the real persistent Proof-ID store now, or just a display-only ID and defer persistence to the verify phase?
**Options presented:** (1) Build the store now [recommended] (2) Defer persistence
**Selected:** (1) Build the persistent store now
**Notes:** Recorded as D-02. Combined with the architectural finding from the prior session (nonce single-use vs. repeatable verify-by-ID) into D-03.

## Area: Nonce entry UX
**Question:** Manual text entry only, or also QR-scan?
**Options presented:** (1) Manual only (matches sketch) (2) Manual + QR scan
**Selected:** (1) Manual text entry only
**Notes:** Recorded as D-06. QR-scan noted as a deferred enhancement.

## Deferred Ideas
- Verify Proof lookup screen + public re-verification (own phase, likely 8.1)
- QR-scan entry for verifier nonce
