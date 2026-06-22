# Phase 9: Multisig Registry Governance (E5) - Pattern Map

**Mapped:** 2026-06-21
**Files analyzed:** 14
**Analogs found:** 12 / 14

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `zk-proofs/contracts/CredentialRegistry.sol` (MODIFIED — add `pendingAdmin`/`transferAdmin`/`acceptAdmin`) | model (on-chain state) | CRUD | itself (existing `admin`/`onlyAdmin`/constructor pattern, same file) | exact |
| `zk-proofs/scripts/deploySafe.js` (NEW) | utility (one-time setup script) | event-driven (deploy + on-chain calls) | `zk-proofs/scripts/deployRegistry.js` | exact |
| `privdId_admin/backend/services/safeService.js` (NEW) | service | event-driven (propose/confirm/execute) | `privdId_admin/backend/services/credentialService.js` | role-match (closest async on-chain-write service; data flow differs: direct-write vs propose/confirm) |
| `privdId_admin/backend/services/credentialService.js` (MODIFIED — `anchorOnChain`/`revokeCredentialOnChain` redirect through `safeService.js`) | service | CRUD → event-driven | itself (existing direct-`ethers.Wallet` pattern, same file, being replaced) | exact |
| `privdId_admin/backend/services/studentService.js` (MODIFIED — handle pending-registry-action status) | service | CRUD | itself (existing `revokeStudent()`/`updateStudent()` call-sites at L300-330) | exact |
| `privdId_admin/backend/models/Student.js` (MODIFIED — add `pendingRegistryAction` field) | model | CRUD | itself (existing `enrollmentPhase`/`anchorPending`/`revoked` status fields) | exact |
| `privdId_admin/backend/controllers/adminController.js` (MODIFIED — add `roleLogin` export) | controller | request-response | itself, `adminLogin` (L6-29, same file) | exact |
| `privdId_admin/backend/controllers/safeController.js` (NEW) | controller | request-response | `privdId_admin/backend/controllers/adminController.js` | role-match |
| `privdId_admin/backend/routes/adminRoutes.js` (MODIFIED — add `POST /role-login`) | route | request-response | itself (same file, `POST /login`) | exact |
| `privdId_admin/backend/routes/safeRoutes.js` (NEW) | route | request-response | `privdId_admin/backend/routes/adminRoutes.js` | exact |
| `privdId_admin/frontend/src/pages/RoleLoginPage.jsx` (NEW) | component (page) | request-response | `privdId_admin/frontend/src/pages/LoginPage.jsx` | exact |
| `privdId_admin/frontend/src/pages/PendingApprovalsPage.jsx` (NEW) | component (page) | streaming (poll) + event-driven (MetaMask sign) | `privdId_admin/frontend/src/pages/DashboardPage.jsx` | role-match |
| `privdId_admin/frontend/src/components/PendingTxCard.jsx` (NEW) | component | request-response | `privdId_admin/frontend/src/components/StudentsTable.jsx` (row/card markup, not the table shell) | role-match |
| `privdId_admin/frontend/src/pages/DashboardPage.jsx` (MODIFIED — add "Pending Registry Actions" read-only card) | component (page) | request-response | itself, the existing 3 stat cards (L80-93, same file) | exact |

## Pattern Assignments

### `zk-proofs/contracts/CredentialRegistry.sol` (model, CRUD — on-chain state)

**Analog:** itself — `zk-proofs/contracts/CredentialRegistry.sol` (existing `admin`/`onlyAdmin`/constructor, L4-30)

**Existing admin/modifier pattern** (lines 4-30):
```solidity
contract CredentialRegistry {
    address public admin;
    ...
    modifier onlyAdmin() {
        require(msg.sender == admin, "Not authorized");
        _;
    }

    constructor() {
        admin = msg.sender;
    }
```

**Core write pattern to preserve (issueCredential / revokeCredential stay `onlyAdmin`-gated, unchanged)** (lines 32-60): existing functions are NOT touched — only `admin` semantics change (now resolves to the Safe address after handoff).

