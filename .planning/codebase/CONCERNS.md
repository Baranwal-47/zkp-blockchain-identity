# Codebase Concerns

**Analysis Date:** 2026-06-16

---

## Security

### Critical

- **All student CRUD routes are unauthenticated**: Every route under `/api/students` — `GET /`, `POST /`, `POST /bulk`, `POST /upload`, `PUT /:id`, `DELETE /:id`, `POST /send-email` — has zero authentication middleware. Any caller on the network can enumerate all students, create, update, revoke, or email credentials. File: `privdId_admin/backend/routes/studentRoutes.js:7-15`. The only route that produces a JWT is `POST /api/admin/login` (`privdId_admin/backend/routes/adminRoutes.js:7`), but that token is never verified on subsequent requests because no auth middleware exists.

- **Student passwords stored as plaintext in MongoDB**: `generateTemporaryPassword()` uses `Math.random()` (not `crypto.randomBytes`) to produce a 10-character string, which is stored verbatim in the `password` field of the `Student` document. The login handler compares with `student.password !== String(password)` — a plain string equality check with no hashing. Files: `privdId_admin/backend/utils/password.js:7`, `privdId_admin/backend/models/Student.js:44-45`, `privdId_admin/backend/controllers/studentController.js:223`. Credential emails also transmit the plaintext password directly (`privdId_admin/backend/services/emailService.js:14`).

- **Private key loaded from env and kept in-process memory**: The Ethereum wallet private key is read via `process.env.PRIVATE_KEY` and passed to `new ethers.Wallet()` on every credential issuance or revocation call. There is no HSM, no KMS, and no key-rotation path. Files: `privdId_admin/backend/services/credentialService.js:36`, `zkp-backend/server.js:45` (hardcoded fallback Alchemy RPC URL with embedded key suffix visible in the source).

- **Hardcoded contract addresses and API keys in zkp-backend source**: The deployer addresses for both `IdentityVerifier` and `CredentialRegistry` contracts and a real Alchemy RPC URL (including the API key path) are embedded as fallback literals. If these environment variables are missing, the live Sepolia addresses and RPC endpoint are used automatically. File: `zkp-backend/server.js:43-46`.

- **Admin web portal has no authentication at all**: The React + Vite admin portal (`privdId_admin/frontend/`) makes API calls directly to `/api/students/*` with no login flow, no token, and no `Authorization` header (`privdId_admin/frontend/src/services/api.js`, `privdId_admin/frontend/src/pages/DashboardPage.jsx`). The app has no login route. Because the backend student routes require no auth either, this means the portal's actions are completely open to the network.

- **ZKP endpoints have no authentication and no rate limiting**: `POST /generate-proof`, `POST /verify`, `POST /verify-onchain`, `POST /credential-info` in `zkp-backend/server.js` have `app.use(cors())` (permissive wildcard) and no rate limiting, no API key, no IP throttle. Proof generation is CPU-intensive (~multi-second Groth16 computation), making this endpoint trivially exploitable for denial-of-service.

### High

- **No replay protection on ZK proofs**: The circuit produces a deterministic `pubHash` for a fixed set of attributes. A valid proof generated once can be copied, stored, and submitted arbitrarily many times — there is no nonce, challenge, expiry, or timestamp bound into the circuit's public signals. `zkp-backend/server.js:86-95` accepts any `(proof, publicSignals)` pair with no time or session binding. QR codes in `digital-app/screens/ShowProof.js:89-99` embed a `generatedAt` timestamp but it is not verified anywhere server-side.

- **Full cryptographic proof embedded in QR code**: `generateQRValue()` serializes `{ proof, publicSignals, revealedDetails, privacySettings, generatedAt, proofType }` into the QR payload. The full Groth16 proof (several kilobytes) is transmitted via QR scan, clipboard, and OS share. A verifier could store the proof and replay it indefinitely. File: `digital-app/screens/ShowProof.js:89-99`.

- **Selective disclosure is app-layer only, not circuit-enforced**: The circuit (`zk-proofs/circuits/identity.circom`) hashes all 5 attributes unconditionally into `pubHash`. There is no Merkle path, no nullifier, and no per-attribute selector signal. The privacy toggle in `ShowProof.js` and `StudentProfileScreen.js` only controls what plaintext is included in the QR payload's `revealedDetails` object — the underlying proof reveals nothing about individual fields, but neither does it cryptographically *prevent* a verifier from demanding all fields be revealed in plaintext (the UI merely omits them by default).

- **Student PII pinned in plaintext to public IPFS**: `issueCredentialOnChain()` pins a JSON document containing `rollNo`, `programme`, `email`, `hashedData`, `issuedAt`, and `issuer` to Pinata. The `ipfsUrl` is then stored in MongoDB and returned to callers. Email is PII under most data-protection regulations. File: `privdId_admin/backend/services/credentialService.js:61-76`.

- **Single admin EOA controls the CredentialRegistry**: The `onlyAdmin` modifier in `CredentialRegistry.sol:23-26` checks `msg.sender == admin`, set to `constructor()` deployer at line 29. A single compromised private key allows forging or mass-revoking all credentials. There is no multisig, no timelock, and no ownership transfer event.

