---
phase: 08-daily-access-flow
plan: 02
subsystem: crypto
tags: [eciesjs, noble-ciphers, aes-256-gcm, secp256k1, expo-secure-store, react-native]

# Dependency graph
requires:
  - phase: 07-keypair-enrollment
    provides: on-device secp256k1 keypair in SecureStore (keypair.js, PRIVATE_KEY_STORAGE_KEY)
  - phase: 06-encrypted-storage
    provides: server-side aesgcm.js/ecies.js blob+envelope shapes this plan mirrors on-device
provides:
  - "decryptCredentialBlob(blob, dek) — on-device AES-256-GCM credential decrypt via @noble/ciphers"
  - "unwrapDEK(envelopeBase64) — on-device ECIES DEK-unwrap via eciesjs + SecureStore"
  - "@noble/ciphers promoted to direct dependency at ^1.3.0"
affects: [08-03-view-credentials, 08-04-generate-proof]

# Tech tracking
tech-stack:
  added: ["@noble/ciphers ^1.3.0 (direct dep, pure-JS AES-GCM, RN-safe)"]
  patterns:
    - "Server-side Node crypto/eciesjs logic mirrored on-device with identical blob/envelope shapes; only the key source differs (function arg server-side vs SecureStore read on-device)"
    - "Every crypto op benchmarked with performance.now() and a single [benchmark] console.log line (CLAUDE.md ground rule 5) — never logs the secret itself"

key-files:
  created:
    - digital-app/utils/credentialCrypto.js
    - digital-app/utils/dek.js
  modified:
    - digital-app/package.json

key-decisions:
  - "@noble/ciphers gcm expects the 16-byte auth tag appended to ciphertext (not passed separately like Node's setAuthTag) — combined = concat(ciphertext, authTag) before decrypt"
  - "Resolved a plan-internal contradiction in Task 2: the <action> mandates a CLAUDE.md-required [benchmark] console.log, but the <verify> script's blanket no-console.log regex would have failed it. Kept the benchmark log (logs only elapsed ms, never privKeyHex/dek) and ran an intent-faithful verification that allows benchmark-only logging while still rejecting any line that references the secret."

patterns-established:
  - "On-device crypto utils document their server-side mirror source file + line range in the JSDoc header, plus an explicit threat-mitigation comment block keyed to threat IDs from the plan's threat_model"

requirements-completed: [ACCESS-02]

# Metrics
duration: 8min
completed: 2026-06-19
---

# Phase 08 Plan 02: On-Device Crypto Primitives Summary

**On-device ECIES DEK-unwrap (eciesjs + SecureStore) and AES-256-GCM credential decrypt (@noble/ciphers), mirroring the server-side ecies.js/aesgcm.js blob and envelope shapes exactly.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-19T18:08:36Z
- **Completed:** 2026-06-19T18:16:36Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- `decryptCredentialBlob(blob, dek)` round-trips a real @noble/ciphers gcm-encrypted blob back to the original JSON object, validating blob shape with the exact mirrored error message from the server-side aesgcm.js
- `unwrapDEK(envelopeBase64)` reads the private key from SecureStore using the verbatim `keypair.js` storage key, wraps eciesjs's `decrypt()` output in `Buffer.from()` (Phase-7 Rule-1 fix), and enforces the 32-byte DEK length check
- `@noble/ciphers` promoted from transitive to direct dependency at `^1.3.0`, closing the RESEARCH.md Wave-0 hoisting-risk gap
- Both utilities forbid logging the DEK, private key, or plaintext credential; only a single `[benchmark]` timing line per op is emitted (CLAUDE.md ground rule 5)

## Task Commits

Each task was committed atomically:

1. **Task 1: Pin @noble/ciphers + create utils/credentialCrypto.js (AES-GCM decrypt)** - `30040c3` (feat)
2. **Task 2: Create utils/dek.js (on-device ECIES unwrap)** - `219ff25` (feat)

**Plan metadata:** (pending — this commit)

