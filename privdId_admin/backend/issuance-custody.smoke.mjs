/**
 * issuance-custody.smoke.mjs — ad-hoc verification of the custody-write path.
 *
 * Exercises splitDEK/wrapShare directly with throwaway in-memory RSA-2048
 * keypairs (no Mongo connection). Asserts:
 *   - shareA is a plaintext hex Shamir share
 *   - shareB/shareC are base64 ciphertext (not valid hex shares on their own)
 *   - 2-of-3 subsets (using A + unwrapped B) reconstruct the exact original DEK
 *
 * Run: node issuance-custody.smoke.mjs
 */
import crypto from "crypto";
import { splitDEK, reconstructDEK } from "./crypto/shamir.js";
import { wrapShare, unwrapShare } from "./crypto/rsaShare.js";

let pass = true;

// Throwaway keypairs for Registrar and Dean (never stored)
const { publicKey: registrarPub, privateKey: registrarPriv } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const { publicKey: deanPub, privateKey: deanPriv } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const dek = crypto.randomBytes(32);

// --- split ---
const [a, b, c] = await splitDEK(dek);

// shareA must be a plaintext hex Shamir share (parseable as hex, not base64-only)
if (!/^[0-9a-f]+$/i.test(a)) {
  console.error("FAIL: shareA is not a plaintext hex string:", a.slice(0, 20));
  pass = false;
} else {
  console.log("PASS: shareA is plaintext hex");
}

// shareB/shareC are RSA-OAEP ciphertext — they should NOT be valid hex shares
// (a valid Shamir hex share, when combined alone, just returns garbage; a
// base64 ciphertext is typically not even valid hex at the right length)
const shareB = await wrapShare(registrarPub, b);
const shareC = await wrapShare(deanPub, c);

if (/^[0-9a-f]+$/i.test(shareB) && shareB.length === b.length) {
  console.error("FAIL: shareB looks like a plaintext hex share — it should be base64 ciphertext");
  pass = false;
} else {
  console.log("PASS: shareB is base64 ciphertext (distinguishable from plaintext share)");
}
if (/^[0-9a-f]+$/i.test(shareC) && shareC.length === c.length) {
  console.error("FAIL: shareC looks like a plaintext hex share — it should be base64 ciphertext");
  pass = false;
} else {
  console.log("PASS: shareC is base64 ciphertext (distinguishable from plaintext share)");
}

// --- reconstruct using A + unwrapped B (2-of-3) ---
const unwrappedB = unwrapShare(registrarPriv, shareB);
const recon1 = await reconstructDEK([a, unwrappedB]);
if (Buffer.compare(recon1, dek) !== 0) {
  console.error("FAIL: [A, unwrappedB] reconstruction did not match original DEK");
  pass = false;
} else {
  console.log("PASS: [shareA, unwrapped shareB] reconstructs original DEK");
}

// --- reconstruct using A + unwrapped C (2-of-3) ---
const unwrappedC = unwrapShare(deanPriv, shareC);
const recon2 = await reconstructDEK([a, unwrappedC]);
if (Buffer.compare(recon2, dek) !== 0) {
  console.error("FAIL: [A, unwrappedC] reconstruction did not match original DEK");
  pass = false;
} else {
  console.log("PASS: [shareA, unwrapped shareC] reconstructs original DEK");
}

if (!pass) {
  console.error("issuance-custody.smoke: FAILED");
  process.exit(1);
}
console.log("issuance-custody.smoke: ALL PASS");
