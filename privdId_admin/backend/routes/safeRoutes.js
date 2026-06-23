import express from "express";

import { getPendingApprovals, getAwaitingProposal, buildProposal, submitProposal, rejectProposal, signPendingTx, executePendingTx } from "../controllers/safeController.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = express.Router();

router.use(requireAuth);

router.get("/pending", getPendingApprovals);
router.get("/awaiting-proposal", getAwaitingProposal);
router.post("/propose-build", buildProposal);
router.post("/propose", submitProposal);
router.post("/reject", rejectProposal);
router.post("/sign", signPendingTx);
router.post("/execute", executePendingTx);

export default router;
