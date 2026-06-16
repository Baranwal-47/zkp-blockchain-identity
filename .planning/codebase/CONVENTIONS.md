# Code Conventions

**Analysis Date:** 2026-06-16

## Module System

Two incompatible module systems coexist across services — this is the most important convention to respect per-service:

| Service | Module System | Indicator |
|---------|--------------|-----------|
| `privdId_admin/backend/` | ESM (`"type": "module"`) | `import`/`export` throughout |
| `privdId_admin/frontend/` | ESM (`"type": "module"`) | Vite project, `import`/`export` |
| `zkp-backend/` | CommonJS | `require()`/`module.exports` throughout |
| `digital-app/` | CommonJS-style (Expo/Babel) | `import` via Babel transform, no `"type":"module"` |
| `zk-proofs/` | CommonJS | `require()` in hardhat.config.js and test files |

**Critical rule:** Never use `require()` inside `privdId_admin/backend/` or `privdId_admin/frontend/`. Never use bare `import` with file paths in `zkp-backend/` or `zk-proofs/`.

**ESM `__dirname` workaround** (used in `zkp-backend/server.js` for CJS, and `privdId_admin/backend/services/credentialService.js` for ESM):
```js
// ESM equivalent (backend credentialService.js):
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
```

## Naming Conventions

### Files
- **Backend (ESM):** `camelCase.js` for all files — `studentService.js`, `poseidonHash.js`, `asyncHandler.js`
- **Backend directories:** `camelCase/` — `controllers/`, `middleware/`, `services/`, `utils/`, `routes/`, `validators/`, `config/`
- **Frontend (React):** `PascalCase.jsx` for components and pages — `DashboardPage.jsx`, `StudentsTable.jsx`, `StudentForm.jsx`
- **Mobile app:** `PascalCase.js` for screen files — `StudentProfileScreen.js`, `LoginScreen.js`, `IdentityForm.js`
- **Admin screens sub-directory:** `screens/admin/` with `AdminDashboardScreen.js`, `AdminLoginScreen.js`
- **Solidity:** `PascalCase.sol` — `CredentialRegistry.sol`, `IdentityVerifier.sol`
- **Circom:** `camelCase.circom` — `identity.circom`

### Variables and Functions
- **camelCase** for all variables, function names, and parameters across all services
- **PascalCase** for classes, React components, and Mongoose models: `AppError`, `Student`, `StudentForm`
- **SCREAMING_SNAKE_CASE** for exported constants: `BACKEND_URL`, `ADMIN_BACKEND_URL` (in `digital-app/environment.js`)
- **Prefix `handle` for event handlers** (frontend/mobile): `handleChange`, `handleSubmit`, `handleToggleSelect`, `handleRevoke`, `handleLogin`
- **Prefix `load` for data-fetch functions:** `loadStudents()`
- **Service functions use descriptive verb-noun:** `listStudents()`, `createStudent()`, `buildStudentRecord()`, `findDuplicateStudent()`, `sanitizeStudent()`, `normalizeStudentInput()`

### Routes and API Endpoints
- **REST pattern:** `GET /api/students`, `POST /api/students`, `GET /api/students/:id`, `PUT /api/students/:id`, `DELETE /api/students/:id`
- **Bulk actions:** `POST /api/students/bulk`, `POST /api/students/upload`, `POST /api/students/send-email`
- **Auth routes:** `POST /api/students/login`, `POST /api/admin/login`
- **ZKP backend:** flat endpoints `/generate-proof`, `/verify`, `/verify-onchain`, `/credential-info`
- **Health check:** `GET /api/health` returns `{ status: "ok", message: "..." }`

### Mongoose Models
- Schema variable named `<Model>Schema` (camelCase): `studentSchema`
- Model exported as `const Student = mongoose.model("Student", studentSchema); export default Student;`

## API Patterns

### Response Format (admin backend — ESM)

**Success responses:**
```js
// List
res.json({ status: "success", count: students.length, students });

// Single create/update
res.json({ status: "success", message: "...", student: sanitizeStudent(doc) });

// Auth
res.json({ status: "success", token });
```

**Error responses** (set by `errorHandler.js`):
```js
{ status: "fail",  message: "..." }          // 4xx client errors
{ status: "error", message: "..." }          // 5xx server errors
{ status: "fail",  message: "...", details } // Joi validation errors
```