## Files Created/Modified
- `digital-app/utils/credentialCrypto.js` - `decryptCredentialBlob(blob, dek)`: validates blob shape, builds `combined = concat(ciphertext, authTag)`, decrypts via `@noble/ciphers` gcm, returns parsed JSON; benchmarks the decrypt call
- `digital-app/utils/dek.js` - `unwrapDEK(envelopeBase64)`: reads private key from SecureStore (`privid_student_privkey`), ECIES-decrypts via `eciesjs`, wraps result in `Buffer.from()`, enforces 32-byte length; benchmarks the decrypt call
- `digital-app/package.json` - added `"@noble/ciphers": "^1.3.0"` to `dependencies` (was previously only a transitive dep of eciesjs/ethers)

## Decisions Made
- Mirrored both server-side crypto primitives field-for-field (same validation messages, same Buffer.from wrap, same length checks) rather than reimplementing them differently for mobile — keeps the two codebases provably equivalent.
- Used `@noble/ciphers/aes`'s `gcm` instead of any Node `crypto` shim, since Node's `crypto.createDecipheriv` with GCM support is unavailable in React Native/Hermes (08-RESEARCH.md Pitfall 1).
- Kept the CLAUDE.md-mandated benchmark `console.log` line in `dek.js` despite the plan's verify script's blanket `console.log` ban — see Deviations below.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Task 2's verify script blanket-bans `console.log`, but the same task's `<action>` mandates a CLAUDE.md ground-rule-5 benchmark `console.log` line**
- **Found during:** Task 2 (Create utils/dek.js)
- **Issue:** The plan's literal Task 2 `<action>` text requires wrapping `decrypt()` with `performance.now()` timers and emitting `console.log(\`[benchmark] unwrapDEK: ...\`)`. The plan's `<verify>` automated check then runs `if(/console\.log/.test(s)) throw new Error('must not log secrets')` — a blanket regex that fails on ANY console.log, including the one the action just required. Running the verify script as literally written produces a false-positive failure even though the benchmark line never logs `privKeyHex` or `dek`.
- **Fix:** Implemented `dek.js` per the action (including the mandated benchmark log, which logs only an elapsed-ms number under a fixed `[benchmark]` label). Ran an intent-faithful version of the verify check that preserves every other structural assertion (eciesjs import, storage key, SecureStore read, Buffer.from wrap, length check) but narrows the secret-logging check to: any `console.log` line must contain `[benchmark]` and must not reference `privKeyHex`. The file has exactly one console.log and it passes this check.
- **Files modified:** digital-app/utils/dek.js
- **Verification:** Custom node -e script (intent-faithful) returns `OK`; manually confirmed the single console.log line is `console.log(\`[benchmark] unwrapDEK: ${(t1 - t0).toFixed(2)}ms\`)` with no reference to privKeyHex or dek.
- **Committed in:** 219ff25 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — plan-internal contradiction between action and verify script)
**Impact on plan:** No scope creep; resolved in favor of the CLAUDE.md hard constraint (ground rule 5: benchmark every crypto op) while still enforcing the real intent of the no-secret-logging gate (T-08-04).

## Issues Encountered
None beyond the deviation documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `decryptCredentialBlob` and `unwrapDEK` are ready for Plan 08-03 (View Credentials) and Plan 08-04 (Generate Proof) to call directly.
- Plan 08-03's on-device checkpoint is the first place `unwrapDEK`'s live ECIES round trip against a real SecureStore-backed key will be exercised end-to-end (this plan's Task 2 verify was structural/static only, per the plan's own `<verification>` section).

---
*Phase: 08-daily-access-flow*
*Completed: 2026-06-19*

## Self-Check: PASSED

- FOUND: digital-app/utils/credentialCrypto.js
- FOUND: digital-app/utils/dek.js
- FOUND: .planning/phases/08-daily-access-flow/08-02-SUMMARY.md
- FOUND: commit 30040c3
- FOUND: commit 219ff25
- FOUND: commit 5cf1642
