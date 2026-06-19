# Phase 8: Daily Access Flow - Pattern Map

**Mapped:** 2026-06-19
**Files analyzed:** 13 (1 admin-backend route/controller, 2 mobile crypto utils, 4 new/reworked screens, 4 deleted legacy screens, 1 App.js edit, 1 zkp-backend config edit)
**Analogs found:** 11 / 13 (2 deletions have no analog need; App.js edit and nonceStore.js TTL edit are direct file modifications, not new-pattern needs)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|-----------------|----------------|
| `privdId_admin/backend/controllers/studentController.js` (+ `getCredentialBlobs`) | controller | request-response (CRUD read) | `getStudentById` (same file, lines 240-245) | exact |
| `privdId_admin/backend/routes/studentRoutes.js` (+ route) | route | request-response | same file, lines 7-16 (`/:id` registration pattern) | exact |
| `digital-app/utils/dek.js` (NEW) | utility (crypto) | transform | `privdId_admin/backend/crypto/ecies.js` `unwrapDEK` (server-side original) | exact (logic mirror, different key source) |
| `digital-app/utils/credentialCrypto.js` (NEW) | utility (crypto) | transform | `privdId_admin/backend/crypto/aesgcm.js` `decryptCredential` | role-match (same blob shape, different cipher lib — Node `crypto` vs `@noble/ciphers`) |
| `digital-app/screens/DashboardScreen.js` (NEW) | component (screen) | request-response (none — pure nav hub) | `digital-app/screens/admin/AdminDashboardScreen.js` (button-hub pattern) + `LoginScreen.js` (card/button visual) | role-match |
| `digital-app/screens/ViewCredentialsScreen.js` (NEW) | component (screen) | request-response (fetch + decrypt + display) | `digital-app/screens/ClaimCredentialScreen.js` (loading/error/retry state machine) | exact (state machine shape) |
| `digital-app/screens/GenerateProofScreen.js` (NEW) | component (screen) | request-response (form submit + crypto) | `digital-app/screens/LoginScreen.js` (form/validation/submit) + `zkp-backend/server.js` `/generate-proof` contract | role-match |
| `digital-app/screens/VerifyProofScreen.js` (REWORK of `VerifyProof.js`) | component (screen) | event-driven (two-hop QR challenge/response) | `digital-app/screens/VerifyProof.js` (existing, being reworked) + `QRScannerScreen.js` (scan pattern) | exact (direct rework target) |
| `digital-app/App.js` (MODIFY navigation) | provider (nav config) | n/a (declarative config) | same file (existing Stack.Screen entries) | exact |
| `zkp-backend/lib/nonceStore.js` (MODIFY `TTL_MS` constant, D-08) | config | n/a | same file, line 30 (single constant) | exact |
| `digital-app/screens/HomeScreen.js` (DELETE) | component (screen) | n/a | — | n/a (deletion) |
| `digital-app/screens/StudentProfileScreen.js` (DELETE) | component (screen) | n/a | — | n/a (deletion) |
| `digital-app/screens/IdentityForm.js` (DELETE) | component (screen) | n/a | — | n/a (deletion) |
| `digital-app/screens/ShowProof.js` (DELETE) | component (screen) | n/a | — | n/a (deletion) |

## Pattern Assignments

### `privdId_admin/backend/controllers/studentController.js` — add `getCredentialBlobs` (controller, request-response)

**Analog:** `getStudentById` (same file, lines 240-245) + `claimPubkey` (lines 281-298) for validation style