**Pattern to add (from RESEARCH.md Pattern 4, verified against OZ `Ownable2Step` v5.6.1 shape, adapted to this contract's `admin` var instead of `owner()`):**
```solidity
address public pendingAdmin;

event AdminTransferStarted(address indexed previousAdmin, address indexed newAdmin);
event AdminTransferred(address indexed previousAdmin, address indexed newAdmin);

function transferAdmin(address newAdmin) external onlyAdmin {
    pendingAdmin = newAdmin;
    emit AdminTransferStarted(admin, newAdmin);
}

function acceptAdmin() external {
    require(msg.sender == pendingAdmin, "Not pending admin");
    emit AdminTransferred(admin, pendingAdmin);
    admin = pendingAdmin;
    pendingAdmin = address(0);
}
```

Mirror the existing event-naming convention (`CredentialIssued`/`CredentialRevoked` → `AdminTransferStarted`/`AdminTransferred`, same `indexed` placement style).

---

### `zk-proofs/scripts/deploySafe.js` (utility, event-driven)

**Analog:** `zk-proofs/scripts/deployRegistry.js` (full file, 26 lines)

**Full pattern to copy (CJS require-based Hardhat script shape — this codebase's scripts use `require`, not ESM, unlike the backend)**:
```javascript
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH");

  // ... deployment logic ...

  console.log("\n✅ <Thing> deployed!");
  console.log("   Contract address:", address);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

**Adapt for Safe deployment:** swap the `hre.ethers.getContractFactory(...).deploy()` body for `Safe.init({ provider, signer: deployerPrivateKey, predictedSafe: { safeAccountConfig: { owners, threshold: 2 } } })` + `createSafeDeploymentTransaction()` (RESEARCH.md Pattern 1), then call `registry.transferAdmin(safeAddress)` using the same `hre.ethers.getContractFactory("CredentialRegistry").attach(REGISTRY_ADDRESS)` style already used elsewhere in this script family. Keep the `console.log("Save this in your .env: ...")` closing convention — `safeService.js`/`.env` will need `SAFE_ADDRESS`.

---

### `privdId_admin/backend/services/safeService.js` (service, event-driven)

**Analog:** `privdId_admin/backend/services/credentialService.js` (imports L1-16, `anchorOnChain` L44-56, `revokeCredentialOnChain` L58-68)

**Imports pattern** (lines 1-16):
```javascript
import axios from 'axios';
import { ethers } from 'ethers';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { encryptCredential } from '../crypto/aesgcm.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const registryArtifact = JSON.parse(
  readFileSync(
    join(__dirname, '../../../zk-proofs/artifacts/contracts/CredentialRegistry.sol/CredentialRegistry.json'),
    'utf8'
  )
);
```
Reuse this exact `__filename`/`__dirname`/`registryArtifact` ABI-loading pattern in `safeService.js` for `new ethers.Interface(registryArtifact.abi).encodeFunctionData(...)` (RESEARCH.md Pitfall 5) — do not re-derive the artifact path differently.

**Core direct-write pattern being REPLACED (do not copy the signing approach, only the structure/shape)** (lines 44-56):
```javascript
async function anchorOnChain(rollNo, cid, merkleRoot) {
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const wallet = new ethers.Wallet(`0x${process.env.PRIVATE_KEY}`, provider);
  const registry = new ethers.Contract(process.env.REGISTRY_ADDRESS, registryArtifact.abi, wallet);

  const pubHashBytes32 = ethers.zeroPadValue(ethers.toBeHex(BigInt(merkleRoot)), 32);

  const tx = await registry.issueCredential(rollNo, cid, pubHashBytes32);
  const receipt = await tx.wait();

  return { txHash: tx.hash, blockNumber: receipt.blockNumber };
}
```
`safeService.js` replaces the `wallet`/`registry.issueCredential(...)` body with Safe SDK's propose flow (RESEARCH.md Pattern 2): `Safe.init({...})` → `createTransaction({ transactions: [{ to: REGISTRY_ADDRESS, value: '0', data: encoded }] })` → `signTransaction()` → `apiKit.proposeTransaction(...)`. Keep the same function-signature shape (`rollNo, cid, merkleRoot` in, `{ ...result }` out) per D-12's contract — but the return value becomes `{ safeTxHash, status: 'pending' }` instead of `{ txHash, blockNumber }`.

**Error/logging convention to copy** (line 66 of `credentialService.js`):
```javascript
console.log(`[credential] Revoked ${rollNo} | Tx: ${tx.hash}`);
```
Use the same `[safe]`-prefixed bracketed-tag console.log convention in `safeService.js` (e.g. `[safe] Proposed issue for ${rollNo} | safeTxHash: ${safeTxHash}`).

---

### `privdId_admin/backend/services/credentialService.js` (MODIFIED, service, CRUD → event-driven)

**Analog:** itself (same file — this is a redirect, not a new pattern)

Keep `anchorOnChain`/`revokeCredentialOnChain`'s exported names and call signatures stable (per RESEARCH.md Code Examples) so `studentService.js`'s import line (`import { issueCredentialOnChain, revokeCredentialOnChain, pinEnvelopeToIPFS } from "./credentialService.js";`, studentService.js L6) does not change. Internally, swap the body to call `safeService.js`'s `proposeRegistryWrite(...)`:
```javascript
import { proposeRegistryWrite } from './safeService.js'

async function anchorOnChain(rollNo, cid, merkleRoot) {
  const pubHashBytes32 = ethers.zeroPadValue(ethers.toBeHex(BigInt(merkleRoot)), 32);
  return proposeRegistryWrite('issueCredential', [rollNo, cid, pubHashBytes32])
}
```

---

### `privdId_admin/backend/services/studentService.js` (MODIFIED, service, CRUD)

**Analog:** itself — `revokeStudent()` (lines 312-330) and the `anchorWarning` try/catch pattern around line 300-309

**Existing call-site + error-handling pattern to mirror for new pending-status handling** (lines 312-330):
```javascript
export async function revokeStudent(id) {
  const student = await Student.findById(id);
  if (!student) throw new AppError("Student not found.", 404);
  if (student.revoked) throw new AppError("Student credential already revoked.", 400);

  try {
    await revokeCredentialOnChain(student.rollNo);
  } catch (err) {
    console.error("[credential] On-chain revocation failed for", student.rollNo, ":", err.message);
    throw new AppError("On-chain revocation failed: " + err.message, 500);
  }

  student.revoked = true;
  student.revokedAt = new Date();
  await student.save();

  return { student: sanitizeStudent(student) };
}
```
**Adapt for propose-only semantics (D-12):** after `revokeCredentialOnChain(...)` now resolves with `{ safeTxHash, status: 'pending' }` instead of completing synchronously, do NOT set `student.revoked = true` here. Instead set `student.pendingRegistryAction = { safeTxHash, type: 'revoke' }` and leave `revoked` false until a separate execute-confirmation path (driven by `safeController.js`'s execute route) flips it to the terminal state. Reuse the exact `try { await X(...) } catch (err) { console.error("[credential] ... failed for", student.rollNo, ":", err.message); throw new AppError(...) }` shape for the new propose call.

---

### `privdId_admin/backend/models/Student.js` (MODIFIED, model, CRUD)

**Analog:** itself — existing status-field conventions (`enrollmentPhase` L62-66, `anchorPending`/`lastAnchorError` L75-82, `revoked`/`revokedAt` L83-90)

**Pattern to copy** (lines 62-90):
```javascript
enrollmentPhase: {
  type: String,
  enum: ["awaiting-keypair", "active", "revoked"],
  default: "awaiting-keypair",
},
onChainTxHash: { type: String, default: null },
onChainBlock: { type: Number, default: null },
anchorPending: { type: Boolean, default: false },
lastAnchorError: { type: String, default: null },
revoked: { type: Boolean, default: false },
revokedAt: { type: Date, default: null },
```
Add a `pendingRegistryAction` field following this exact shape/defaulting convention:
```javascript
pendingRegistryAction: {
  safeTxHash: { type: String, default: null },
  type: { type: String, enum: ["issue", "revoke"], default: null },
},
```

---

### `privdId_admin/backend/controllers/adminController.js` (MODIFIED, controller, request-response)

**Analog:** itself — `adminLogin` (full file, lines 1-29)

**Full pattern to copy verbatim, parameterized by role** (lines 1-29):
```javascript
import jwt from "jsonwebtoken";

import { asyncHandler } from "../middleware/asyncHandler.js";
import AppError from "../utils/appError.js";

export const adminLogin = asyncHandler(async (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    throw new AppError("Admin authentication is not configured. Set ADMIN_PASSWORD in .env", 500);
  }
  if (!password || password !== adminPassword) {
    throw new AppError("Invalid admin password.", 401);
  }

  const token = jwt.sign(
    { role: "admin" },
    process.env.JWT_SECRET || "privid-admin-secret",
    { expiresIn: "24h" }
  );

  res.json({ status: "success", token });
});
```
**New `roleLogin` export (RESEARCH.md Code Examples, already verified against this exact shape):**
```javascript
export const roleLogin = asyncHandler(async (req, res) => {
  const { role, password } = req.body;
  const rolePasswordEnvKey = { acadadmin: 'ACADADMIN_PASSWORD', registrar: 'REGISTRAR_PASSWORD', dean: 'DEAN_PASSWORD' }[role];
  if (!rolePasswordEnvKey) throw new AppError('Select your role first.', 400);
  const expected = process.env[rolePasswordEnvKey];
  if (!expected) throw new AppError(`${role} authentication is not configured.`, 500);
  if (!password || password !== expected) throw new AppError('Incorrect password for this role. Try again.', 401);

  const token = jwt.sign({ role }, process.env.JWT_SECRET || 'privid-admin-secret', { expiresIn: '24h' });
  res.json({ status: 'success', token, role });
});
```

---

### `privdId_admin/backend/controllers/safeController.js` (NEW, controller, request-response)

**Analog:** `privdId_admin/backend/controllers/adminController.js` (same `asyncHandler`/`AppError` shape)

**Imports + error pattern to copy** (lines 1-4, 9-17 style):
```javascript
import { asyncHandler } from "../middleware/asyncHandler.js";
import AppError from "../utils/appError.js";