### Error Class
`AppError` (`privdId_admin/backend/utils/appError.js`) extends `Error`:
```js
throw new AppError("Route not found", 404);
throw new AppError("Invalid admin password.", 401);
throw new AppError("Date of Birth is required...", 400, optionalDetails);
```
- `statusCode` → HTTP status
- `status` → `"fail"` for 4xx, `"error"` for 5xx
- `isOperational: true` marks expected errors

### ZKP Backend Response Format (CJS, flat)
```js
res.json({ proof, publicSignals });               // generate-proof
res.json({ valid: isValid });                      // verify / verify-onchain
res.json({ found, rollNo, ipfsCID, issuedAtMs, revoked, ipfsUrl }); // credential-info
res.status(500).json({ error: "...", details: err.message }); // errors
```

## Error Handling

### Admin Backend (ESM)
- All controller functions are wrapped with `asyncHandler`:
  ```js
  export const asyncHandler = (handler) =>
    (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
  ```
- Thrown `AppError` instances propagate to `errorHandler` middleware in `app.js`
- Duplicate-key (11000), Mongoose `ValidationError`, Multer errors, and Joi errors each have dedicated branches in `errorHandler`
- 404 is produced by the `notFound` middleware at the end of the chain

### ZKP Backend (CJS)
- `try/catch` per route, `res.status(5xx).json({ error, details })` inline — no global error middleware
- `console.error(...)` for server-side logging before the error response

### Mobile App (React Native)
- `try/catch/finally` pattern inside `async` handlers: `setLoading(true)`, `catch(error) { Alert.alert(...) }`, `finally { setLoading(false) }`
- Uses `Alert.alert()` (not toast) for error display
- Silent catch pattern for background refreshes: `catch { /* silently fail */ }`

### Admin Frontend (React + Vite)
- Same `try/catch/finally` with `setLoading` pattern
- Uses `react-hot-toast` (`toast.error(...)`, `toast.success(...)`) instead of `Alert`
- Centralized error message extraction via `getApiErrorMessage(error)` in `src/services/api.js`:
  ```js
  error?.response?.data?.message || error?.response?.data?.error || error?.message || "Request failed"
  ```

## Frontend Patterns (React Native + React)

### State Management
No global state library (no Redux, no Zustand, no Context API used). All state is local component state via `useState`.

**Mobile (React Native):** Each screen component manages its own state. Data is passed between screens via `navigation.navigate('ScreenName', { param })` and `route.params`.

**Admin frontend (React + Vite):** Each page component owns its state. Shared data is re-fetched on navigation; no shared store.

**Typical page-level state pattern (both platforms):**
```js
const [data, setData] = useState([]);
const [loading, setLoading] = useState(true/false);
const [formData, setFormData] = useState(initialFormState);
```

### Form Patterns (Admin Frontend)
- `initialFormState` const defined outside component
- `handleChange` uses generic event handler: `const { name, value } = event.target; setFormData(current => ({ ...current, [name]: value }))`
- Form reset after successful submit: `setFormData(initialFormState)`

### Component Props Pattern (Admin Frontend)
Components receive data and callbacks as props. Example from `StudentsTable.jsx`:
```jsx
<StudentsTable
  students={students}
  loading={loading}
  onRefresh={loadStudents}
  selectedIds={selectedIds}
  onToggleSelect={handleToggleSelect}
  onRevoke={handleRevoke}
/>
```
Callback props use `on<Action>` prefix.

### Mobile Navigation
`@react-navigation/stack` with `createStackNavigator`. Navigation options defined as objects (`defaultHeaderStyle`, `adminHeaderStyle`). Screens in `screens/` flat or `screens/admin/` sub-directory.

### Data Refresh Pattern (Mobile)
`useFocusEffect` + `useCallback` for refreshing data when a screen regains focus:
```js
useFocusEffect(useCallback(() => { refresh(); }, [dependency]));
```

### API Client
- **Admin frontend:** Axios instance created in `src/services/api.js` with `baseURL` from `import.meta.env.VITE_API_BASE_URL`
- **Mobile app:** Direct `fetch()` calls using URL from `environment.js` constants. No Axios instance wrapper.

## Solidity Patterns

