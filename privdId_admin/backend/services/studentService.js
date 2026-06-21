import AppError from "../utils/appError.js";
import Student from "../models/Student.js";
import { hashPoseidonFields } from "../utils/poseidonHash.js"; // kept for legacy callers; NOT called from new commitment path
import { generateTemporaryPassword } from "../utils/password.js";
import { sendCredentialsEmail } from "./emailService.js";
import { issueCredentialOnChain, revokeCredentialOnChain, pinEnvelopeToIPFS } from "./credentialService.js";
import { generateDEK } from "../crypto/aesgcm.js";
import { wrapDEK } from "../crypto/ecies.js";
import { hashToField, generateSalts, computeMerkleRoot, CHUNK_COUNTS } from "../utils/identityCommitment.js";
import { PROGRAMME_LEVEL, DISCIPLINE } from "../constants/enumCodes.js";

export function normalizeStudentInput(studentPayload) {
  // parse YYYY-MM-DD → YYYYMMDD integer for commitment; keep dob string for display
  const dobStr = String(studentPayload.dob ?? "").trim();
  const dobInt = dobStr ? parseInt(dobStr.replace(/-/g, ""), 10) : null;
  return {
    name: String(studentPayload.name ?? "").trim(),
    email: String(studentPayload.email ?? "").trim().toLowerCase(),
    rollNo: String(studentPayload.rollNo ?? "").trim(),
    programmeLevel: String(studentPayload.programmeLevel ?? "").trim(),
    discipline: String(studentPayload.discipline ?? "").trim(),
    batch: Number(studentPayload.batch) || null,
    dob: dobStr,                                                    // display string
    dobInt,                                                         // YYYYMMDD integer for commitment (leaf 2)
  };
}

export function sanitizeStudent(student) {
  return {
    id: student._id.toString(),
    name: student.name,
    email: student.email,
    rollNo: student.rollNo,
    programmeLevel: student.programmeLevel,
    discipline: student.discipline,
    batch: student.batch,
    dob: student.dob,
    hashedData: student.hashedData,
    emailSent: student.emailSent,
    emailSentAt: student.emailSentAt,
    createdAt: student.createdAt,
    ciphertextCID: student.ciphertextCID ?? null,
    // NOTE (D-02): the per-student plaintext encryption key is intentionally
    // excluded from this allowlist — it must never leave the backend via any
    // API response. Do NOT "helpfully" add it back to this object.
    enrollmentPhase: student.enrollmentPhase ?? "awaiting-keypair",
    pubKey: student.pubKey ?? null,
    dekEnvelopeCID: student.dekEnvelopeCID ?? null,
    onChainTxHash: student.onChainTxHash ?? null,
    onChainBlock: student.onChainBlock ?? null,
    revoked: student.revoked ?? false,
    revokedAt: student.revokedAt ?? null,
  };
}

export async function listStudents() {
  const students = await Student.find().sort({ createdAt: -1 });
  return students.map(sanitizeStudent);
}

export async function findDuplicateStudent({ email, rollNo }) {
  return Student.findOne({
    $or: [{ email }, { rollNo }],
  });
}

export async function buildStudentRecord(studentPayload) {
  const normalizedStudent = normalizeStudentInput(studentPayload);

  // Input guards — all 4 committed integer/enum attributes are required
  if (!normalizedStudent.dob) {
    throw new AppError("Date of Birth is required to issue a credential.", 400);
  }
  if (!normalizedStudent.dobInt) {
    throw new AppError("Date of Birth could not be parsed to an integer. Expected YYYY-MM-DD.", 400);
  }
  if (!normalizedStudent.programmeLevel) {
    throw new AppError("programmeLevel is required to issue a credential.", 400);
  }
  if (!normalizedStudent.discipline) {
    throw new AppError("discipline is required to issue a credential.", 400);
  }
  if (!normalizedStudent.batch) {
    throw new AppError("batch is required to issue a credential.", 400);
  }

  // Enum code lookup — throws if the string is not in the frozen map (T-01-09)
  const programmeLevelCode = PROGRAMME_LEVEL[normalizedStudent.programmeLevel];
  const disciplineCode = DISCIPLINE[normalizedStudent.discipline];
  if (programmeLevelCode === undefined) {
    throw new AppError(`Unknown programmeLevel: "${normalizedStudent.programmeLevel}"`, 400);
  }
  if (disciplineCode === undefined) {
    throw new AppError(`Unknown discipline: "${normalizedStudent.discipline}"`, 400);
  }

  const temporaryPassword = generateTemporaryPassword();

  // 7-attribute salted Merkle commitment — frozen leaf order per IDENTITY_SPEC §1
  const salts = generateSalts(7);
  const attrs = [
    await hashToField(normalizedStudent.name, CHUNK_COUNTS.name),        // leaf 0: name
    await hashToField(normalizedStudent.rollNo, CHUNK_COUNTS.rollNo),    // leaf 1: rollNo
    String(normalizedStudent.dobInt),                                     // leaf 2: dob YYYYMMDD int
    String(programmeLevelCode),                                           // leaf 3: programmeLevel code
    String(disciplineCode),                                               // leaf 4: discipline code
    String(normalizedStudent.batch),                                      // leaf 5: batch year int
    await hashToField(normalizedStudent.email, CHUNK_COUNTS.email),      // leaf 6: email
  ];
  const merkleRoot = await computeMerkleRoot(attrs, salts);

  return {
    ...normalizedStudent,
    merkleRoot,
    salts,
    password: temporaryPassword,
  };
}