export const getPendingApprovals = asyncHandler(async (req, res) => {
  const pending = await safeService.getPendingTransactions();
  res.json({ status: "success", pending });
});

export const signPendingTx = asyncHandler(async (req, res) => {
  const { safeTxHash, signature, signerAddress } = req.body;
  if (!safeTxHash || !signature) throw new AppError("safeTxHash and signature are required.", 400);
  const result = await safeService.confirmSignature(safeTxHash, signature, signerAddress);
  res.json({ status: "success", result });
});

export const executePendingTx = asyncHandler(async (req, res) => {
  const { safeTxHash } = req.body;
  if (!safeTxHash) throw new AppError("safeTxHash is required.", 400);
  const result = await safeService.executeTransaction(safeTxHash);
  res.json({ status: "success", result });
});
```
Per RESEARCH.md Security Domain V5, validate `safeTxHash`/address inputs as well-formed hex using `joi` (already a backend dependency, `package.json` L20) the same way other controllers validate request bodies.

---

### `privdId_admin/backend/routes/adminRoutes.js` (MODIFIED, route, request-response)

**Analog:** itself (full file, 10 lines)

**Full pattern to copy** (lines 1-9):
```javascript
import express from "express";
import { adminLogin } from "../controllers/adminController.js";

const router = express.Router();
router.post("/login", adminLogin);

