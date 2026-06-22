import express from "express";
import { registerCustodianKey, getCustodianStatus } from "../controllers/custodianController.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = express.Router();

router.use(requireAuth);

router.get("/status", getCustodianStatus);
router.post("/register-key", registerCustodianKey);

export default router;
