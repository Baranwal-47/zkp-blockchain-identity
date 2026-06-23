import { asyncHandler } from "../middleware/asyncHandler.js";
import AppError from "../utils/appError.js";
import Student from "../models/Student.js";
import {
  initiateRecovery as initiateRecoverySession,
  getSession,
  addShare,
  reconstructIfReady,
  runOperation,
  performDeviceLoss,
  performCredentialMod,
  findOpenSessionForStudent,
  submitStudentPubKey,
} from "../services/recoveryService.js";

const CUSTODIAN_ROLES = ["acadadmin", "registrar", "dean"];
const COMPRESSED_SECP256K1_PUBKEY_HEX = /^[0-9a-fA-F]{66}$/;

/**
 * POST /api/recovery/initiate — AcadAdmin-only (locked decision Q1).
 *
 * Loads the student's plaintext Share A from MongoDB and opens a recovery
 * session seeded with it — only ONE additional custodian (registrar or dean)
 * needs to submit a share to reach the 2-of-3 threshold.
 *
 * 11-02 REDESIGN: for device-loss, newPubKey is now OPTIONAL — the admin no
 * longer types the student's new key. The student supplies it later via
 * POST /:sessionId/student-pubkey from their own device (real-world flow:
 * the admin never knows that key). For credential-mod, this endpoint is also
 * now reachable transparently from the Edit-flow's 409 (studentController.js
 * updateStudentById), not just from a manual RecoveryPage form.
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

  // newPubKey is intentionally NOT required for device-loss anymore — the
  // student submits it later via /:sessionId/student-pubkey.

  const sessionId = initiateRecoverySession({
    studentId,
    operationType,
    newPubKey: newPubKey ?? null,
    attributeUpdates,
    shareA: student.custodyShareA,
  });

  res.json({ status: "pending", sessionId, sharesReceived: 1, sharesNeeded: 2 });
});

/**
 * GET /api/recovery/status/:studentId — any custodian role.
 *
 * Lightweight lookup for the AcadAdmin dashboard ("Recovery initiated" /
 * "Waiting for student pubkey" / "Waiting for custodian shares" / no open
 * session) and for the mobile app to discover its own open session + id.
 */
export const getRecoveryStatusForStudent = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const status = findOpenSessionForStudent(studentId);
  res.json({ status: "success", session: status });
});

/**
 * POST /api/recovery/:sessionId/student-pubkey — public to the claiming
 * student's flow (no custodian-role gate; the mobile app calls this with the
 * student's own sessionId, mirroring claimPubkey's unauthenticated pattern).
 *
 * Student-driven half of the device-loss redesign: the student generates a
 * fresh on-device keypair (same generateAndStoreKeypair() as the original
 * claim) and posts ONLY the public key here. Reuses the same either-order
 * completion gate as submitShare — if shares already met threshold, this
 * call is what reconstructs+completes; otherwise it just records the pubkey
 * and waits for the second custodian share.
 */
export const submitRecoveryPubKey = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const { pubKeyHex } = req.body;

  if (!pubKeyHex || typeof pubKeyHex !== "string") {
    throw new AppError("pubKeyHex is required.", 400);
  }
  if (!COMPRESSED_SECP256K1_PUBKEY_HEX.test(pubKeyHex)) {
    throw new AppError("pubKeyHex must be a 66-character hex-encoded compressed secp256k1 public key.", 400);
  }

  const session = submitStudentPubKey(sessionId, pubKeyHex);
  const result = await reconstructIfReady(session);

  if (!result.ready) {
    return res.status(202).json({
      status: "pending",
      sharesReceived: result.sharesReceived,
      waitingOnPubKey: result.waitingOnPubKey,
    });
  }

  const operationResult = await runOperation(sessionId, result.dek, (dek) => performDeviceLoss(session, dek));
  res.json({ status: "complete", operationType: session.operationType, result: operationResult });
});

/**
 * POST /api/recovery/submit-share — any custodian role (acadadmin/registrar/dean).
 *
 * Adds the calling custodian's share to the session. Completion is gated on
 * BOTH the 2-of-3 share threshold AND (for device-loss) the student's pubkey
 * having arrived (11-02 redesign, either order) — reconstructIfReady()
 * returns ready:false with waitingOnPubKey:true if shares hit threshold but
 * the student hasn't submitted their new key yet.
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
    return res.status(202).json({
      status: "pending",
      sharesReceived: result.sharesReceived,
      waitingOnPubKey: result.waitingOnPubKey,
    });
  }

  const opFn =
    session.operationType === "device-loss"
      ? (dek) => performDeviceLoss(session, dek)
      : (dek) => performCredentialMod(session, dek);
  const operationResult = await runOperation(sessionId, result.dek, opFn);

  res.json({ status: "complete", operationType: session.operationType, result: operationResult });
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
