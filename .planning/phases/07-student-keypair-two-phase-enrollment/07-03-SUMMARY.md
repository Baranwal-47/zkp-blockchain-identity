---
phase: 07-student-keypair-two-phase-enrollment
plan: 03

subsystem: mobile
tags: [eciesjs, secp256k1, expo-secure-store, react-native-get-random-values, keygen]

# Dependency graph
requires:
  - phase: 07-01-ecies-crypto-foundation
    provides: "eciesjs API shape (PrivateKey, .toHex(), .publicKey.toHex(), PrivateKey.fromHex) verified server-side"
provides:
  - "digital-app: eciesjs@^0.5.0, expo-secure-store (SDK-53-resolved), react-native-get-random-values@^1.11.0 installed"
  - "RNG polyfill wired as literal first line of index.js"
  - "utils/keypair.js — generateAndStoreKeypair() / getStoredPublicKeyHexForRetry()"
affects: [07-04-claim-screen]

# Tech tracking
tech-stack:
  added:
    - "eciesjs@^0.5.0 (digital-app)"
    - "expo-secure-store@~14.2.4 (digital-app, SDK-53-resolved via npx expo install)"
    - "react-native-get-random-values@^1.11.0 (digital-app — pinned to the 1.x line; 2.0.0 requires react-native>=0.81 and this project is on 0.79.5)"
  patterns:
    - "RNG polyfill import must be the literal first statement in index.js, before expo/App or anything that transitively imports eciesjs/ethers"
    - "Mobile keypair module convention (mirrors crypto/ecies.js's server-side discipline): write secret to secure storage BEFORE returning; never log/return private key material; retry path re-derives, never regenerates"

key-files:
  created:
    - digital-app/utils/keypair.js
  modified:
    - digital-app/index.js
    - digital-app/app.json
    - digital-app/App.js
    - digital-app/package.json

key-decisions:
  - "Pinned react-native-get-random-values to ^1.11.0 instead of latest (2.0.0): npm install failed with ERESOLVE because 2.0.0's peerDependency requires react-native>=0.81, but digital-app is on react-native@0.79.5 (Expo SDK 53). Verified 1.11.0 (and the entire 1.x line) only requires react-native>=0.56, fully compatible. No --force/--legacy-peer-deps used — resolved by selecting the correct compatible version instead of overriding the resolver."
  - "expo-secure-store resolved to ~14.2.4 via npx expo install's SDK-53 compatibility table, per RESEARCH.md Pitfall 2 (never hardcode ^56.0.4)."
  - "Added a temporary RNG smoke-test probe to App.js (top-level useEffect, logs only key type/length) rather than index.js, to keep it isolated and trivially removable without touching the polyfill-ordering-critical entry point."

requirements-completed: [KEY-01 (mobile half — partial, see Human Verification Pending)]

# Metrics
duration: 12min
completed: 2026-06-19
---

# Phase 07 Plan 03: Mobile Crypto Foundation (RNG Polyfill + Keypair Module) Summary

