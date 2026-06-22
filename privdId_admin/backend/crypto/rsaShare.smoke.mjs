/**
 * rsaShare.smoke.mjs — round-trip verification of wrapShare / unwrapShare.
 * Run: node crypto/rsaShare.smoke.mjs
 */
import crypto from "crypto";
import { wrapShare, unwrapShare } from "./rsaShare.js";

// Throwaway RSA-2048 keypair (never committed or stored)
const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

// A realistic ~99-char hex Shamir share
const sampleShare = "a".repeat(99);

const wrapped = await wrapShare(publicKey, sampleShare);
const recovered = unwrapShare(privateKey, wrapped);

if (recovered !== sampleShare) {
  console.error("FAIL: unwrapShare did not recover original share");
  console.error("expected:", sampleShare);
  console.error("got:     ", recovered);
  process.exit(1);
}

console.log("PASS: wrapShare → unwrapShare round-trip matches");
console.log("rsaShare.smoke: ALL PASS");
