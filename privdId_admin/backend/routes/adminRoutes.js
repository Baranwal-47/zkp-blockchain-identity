import express from "express";

import { roleLogin } from "../controllers/adminController.js";

const router = express.Router();

// Old generic ADMIN_PASSWORD login retired — the Academic Admin role
// (/role-login with role=acadadmin) is now the full registry admin.
router.post("/role-login", roleLogin);

export default router;
