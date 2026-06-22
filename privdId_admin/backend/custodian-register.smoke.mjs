/**
 * custodian-register.smoke.mjs — service-layer verification of registerCustodianPublicKey.
 * Exercises the validation logic directly (no HTTP). Run: node custodian-register.smoke.mjs
 */
import crypto from "crypto";
import os from "os";
import path from "path";
import { registerCustodianPublicKey } from "./services/custodianService.js";

let pass = true;

// Throwaway RSA-2048 keypair
const { publicKey: pub2048, privateKey: priv2048 } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding:  { type: "spki",  format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const tmpPath = path.join(os.tmpdir(), `smoke_reg_${Date.now()}.pem`);
process.env.REGISTRAR_PUBLIC_KEY_PATH = tmpPath;

// 1. Valid 2048-bit public PEM → should write and return {role, path}
try {
  const result = await registerCustodianPublicKey("registrar", pub2048);
  // Verify the written file parses back as a 2048-bit RSA public key
  const { readFileSync } = await import("fs");
  const written = readFileSync(tmpPath, "utf8");
  const k = crypto.createPublicKey(written);
  if (k.asymmetricKeyType !== "rsa" || k.asymmetricKeyDetails.modulusLength !== 2048) {
    throw new Error("Written PEM does not parse as RSA-2048");
  }
  console.log("PASS: valid RSA-2048 public PEM accepted and written");
} catch (err) {
  console.error("FAIL: valid public PEM rejected:", err.message);
  pass = false;
}

// 2. Private-key PEM → must be REJECTED, no file overwritten with private material
try {
  await registerCustodianPublicKey("registrar", priv2048);
  console.error("FAIL: private-key PEM was accepted (D-10 violation)");
  pass = false;
} catch (err) {
  if (err.message.includes("private key") || err.message.includes("PUBLIC key")) {
    console.log("PASS: private-key PEM rejected:", err.message);
  } else {
    console.error("FAIL: rejected with unexpected error:", err.message);
    pass = false;
  }
}

// 3. 1024-bit public PEM → must be REJECTED (modulus check)
const { publicKey: pub1024 } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 1024,
  publicKeyEncoding: { type: "spki", format: "pem" },
});
try {
  await registerCustodianPublicKey("registrar", pub1024);
  console.error("FAIL: 1024-bit key was accepted");
  pass = false;
} catch (err) {
  console.log("PASS: 1024-bit key rejected:", err.message);
}

// 4. Garbage → must be REJECTED
try {
  await registerCustodianPublicKey("registrar", "this is not a pem");
  console.error("FAIL: garbage PEM was accepted");
  pass = false;
} catch (err) {
  console.log("PASS: garbage PEM rejected:", err.message);
}

if (!pass) {
  console.error("custodian-register.smoke: FAILED");
  process.exit(1);
}
console.log("custodian-register.smoke: ALL PASS");
