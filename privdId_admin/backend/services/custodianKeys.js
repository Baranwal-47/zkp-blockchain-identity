/**
 * custodianKeys.js — lazy loader for custodian RSA-2048 public-key PEMs.
 *
 * The Registrar and Dean public PEMs are read on first use (never at import
 * time) so a missing PEM does not crash backend boot — same lazy-load pattern
 * as safeService.js::getApiKit(). These are PUBLIC keys only (D-05: the admin
 * process NEVER holds any custodian private key).
 *
 * Env vars:
 *   REGISTRAR_PUBLIC_KEY_PATH — path to the Registrar RSA-2048 public PEM
 *   DEAN_PUBLIC_KEY_PATH      — path to the Dean RSA-2048 public PEM
 *
 * Both are written either by:
 *   - the browser onboarding page (POST /api/custodians/register-key, D-10)
 *   - the dev keygen script (scripts/generateCustodianKeys.js, local-dev only)
 */

import fs from "fs";

let _registrarPem = null;
let _deanPem = null;

/**
 * getRegistrarPublicKey() → string (RSA-2048 SPKI PEM)
 * Throws a clear AppError-style message if REGISTRAR_PUBLIC_KEY_PATH is unset
 * or the file is missing — never surfaces a raw ENOENT.
 */
export function getRegistrarPublicKey() {
  if (_registrarPem) return _registrarPem;
  const path = process.env.REGISTRAR_PUBLIC_KEY_PATH;
  if (!path) {
    throw new Error(
      "Registrar public key not configured — run custodian onboarding first (REGISTRAR_PUBLIC_KEY_PATH is unset)."
    );
  }
  try {
    _registrarPem = fs.readFileSync(path, "utf8");
  } catch {
    throw new Error(
      `Registrar public key not configured — file not found at "${path}". Run custodian onboarding first.`
    );
  }
  return _registrarPem;
}

/**
 * getDeanPublicKey() → string (RSA-2048 SPKI PEM)
 * Throws a clear AppError-style message if DEAN_PUBLIC_KEY_PATH is unset
 * or the file is missing — never surfaces a raw ENOENT.
 */
export function getDeanPublicKey() {
  if (_deanPem) return _deanPem;
  const path = process.env.DEAN_PUBLIC_KEY_PATH;
  if (!path) {
    throw new Error(
      "Dean public key not configured — run custodian onboarding first (DEAN_PUBLIC_KEY_PATH is unset)."
    );
  }
  try {
    _deanPem = fs.readFileSync(path, "utf8");
  } catch {
    throw new Error(
      `Dean public key not configured — file not found at "${path}". Run custodian onboarding first.`
    );
  }
  return _deanPem;
}
