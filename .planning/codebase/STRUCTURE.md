# STRUCTURE.md — PrivdID Repository Layout

Generated: 2026-06-16

## Root

```
digital_id_app/
├── CLAUDE.md                        # Project instructions & ground rules
├── README.md                        # Stale (VIT branding) — do not trust
├── .gitignore
├── .vscode/settings.json
├── .planning/codebase/              # GSD planning artifacts
│   ├── ARCHITECTURE.md
│   ├── CONVENTIONS.md
│   ├── INTEGRATIONS.md
│   ├── STACK.md
│   └── STRUCTURE.md                 # this file
├── digital-app/                     # Expo React Native mobile app
├── privdId_admin/                   # Admin portal (frontend + backend)
├── zk-proofs/                       # Hardhat + Circom + Solidity
└── zkp-backend/                     # Express proof-gen/verify service
```

---

## digital-app/  (Expo React Native, port varies)

Student-facing mobile app with embedded admin screens.

```
digital-app/
├── App.js                           # Root navigator
├── index.js                         # Expo entry point
├── app.json                         # Expo config (name, slug, icons)
├── package.json
├── environment.js                   # Runtime env vars (API URLs)
├── assets/
│   ├── icon.png
│   ├── splash-icon.png
│   ├── adaptive-icon.png
│   └── favicon.png
├── screens/
│   ├── LoginScreen.js               # Student login
│   ├── HomeScreen.js                # Student home / dashboard
│   ├── StudentProfileScreen.js      # View decrypted profile
│   ├── IdentityForm.js              # Identity submission form
│   ├── ShowProof.js                 # Display generated ZK proof
│   ├── VerifyProof.js               # Verify a QR-encoded proof
│   ├── QRScannerScreen.js           # Camera QR scanner
│   ├── ManualQRInput.js             # Manual proof string input
│   ├── LoadingScreen.js
│   ├── ErrorScreen.js
│   └── admin/
│       ├── AdminLoginScreen.js
│       ├── AdminDashboardScreen.js
│       ├── AdminAddStudentScreen.js
│       ├── AdminEditStudentScreen.js
│       └── AdminUploadScreen.js     # Bulk Excel upload
└── .env / .env.example
```

---

## privdId_admin/  (Admin portal)

### privdId_admin/frontend/  (React + Vite + Tailwind)

```
frontend/
├── index.html
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── eslint.config.js
├── package.json
├── public/
│   ├── favicon.svg
│   └── icons.svg
└── src/
    ├── main.jsx
    ├── App.jsx                      # Router + layout
    ├── index.css                    # Tailwind directives
    ├── assets/
    │   ├── hero.png
    │   ├── react.svg
    │   └── vite.svg
    ├── components/
    │   ├── Layout.jsx               # Sidebar + nav shell
    │   ├── StudentForm.jsx          # Shared add/edit form
    │   ├── StudentsTable.jsx        # Paginated student list
    │   └── UploadPanel.jsx          # Excel drag-and-drop panel
    ├── pages/
    │   ├── DashboardPage.jsx
    │   ├── AddStudentPage.jsx
    │   ├── EditStudentPage.jsx
    │   └── UploadPage.jsx
    ├── services/
    │   └── api.js                   # Axios client → admin backend
    └── utils/
        └── format.js
```

### privdId_admin/backend/  (Express 5 + MongoDB ESM, port 5000)

Handles student CRUD, Poseidon hash computation, Pinata IPFS pin, on-chain writes.

```
backend/
├── server.js                        # HTTP entry, CORS, routes mount
├── app.js                           # Express app factory
├── package.json
├── config/
│   ├── db.js                        # Mongoose connect
│   └── nodemailer.js                # SMTP transport setup
├── controllers/
│   ├── adminController.js           # Admin auth handlers
│   └── studentController.js        # Student CRUD handlers
├── middleware/
│   ├── asyncHandler.js
│   └── errorHandler.js
├── models/
│   └── Student.js                   # Mongoose schema (all student fields)
├── routes/
│   ├── adminRoutes.js
│   └── studentRoutes.js
├── services/
│   ├── credentialService.js         # Poseidon hash + Pinata pin + chain write
│   ├── emailService.js              # Send credential email
│   └── studentService.js           # Business logic wrapper
├── utils/
│   ├── appError.js
│   ├── asyncHandler.js
│   ├── excelParser.js               # xlsx bulk import
│   ├── password.js                  # Hashing helpers
│   └── poseidonHash.js              # circomlibjs Poseidon wrapper
├── validators/
│   └── studentValidator.js
└── .env
```