export default router;
```
Add: `import { roleLogin } from "../controllers/adminController.js";` and `router.post("/role-login", roleLogin);` directly below the existing `/login` line — same router instance, no new sub-router needed.

---

### `privdId_admin/backend/routes/safeRoutes.js` (NEW, route, request-response)

**Analog:** `privdId_admin/backend/routes/adminRoutes.js`

```javascript
import express from "express";
import { getPendingApprovals, signPendingTx, executePendingTx } from "../controllers/safeController.js";

const router = express.Router();
router.get("/pending", getPendingApprovals);
router.post("/sign", signPendingTx);
router.post("/execute", executePendingTx);

export default router;
```
Mount at `/api/safe` in `app.js` the same way `adminRoutes.js` is mounted at `/api/admin` (check `app.js` mount convention before wiring — same file pattern, not separately excerpted here since it's a 1-line addition).

---

### `privdId_admin/frontend/src/pages/RoleLoginPage.jsx` (NEW, component, request-response)

**Analog:** `privdId_admin/frontend/src/pages/LoginPage.jsx` (full file, 57 lines)

**Full pattern to copy almost verbatim** (lines 1-57):
```jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import api, { getApiErrorMessage } from "../services/api.js";

export default function LoginPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await api.post("/admin/login", { password });
      localStorage.setItem("adminToken", response.data.token);
      navigate("/", { replace: true });
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 text-slate-100">
      <form onSubmit={handleSubmit} className="panel w-full max-w-sm gap-5 flex flex-col">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-zinc-400">PrivdId Admin</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">Admin sign in</h1>
        </div>
        <label className="flex flex-col gap-2 text-sm text-slate-300">
          Admin password
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-slate-100 outline-none focus:border-blue-500"
          />
        </label>
        <button
          type="submit"
          disabled={loading || !password}
          className="rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
