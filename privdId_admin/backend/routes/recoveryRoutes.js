import express from "express";
import {
  initiateRecovery,
  submitShare,
  getMyShare,
  getRecoveryStatusForStudent,
  listRecoveryStatuses,
  submitRecoveryPubKey,
} from "../controllers/recoveryController.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = express.Router();

// Student-facing routes — NOT gated by requireAuth (mobile app has no admin
// JWT; mirrors the unauthenticated claimPubkey/loginStudent pattern in
// studentRoutes.js). Must be registered BEFORE router.use(requireAuth) below.
router.post("/:sessionId/student-pubkey", submitRecoveryPubKey);
// Single-student status lookup — the student authenticates by knowing their
// own studentId (post-login), same trust level as the rest of the
// unauthenticated student-facing API surface.
router.get("/status/:studentId", getRecoveryStatusForStudent);

router.use(requireAuth);

router.post("/initiate", initiateRecovery);
router.post("/submit-share", submitShare);
router.get("/:sessionId/my-share", getMyShare);
// Bulk status lookup is admin-only (dashboard status pills across all rows).
router.get("/status", listRecoveryStatuses);

export default router;
