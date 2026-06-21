import express from "express";

import { getPendingApprovals, signPendingTx, executePendingTx } from "../controllers/safeController.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = express.Router();

router.use(requireAuth);

router.get("/pending", getPendingApprovals);
router.post("/sign", signPendingTx);
router.post("/execute", executePendingTx);

export default router;