**Imports pattern** (top of file, already present — no new imports needed beyond what's there):
```javascript
import { AppError } from "../utils/appError.js"; // already imported in this file
import { asyncHandler } from "../middleware/asyncHandler.js"; // already imported
import Student from "../models/Student.js"; // already imported
```

**Core CRUD pattern** (mirrors `getStudentById`, lines 240-245):
```javascript
export const getStudentById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const student = await Student.findById(id);
  if (!student) throw new AppError("Student not found.", 404);
  res.json({ status: "success", student: sanitizeStudent(student) });
});
```

**New handler to write** (research-verified shape, RESEARCH.md Pattern 1):
```javascript
export const getCredentialBlobs = asyncHandler(async (req, res) => {
  const { rollNo } = req.params;

  const student = await Student.findOne({ rollNo });
  if (!student) throw new AppError("Student not found.", 404);
  if (student.enrollmentPhase !== "active") {
    throw new AppError("Student has not completed enrollment.", 403);
  }
  if (!student.ciphertextCID || !student.dekEnvelopeCID) {
    throw new AppError("Credential blobs are not available for this student.", 404);
  }

  res.json({
    status: "success",
    ciphertextCID: student.ciphertextCID,
    dekEnvelopeCID: student.dekEnvelopeCID,
  });
});
```

**Validation pattern** (mirrors `claimPubkey`'s regex-validation style, lines 279-289 — apply same discipline to `rollNo` param shape per RESEARCH.md V5 note, e.g. reuse `studentValidator.js`'s `rollNo: Joi.string().trim().min(1).max(50).required()` schema if validating before the DB call):
```javascript
const COMPRESSED_SECP256K1_PUBKEY_HEX = /^[0-9a-fA-F]{66}$/; // example of this file's regex-guard convention; apply analogous param-shape check to rollNo
```

**Error handling pattern:** `AppError(message, statusCode)` thrown directly — `asyncHandler` (see Shared Patterns below) forwards to centralized error middleware. No try/catch needed inside the handler itself; this project's convention is to let `AppError` propagate.

---

### `privdId_admin/backend/routes/studentRoutes.js` — add new route (route, request-response)

**Analog:** same file, full content (18 lines, already in context above)

**Core pattern** (route registration, lines 1-17):
```javascript
import express from "express";
import { addStudent, bulkAddStudents, getStudents, getStudentById, loginStudent, sendStudentEmails, updateStudentById, revokeStudentById, uploadMiddleware, uploadStudents, claimPubkey } from "../controllers/studentController.js";

const router = express.Router();

router.post("/login", loginStudent);
router.get("/", getStudents);
router.post("/", addStudent);
router.post("/bulk", bulkAddStudents);
router.post("/upload", uploadMiddleware, uploadStudents);
router.post("/send-email", sendStudentEmails);
router.get("/:id", getStudentById);          // <- new route MUST be registered BEFORE this line
router.post("/:id/pubkey", claimPubkey);
router.put("/:id", updateStudentById);
router.delete("/:id", revokeStudentById);

export default router;
```

**CRITICAL ordering note (Pitfall 5, RESEARCH.md):** Insert `router.get("/credential/:rollNo/blobs", getCredentialBlobs);` BEFORE `router.get("/:id", getStudentById);` — Express matches in registration order; otherwise `/credential/X1234/blobs` will be swallowed by `/:id` with `id="credential"`.

---

### `digital-app/utils/dek.js` (NEW) — on-device ECIES DEK unwrap (utility, transform)

**Analog:** `privdId_admin/backend/crypto/ecies.js`, lines 93-103 (server-side `unwrapDEK` original)

**Core pattern to mirror exactly** (server-side original):
```javascript
export function unwrapDEK(privKeyHex, envelopeBase64) {
  const envelope = Buffer.from(envelopeBase64, "base64");
  const dek = Buffer.from(decrypt(privKeyHex, envelope)); // throws on auth failure
  if (dek.length !== DEK_LENGTH) {
    throw new Error(`unwrapDEK: decrypted DEK has unexpected length ${dek.length}`);
  }
  return dek;
}
```

**Mobile adaptation** (reads privKeyHex from SecureStore instead of receiving as arg — mirrors `digital-app/utils/keypair.js`'s `getStoredPublicKeyHexForRetry` SecureStore-read pattern, lines 32-40):
```javascript
import { decrypt } from 'eciesjs';
import * as SecureStore from 'expo-secure-store';

const PRIVATE_KEY_STORAGE_KEY = 'privid_student_privkey'; // MUST match utils/keypair.js exactly (keypair.js line 6)

export async function unwrapDEK(envelopeBase64) {
  const privKeyHex = await SecureStore.getItemAsync(PRIVATE_KEY_STORAGE_KEY);
  if (!privKeyHex) throw new Error('unwrapDEK: no stored private key found');

  const envelope = Buffer.from(envelopeBase64, 'base64');
  const dek = Buffer.from(decrypt(privKeyHex, envelope));
  if (dek.length !== 32) {
    throw new Error(`unwrapDEK: decrypted DEK has unexpected length ${dek.length}`);
  }
  return dek;
}
```

**Error handling pattern:** Do NOT catch/swallow `decrypt()`'s auth-tag-mismatch errors — propagate uncaught to caller, exactly as the server-side original's docstring specifies (ecies.js lines 85-87).

**Security discipline (Shared Pattern — see below):** Never log `privKeyHex`, the DEK, or any intermediate plaintext.

---

### `digital-app/utils/credentialCrypto.js` (NEW) — on-device AES-GCM decrypt (utility, transform)

**Analog:** `privdId_admin/backend/crypto/aesgcm.js`, lines 98-119 (`decryptCredential`, server-side original — Node `crypto`, NOT directly portable to RN per Pitfall 1)

**Blob-shape validation pattern to mirror exactly** (lines 102-109):
```javascript
if (
  !blob ||
  typeof blob.iv !== "string" ||
  typeof blob.authTag !== "string" ||
  typeof blob.ciphertext !== "string"
) {
  throw new Error("decryptCredential: blob must have iv, authTag, ciphertext base64 strings");
}
```

**Server-side decrypt core (Node `crypto` — reference only, NOT portable to RN):**
```javascript
const iv = Buffer.from(blob.iv, "base64");
const authTag = Buffer.from(blob.authTag, "base64");
const ciphertext = Buffer.from(blob.ciphertext, "base64");

const decipher = crypto.createDecipheriv("aes-256-gcm", dek, iv);
decipher.setAuthTag(authTag); // MUST be called before decipher.final()
const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
return JSON.parse(plaintext.toString("utf8"));
```

**Mobile adaptation using `@noble/ciphers`** (RESEARCH.md Pattern 3 — verify exact API signature against Context7/official docs before implementation, flagged LOW confidence / Assumption A1):
```javascript
import { gcm } from '@noble/ciphers/aes';

export function decryptCredentialBlob(blob, dek) {
  if (!blob || typeof blob.iv !== 'string' || typeof blob.authTag !== 'string' || typeof blob.ciphertext !== 'string') {
    throw new Error('decryptCredentialBlob: blob must have iv, authTag, ciphertext base64 strings');
  }
  const iv = Buffer.from(blob.iv, 'base64');
  const authTag = Buffer.from(blob.authTag, 'base64');
  const ciphertext = Buffer.from(blob.ciphertext, 'base64');

  const combined = Buffer.concat([ciphertext, authTag]); // VERIFY this concat order against @noble/ciphers docs
  const plaintext = gcm(dek, iv).decrypt(combined);
  return JSON.parse(Buffer.from(plaintext).toString('utf8'));
}
```

**Error handling pattern:** Same as `dek.js` — do not swallow auth-tag mismatch errors, let them propagate (matches `decryptCredential`'s own no-catch discipline).

---

### `digital-app/screens/DashboardScreen.js` (NEW) — 3-button hub (component/screen, request-response)

**Analog:** `LoginScreen.js` (card/button visual language) + the button-stack convention seen in admin screens

**Imports pattern** (mirrors `LoginScreen.js` lines 1-14):
```javascript
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { ADMIN_BACKEND_URL } from '../environment';
```

**Button style to copy verbatim** (`LoginScreen.js` `loginButton`/`loginButtonText`, lines 202-223):
```javascript
loginButton: {
  backgroundColor: '#3b82f6',
  paddingVertical: 16,
  borderRadius: 12,
  alignItems: 'center',
  marginTop: 24,
  shadowColor: '#3b82f6',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.3,
  shadowRadius: 8,
  elevation: 4,
},
loginButtonText: {
  color: '#ffffff',
  fontSize: 16,
  fontWeight: '700',
},
```
Per UI-SPEC: 3 buttons, full-width, stacked vertically with `lg` (24px) gaps — reuse this exact button style 3x for "View Credentials" / "Generate Proof" / "Verify Proof", navigating via `navigation.navigate('ViewCredentialsScreen')` etc. (mirrors `LoginScreen.js`'s `navigation.navigate('ClaimCredentialScreen', {...})` call, line 46).

**Card/container style to copy** (`LoginScreen.js` `container`/`form`, lines 131-134, 161-171):
```javascript
container: { flex: 1, backgroundColor: '#f8fafc' },
form: {
  backgroundColor: '#ffffff',
  borderRadius: 16,
  padding: 24,
  marginBottom: 24,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.07,
  shadowRadius: 8,
  elevation: 3,
},
```

---

### `digital-app/screens/ViewCredentialsScreen.js` (NEW) — decrypt + display + Blockchain Status (component/screen, request-response)

**Analog:** `digital-app/screens/ClaimCredentialScreen.js` (full file, 140 lines — exact loading/error/retry state-machine match)

**State machine + auto-fire-on-mount pattern to copy verbatim** (lines 1-45):
```javascript
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { ADMIN_BACKEND_URL } from '../environment';

export default function ViewCredentialsScreen({ route, navigation }) {
  const [status, setStatus] = useState('loading'); // 'loading' | 'error' | 'ready'
  const [errorMessage, setErrorMessage] = useState(null);

  const loadCredential = async () => {
    setStatus('loading');
    try {
      // 1. fetch blobs via GET /credential/:rollNo/blobs (new admin-backend route)
      // 2. unwrapDEK(dekEnvelopeCID-fetched-blob) — utils/dek.js
      // 3. decryptCredentialBlob(ciphertextCID-fetched-blob, dek) — utils/credentialCrypto.js
      // 4. POST zkp-backend /credential-info { pubHash: merkleRoot } for Blockchain Status (D-05)
      setStatus('ready');
    } catch (error) {
      setErrorMessage(error.message || "Couldn't load your credential. Check your connection and try again.");
      setStatus('error');
    }
  };

  useEffect(() => { loadCredential(); }, []);
  // ... render loading/error/ready exactly as ClaimCredentialScreen.js does (lines 47-76)
}
```

**Loading/error UI to copy verbatim** (`ClaimCredentialScreen.js` lines 47-76 + styles lines 78-139) — `ActivityIndicator color="#3b82f6"`, "Try Again" retry button, error heading in `#ef4444`.

**Blockchain Status badge pattern (D-05)** — new copy per UI-SPEC, reuses the `/credential-info` request/response shape documented in RESEARCH.md:
```javascript
// POST {ZKP_BACKEND_URL}/credential-info  { pubHash: merkleRoot }
// Response: { found: true, rollNo, ciphertextCID, issuedAtMs, revoked, ipfsUrl, etherscanUrl }
// found:true && !revoked -> "Blockchain Status: Verified" (#22c55e)
// found:true && revoked -> "Blockchain Status: Revoked" (#ef4444)
// network/throw error -> "Blockchain Status: Unable to verify" (#64748b, NOT destructive red)
```

---

### `digital-app/screens/GenerateProofScreen.js` (NEW) — checklist + nonce + result QR (component/screen, request-response)

**Analog:** `digital-app/screens/LoginScreen.js` (form/TextInput/submit/validation pattern, full file) + `zkp-backend/server.js` `/generate-proof` contract (RESEARCH.md Pattern 4)

**Form input pattern to copy** (`LoginScreen.js` lines 72-103, label+input+row structure):
```javascript
<Text style={styles.label}>Verifier Challenge Code</Text>
<TextInput
  style={styles.input}
  placeholder="Paste the code from your verifier"
  value={nonce}
  onChangeText={setNonce}
  autoCapitalize="none"
  autoCorrect={false}
  placeholderTextColor="#9ca3af"
/>
```

**Submit handler request-construction pattern** (RESEARCH.md Pattern 4, exact field remapping — note Pitfall 3's `dob`/`dobInt` rename and Pitfall 2's mandatory explicit `salts` passthrough):
```javascript
async function handleGenerateProof(decryptedCredential, checkedAttrs, nonce) {
  const attrs = {
    name: decryptedCredential.name,
    rollNo: decryptedCredential.rollNo,
    dob: decryptedCredential.dobInt,        // Pitfall 3: MUST remap dobInt -> dob
    programmeLevel: decryptedCredential.programmeLevel,
    discipline: decryptedCredential.discipline,
    batch: decryptedCredential.batch,
    email: decryptedCredential.email,
  };
  const currentDateInt = Number(new Date().toISOString().slice(0, 10).replace(/-/g, ''));

  const response = await fetch(`${BACKEND_URL}/generate-proof`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      attrs,
      salts: decryptedCredential.salts,   // Pitfall 2: NEVER omit — server auto-generates if absent, breaking on-chain match
      reveal: checkedAttrs,
      nonce,
      currentDateInt,
    }),
  });
  const { proof, publicSignals, salts } = await response.json();
  return { proof, publicSignals };
}
```

**Checkbox row pattern (per UI-SPEC interaction notes):** 44px-min-height `TouchableOpacity` rows with ☑/☐ glyph + label, `#3b82f6` fill when checked — no existing screen has this exact pattern; closest analog is `LoginScreen.js`'s `eyeButton` `TouchableOpacity` toggle (lines 97-103) for the toggle-state interaction idiom only.

**Loading/disabled-button pattern** (`LoginScreen.js` lines 105-115, `disabledButton` style lines 214-218):
```javascript
<TouchableOpacity
  style={[styles.loginButton, loading && styles.disabledButton]}
  onPress={handleLogin}
  disabled={loading}
>
  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.loginButtonText}>Sign In</Text>}
</TouchableOpacity>
```

---

### `digital-app/screens/VerifyProofScreen.js` (REWORK of `VerifyProof.js`) — two-hop QR challenge/response (component/screen, event-driven)

**Analog:** `digital-app/screens/VerifyProof.js` (existing file, being reworked — full content read, 1317 lines) + `digital-app/screens/QRScannerScreen.js` (scan pattern, full content read, 275 lines)

**Existing `/verify-onchain` + `/credential-info` call pattern to KEEP (lines 74-106 of `VerifyProof.js`)** — this logic survives the rework, just gets re-triggered per-hop instead of once:
```javascript
const verifyOnChain = async () => {
  const response = await fetch(`${BACKEND_URL}/verify-onchain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proof, publicSignals, sessionId }),
  });
  if (!response.ok) throw new Error(`Blockchain verification failed: ${response.status}`);
  const data = await response.json();
  return { valid: data.valid, timestamp: new Date().toISOString(), method: 'blockchain' };
};