export async function createStudent(studentPayload) {
  const record = await buildStudentRecord(studentPayload);
  const student = await Student.create({
    name: record.name,
    email: record.email,
    rollNo: record.rollNo,
    programmeLevel: record.programmeLevel,
    discipline: record.discipline,
    batch: record.batch,
    dob: record.dob,
    dobInt: record.dobInt,
    salts: record.salts,
    merkleRoot: record.merkleRoot,
    password: record.password,
    emailSent: false,
    emailSentAt: null,
  });

  // Anchor credential on IPFS + Sepolia — non-blocking, student is saved regardless
  // (T-06-09 accepted risk: a Pinata/RPC failure here must NOT block student.save()).
  // On failure, anchorPending/lastAnchorError are persisted so operators can find and
  // retry affected students instead of the failure being a silent, unrecoverable no-op.
  try {
    const dek = generateDEK();
    const { cid, safeTxHash } = await issueCredentialOnChain(student, dek);
    student.dek = dek.toString('base64');
    student.ciphertextCID = cid;
    student.pendingRegistryAction = { safeTxHash, type: 'issue' };
    student.anchorPending = false;
    student.lastAnchorError = null;
    await student.save();
  } catch (err) {
    console.error('[credential] On-chain anchoring failed for', student.rollNo, ':', err.message);
    student.anchorPending = true;
    student.lastAnchorError = err.message;
    await student.save();
  }

  return {
    student: sanitizeStudent(student),
  };
}

export async function buildBulkStudents(studentRows) {
  const prepared = [];

  for (const row of studentRows) {
    const record = await buildStudentRecord(row);
    prepared.push(record);
  }

  return prepared;
}

export async function insertBulkStudents(preparedStudents) {
  const studentsToInsert = preparedStudents.map((student) => ({
    ...student,
    emailSent: false,
    emailSentAt: null,
  }));
  const insertedStudents = await Student.insertMany(studentsToInsert, { ordered: true });

  // Anchor each credential on IPFS + Sepolia — failures are logged but don't abort
  // the batch (same non-blocking semantics as createStudent, T-06-09). WR-02/WR-04:
  // track per-row anchor outcome so the caller can report "issued X/Y, Z pending"
  // instead of the batch silently appearing fully successful; build the response
  // from the loop's own results rather than re-querying the DB.
  let anchored = 0;
  let pending = 0;
  for (const student of insertedStudents) {
    try {
      const dek = generateDEK();
      const { cid, safeTxHash } = await issueCredentialOnChain(student, dek);
      await Student.updateOne(
        { _id: student._id },
        { ciphertextCID: cid, dek: dek.toString('base64'), pendingRegistryAction: { safeTxHash, type: 'issue' }, anchorPending: false, lastAnchorError: null }
      );
      student.ciphertextCID = cid;
      student.pendingRegistryAction = { safeTxHash, type: 'issue' };
      student.anchorPending = false;
      anchored += 1;
    } catch (err) {
      console.error('[credential] On-chain anchoring failed for', student.rollNo, ':', err.message);
      await Student.updateOne(
        { _id: student._id },
        { anchorPending: true, lastAnchorError: err.message }
      );
      student.anchorPending = true;
      student.lastAnchorError = err.message;
      pending += 1;
    }
  }

  return {
    insertedStudents: insertedStudents.map(sanitizeStudent),
    anchorSummary: { total: insertedStudents.length, anchored, pending },
  };
}