- **Admin password compared with plaintext env variable**: `adminController.js:15` does `password !== adminPassword` where `adminPassword = process.env.ADMIN_PASSWORD`. This is a plaintext string comparison. There is no bcrypt/argon2 hash, no lockout after N failed attempts, and no timing-safe comparison (susceptible to timing side-channel). The JWT fallback secret `"privid-admin-secret"` is hardcoded at `adminController.js:22` and will be used if `JWT_SECRET` is unset.

- **Student login returns no JWT — session is stateless on client side only**: `POST /api/students/login` returns the full student object but no session token. The mobile app passes the student object through React Navigation params. A revoked student can remain logged in across sessions because revocation is only checked on `useFocusEffect` re-fetch, which can fail silently (`StudentProfileScreen.js:59`: `// silently fail — stale data is better than a crash`).

### Medium

- **`Math.random()` used for temporary password generation**: The standard library's PRNG is not cryptographically secure. An attacker who can observe timing or output patterns could predict generated passwords. File: `privdId_admin/backend/utils/password.js:7`. Should use `crypto.randomBytes()`.

- **No input validation on ZKP backend**: `POST /generate-proof` destructures `{ name, rollNo, dob, phoneNo, branch }` from `req.body` with no schema validation. Oversized strings passed to `stringToBigInt()` will produce values that exceed the BN254 scalar field, causing `snarkjs` to throw opaque errors. File: `zkp-backend/server.js:60-68`.

- **Email credentials endpoint has no authentication**: `POST /api/students/send-email` is unauthenticated. Any caller can trigger credential emails to arbitrary student subsets, potentially spamming students or revealing that they are registered. File: `privdId_admin/backend/routes/studentRoutes.js:12`.

- **CORS wildcard on ZKP backend**: `app.use(cors())` with no `origin` option allows any origin to make cross-site requests to the proof generation and verification endpoints. File: `zkp-backend/server.js:10`. The admin backend is more restricted (`origin: process.env.FRONTEND_URL || true`) but `true` still allows all origins if the env var is unset (`privdId_admin/backend/app.js:18-19`).

- **`req.body` from proof generation logged to stdout in production**: `console.log('Received input:', req.body)` at `zkp-backend/server.js:58` prints the full plaintext attribute set (name, rollNo, DOB, phone) on every proof request. These logs persist in process stdout, which may be captured by log aggregators.

- **No logout / session invalidation for admin in mobile app**: The admin JWT is passed through React Navigation params (`AdminDashboardScreen.js:22`). There is no token storage, no expiry check, and no logout route. Navigating back to `HomeScreen` and re-opening admin screens retains the stale token in memory. The JWT is 24h expiry (`adminController.js:22`) but there is no server-side blacklist.

---

## Technical Debt

- **Stale institution branding in IPFS-pinned credential JSON**: The `issuer` field is hardcoded to `'PrivdID — VIT Bhopal University'` in `privdId_admin/backend/services/credentialService.js:67`. The project is for IIITDM Jabalpur. Every credential already anchored on-chain and IPFS carries the wrong issuer name.

- **Circuit field names differ from database field names**: The circuit (`identity.circom`) uses `branch` and `phoneNo`. The MongoDB schema (`Student.js`) stores `programme` and `contactNo`. The mapping is done at the mobile app layer (`StudentProfileScreen.js:112-113`: `phoneNo: normalizedPhone, branch: student.programme`). If any service calls `/generate-proof` directly with DB field names, verification will silently produce a wrong hash. There is no shared field-name contract between services.

- **`IdentityForm.js` (manual flow) is a legacy dead path**: `IdentityForm.js` accepts manual text input of all attributes and generates a proof without the student logging in. This path bypasses the admin-issued credential entirely — a user can fabricate any identity. The screen remains navigable from the home screen. File: `digital-app/screens/IdentityForm.js`. There is no server-side binding between the manually entered data and an on-chain credential.

- **ZKP backend uses CommonJS (`require`) while admin backend uses ESM (`import`)**: `zkp-backend/server.js` uses `require()` throughout; `privdId_admin/backend/` is `"type": "module"` ESM. This inconsistency creates confusion and prevents shared utility modules without a build step.

- **`zk-proofs/.env` and `zkp-backend/.env` both exist in the repo working tree**: The `.gitignore` was recently modified (commit `1451af4`), so these files may have been tracked previously. Both files contain `PRIVATE_KEY` and RPC URLs. File: `zk-proofs/.env`, `zkp-backend/.env`.

- **Hardcoded IP addresses as fallback URLs in mobile app**: `digital-app/environment.js:2-3` contains fallback URLs pointing to `http://10.55.201.52:3001` and `http://10.55.201.52:5000` (a WSL LAN IP). These will silently fail for any user not on the same LAN, with no clear error.