```
**Per UI-SPEC adaptations:** add a 3-option role selector above the password field ("Academic Admin"/"Assistant Registrar"/"Dean"), change heading to "Official sign-in", POST to `/admin/role-login` with `{ role, password }` body, store the role-scoped token (e.g. `localStorage.setItem("officialToken", ...)` — distinct key from `adminToken` to avoid collision with the existing admin auth), change CTA copy to "Continue" (UI-SPEC reserves "Sign in" for the existing admin login), navigate to `/pending-approvals` instead of `/`.

---

### `privdId_admin/frontend/src/pages/PendingApprovalsPage.jsx` (NEW, component, streaming/event-driven)

**Analog:** `privdId_admin/frontend/src/pages/DashboardPage.jsx` (load pattern L13-24, destructive-confirm pattern L58-68, useEffect L70-72)

**Data-loading pattern to copy** (lines 13-24):
```jsx
const [students, setStudents] = useState([]);
const [loading, setLoading] = useState(true);

async function loadStudents() {
  setLoading(true);
  try {
    const response = await api.get("/students");
    setStudents(response.data.students || []);
  } catch (error) {
    toast.error(getApiErrorMessage(error));
  } finally {
    setLoading(false);
  }
}

useEffect(() => {
  void loadStudents();
}, []);
```
Adapt to `api.get("/safe/pending")` polled on an interval (RESEARCH.md D-07 discretion: polling vs webhook — polling matches this existing `useEffect`+manual-refresh idiom, no websocket infra exists in this codebase).

**Destructive-confirm pattern to copy verbatim for Execute (D-06)** (lines 58-68):
```jsx
async function handleRevoke(studentId) {
  if (window.confirm("Are you sure you want to revoke this student's credential? This action is irreversible.")) {
    try {
      await api.delete(`/students/${studentId}`);
      toast.success("Student credential revoked successfully.");
      await loadStudents();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }
}
```
Per UI-SPEC's exact copy: `window.confirm("Execute this {issue/revoke} transaction now? This will submit it on-chain and cannot be undone.")` → on confirm, `api.post("/safe/execute", { safeTxHash })` → `toast.success("Transaction executed successfully.")`.

**MetaMask connection (new for this phase, no existing analog in codebase — per UI-SPEC "Wallet connection" row, plain `ethers` v6, no wagmi):**
```jsx
import { ethers } from "ethers";

async function connectWallet() {
  const provider = new ethers.BrowserProvider(window.ethereum);
  const [address] = await provider.send("eth_requestAccounts", []);
  return { provider, address };
}
```

---

### `privdId_admin/frontend/src/components/PendingTxCard.jsx` (NEW, component, request-response)

**Analog:** `privdId_admin/frontend/src/components/StudentsTable.jsx` row markup (lines 92-131) and status-pill convention (line 110)

**Status-pill pattern to copy verbatim** (line 110):
```jsx
<span className={student.revoked ? "rounded-full bg-red-400/15 px-3 py-1 text-xs font-medium text-red-200" : student.emailSent ? "rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-medium text-emerald-200" : "rounded-full bg-amber-400/15 px-3 py-1 text-xs font-medium text-amber-200"}>
  {student.revoked ? "Revoked" : student.emailSent ? `Sent...` : "Pending"}
</span>
```
Adapt for "Awaiting {N} more signature{s}" (amber) / "Ready to execute — 2 of 2 signed" (emerald) per UI-SPEC's exact D-07 copy and color mapping.

**Card/row container pattern to copy** (line 93, row shell): `rounded-2xl bg-white/5` — per UI-SPEC this becomes the card container (not a `<tr>`, since each entry needs a 2-button action area).

**Action-button pair pattern to copy** (lines 118-127, Edit/Revoke link+button pairing):
```jsx
<div className="flex items-center gap-2">
  <Link to={`/students/${student.id}/edit`} className="text-xs font-semibold text-blue-400 hover:text-blue-300">Edit</Link>
  <button onClick={() => onRevoke(student.id)} className="text-xs font-semibold text-red-400 hover:text-red-300 disabled:cursor-not-allowed disabled:text-zinc-500" disabled={student.revoked}>
    {student.revoked ? "Revoked" : "Revoke"}
  </button>
</div>
```
Adapt Sign (`text-blue-400`/`.primary-button`-blue) vs Execute (`text-red-400`/new `.destructive-button`, per UI-SPEC's "Sign vs Execute color separation") — same disabled-state pattern (`disabled={alreadySignedByThisOfficial}` / `disabled={confirmations.length < threshold}`).

---

### `privdId_admin/frontend/src/pages/DashboardPage.jsx` (MODIFIED, component, request-response)

**Analog:** itself — existing 3 stat cards (lines 80-93)

**Pattern to copy verbatim, add as a 4th card** (lines 80-93):
```jsx
<section className="grid gap-4 md:grid-cols-3">
  <div className="panel-soft">
    <p className="text-sm text-slate-400">Total students</p>
    <h3 className="mt-3 text-3xl font-semibold text-white">{totalStudents}</h3>
  </div>
  ...
</section>
```
Per UI-SPEC, the new "Pending Registry Actions" card is read-only (D-07) — no Sign/Execute buttons, just the per-item line `"{Issue/Revoke} requested for {rollNo}, awaiting {N} more signature{s}"` and a navigation link to `/pending-approvals` (`<Link>`, same import already used in `StudentsTable.jsx` line 2). Fetch via a new `api.get("/safe/pending")` call added alongside the existing `loadStudents()` in the same `useEffect` (lines 70-72) or a sibling `useEffect`.

## Shared Patterns

### Auth gate (JWT, asyncHandler, AppError)
**Source:** `privdId_admin/backend/controllers/adminController.js` (full file) + `privdId_admin/backend/middleware/asyncHandler.js` (full file)
**Apply to:** `adminController.js`'s new `roleLogin`, `safeController.js`'s 3 new routes
```javascript
export function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}
```
All new backend routes wrap handlers in `asyncHandler(...)` and throw `AppError(message, statusCode)` instead of manual `res.status().json()` error branches — never deviate from this, it's the project's sole error-handling convention (no Express centralized error middleware excerpt was found separate from `AppError`'s throw-and-catch shape; `app.js` likely has a final error handler consuming `AppError` — verify at implementation time, not re-fetched here to avoid redundant reads).

### Frontend API client + error message extraction
**Source:** `privdId_admin/frontend/src/services/api.js` (full file, 31 lines)
**Apply to:** Every new frontend page (`RoleLoginPage.jsx`, `PendingApprovalsPage.jsx`) and the `DashboardPage.jsx` addition
```javascript
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api",
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("adminToken");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function getApiErrorMessage(error) {
  return error?.response?.data?.message || error?.response?.data?.error || error?.message || "Request failed";
}
```
**Decision needed at plan time:** the role-login token must NOT collide with `adminToken` (interceptor reads a fixed `localStorage` key) — either add a second interceptor branch reading an `officialToken` key when calling `/safe/*` routes, or namespace tokens by route prefix. Flag this for the planner; not resolved by existing code as-is.

### React Router auth guard + route registration
**Source:** `privdId_admin/frontend/src/App.jsx` (full file, 37 lines)
**Apply to:** New `RoleLoginPage`/`PendingApprovalsPage` route registration
```jsx
function RequireAuth({ children }) {
  if (!localStorage.getItem("adminToken")) {
    return <Navigate to="/login" replace />;
  }
  return children;
}
```
A parallel `RequireOfficialAuth` (checking `officialToken`) gates `/pending-approvals`; `/official-login` (or similar) stays outside any auth wrapper, mirroring `/login`'s placement in the `<Routes>` tree (lines 19-34).

### Toast + destructive-confirm UX
**Source:** `privdId_admin/frontend/src/pages/DashboardPage.jsx` lines 58-68 (`handleRevoke`)
**Apply to:** Execute action in `PendingApprovalsPage.jsx`/`PendingTxCard.jsx` — `window.confirm(...)` then `toast.success(...)`/`toast.error(getApiErrorMessage(error))`, no new confirm-modal component introduced (matches UI-SPEC's explicit instruction to reuse this exact pattern).

### Contract ABI loading from Hardhat artifact
**Source:** `privdId_admin/backend/services/credentialService.js` lines 1-16
**Apply to:** `safeService.js`'s `MetaTransactionData.data` encoding (RESEARCH.md Pitfall 5) — reuse the same `readFileSync(join(__dirname, '../../../zk-proofs/artifacts/...'))` artifact path and `JSON.parse(...).abi` shape, do not introduce a second ABI-loading mechanism.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| MetaMask `BrowserProvider`/`window.ethereum` connection logic (inside `PendingApprovalsPage.jsx`) | hook/utility (browser wallet) | event-driven | No wallet-connection code exists anywhere in the codebase yet (UI-SPEC confirms: "no `wagmi`/`web3modal` exists in this codebase yet") — use RESEARCH.md's verified `ethers` v6 `BrowserProvider.send("eth_requestAccounts")` snippet directly, no in-repo precedent to copy from |
| `@safe-global/protocol-kit`/`api-kit` propose/confirm/execute calls themselves | service (SDK glue) | event-driven | No prior Safe SDK usage exists in this codebase — RESEARCH.md's verified Pattern 1/2/3 code examples (sourced from the installed package `.d.ts` files) are the only available reference; planner should treat RESEARCH.md as the analog for this portion specifically |

## Metadata

**Analog search scope:** `privdId_admin/backend/{services,controllers,routes,models,middleware}`, `privdId_admin/frontend/src/{pages,components,services}`, `zk-proofs/{contracts,scripts,test}`
**Files scanned:** 17 (credentialService.js, adminController.js, adminRoutes.js, asyncHandler.js, CredentialRegistry.sol, deployRegistry.js, Registry.js, studentService.js [partial], Student.js, LoginPage.jsx, DashboardPage.jsx, StudentsTable.jsx, api.js, App.jsx, package.json [grep only])
**Pattern extraction date:** 2026-06-21