export async function updateStudent(id, payload) {
  // dek has select: false (WR-01/D-02) — must be explicitly selected here because
  // the re-issuance path below reuses (never rotates) the existing DEK.
  const student = await Student.findById(id).select('+dek');
  if (!student) throw new AppError("Student not found.", 404);
  if (student.revoked) throw new AppError("Cannot update a revoked credential.", 400);

  const allowedFields = ["name", "programmeLevel", "discipline", "batch", "dob"];
  allowedFields.forEach((field) => {
    if (payload[field] !== undefined) student[field] = String(payload[field]).trim();
  });
  // batch is a Number — coerce separately after the String pass above
  if (payload.batch !== undefined) student.batch = Number(payload.batch) || null;

  if (!student.dob) {
    throw new AppError("Date of Birth is required to issue a credential.", 400);
  }

  // Input guards for commitment fields
  if (!student.programmeLevel) {
    throw new AppError("programmeLevel is required to issue a credential.", 400);
  }
  if (!student.discipline) {
    throw new AppError("discipline is required to issue a credential.", 400);
  }
  if (!student.batch) {
    throw new AppError("batch is required to issue a credential.", 400);
  }

  // Enum code lookup — throws if not in the frozen map (T-01-09)
  const programmeLevelCode = PROGRAMME_LEVEL[student.programmeLevel];
  const disciplineCode = DISCIPLINE[student.discipline];
  if (programmeLevelCode === undefined) {
    throw new AppError(`Unknown programmeLevel: "${student.programmeLevel}"`, 400);
  }
  if (disciplineCode === undefined) {
    throw new AppError(`Unknown discipline: "${student.discipline}"`, 400);
  }

  // Re-parse dobInt from the stored dob display string
  const dobStr = String(student.dob ?? "").trim();
  const dobInt = dobStr ? parseInt(dobStr.replace(/-/g, ""), 10) : null;
  if (!dobInt) {
    throw new AppError("Date of Birth could not be parsed to an integer. Expected YYYY-MM-DD.", 400);
  }
  student.dobInt = dobInt;

  // Recompute 7-attribute salted Merkle commitment — both sites must use computeMerkleRoot (T-01-08)
  const salts = generateSalts(7);
  const attrs = [
    await hashToField(student.name, CHUNK_COUNTS.name),        // leaf 0: name
    await hashToField(student.rollNo, CHUNK_COUNTS.rollNo),    // leaf 1: rollNo
    String(dobInt),                                             // leaf 2: dob YYYYMMDD int
    String(programmeLevelCode),                                 // leaf 3: programmeLevel code
    String(disciplineCode),                                     // leaf 4: discipline code
    String(student.batch),                                      // leaf 5: batch year int
    await hashToField(student.email, CHUNK_COUNTS.email),      // leaf 6: email
  ];
  student.salts = salts;
  student.merkleRoot = await computeMerkleRoot(attrs, salts);

  await student.save();

  // Re-issue credential — new IPFS pin + overwrites on-chain CID for this rollNo
  // DEK is REUSED, never rotated (D-04/D-05) — rotating would silently invalidate
  // the Phase 7 ECIES envelope wrapped around the original DEK.
  // CR-02: surface the no-op/failure to the caller via anchorWarning instead of a
  // silent 200 — on-chain merkleRoot has already been updated above (unconditional
  // student.save()), so a skipped/failed re-issuance here means the pinned
  // ciphertext/CID is now stale relative to the on-chain root.
  let anchorWarning = null;
  try {
    if (!student.dek) {
      anchorWarning = 'Credential metadata updated, but re-issuance skipped: no DEK on file.';
      console.error('[credential] updateStudent: missing DEK for', student.rollNo, '— cannot re-issue without rotating');
    } else {
      const dek = Buffer.from(student.dek, 'base64');
      const { cid, safeTxHash } = await issueCredentialOnChain(student, dek);
      student.ciphertextCID = cid;
      student.pendingRegistryAction = { safeTxHash, type: 'issue' };
      await student.save();
    }
  } catch (err) {
    anchorWarning = 'Re-anchoring failed: ' + err.message;
    console.error("[credential] Re-anchoring failed for", student.rollNo, ":", err.message);
  }

  return { student: sanitizeStudent(student), anchorWarning };
}

export async function revokeStudent(id) {
  const student = await Student.findById(id);
  if (!student) throw new AppError("Student not found.", 404);
  if (student.revoked) throw new AppError("Student credential already revoked.", 400);

  // Propose revocation on-chain first — terminal `revoked` state is deferred
  // to the execute-confirmation path (09-03), not set here on propose (D-12).
  let safeTxHash;
  try {
    ({ safeTxHash } = await revokeCredentialOnChain(student.rollNo));
  } catch (err) {
    console.error("[credential] On-chain revocation failed for", student.rollNo, ":", err.message);
    throw new AppError("On-chain revocation failed: " + err.message, 500);
  }

  student.pendingRegistryAction = { safeTxHash, type: 'revoke' };
  await student.save();

  return { student: sanitizeStudent(student) };
}

