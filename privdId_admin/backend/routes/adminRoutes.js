import express from "express";

import { adminLogin, roleLogin } from "../controllers/adminController.js";

const router = express.Router();

router.post("/login", adminLogin);
router.post("/role-login", roleLogin);

export default router;
