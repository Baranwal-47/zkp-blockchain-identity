/**
 * generateCustodianKeys.js — DEV-ONLY throwaway RSA-2048 custodian keypair generator.
 *
 * Locked decision: D-10 (client-side custodian keygen in the browser for production).
 * This script is the LOCAL-DEV-ONLY equivalent — it generates throwaway keys so
 * local issuance (Plan 02) has real custodian public PEMs without the browser flow.
 *
 * SECURITY WARNING — LOCAL DEV ONLY:
 *   - These keys are throwaway. NEVER commit them. NEVER use in any deployed environment.
 *   - The private PEMs are written to ./keys/<role>_private.pem — gitignored, dev only.
 *   - In production, each official generates their own keypair client-side via the
 *     browser onboarding page (POST /api/custodians/register-key) — the private key
 *     is born in the browser and NEVER transmitted to the server (D-10).
 *   - DISK-WRITE DISCLOSURE: this script writes both public AND private PEMs to disk.
 *     Delete the private PEMs when done with local testing.
 *
 * AcadAdmin has NO RSA key — Share A is plaintext (D-03). Only Registrar and Dean.
 *
 * Usage:
 *   node scripts/generateCustodianKeys.js
 *   (REGISTRAR_PUBLIC_KEY_PATH and DEAN_PUBLIC_KEY_PATH must be set in .env)
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const keysDir = path.resolve(__dirname, "../keys");

const custodians = [
  { label: "Asst. Registrar", role: "registrar", pubEnv: "REGISTRAR_PUBLIC_KEY_PATH" },
  { label: "Dean",            role: "dean",       pubEnv: "DEAN_PUBLIC_KEY_PATH" },
];

fs.mkdirSync(keysDir, { recursive: true });

for (const { label, role, pubEnv } of custodians) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding:  { type: "spki",  format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  const pubPath  = process.env[pubEnv] ?? path.join(keysDir, `${role}_public.pem`);
  const privPath = path.join(keysDir, `${role}_private.pem`);

  fs.mkdirSync(path.dirname(pubPath), { recursive: true });
  fs.writeFileSync(pubPath,  publicKey,  "utf8");
  fs.writeFileSync(privPath, privateKey, "utf8");

  console.log(`[${label}]`);
  console.log(`  Public  → ${pubPath}`);
  console.log(`  Private → ${privPath}  ← KEEP LOCAL, NEVER COMMIT`);
}

console.log(`
Next steps:
  1. Ensure your .env sets REGISTRAR_PUBLIC_KEY_PATH and DEAN_PUBLIC_KEY_PATH
     (defaults: ./keys/registrar_public.pem and ./keys/dean_public.pem)
  2. Never commit anything under keys/  (covered by the existing *.pem gitignore rule)
  3. For a real deployment, run the browser onboarding page instead of this script
`);