**Installed `eciesjs`, `expo-secure-store`, and `react-native-get-random-values` in `digital-app`; wired the RNG polyfill as the first line of `index.js`; created `utils/keypair.js` with `generateAndStoreKeypair()`/`getStoredPublicKeyHexForRetry()`. The on-device Hermes RNG smoke test (Task 2's human-check) is started and ready but NOT YET CONFIRMED PASSING — no physical device/simulator/Hermes runtime was available in the execution environment to complete that step.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-06-19T09:13:00Z
- **Completed:** 2026-06-19T09:18:36Z
- **Tasks:** 2 of 3 fully completed (Task 1 was the pre-approved human checkpoint); Task 2's automated/static portions complete, human-check portion pending
- **Files modified:** 5 (1 created, 4 modified)

## Accomplishments
- Task 1 (blocking human checkpoint) was already approved by the user prior to this execution run ("approved" for `react-native-get-random-values`'s package legitimacy).
- All three dependencies installed at correct, compatible versions:
  - `eciesjs@^0.5.0` (pure-JS `@noble/curves` line, matches 07-01's server-side choice)
  - `expo-secure-store@~14.2.4` (SDK-53-resolved, not hardcoded)
  - `react-native-get-random-values@^1.11.0` (deviation — see Decisions)
- `digital-app/index.js`: `import 'react-native-get-random-values';` added as the literal first line, before the `expo`/`App` imports, with an inline comment documenting why it must stay first.
- `digital-app/app.json`: `expo-secure-store` config plugin auto-registered by `npx expo install`.
- `digital-app/utils/keypair.js` created: `generateAndStoreKeypair()` generates a secp256k1 keypair, writes the private key hex to SecureStore under `privid_student_privkey` before returning, and returns only `{ pubKeyHex }`; `getStoredPublicKeyHexForRetry()` re-derives the pubkey from the stored private key and never regenerates. Both verified against the plan's exact grep/node verify command (`OK`).
- Build-time verification: `npx expo export --platform android` successfully bundled all 1284 modules (including the new deps) into a Hermes bytecode bundle with no resolution errors — only a benign `@noble/hashes` package-exports-map warning (Metro falls back to file-based resolution; common with this package, non-blocking).
- Expo dev server started in the background (`npx expo start --clear`, confirmed healthy at `http://localhost:8081`) and left running for the user to connect a device/Expo Go session.

## Task Commits

Each task was committed atomically:

1. **Task 2: Install deps, wire RNG polyfill** (automated portion) - `b363a4a` (feat)
2. **Task 3: Create utils/keypair.js** - `df59b21` (feat)

## Files Created/Modified
- `digital-app/utils/keypair.js` - New: on-device keygen + SecureStore persistence (generateAndStoreKeypair, getStoredPublicKeyHexForRetry)
- `digital-app/index.js` - RNG polyfill import added as first line
- `digital-app/app.json` - expo-secure-store config plugin registered (auto, by `npx expo install`)
- `digital-app/App.js` - Temporary RNG smoke-test probe added (useEffect, logs key type/length only) — **must be removed once the on-device check passes**
- `digital-app/package.json` - Added eciesjs, expo-secure-store, react-native-get-random-values

## Decisions Made
- **react-native-get-random-values version deviation:** the plan said to install the package without specifying a version; a bare `npm install react-native-get-random-values` resolved to `2.0.0`, which failed with `ERESOLVE` because its peerDependency requires `react-native>=0.81` while `digital-app` is on `react-native@0.79.5`. Checked `npm view react-native-get-random-values versions`/`peerDependencies` across the version history: only `2.0.0` raised the floor to `0.81`; the entire `1.x` line (up to `1.11.0`) requires only `react-native>=0.56`. Installed `1.11.0` explicitly — a genuinely compatible resolution, not a forced/overridden one (no `--force`/`--legacy-peer-deps` used).
- Kept the temporary smoke-test probe in `App.js` rather than `index.js`, to avoid adding any non-polyfill statement to the file whose only job is correct import ordering.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Blocker] react-native-get-random-values@latest (2.0.0) incompatible with project's React Native version**
- **Found during:** Task 2, initial `npm install` command
- **Issue:** `npm install eciesjs@^0.5.0 react-native-get-random-values` failed with `ERESOLVE unable to resolve dependency tree` — `react-native-get-random-values@2.0.0`'s peerDependency requires `react-native>=0.81`; `digital-app` has `react-native@0.79.5` (Expo SDK 53).
- **Fix:** Verified via `npm view` that the `1.x` line (latest patch `1.11.0`) only requires `react-native>=0.56`. Installed `react-native-get-random-values@1.11.0` explicitly instead of the unconstrained latest.
- **Verification:** `npm install` completed cleanly with zero ERESOLVE errors; `npx expo export` bundled the module successfully.
- **Committed in:** `b363a4a` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 dependency-resolution blocker, not a correctness bug)
**Impact on plan:** None on scope — the fix produces the exact same polyfill behavior at runtime (Hermes-targeted `crypto.getRandomValues` patch), just at a version compatible with this project's actual React Native version rather than the unconstrained `latest` tag.

## Issues Encountered

**Human Verification Pending — on-device RNG smoke test not yet executed.**

Task 2's `<verify>` is explicitly a `<human-check>`: confirm on a real device/Expo Go/simulator that the app launches, the temporary keygen probe logs a key length/type, and no `crypto.getRandomValues must be defined` error appears. The execution environment for this run is a headless WSL shell with no `adb`, no emulator, and no Hermes runtime binary available — there is no way to launch the actual app and observe this from here.

What was done in lieu of the device check:
- Confirmed via `node` (plain V8, not Hermes/RN) that `eciesjs`'s `PrivateKey` generation and hex encoding work correctly in isolation (64-char priv hex, 66-char compressed pub hex) — this validates the library's API shape but does NOT exercise the RN/Hermes `crypto.getRandomValues` polyfill path.
- Confirmed via `npx expo export --platform android` that Metro/Hermes successfully bundles the full import graph (`index.js` → polyfill → App → eciesjs → `@noble/hashes`) with no resolution errors — this is build-time evidence the wiring is structurally correct, but does not prove the polyfill executes correctly at runtime.
- Started `npx expo start --clear` in the background; confirmed the dev server is live and responding at `http://localhost:8081`.

**Action required from the user:** open Expo Go (or a connected device/emulator) against the running dev server, launch the app, and confirm in the Metro/device logs that `[RNG smoke test] priv type/len: ... pub type/len: ...` appears with NO `crypto.getRandomValues must be defined` error. Once confirmed, remove the temporary `useEffect` probe block from `digital-app/App.js` (clearly marked `TEMPORARY (Phase 07-03 Task 2 RNG smoke test)`) and record the device/simulator used. This plan's KEY-01 mobile requirement and Task 2's acceptance criteria are not fully closed until this human-check passes.

## User Setup Required

- **Action:** Connect a real device, Expo Go session, or simulator to the running Expo dev server (`http://localhost:8081`, started via `npx expo start --clear`) and confirm the on-device RNG smoke test passes (see Issues Encountered above for exact pass criteria).
- **Follow-up:** After confirming, remove the temporary probe from `digital-app/App.js` and note the device/simulator used for the record.

## Next Phase Readiness
- `utils/keypair.js` (`generateAndStoreKeypair`/`getStoredPublicKeyHexForRetry`) is ready for plan 07-04's `ClaimCredentialScreen` to call directly.
- **Blocker for full KEY-01 closure:** the on-device RNG smoke test (Task 2 human-check) must be completed and confirmed passing before this plan can be considered fully done. Plan 07-04 can proceed in parallel (it depends on this plan's exports existing, which they do), but the phase as a whole should not be marked complete until the device check is confirmed and the temporary probe is removed.

---
*Phase: 07-student-keypair-two-phase-enrollment*
*Completed: 2026-06-19 (Tasks 2 + 3 code complete; Task 2 human-check pending)*

## Self-Check: PARTIAL — automated/static verification passed for both tasks; Task 2's required on-device human-check could not be performed in this environment and remains open.