- **No password change mechanism exists**: Students receive a temporary password by email, but there is no endpoint or UI to change it. The plaintext password persists in MongoDB indefinitely. The email template says "Please sign in and update your password as soon as possible" but there is no such feature. File: `privdId_admin/backend/services/emailService.js:11`.

- **`buildBulkStudents()` loops serially with `await`**: Bulk student creation computes Poseidon hashes one at a time in a `for...of` loop (`studentService.js:123-130`). For large Excel uploads, this is synchronous I/O blocking the event loop. Should be `Promise.all()`.

- **`insertBulkStudents()` anchors on-chain serially**: After `Student.insertMany()`, each credential is anchored on-chain one at a time in a sequential `for...of` loop, each awaiting a Sepolia transaction confirmation (`studentService.js:143-158`). A 50-student bulk upload could block for minutes.

---

## Architecture Concerns

- **Single point of failure: admin EOA private key**: The entire issuance and revocation lifecycle depends on one Ethereum private key loaded from env at runtime. Loss or compromise of this key with no multisig means either: the registry becomes permanently unwritable (lost key), or all credentials can be mass-revoked or forged (compromised key). File: `privdId_admin/backend/services/credentialService.js:35-36`.

- **IPFS anchoring failure is silently swallowed on student creation**: In `createStudent()` and `insertBulkStudents()`, if `issueCredentialOnChain()` throws, the error is logged to console and the student is saved without an IPFS CID or on-chain record. The student appears successfully created in the API response, but has no anchored credential. File: `privdId_admin/backend/services/studentService.js:103-116`. This means `ipfsCID` and `onChainTxHash` can be `null` for any student without any UI warning to the admin.

- **Admin token is passed as React Navigation route param, not secure storage**: The JWT issued at admin login is carried through `route.params.token` across all admin screens. This is visible in React DevTools, persists in navigation state, and is not cleared on "logout" (there is no logout action). Files: `digital-app/screens/admin/AdminLoginScreen.js:42`, `AdminDashboardScreen.js:22`.

- **No error boundary or retry logic in proof pipeline**: `LoadingScreen.js` wraps the entire proof + verify pipeline in a single try/catch. Any failure at any stage (including transient network issues to Sepolia) navigates to `ErrorScreen` with no retry or partial success path. File: `digital-app/screens/LoadingScreen.js:36-87`.

- **`CredentialRegistry.sol` has no admin transfer or upgrade path**: The `admin` address is set once in the constructor and there is no `transferAdmin()` or `renounceAdmin()` function. If the deployer wallet is lost, the contract is permanently frozen. File: `zk-proofs/contracts/CredentialRegistry.sol:28-30`.

- **Student fetch in `StudentProfileScreen` is unauthenticated**: The revocation check on focus (`useFocusEffect`) calls `GET /api/students/:id` with no auth header (`StudentProfileScreen.js:43`). Any client can poll any student ID to check revocation status and retrieve full student data.

- **Web admin frontend has no protected routes**: `privdId_admin/frontend/src/App.jsx` renders all admin routes (`/`, `/students/new`, `/students/:id/edit`, `/students/upload`) without a login guard. The entire admin UI is publicly accessible.

---

## Performance Concerns

- **Groth16 proof generation is CPU-bound and single-threaded**: `snarkjs.groth16.fullProve()` at `zkp-backend/server.js:72-76` blocks the Node.js event loop for the duration of proof generation (measured at several seconds). Under concurrent load, all other requests queue behind it. There is no worker thread, no job queue, and no timeout.

- **Poseidon hasher is initialized once but cached via module-level promise**: `poseidonPromise` in `privdId_admin/backend/utils/poseidonHash.js:3` caches the built Poseidon instance, which is correct, but `buildPoseidon()` is async and must resolve before the first hash. Under cold start with concurrent requests, multiple `buildPoseidon()` calls may be initiated before the promise settles (the guard `if (!poseidonPromise)` sets it before it resolves, so this is actually safe — but only because assignment is synchronous before the first `await`).

- **Sepolia transaction awaits `tx.wait()` synchronously in the request path**: Both `anchorOnChain()` and `revokeCredentialOnChain()` in `credentialService.js:42-45` await full transaction confirmation before returning. Sepolia block time is ~12 seconds. Student creation API calls block for 12+ seconds waiting for on-chain confirmation.

- **No caching on `GET /api/students`**: Every dashboard load in both the web portal and mobile admin panel issues a full `Student.find().sort()` with no pagination, no cursor, and no cache. For large student databases this will be slow and bandwidth-intensive. File: `privdId_admin/backend/services/studentService.js:55-57`.

- **Verification key loaded synchronously at startup**: `zkp-backend/server.js:35` reads the verification key JSON with `fs.readFileSync()` at module load time, blocking the process startup. Not critical, but any future expansion to multiple keys would need async loading.

- **`listStudents()` returns all students unsanitized to all callers**: The dashboard response includes `hashedData`, `ipfsCID`, `onChainTxHash`, and `onChainBlock` for every student. These are not needed for the list view and increase payload size unnecessarily. File: `privdId_admin/backend/services/studentService.js:55-58`.

---

*Concerns audit: 2026-06-16*
