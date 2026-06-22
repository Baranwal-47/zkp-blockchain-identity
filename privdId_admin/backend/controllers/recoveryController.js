import { asyncHandler } from "../middleware/asyncHandler.js";
import AppError from "../utils/appError.js";
import Student from "../models/Student.js";
import {
  initiateRecovery as initiateRecoverySession,
  getSession,
  addShare,
  reconstructIfReady,
  runOperation,
} from "../services/recoveryService.js";

const CUSTODIAN_ROLES = ["acadadmin", "registrar", "dean"];

/**
 * POST /api/recovery/initiate — AcadAdmin-only (locked decision Q1).
 *
 * Loads the student's plaintext Share A from MongoDB and opens a recovery
 * session seeded with it — only ONE additional custodian (registrar or dean)
 * needs to submit a share to reach the 2-of-3 threshold.
 */
export const initiateRecovery = asyncHandler(async (req, res) => {
  if (req.user.role !== "acadadmin") {
    throw new AppError("Only the AcadAdmin can initiate a recovery session.", 403);
  }

  const { studentId, operationType, newPubKey, attributeUpdates } = req.body;

  if (!studentId) {
    throw new AppError("studentId is required.", 400);
  }

  const student = await Student.findById(studentId).select("+custodyShareA");
  if (!student) {
    throw new AppError("Student not found.", 404);
  }
  if (student.erased) {
    throw new AppError("This credential has been erased; recovery is not possible.", 409);
  }
  if (!student.custodyShareA) {
    throw new AppError("This student has no custodial Share A on record.", 409);
  }

  if (operationType === "device-loss" && (typeof newPubKey !== "string" || !newPubKey.trim())) {
    throw new AppError("newPubKey is required for device-loss recovery.", 400);
  }

  const sessionId = initiateRecoverySession({
    studentId,
    operationType,
    newPubKey,
    attributeUpdates,
    shareA: student.custodyShareA,
  });

  res.json({ status: "pending", sessionId, sharesReceived: 1, sharesNeeded: 2 });
});

/**
 * POST /api/recovery/submit-share — any custodian role (acadadmin/registrar/dean).
 *
 * Adds the calling custodian's share to the session. At threshold (2 distinct
 * roles), reconstructs the DEK and immediately wipes it via runOperation — this
 * plan has no Case A/Case B operation yet, so the operationFn is a no-op.
 */
export const submitShare = asyncHandler(async (req, res) => {
  const { sessionId, shareHex } = req.body;

  if (!sessionId || !shareHex) {
    throw new AppError("sessionId and shareHex are required.", 400);
  }

  if (!CUSTODIAN_ROLES.includes(req.user.role)) {
    throw new AppError("Your role may not submit a recovery share.", 403);
  }

  const session = addShare(sessionId, req.user.role, shareHex);
  const result = await reconstructIfReady(session);

  if (!result.ready) {
    return res.status(202).json({ status: "pending", sharesReceived: result.sharesReceived });
  }

  // TODO(11-02): replace the no-op operationFn with Case A / Case B dispatch by operationType
  await runOperation(sessionId, result.dek, async () => {});

  res.json({ status: "reconstructed" });
});

/**
 * GET /api/recovery/:sessionId/my-share — wrapped-share lookup for the calling
 * custodian's own role (read-only; does NOT count as a share submission).
 */
export const getMyShare = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;

  if (req.user.role === "acadadmin") {
    throw new AppError("AcadAdmin's share is already preloaded; nothing to fetch.", 400);
  }

  const session = getSession(sessionId);
  if (!session) {
    throw new AppError("Recovery session not found or expired.", 404);
  }

  const field =
    req.user.role === "registrar" ? "custodyShareB" : req.user.role === "dean" ? "custodyShareC" : null;
  if (!field) {
    throw new AppError("Your role does not hold a custodial share.", 403);
  }

  const student = await Student.findById(session.studentId).select(`+${field}`);
  if (!student) {
    throw new AppError("Student not found.", 404);
  }
  if (!student[field]) {
    throw new AppError("No wrapped share found for your role on this student.", 409);
  }

  res.json({ wrappedShare: student[field], role: req.user.role });
});
