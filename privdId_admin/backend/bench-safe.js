/**
 * bench-safe.js — TBM N=5 automated Safe propose→sign→execute benchmark
 * (EVALUATION_PLAN.md §5.3). Replaces MetaMask with 2 raw custodian private
 * keys signing directly via protocol-kit's signHash(), isolating
 * infrastructure latency from human decision time.
 *
 * Prerequisites (read from .env, in addition to the usual SAFE_ADDRESS /
 * REGISTRY_ADDRESS / SAFE_API_KEY / SAFE_CHAIN_ID / SEPOLIA_RPC_URL):
 *   SAFE_LOCAL_SIGNER_KEY  — private key of Safe owner #1 (existing dev-mode
 *                            var, same one USE_LOCAL_SIGNERS already uses)
 *   SAFE_BENCH_SIGNER2_KEY — private key of Safe owner #2 (funded, Sepolia) — new
 *
 * For each of N=5 cycles this creates one throwaway issued student
 * (BENCHSF1..BENCHSF5, direct EOA issuance — not timed) then revokes it
 * through the Safe: build → propose (sign 1) → confirm (sign 2) → execute.
 * Mongo records are deleted afterward; the on-chain revoke is permanent
 * (registry has no delete) but harmless — these are dummy rollNos.
 *
 * Run: cd privdId_admin/backend && node bench-safe.js
 */
import "dotenv/config";
import Safe from "@safe-global/protocol-kit";
import { connectDatabase } from "./config/db.js";
import { createStudent } from "./services/studentService.js";
import {
  buildUnsignedRegistryTx,
  relayProposal,
  confirmSignature,
  executeTransaction,
} from "./services/safeService.js";
import Student from "./models/Student.js";

const N = 5;

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} must be set in .env to run bench-safe.js`);
  return v;
}

async function signAsOwner(privateKey, safeTxHash) {
  const protocolKit = await Safe.init({
    provider: process.env.SEPOLIA_RPC_URL,
    signer: privateKey,
    safeAddress: process.env.SAFE_ADDRESS,
  });
  return protocolKit.signHash(safeTxHash);
}

async function main() {
  const signer1Key = requireEnv("SAFE_LOCAL_SIGNER_KEY");
  const signer2Key = requireEnv("SAFE_BENCH_SIGNER2_KEY");

  await connectDatabase();
  await Student.deleteMany({ rollNo: { $regex: /^BENCHSF[1-5]$/ } });

  const phases = { build: [], propose: [], sign: [], execute: [], e2e: [] };

  for (let i = 1; i <= N; i++) {
    const rollNo = `BENCHSF${i}`;

    // Issue first (not timed — Safe latency is what's measured here).
    await createStudent({
      name: `Bench Safe Student ${i}`,
      email: `benchsafe${i}@iiitdmj.ac.in`,
      rollNo,
      programmeLevel: "B.Tech",
      discipline: "CSE",
      batch: 2022,
      dob: "2004-01-01",
    });

    const tE2E0 = performance.now();

    let t = performance.now();
    const { safeTransactionData, safeTxHash } = await buildUnsignedRegistryTx("revokeCredential", [rollNo]);
    phases.build.push((performance.now() - t) / 1000);

    t = performance.now();
    const sig1 = await signAsOwner(signer1Key, safeTxHash);
    await relayProposal({
      safeTransactionData,
      safeTxHash,
      senderAddress: sig1.signer,
      senderSignature: sig1.data,
    });
    phases.propose.push((performance.now() - t) / 1000);

    t = performance.now();
    const sig2 = await signAsOwner(signer2Key, safeTxHash);
    await confirmSignature(safeTxHash, sig2.data, sig2.signer);
    phases.sign.push((performance.now() - t) / 1000);

    t = performance.now();
    await executeTransaction(safeTxHash, signer1Key);
    phases.execute.push((performance.now() - t) / 1000);

    phases.e2e.push((performance.now() - tE2E0) / 1000);
    console.log(`cycle[${i}]: build ${phases.build[i-1].toFixed(3)}s propose ${phases.propose[i-1].toFixed(3)}s sign ${phases.sign[i-1].toFixed(3)}s execute ${phases.execute[i-1].toFixed(3)}s total ${phases.e2e[i-1].toFixed(3)}s`);
  }

  console.log("\n=== BENCH-SAFE SUMMARY (n=5) ===");
  for (const [label, samples] of Object.entries(phases)) {
    const min = Math.min(...samples);
    const max = Math.max(...samples);
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    console.log(`Safe_${label}: observed range [${min.toFixed(3)}s, ${max.toFixed(3)}s], mean ${mean.toFixed(3)}s (n=${samples.length})`);
  }
  console.log("=================================\n");

  await Student.deleteMany({ rollNo: { $regex: /^BENCHSF[1-5]$/ } });
  console.log("Cleaned up BENCHSF1-5 Mongo records (on-chain revokes remain — registry has no delete).");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("bench-safe.js failed:", err);
    process.exit(1);
  });