---

## zk-proofs/  (Hardhat + Circom 2.1.6 + Solidity)

Circuit compilation, trusted setup, contract deploy. Note: `circom/` is a vendored copy of the Circom 2.1.6 Rust compiler source (not project code); `circomlib/` is the standard circuit library.

```
zk-proofs/
├── hardhat.config.js
├── package.json
├── compute_poseidon.js              # Standalone Poseidon hash utility
├── verification_key.json            # Groth16 vkey (current circuit)
├── circuits/
│   └── identity.circom              # Main identity circuit (Poseidon(5))
├── contracts/
│   ├── IdentityVerifier.sol         # Groth16 verifier (auto-generated)
│   ├── CredentialRegistry.sol       # On-chain commitment registry
│   └── Lock.sol                     # Hardhat boilerplate (unused)
├── scripts/
│   ├── deployVerifier.js
│   ├── deployRegistry.js
│   └── verifyProof.js
├── ignition/modules/
│   └── Lock.js                      # Hardhat Ignition module (boilerplate)
├── test/
│   ├── Lock.js
│   └── Registry.js
├── circomlib/                       # circomlib circuit primitives
│   └── circuits/
│       ├── poseidon.circom
│       ├── comparators.circom
│       ├── bitify.circom
│       ├── smt/                     # Sparse Merkle Tree circuits
│       └── sha256/
├── circom/                          # Vendored Circom 2.1.6 Rust compiler source
│   ├── Cargo.toml / Cargo.lock
│   └── [compiler crates: circom, compiler, constraint_generation, dag, ...]
├── artifacts/                       # Hardhat compile output (gitignored)
├── build/                           # circom compile output (gitignored)
├── cache/                           # Hardhat cache (gitignored)
└── .env / .env.example
```

---

## zkp-backend/  (Express + snarkjs + ethers v6, port 3000)

Proof generation and on-chain verification service. Read-only chain access (no writes). Circuit artifacts are bundled directly in this directory.

```
zkp-backend/
├── server.js                        # All routes: /generate-proof, /verify-proof
├── package.json
├── identity.wasm                    # Compiled circuit witness generator
├── identity_final.zkey              # Groth16 proving key
├── verification_key.json            # Groth16 verification key
└── .env / .env.example
```

---

## docs/

```
docs/
├── CLAUDE_CODE_BLUEPRINT.md         # Master rebuild spec (entry point)
├── README.md
├── PrivdID_Presentation.pdf
├── PrivdID_Architecture_Enhanced.pdf
├── PrivdID_IEEE_Paper.docx
├── current/
│   ├── research/
│   │   ├── RESEARCH_BRIEF.md
│   │   ├── TECHNICAL_VALIDATION.md
│   │   ├── PROJECT_UNDERSTANDING.md
│   │   ├── PERFORMANCE_METRICS.md
│   │   ├── CONTRIBUTIONS.md
│   │   ├── RELATED_WORK.md
│   │   ├── FINAL_PAPER_OUTLINE.md
│   │   └── RUNNING.md
│   └── images/
│       ├── final_fig_1_architecture.md ... final_fig_6_comparison.md
│       └── final_images/            # PNG figures for IEEE paper
└── improvement/
    ├── IMPROVEMENT_PLAN.md
    └── PrivdID Enhancement Architecture Summary.pdf
```

---

## Key observations

- **Circuit artifacts split**: `identity.circom` lives in `zk-proofs/circuits/`; the compiled `identity.wasm` and `identity_final.zkey` live in `zkp-backend/`. These must stay in sync after any circuit change.
- **No shared package**: Each of the 4 services (`digital-app`, `frontend`, `backend`, `zkp-backend`) has its own `package.json` and `node_modules`. There is no monorepo root `package.json`.
- **`zk-proofs/` has its own `node_modules`** (for Hardhat/snarkjs scripts) but is not a runtime service.
- **Ports**: admin backend 5000, zkp-backend 3000, frontend dev server 5173 (Vite default).
- **ESM**: admin backend uses ES module syntax (`"type": "module"` in package.json).
- **`circom/` vendor tree** inside `zk-proofs/` is the full Circom Rust compiler source — not project application code. Do not modify it.
