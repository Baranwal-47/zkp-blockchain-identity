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

// Student-facing route — NOT gated by requireAuth (mobile app has no admin
// JWT; mirrors the unauthenticated claimPubkey pattern in studentRoutes.js).
// Must be registered BEFORE router.use(requireAuth) below.
router.post("/:sessionId/student-pubkey", submitRecoveryPubKey);

router.use(requireAuth);

router.post("/initiate", initiateRecovery);
router.post("/submit-share", submitShare);
router.get("/:sessionId/my-share", getMyShare);
// /status (bulk) must be registered BEFORE /status/:studentId — Express
// matches in registration order and /status/:studentId would otherwise
// swallow a bare GET /status with studentId="" never matching anyway, but
// keeping bulk-first avoids any ambiguity as routes grow.
router.get("/status", listRecoveryStatuses);
router.get("/status/:studentId", getRecoveryStatusForStudent);

export default router;
