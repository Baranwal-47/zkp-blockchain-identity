/**
 * bench-crypto.js — TBM N=20 benchmark for AES-256-GCM, ECIES, Shamir, and
 * RSA-OAEP primitives in isolation (EVALUATION_PLAN.md §5.2).
 *
 * Run: cd privdId_admin/backend && node bench-crypto.js
 *
 * Protocol matches zkp-backend/bench.js: N=20 iterations, first dropped as
 * warm-up, mean + sample std dev (n-1=19) over the remaining n=19.
 */
import crypto from "crypto";
import { PrivateKey } from "eciesjs";
import { generateDEK, encryptCredential, decryptCredential } from "./crypto/aesgcm.js";
import { wrapDEK, unwrapDEK } from "./crypto/ecies.js";
import { splitDEK, reconstructDEK } from "./crypto/shamir.js";
import { wrapShare, unwrapShare } from "./crypto/rsaShare.js";

const N = 20;

async function runLoop(label, fn) {
  const samples = [];
  for (let i = 0; i < N; i++) {
    const t0 = performance.now();
    await fn();
    samples.push((performance.now() - t0) / 1000);
  }
  const measured = samples.slice(1); // drop warm-up
  const n = measured.length;
  const mean = measured.reduce((a, b) => a + b, 0) / n;
  const variance = measured.reduce((acc, s) => acc + (s - mean) ** 2, 0) / (n - 1);
  const sd = Math.sqrt(variance);
  console.log(`${label}: mean ${mean.toFixed(5)} s ± ${sd.toFixed(5)} s (n=${n})`);
  return { mean, sd, n };
}

async function main() {
  const results = {};

  // --- AES-256-GCM ---
  const dek = generateDEK();
  const sampleCred = {
    name: "Bench Student", rollNo: "BENCHCR01", dob: "20040101",
    programmeLevel: "B.Tech", discipline: "CSE", batch: "2022", email: "bench@iiitdmj.ac.in",
  };
  results.AES_encrypt = await runLoop("AES_encrypt", () => encryptCredential(sampleCred, dek));
  const blob = await encryptCredential(sampleCred, dek);
  results.AES_decrypt = await runLoop("AES_decrypt", () => decryptCredential(blob, dek));

  // --- ECIES ---
  const sk = new PrivateKey();
  const pubKeyHex = sk.publicKey.toHex();
  const privKeyHex = sk.toHex();
  results.ECIES_wrap = await runLoop("ECIES_wrap", () => wrapDEK(pubKeyHex, dek));
  const envelope = await wrapDEK(pubKeyHex, dek);
  results.ECIES_unwrap = await runLoop("ECIES_unwrap", () => unwrapDEK(privKeyHex, envelope));

  // --- Shamir 2-of-3 ---
  results.Shamir_split = await runLoop("Shamir_split", () => splitDEK(dek));
  const [shareA, shareB] = await splitDEK(dek);
  results.Shamir_reconstruct = await runLoop("Shamir_reconstruct", () => reconstructDEK([shareA, shareB]));

  // --- RSA-2048-OAEP ---
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  results.RSA_wrapShare = await runLoop("RSA_wrapShare", () => wrapShare(publicKey, shareA));
  const wrapped = await wrapShare(publicKey, shareA);
  results.RSA_unwrapShare = await runLoop("RSA_unwrapShare", () => unwrapShare(privateKey, wrapped));

  console.log("\n=== BENCH-CRYPTO SUMMARY ===");
  for (const [label, r] of Object.entries(results)) {
    console.log(`${label}: mean ${r.mean.toFixed(5)} s ± ${r.sd.toFixed(5)} s (n=${r.n})`);
  }
  console.log("============================\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("bench-crypto.js failed:", err);
    process.exit(1);
  });
