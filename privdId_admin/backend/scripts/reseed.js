/**
 * reseed.js — Wipe and re-seed test students with the new 7-attribute salted Merkle commitment.
 *
 * PURPOSE: Phase-1 acceptance gate (SPEC-02 / success criterion 3).
 * Proves that the admin issuance path and the prover-side recomputation
 * independently converge on the same Merkle root for every student — including
 * the >31-byte name and >31-byte email cases that exercise the 2-chunk path.
 *
 * USAGE (from privdId_admin/backend/):
 *   node scripts/reseed.js
 *
 * Requires: MONGO_URI set in privdId_admin/backend/.env (read via dotenv).
 *
 * THREAT MITIGATIONS (per threat_model in 01-04-PLAN.md):
 *   T-01-12: assert.strictEqual root-equality gate per student (issuance === prover-side recompute)
 *   T-01-13: gate mandatorily exercised for >31-byte name and >31-byte email
 *   T-01-14: SEED covers over-18/under-18 DOBs, postgrad/undergrad, discipline spread (D-12)
 */

import { hashToField, generateSalts, computeMerkleRoot, CHUNK_COUNTS } from "../utils/identityCommitment.js";
import { PROGRAMME_LEVEL, DISCIPLINE } from "../constants/enumCodes.js";
import Student from "../models/Student.js";
import mongoose from "mongoose";
import assert from "assert";
import dotenv from "dotenv";

dotenv.config();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a YYYY-MM-DD string to a YYYYMMDD integer for commitment.
 * e.g. "2004-02-15" → 20040215
 */
function parseDobInt(dobStr) {
  return parseInt(dobStr.replace(/-/g, ""), 10);
}

/**
 * Build the 7-element attrs array in frozen leaf order (IDENTITY_SPEC.md §1).
 *
 * Leaf order:
 *   0: name (hashToField, maxChunks=4)
 *   1: rollNo (hashToField, maxChunks=2)
 *   2: dob YYYYMMDD integer (string)
 *   3: programmeLevel code (string)
 *   4: discipline code (string)
 *   5: batch year integer (string)
 *   6: email (hashToField, maxChunks=2)
 */
async function buildAttrs({ name, rollNo, dobInt, programmeLevel, discipline, batch, email }) {
  return [
    await hashToField(name, CHUNK_COUNTS.name),               // leaf 0
    await hashToField(rollNo, CHUNK_COUNTS.rollNo),           // leaf 1
    String(dobInt),                                            // leaf 2 — YYYYMMDD int
    String(PROGRAMME_LEVEL[programmeLevel]),                   // leaf 3 — code
    String(DISCIPLINE[discipline]),                            // leaf 4 — code
    String(batch),                                             // leaf 5 — year int
    await hashToField(email, CHUNK_COUNTS.email),             // leaf 6
  ];
}

// ---------------------------------------------------------------------------
// SEED array — D-12 coverage
//
// Reference date for age calculation: 2026-06-16
//   - over-18: DOB ≤ 2008-06-16  (e.g. 2004-02-15 → 22 years old)
//   - under-18: DOB ≥ 2008-06-17 (e.g. 2010-03-22 → 16 years old)
//
// Name > 31 bytes: "Rajesh Kumar Sharma Gupta Verma Singh" = 37 bytes (UTF-8)
// Email > 31 bytes: "utkarshbaranwal47@students.iiitdmj.ac.in" = 40 bytes (UTF-8)
// ---------------------------------------------------------------------------