const lookupRegistry = async () => {
  try {
    const pubHash = publicSignals[0];
    const response = await fetch(`${BACKEND_URL}/credential-info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pubHash }),
    });
    if (!response.ok) return { found: false };
    return await response.json();
  } catch {
    return { found: false };
  }
};
```
**CRITICAL existing comment to preserve (lines 17-20 of `VerifyProof.js`)** — confirms RESEARCH.md's Open Question 3 was ALREADY resolved in this exact file: the off-chain `/verify` pre-check was deliberately dropped to avoid double-consuming the nonce; `/verify-onchain` alone is authoritative. Do not re-add a `/verify` call in the rework.

**New: D-09 Step 1 (challenge-out) — call `/session/nonce`** (RESEARCH.md "Code Examples" section, exact response shape):
```javascript
// POST {ZKP_BACKEND_URL}/session/nonce  (no body)
// Response: { nonce: "<decimal string>", sessionId: "<uuid>", expiresAt: <epoch ms> }
```

**QR render pattern (new — `react-native-qrcode-svg`, not yet used anywhere in codebase, no direct analog — use library defaults per UI-SPEC):**
```javascript
import QRCode from 'react-native-qrcode-svg';
<QRCode value={JSON.stringify(challengePayload)} size={220} backgroundColor="#ffffff" />
```

**QR scan pattern to copy from `QRScannerScreen.js`** (lines 25-56, barcode-scanned handler + JSON.parse + Alert-on-invalid):
```javascript
const handleBarcodeScanned = ({ type, data }) => {
  setScanned(true);
  Vibration.vibrate(100);
  try {
    const payload = JSON.parse(data);
    if (/* shape check, e.g. payload.proof && payload.publicSignals, or payload.nonce && payload.sessionId for hop 1 */) {
      navigation.navigate('VerifyProofScreen', { /* ...parsed fields */ });
    } else {
      Alert.alert('Invalid QR Code', 'This QR code does not contain valid proof data.', [{ text: 'Scan Again', onPress: () => setScanned(false) }]);
    }
  } catch (error) {
    Alert.alert('Invalid QR Code', 'Could not parse QR code data. Please ensure it contains a valid zero-knowledge proof.', [{ text: 'Scan Again', onPress: () => setScanned(false) }]);
  }
};
```
Camera setup (`CameraView`, permission request, `barcodeScannerSettings={{ barcodeTypes: ['qr'] }}`) and the scan-frame overlay (`scanArea`, 250x250px, corner brackets) carry forward unchanged — copy lines 12-23, 83-129, and the `scanArea`/`corner`/`overlay` styles (lines 168-246) verbatim.

**Manual-entry fallback (D-09 scan-or-manual parity) — analog is `ManualQRInput.js`** (not fully read this pass; existing file referenced in RESEARCH.md's reference map, confirmed to exist and already handle text-paste-then-JSON.parse for the single-screen `VerifyProof.js` flow — reuse/extend its text-input + parse pattern for both new hops rather than `QRScannerScreen.js`'s camera-only pattern).

**Dangling navigation references to fix during rework (RESEARCH.md "Runtime State Inventory"):**
- `VerifyProof.js` line 111: `navigation.reset({ index: 0, routes: [{ name: 'IdentityForm' }] })` — `IdentityForm` is deleted (D-04); redirect to `DashboardScreen`.
- `ManualQRInput.js` line 19: reset to `[{ name: 'HomeScreen' }]` — redirect to `DashboardScreen`.
- `LoadingScreen.js` line 40: `navigation.replace('ShowProof', ...)` — `ShowProof` is deleted; redirect to whatever the new result view is (likely inline in `GenerateProofScreen.js`, or confirm if `LoadingScreen.js` itself is retired).
- `ErrorScreen.js` lines 11, 18: navigate/reset to `'IdentityForm'` — redirect to `DashboardScreen`.

---

### `digital-app/App.js` (MODIFY — remove 4 legacy screens, add 4 new) (provider/nav config, n/a)

**Analog:** same file, full content (175 lines, already in context above)

**Pattern to follow for new screen registration** (mirrors `ClaimCredentialScreen` entry, lines 81-85 — `headerLeft: null`/`gestureEnabled: false` for screens that shouldn't allow back-navigation mid-flow):
```javascript
<Stack.Screen
  name="ClaimCredentialScreen"
  component={ClaimCredentialScreen}
  options={{ title: 'Claim Your Credential', headerLeft: null, gestureEnabled: false }}
/>
```

**Exact removal targets (imports + registrations) — per RESEARCH.md's exhaustive grep-verified reference map:**
- Remove imports at lines 5 (`HomeScreen`), 8 (`StudentProfileScreen`), 9 (`IdentityForm`), 11 (`ShowProof`).
- Remove `Stack.Screen` blocks: lines 69-73 (`HomeScreen`), 86-90 (`StudentProfile`), 93-102 (`IdentityForm`), 114-118 (`ShowProof` — part of the "Shared Proof Screens" block at lines 104-143; ONLY remove the `ShowProof` entry, keep `LoadingScreen`/`VerifyProof`/`ErrorScreen`/`QRScannerScreen`/`ManualQRInput`).
- Add new imports + `Stack.Screen` entries for `DashboardScreen`, `ViewCredentialsScreen`, `GenerateProofScreen` (and rename/keep `VerifyProof` → `VerifyProofScreen` if file renamed during rework).
- Decide where the `HomeScreen`'s `navigation.navigate('LoginScreen')` entry-point affordance moves — likely app boots directly to `LoginScreen` per UI-SPEC (Dashboard is post-login).

---

## Shared Patterns

### Backend error handling (AppError + asyncHandler)
**Source:** `privdId_admin/backend/utils/appError.js` (full file, 10 lines) + `privdId_admin/backend/middleware/asyncHandler.js` (full file, 3 lines)
**Apply to:** `getCredentialBlobs` controller (the only new backend file this phase touches)
```javascript
// appError.js
export default class AppError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
    this.details = details;
    this.isOperational = true;
  }
}

// asyncHandler.js
export function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}
```
Every controller in `studentController.js` wraps its body in `asyncHandler(async (req, res) => {...})` and throws `AppError(message, statusCode)` directly — no manual try/catch, no manual `res.status(...).json(...)` on the error path. The new `getCredentialBlobs` MUST follow this exactly.

### Mobile screen visual language (card/button/loading)
**Source:** `digital-app/screens/LoginScreen.js` (full file) + `digital-app/screens/ClaimCredentialScreen.js` (full file)
**Apply to:** All 4 new/reworked screens (Dashboard, View Credentials, Generate Proof, Verify Proof)
- Screen background: `#f8fafc`; card surface: `#ffffff`, `borderRadius: 16`, `padding: 24`, shadow (`shadowOpacity: 0.07, shadowRadius: 8, elevation: 3`).
- Primary CTA button: `backgroundColor: '#3b82f6'`, `paddingVertical: 16`, `borderRadius: 12`, white bold text, colored shadow (`shadowColor: '#3b82f6', shadowOpacity: 0.3, elevation: 4`).
- Loading: `<ActivityIndicator color="#3b82f6" size="large" />` + descriptive in-progress copy (e.g. "Decrypting your credential…").
- Error/retry: heading in `#ef4444`, body in `#64748b`, "Try Again" button restyled as the primary CTA.
- Disabled button state: lighter fill (`#93c5fd`/`#94a3b8`), `shadowOpacity: 0`, `elevation: 0`.

### Mobile crypto discipline (never log secrets)
**Source:** `privdId_admin/backend/crypto/ecies.js` + `digital-app/utils/keypair.js` (both already follow this)
**Apply to:** `digital-app/utils/dek.js`, `digital-app/utils/credentialCrypto.js`
- Never `console.log` the DEK, `privKeyHex`, or decrypted plaintext credential.
- Let auth-tag/decrypt failures propagate uncaught — do not wrap in a try/catch that swallows the specific crypto error; catch only at the screen-level call site to set UI error state.
- `PRIVATE_KEY_STORAGE_KEY = 'privid_student_privkey'` constant MUST be reused verbatim from `digital-app/utils/keypair.js` line 6 — do not redefine with a different string.

### QR scan-or-manual parity footer (D-09)
**Source:** `digital-app/screens/QRScannerScreen.js` footer pattern, lines 109-125, 247-251 (`gap: 16` button stack)
**Apply to:** Both Verify Proof hops (Step 1 challenge-out / Step 2 proof-out)
```javascript
<View style={styles.footer}>
  {/* existing pattern: scanAgainButton + cancelButton, gap:16 — extend with a manual-entry text-link in the same footer area per D-09, do not hide behind a secondary menu */}
</View>
```

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| QR-encode/decode payload construction (challenge-out and proof-out JSON shape) | utility/transform | event-driven | No existing QR-generation code exists anywhere in the codebase (`react-native-qrcode-svg` is installed but unused) — `QRScannerScreen.js` only covers the scan/decode half. Planner should use RESEARCH.md's Pitfall 4 payload-size guidance (1900-2600 char proof+publicSignals+sessionId payload, recommend LOW/MEDIUM QR error-correction level) rather than a codebase analog. |
| Checkbox/attribute-selection list UI | component (list row) | n/a | No existing screen has a multi-select checkbox list — closest partial analog is `LoginScreen.js`'s single `eyeButton` toggle (binary show/hide), useful only for the tap-to-toggle interaction idiom, not the list-row layout. Follow UI-SPEC's 44px-min-height row spec directly. |

## Metadata

**Analog search scope:** `privdId_admin/backend/{controllers,routes,crypto,utils,middleware}/`, `digital-app/{screens,utils}/`, `digital-app/screens/admin/`, `zkp-backend/{server.js,lib/}`
**Files scanned:** studentController.js, studentRoutes.js, ecies.js, aesgcm.js, asyncHandler.js, appError.js, App.js, LoginScreen.js, ClaimCredentialScreen.js, QRScannerScreen.js, VerifyProof.js, keypair.js (12 files read in full or targeted-range; graphify used for orientation before each read)
**Pattern extraction date:** 2026-06-19
