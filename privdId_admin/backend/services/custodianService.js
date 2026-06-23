/**
 * custodianService.js — register a custodian's RSA-2048 public-key PEM.
 *
 * Validates the submitted PEM (public-only, RSA-2048) before writing it to the
 * role's configured path. The critical D-10 control: a private-key PEM submitted
 * in place of a public key is REJECTED before any write.
 *
 * crypto.createPublicKey() alone is NOT sufficient to distinguish public from
 * private input — it silently extracts the public half of a private PEM and
 * returns a valid type:"public" / asymmetricKeyType:"rsa" / modulusLength:2048
 * key. Two checks are layered:
 *   1. ARMOR CHECK — require "BEGIN PUBLIC KEY" (SPKI); reject any private armor token.
 *   2. PARSE-AS-PRIVATE PROBE — attempt crypto.createPrivateKey(pem); if it SUCCEEDS,
 *      the input contains private material → reject. A valid SPKI public PEM makes
 *      createPrivateKey throw, which is the PASS path.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import AppError from "../utils/appError.js";

const ROLE_PATH_ENV = {
  registrar: "REGISTRAR_PUBLIC_KEY_PATH",
  dean:      "DEAN_PUBLIC_KEY_PATH",
};

export async function registerCustodianPublicKey(role, publicKeyPem) {
  const envVar = ROLE_PATH_ENV[role];
  const targetPath = process.env[envVar];
  if (!targetPath) {
    throw new AppError(`Custodian public-key path not configured for ${role} (${envVar} is unset).`, 500);
  }

  // Onboarding is one-time: re-registering would silently orphan every share
  // already wrapped under the existing key. Delete the file to rotate intentionally.
  if (fs.existsSync(targetPath)) {
    throw new AppError(
      `A ${role} custodian key is already registered. Onboarding is one-time — delete ${targetPath} on the server to rotate.`,
      409
    );
  }

  // 1. ARMOR CHECK — SPKI public armor required; private armor tokens forbidden.
  if (!publicKeyPem.includes("-----BEGIN PUBLIC KEY-----")) {
    throw new AppError("Only a PUBLIC key PEM may be registered (missing SPKI armor).", 400);
  }
  if (
    publicKeyPem.includes("-----BEGIN PRIVATE KEY-----") ||
    publicKeyPem.includes("-----BEGIN RSA PRIVATE KEY-----") ||
    publicKeyPem.includes("-----BEGIN EC PRIVATE KEY-----")
  ) {
    throw new AppError("Only a PUBLIC key PEM may be registered.", 400);
  }

  // 2. PARSE-AS-PRIVATE PROBE — if createPrivateKey succeeds, private material is present.
  try {
    crypto.createPrivateKey(publicKeyPem);
    // If we reach here, the PEM contains a private key — reject.
    throw new AppError("A private key was submitted; only the PUBLIC key may be registered.", 400);
  } catch (err) {
    if (err instanceof AppError) throw err;
    // createPrivateKey threw → the PEM is not a private key → PASS
  }

  // 3. FORMAT + ALGORITHM validation via createPublicKey.
  let key;
  try {
    key = crypto.createPublicKey(publicKeyPem);
  } catch {
    throw new AppError("Invalid RSA public key PEM.", 400);
  }
  if (key.asymmetricKeyType !== "rsa") {
    throw new AppError("Custodian key must be RSA-2048.", 400);
  }
  if (key.asymmetricKeyDetails.modulusLength !== 2048) {
    throw new AppError("Custodian key must be RSA-2048.", 400);
  }

  // All checks passed — write.
  fs.mkdirSync(path.dirname(path.resolve(targetPath)), { recursive: true });
  fs.writeFileSync(targetPath, publicKeyPem, "utf8");

  return { role, path: targetPath };
}
