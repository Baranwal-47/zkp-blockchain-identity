import multer from "multer";

import AppError from "../utils/appError.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validateStudentPayload } from "../validators/studentValidator.js";
import { parseStudentsFromWorkbook } from "../utils/excelParser.js";
import {
  buildBulkStudents,
  createStudent,
  findDuplicateStudent,
  insertBulkStudents,
  listStudents,
  normalizeStudentInput,
  sanitizeStudent,
  sendEmailsForStudents,
  updateStudent,
  revokeStudent,
  claimCredential,
} from "../services/studentService.js";
import Student from "../models/Student.js";
import Joi from "joi";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function extractValidationMessage(error) {
  return error.details.map((detail) => detail.message).join(", ");
}

function validateExcelRows(rows) {
  const validRows = [];
  const errors = [];

  rows.forEach((row) => {
    const { error, value } = validateStudentPayload(row);

    if (error) {
      errors.push({ row: row.rowNumber, message: extractValidationMessage(error) });
      return;
    }

    validRows.push(normalizeStudentInput(value));
  });

  return { validRows, errors };
}

const sendEmailSchema = Joi.object({
  studentIds: Joi.array().items(Joi.string().trim().required()).min(1).required(),
});

const bulkStudentsSchema = Joi.array()
  .items(
    Joi.object({
      name: Joi.string().trim().min(2).max(120).required(),
      email: Joi.string().trim().email().required(),
      rollNo: Joi.string().trim().min(1).max(50).required(),
      programme: Joi.string().trim().min(2).max(120).required(),
      contactNo: Joi.string().trim().min(5).max(20).required(),
    })
  )
  .min(1)
  .required();

export const uploadMiddleware = upload.single("file");

export const getStudents = asyncHandler(async (_req, res) => {
  const students = await listStudents();

  res.json({
    status: "success",
    count: students.length,
    students,
  });
});

export const addStudent = asyncHandler(async (req, res) => {
  const { error, value } = validateStudentPayload(req.body);

  if (error) {
    throw new AppError("Validation failed", 400, error.details);
  }

  const normalizedValue = normalizeStudentInput(value);

  const duplicate = await findDuplicateStudent(normalizedValue);

  if (duplicate) {
    throw new AppError("A student with the same email or roll number already exists.", 409);
  }

  const result = await createStudent(normalizedValue);

  res.status(201).json({
    status: "success",
    message: "Student created successfully. You can send credentials from the dashboard.",
    student: result.student,
  });
});

export const uploadStudents = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError("Please upload an Excel file.", 400);
  }

  const parsedRows = parseStudentsFromWorkbook(req.file.buffer);
  const { validRows, errors } = validateExcelRows(parsedRows);

  if (errors.length) {
    throw new AppError("One or more rows failed validation.", 400, { rowErrors: errors });
  }

  if (!validRows.length) {
    throw new AppError("The uploaded workbook does not contain any student rows.", 400);
  }

  const duplicateRows = [];
  const seenEmails = new Set();
  const seenRollNos = new Set();

  validRows.forEach((row) => {
    const normalizedEmail = row.email.toLowerCase();

    if (seenEmails.has(normalizedEmail) || seenRollNos.has(row.rollNo)) {
      duplicateRows.push({ email: row.email, rollNo: row.rollNo });
      return;
    }

    seenEmails.add(normalizedEmail);
    seenRollNos.add(row.rollNo);
  });

  if (duplicateRows.length) {
    throw new AppError("Duplicate email or roll number found inside the uploaded file.", 409, duplicateRows);
  }

  const databaseMatches = await Student.find({
    $or: validRows.flatMap((row) => [
      { email: row.email },
      { rollNo: row.rollNo },
    ]),
  }).select("email rollNo");

  if (databaseMatches.length) {
    throw new AppError("Some uploaded students already exist in the database.", 409, {
      duplicates: databaseMatches,
    });
  }

  const preparedStudents = await buildBulkStudents(validRows);
  const result = await insertBulkStudents(preparedStudents);

  res.status(201).json({
    status: "success",
    message: `Students uploaded: ${result.anchorSummary.anchored}/${result.anchorSummary.total} anchored, ${result.anchorSummary.pending} pending retry.`,
    count: result.insertedStudents.length,
    students: result.insertedStudents,
    anchorSummary: result.anchorSummary,
  });
});