// Phase 7 (ENROLL-02 / KEY-02): student-claim half of two-phase enrollment.
// On a valid claim against an "awaiting-keypair" student, ECIES-wraps the
// escrowed DEK to the submitted pubkey, pins the envelope to IPFS, then in a
// single atomic write wipes the plaintext dek, stores dekEnvelopeCID, and
// flips enrollmentPhase to "active". D-06: a student may claim only once —
// the enrollmentPhase filter inside findOneAndUpdate closes the TOCTOU
// window between the pre-check and the write (07-RESEARCH.md Pitfall 4 /
// Known Threat Patterns). Pin happens BEFORE the Mongo write (cheap to
// retry, no DEK exposure if the pin fails) so a partial failure never
// leaves the student stuck mid-claim with the plaintext DEK already wiped.
export async function claimCredential(id, pubKeyHex) {
  // dek has select: false (D-02) — must be explicitly selected to wrap it.
  const student = await Student.findById(id).select("+dek");
  if (!student) throw new AppError("Student not found.", 404);
  if (student.revoked) throw new AppError("Cannot claim a revoked credential.", 403);

  // D-06 one-time-claim guard (pre-check; the atomic write below re-checks
  // this same condition in its filter to close the TOCTOU window).
  if (student.enrollmentPhase !== "awaiting-keypair") {
    throw new AppError("This credential has already been claimed.", 409);
  }

  // Fail loudly on a missing DEK — never regenerate (Phase 6 decision).
  if (!student.dek) {
    throw new AppError("No DEK is on file for this student; cannot complete claim.", 500);
  }

  const dekBuffer = Buffer.from(student.dek, "base64");
  const envelopeBase64 = await wrapDEK(pubKeyHex, dekBuffer);

  // Pin FIRST — idempotent-safe to abandon/retry, and the plaintext dek is
  // still intact in Mongo if this step fails (Pitfall 4 ordering).
  const dekEnvelopeCID = await pinEnvelopeToIPFS(envelopeBase64, student.rollNo);

  // Single atomic write: filter re-checks enrollmentPhase (closes TOCTOU),
  // and the $set/$unset together wipe the plaintext dek, store the
  // envelope CID, store the pubkey, and flip the phase in one operation.
  const updated = await Student.findOneAndUpdate(
    { _id: id, enrollmentPhase: "awaiting-keypair" },
    {
      $set: { pubKey: pubKeyHex, dekEnvelopeCID, enrollmentPhase: "active" },
      $unset: { dek: "" },
    },
    { new: true }
  );

  if (!updated) {
    // Another request already flipped the phase between our pre-check and
    // this write — the envelope we just pinned is simply abandoned/orphaned.
    throw new AppError("This credential has already been claimed.", 409);
  }

  return { student: sanitizeStudent(updated) };
}

export async function sendEmailsForStudents(studentIds) {
  if (!Array.isArray(studentIds) || !studentIds.length) {
    throw new AppError("At least one student must be selected.", 400);
  }

  const students = await Student.find({ _id: { $in: studentIds } }).sort({ createdAt: -1 });

  if (!students.length) {
    throw new AppError("No matching students were found.", 404);
  }

  const results = await Promise.all(
    students.map(async (student) => {
      const studentId = student._id.toString();

      if (student.emailSent) {
        return {
          studentId,
          name: student.name,
          email: student.email,
          status: "skipped",
          message: "Email already sent.",
        };
      }

      try {
        await sendCredentialsEmail({
          to: student.email,
          name: student.name,
          email: student.email,
          password: student.password,
        });

        student.emailSent = true;
        student.emailSentAt = new Date();
        await student.save();

        return {
          studentId,
          name: student.name,
          email: student.email,
          status: "sent",
          message: "Credentials sent successfully.",
        };
      } catch (error) {
        return {
          studentId,
          name: student.name,
          email: student.email,
          status: "failed",
          message: error.message || "Email delivery failed.",
        };
      }
    })
  );

  const summary = {
    sent: [],
    skipped: [],
    failed: [],
  };

  for (const result of results) {
    if (result.status === "sent") {
      summary.sent.push(result.studentId);
      continue;
    }

    if (result.status === "skipped") {
      summary.skipped.push({ studentId: result.studentId, reason: result.message });
      continue;
    }

    summary.failed.push({ studentId: result.studentId, reason: result.message });
  }

  return {
    summary,
    details: results,
  };
}