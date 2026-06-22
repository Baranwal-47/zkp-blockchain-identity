import express from "express";
import { initiateRecovery, submitShare, getMyShare } from "../controllers/recoveryController.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = express.Router();

router.use(requireAuth);

router.post("/initiate", initiateRecovery);
router.post("/submit-share", submitShare);
router.get("/:sessionId/my-share", getMyShare);

export default router;