export const bulkAddStudents = asyncHandler(async (req, res) => {
  const { error, value: rows } = bulkStudentsSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    throw new AppError("Validation failed", 400, error.details);
  }

  const normalizedRows = rows.map(normalizeStudentInput);

  // Check for duplicates within the submitted list
  const seenEmails = new Set();
  const seenRollNos = new Set();
  const internalDuplicates = [];

  normalizedRows.forEach((row) => {
    if (seenEmails.has(row.email) || seenRollNos.has(row.rollNo)) {
      internalDuplicates.push({ email: row.email, rollNo: row.rollNo });
    } else {
      seenEmails.add(row.email);
      seenRollNos.add(row.rollNo);
    }
  });

  if (internalDuplicates.length) {
    throw new AppError("Duplicate email or roll number found in submitted list.", 409, internalDuplicates);
  }

  // Check against existing DB records
  const databaseMatches = await Student.find({
    $or: normalizedRows.flatMap((row) => [{ email: row.email }, { rollNo: row.rollNo }]),
  }).select("email rollNo");

  if (databaseMatches.length) {
    throw new AppError("Some students already exist in the database.", 409, {
      duplicates: databaseMatches,
    });
  }

  const preparedStudents = await buildBulkStudents(normalizedRows);
  const result = await insertBulkStudents(preparedStudents);

  res.status(201).json({
    status: "success",
    message: `${result.anchorSummary.anchored}/${result.anchorSummary.total} student(s) anchored successfully, ${result.anchorSummary.pending} pending retry.`,
    count: result.insertedStudents.length,
    students: result.insertedStudents,
    anchorSummary: result.anchorSummary,
  });
});

export const loginStudent = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new AppError("Email and password are required.", 400);
  }

  const student = await Student.findOne({ email: String(email).toLowerCase().trim() });

  if (!student || student.password !== String(password)) {
    throw new AppError("Invalid email or password.", 401);
  }

  if (student.revoked) {
    throw new AppError("This credential has been revoked. Please contact your institution.", 403);
  }

  res.json({
    status: "success",
    student: sanitizeStudent(student),
  });
});

export const getStudentById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const student = await Student.findById(id);
  if (!student) throw new AppError("Student not found.", 404);
  res.json({ status: "success", student: sanitizeStudent(student) });
});

// Phase 8 (ACCESS-01): daily-access lookup by rollNo — returns ONLY the two
// IPFS CIDs (ciphertextCID + dekEnvelopeCID) needed for on-device decryption,
// never the full sanitized student object. Gated on enrollmentPhase==="active"
// so a student who hasn't claimed their keypair yet gets a 403, not stale/null CIDs.
export const getCredentialBlobs = asyncHandler(async (req, res) => {
  const { rollNo } = req.params;
  const student = await Student.findOne({ rollNo });
  if (!student) throw new AppError("Student not found.", 404);
  if (student.enrollmentPhase !== "active") {
    throw new AppError("Student has not completed enrollment.", 403);
  }
  if (!student.ciphertextCID || !student.dekEnvelopeCID) {
    throw new AppError("Credential blobs are not available for this student.", 404);
  }
  res.json({
    status: "success",
    ciphertextCID: student.ciphertextCID,
    dekEnvelopeCID: student.dekEnvelopeCID,
  });
});

export const updateStudentById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await updateStudent(id, req.body);
  // CR-02: surface anchorWarning so the admin UI can detect on-chain/off-chain
  // divergence (merkleRoot updated but ciphertext re-issuance skipped/failed).
  res.json({
    status: result.anchorWarning ? "warning" : "success",
    message: result.anchorWarning
      ? "Student metadata updated, but credential re-issuance did not complete."
      : "Student updated and credential re-issued on IPFS and blockchain.",
    student: result.student,
    anchorWarning: result.anchorWarning ?? null,
  });
});

export const revokeStudentById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await revokeStudent(id);
  res.json({
    status: "success",
    message: "Student credential revoked on blockchain.",
    student: result.student,
  });
});

// Phase 7 (ENROLL-02 / KEY-02): student-claim half of two-phase enrollment.
// T-07-02: validates pubKeyHex looks like a compressed secp256k1 public key
// (66 hex chars) BEFORE delegating to claimCredential, so malformed/oversized
// input is rejected with 400 ahead of eciesjs.encrypt. AppErrors thrown by
// claimCredential (404/403/409/500) are NOT caught here — asyncHandler
// forwards them to the error middleware so the service's status codes
// (e.g. 409 on repeat claim) surface unchanged.
const COMPRESSED_SECP256K1_PUBKEY_HEX = /^[0-9a-fA-F]{66}$/;

export const claimPubkey = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { pubKeyHex } = req.body;

  if (!pubKeyHex || typeof pubKeyHex !== "string") {
    throw new AppError("pubKeyHex is required.", 400);
  }
  if (!COMPRESSED_SECP256K1_PUBKEY_HEX.test(pubKeyHex)) {
    throw new AppError("pubKeyHex must be a 66-character hex-encoded compressed secp256k1 public key.", 400);
  }

  const result = await claimCredential(id, pubKeyHex);

  res.json({
    status: "success",
    student: result.student,
  });
});

export const sendStudentEmails = asyncHandler(async (req, res) => {
  const { error, value } = sendEmailSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    throw new AppError("Please select at least one student.", 400, error.details);
  }

  const result = await sendEmailsForStudents(value.studentIds);

  res.status(200).json({
    status: "success",
    message: "Email processing finished.",
    summary: result.summary,
    details: result.details,
  });
});