- Solidity version: `^0.8.20` (CredentialRegistry) / `^0.8.28` (hardhat.config.js default)
- License: `SPDX-License-Identifier: MIT`
- Single admin address pattern (EOA, not multisig yet): `address public admin; modifier onlyAdmin { require(msg.sender == admin, "Not authorized"); _; }`
- Constructor sets `admin = msg.sender`
- Storage layout: `mapping(string => Credential)` primary, `mapping(bytes32 => string)` and `mapping(bytes32 => bool)` for hash lookups
- Events emitted on all state changes: `CredentialIssued`, `CredentialRevoked`
- View functions return tuples: `returns (string memory ipfsCID, bytes32 pubHash, uint256 issuedAt, bool exists, bool revoked)`
- `calldata` for external string parameters
- `IdentityVerifier.sol` is snarkjs-generated (GPL-3.0), not hand-written

### Circom Patterns
- `pragma circom 2.1.6;`
- Template-based: `template Identity() { ... } component main = Identity();`
- Private signals (`signal input`) for attributes, public output (`signal output pubHash`)
- Uses `circomlib` Poseidon: `component hasher = Poseidon(5);`
- Attributes encoded via `stringToBigInt` (UTF-8 bytes → BigInt)

## Config Access

### Admin Backend (ESM)
- `dotenv` loaded in `app.js` via `import dotenv from "dotenv"; dotenv.config();`
- Config accessed inline via `process.env.VAR_NAME`
- Critical vars: `MONGO_URI`, `PORT`, `FRONTEND_URL`, `PINATA_JWT`, `SEPOLIA_RPC_URL`, `PRIVATE_KEY`, `REGISTRY_ADDRESS`, `ADMIN_PASSWORD`, `JWT_SECRET`
- Database connection in `config/db.js` reads `process.env.MONGO_URI` and throws if missing
- Email config in `config/nodemailer.js`

### ZKP Backend (CJS)
- `require('dotenv').config();` at top of `server.js`
- File paths for WASM/zkey read from env with `path.join(__dirname, 'filename')` fallbacks
- Contract addresses have hardcoded fallbacks (should be env-only in production)
- Critical vars: `WASM_PATH`, `ZKEY_PATH`, `VKEY_PATH`, `VERIFIER_ABI_PATH`, `REGISTRY_ABI_PATH`, `VERIFIER_ADDRESS`, `REGISTRY_ADDRESS`, `BLOCKCHAIN_RPC_URL`, `PORT`

### Admin Frontend (Vite)
- `import.meta.env.VITE_API_BASE_URL` (Vite convention, requires `VITE_` prefix)
- Fallback: `"http://localhost:5000/api"`

### Mobile App (Expo)
- `process.env.EXPO_PUBLIC_BACKEND_URL` and `process.env.EXPO_PUBLIC_ADMIN_BACKEND_URL` (Expo convention, requires `EXPO_PUBLIC_` prefix)
- Centralized in `digital-app/environment.js`, imported by all screens that need URLs
- Hardcoded fallback LAN IPs in `environment.js` (development convenience)

### ZK Proofs (Hardhat)
- `require("dotenv").config()` at top of `hardhat.config.js`
- `process.env.SEPOLIA_RPC_URL` and `process.env.PRIVATE_KEY` for network config

## Import/Export Patterns

### ESM (admin backend + admin frontend)
```js
// Named exports preferred for utilities
export function asyncHandler(handler) { ... }
export async function hashPoseidonFields(fields) { ... }
export { stringToBigInt };

// Default export for main module/component
export default class AppError extends Error { ... }
export default Student;
export default function DashboardPage() { ... }
export default app;
```
- All import paths in backend use explicit `.js` extension: `import AppError from "../utils/appError.js";`
- React components in frontend use `.jsx` extension in imports: `import Layout from "./components/Layout.jsx";`

### CommonJS (zkp-backend + zk-proofs tests)
```js
const express = require('express');
const { ethers } = require('ethers');
// No explicit module.exports — zkp-backend server.js uses app.listen() directly
```

### Mobile App
```js
import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, ... } from 'react-native';
import { ADMIN_BACKEND_URL } from '../environment';
export default function LoginScreen({ navigation }) { ... }
```

---

*Convention analysis: 2026-06-16*
