/**
 * shamir.smoke.mjs — ad-hoc round-trip verification of the Shamir 2-of-3 primitive.
 * Run: node crypto/shamir.smoke.mjs
 */
import crypto from "crypto";
import { splitDEK, reconstructDEK } from "./shamir.js";

let pass = true;

const dek = crypto.randomBytes(32);

const [A, B, C] = await splitDEK(dek);

// 2-of-3 subset [A, B]
const recon1 = await reconstructDEK([A, B]);
if (Buffer.compare(recon1, dek) !== 0) {
  console.error("FAIL: [A,B] reconstruction did not match original DEK");
  pass = false;
} else {
  console.log("PASS: [A,B] reconstruction matches original DEK");
}

// 2-of-3 subset [B, C]
const recon2 = await reconstructDEK([B, C]);
if (Buffer.compare(recon2, dek) !== 0) {
  console.error("FAIL: [B,C] reconstruction did not match original DEK");
  pass = false;
} else {
  console.log("PASS: [B,C] reconstruction matches original DEK");
}

// Single share must NOT reconstruct the DEK
let singleShareFails = false;
try {
  const recon3 = await reconstructDEK([A]);
  // reconstructDEK throws on length mismatch OR returns garbage — both are PASS
  if (Buffer.compare(recon3, dek) !== 0) {
    singleShareFails = true;
  }
} catch {
  singleShareFails = true;
}
if (singleShareFails) {
  console.log("PASS: single share does not reconstruct original DEK");
} else {
  console.error("FAIL: single share incorrectly reconstructed original DEK");
  pass = false;
}

if (!pass) {
  console.error("shamir.smoke: FAILED");
  process.exit(1);
}
console.log("shamir.smoke: ALL PASS");
