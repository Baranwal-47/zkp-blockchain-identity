/**
 * bench-issuance.js — TBM N=5 full issuance benchmark (EVALUATION_PLAN.md §5.4).
 *
 * Calls studentService.createStudent() directly (same pipeline POST
 * /api/students hits: Mongo write + Poseidon commitment + AES encrypt +
 * Pinata pin + Shamir split + direct on-chain anchor) for 5 throwaway
 * students (BENCH01..BENCH05), times each end-to-end, then deletes the 5
 * Mongo records. The on-chain anchors are NOT reversible (registry has no
 * delete) — these are real, tiny Sepolia writes under a dummy rollNo.
 *
 * Run: cd privdId_admin/backend && node bench-issuance.js
 */
import "dotenv/config";
import { connectDatabase } from "./config/db.js";
import { createStudent } from "./services/studentService.js";
import Student from "./models/Student.js";

const N = 5;

function makePayload(i) {
  return {
    name: `Bench Student ${i}`,
    email: `bench${i}@iiitdmj.ac.in`,
    rollNo: `BENCH0${i}`,
    programmeLevel: "B.Tech",
    discipline: "CSE",
    batch: 2022,
    dob: "2004-01-01",
  };
}

async function main() {
  await connectDatabase();

  // Clean up any leftover BENCH0x students from a prior failed run first.
  await Student.deleteMany({ rollNo: { $regex: /^BENCH0[1-5]$/ } });

  const samples = [];
  for (let i = 1; i <= N; i++) {
    const t0 = performance.now();
    await createStudent(makePayload(i));
    const seconds = (performance.now() - t0) / 1000;
    samples.push(seconds);
    console.log(`issuance[${i}]: ${seconds.toFixed(3)} s`);
  }

  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const min = Math.min(...samples);
  const max = Math.max(...samples);

  console.log("\n=== BENCH-ISSUANCE SUMMARY ===");
  console.log(`Full issuance: mean ${mean.toFixed(3)} s, observed range [${min.toFixed(3)} s, ${max.toFixed(3)} s] (n=${N})`);
  console.log("===============================\n");

  await Student.deleteMany({ rollNo: { $regex: /^BENCH0[1-5]$/ } });
  console.log("Cleaned up BENCH01-05 Mongo records (on-chain anchors remain — registry has no delete).");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("bench-issuance.js failed:", err);
    process.exit(1);
  });