const SEED = [
  // --- Student 1 ---
  // Name: >31 bytes (37 bytes) → exercises the 2-chunk path for names (T-01-13)
  // DOB: over-18 (22 years old)
  // Programme: B.Tech (undergrad), CSE
  {
    name: "Rajesh Kumar Sharma Gupta Verma Singh",
    email: "23bcs041@iiitdmj.ac.in",
    rollNo: "23BCS041",
    programmeLevel: "B.Tech",
    discipline: "CSE",
    batch: 2023,
    dob: "2004-02-15",
    programme: "B.Tech CSE",
    contactNo: "9876543210",
  },

  // --- Student 2 ---
  // Email: >31 bytes (40 bytes) → exercises the 2-chunk path for emails (T-01-13)
  // DOB: over-18 (25 years old)
  // Programme: M.Tech (postgrad), ECE
  {
    name: "Utkarsh Baranwal",
    email: "utkarshbaranwal47@students.iiitdmj.ac.in",
    rollNo: "22MTE007",
    programmeLevel: "M.Tech",
    discipline: "ECE",
    batch: 2022,
    dob: "2001-04-22",
    programme: "M.Tech ECE",
    contactNo: "9123456789",
  },

  // --- Student 3 ---
  // DOB: under-18 (born 2010-03-22 → 16 years old relative to 2026-06-16)
  // Programme: B.Des (undergrad), Design
  {
    name: "Ananya Sharma",
    email: "23bds012@iiitdmj.ac.in",
    rollNo: "23BDS012",
    programmeLevel: "B.Des",
    discipline: "Design",
    batch: 2023,
    dob: "2010-03-22",
    programme: "B.Des Design",
    contactNo: "9988776655",
  },

  // --- Student 4 ---
  // DOB: over-18 (26 years old)
  // Programme: PhD (postgrad), ME — postgrad discipline spread
  {
    name: "Dhruv Anand Singh",
    email: "22phd003@iiitdmj.ac.in",
    rollNo: "22PHD003",
    programmeLevel: "PhD",
    discipline: "ME",
    batch: 2022,
    dob: "2000-11-08",
    programme: "PhD ME",
    contactNo: "9871234560",
  },

  // --- Student 5 ---
  // DOB: over-18 (23 years old)
  // Programme: Dual (undergrad-entry), SmartMfg — covers Dual edge case
  {
    name: "Priya Nair",
    email: "21dual015@iiitdmj.ac.in",
    rollNo: "21DUL015",
    programmeLevel: "Dual",
    discipline: "SmartMfg",
    batch: 2021,
    dob: "2003-07-19",
    programme: "Dual SmartMfg",
    contactNo: "8800112233",
  },

  // --- Student 6 ---
  // DOB: under-18 (born 2009-12-05 → 16 years old relative to 2026-06-16)
  // Programme: B.Tech (undergrad), NatSci — covers NatSci discipline
  {
    name: "Arjun Mehta",
    email: "24bcs098@iiitdmj.ac.in",
    rollNo: "24BCS098",
    programmeLevel: "B.Tech",
    discipline: "NatSci",
    batch: 2024,
    dob: "2009-12-05",
    programme: "B.Tech NatSci",
    contactNo: "7711223344",
  },

  // --- Student 7 ---
  // DOB: over-18 (24 years old)
  // Programme: M.Des (postgrad), Design — covers M.Des postgrad level
  {
    name: "Kavya Reddy",
    email: "21mde004@iiitdmj.ac.in",
    rollNo: "21MDE004",
    programmeLevel: "M.Des",
    discipline: "Design",
    batch: 2021,
    dob: "2002-09-30",
    programme: "M.Des Design",
    contactNo: "6655443322",
  },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!process.env.MONGO_URI) {
    console.error(
      "ERROR: MONGO_URI is not set. Set MONGO_URI in privdId_admin/backend/.env before running this script."
    );
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("[reseed] Connected to MongoDB.");

  try {
    // Wipe all existing student records (D-12: no migration of old flat-Poseidon(5) records)
    const { deletedCount } = await Student.deleteMany({});
    console.log(`[reseed] Wiped ${deletedCount} existing student record(s).`);

    let passCount = 0;

    for (const seedData of SEED) {
      const { name, email, rollNo, programmeLevel, discipline, batch, dob, programme, contactNo } =
        seedData;

      const dobInt = parseDobInt(dob);

      // ---- ISSUANCE PATH ----
      // Build attrs in frozen leaf order; generate fresh salts
      const salts = generateSalts(7);
      const issuanceAttrs = await buildAttrs({ name, rollNo, dobInt, programmeLevel, discipline, batch, email });
      const merkleRoot = await computeMerkleRoot(issuanceAttrs, salts);

      // Persist via Student.create — includes salts[] and merkleRoot
      const createdStudent = await Student.create({
        name,
        email,
        rollNo,
        programme,
        programmeLevel,
        discipline,
        batch,
        dob,
        dobInt,
        contactNo,
        salts,
        merkleRoot,
        // hashedData: no longer used for new records — set a placeholder to satisfy the schema
        // (schema has required:true on hashedData for legacy; post-wipe all records are new-scheme)
        hashedData: merkleRoot,
        // password: required by schema — set a throwaway placeholder for test data
        password: `reseed-placeholder-${rollNo}`,
      });

      // ---- PROVER-SIDE RECOMPUTATION ----
      // Independently rebuild attrs from persisted/known field values.
      // This re-runs hashToField and enum lookups independently (NOT reusing issuanceAttrs).
      // Reading salts back from createdStudent.salts proves the stored salts round-trip correctly.
      const reAttrs = await buildAttrs({
        name: createdStudent.name,
        rollNo: createdStudent.rollNo,
        dobInt: createdStudent.dobInt,
        programmeLevel: createdStudent.programmeLevel,
        discipline: createdStudent.discipline,
        batch: createdStudent.batch,
        email: createdStudent.email,
      });

      const recomputed = await computeMerkleRoot(reAttrs, createdStudent.salts);

      // ---- ACCEPTANCE GATE ----
      assert.strictEqual(
        recomputed,
        createdStudent.merkleRoot,
        `ROOT MISMATCH for ${rollNo}: issuance and prover-side paths diverged`
      );

      const nameBytes = Buffer.byteLength(name, "utf8");
      const emailBytes = Buffer.byteLength(email, "utf8");
      const chunks = nameBytes > 31 ? "2-chunk name" : emailBytes > 31 ? "2-chunk email" : "1-chunk";
      console.log(
        `[reseed] ${rollNo}  root=${createdStudent.merkleRoot.slice(0, 16)}...  salts=${createdStudent.salts.length}  (${chunks})  PASS`
      );
      passCount++;
    }

    console.log(`\n[reseed] Done. ${passCount}/${SEED.length} students seeded and verified. All root-equality gates PASSED.`);
  } finally {
    await mongoose.disconnect();
    console.log("[reseed] Disconnected.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
