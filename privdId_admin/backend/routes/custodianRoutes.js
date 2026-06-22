import express from "express";
import { registerCustodianKey } from "../controllers/custodianController.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = express.Router();

router.use(requireAuth);

router.post("/register-key", registerCustodianKey);

export default router;
