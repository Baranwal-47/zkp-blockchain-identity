import jwt from "jsonwebtoken";

import { asyncHandler } from "../middleware/asyncHandler.js";
import AppError from "../utils/appError.js";

const ROLE_PASSWORD_ENV_KEY = {
  acadadmin: "ACADADMIN_PASSWORD",
  registrar: "REGISTRAR_PASSWORD",
  dean: "DEAN_PASSWORD",
};

export const roleLogin = asyncHandler(async (req, res) => {
  const { role, password } = req.body;

  const rolePasswordEnvKey = ROLE_PASSWORD_ENV_KEY[role];
  if (!rolePasswordEnvKey) {
    throw new AppError("Select your role first.", 400);
  }

  const expected = process.env[rolePasswordEnvKey];
  if (!expected) {
    throw new AppError(`${role} authentication is not configured.`, 500);
  }

  if (!password || password !== expected) {
    throw new AppError("Incorrect password for this role. Try again.", 401);
  }

  const token = jwt.sign(
    { role },
    process.env.JWT_SECRET || "privid-admin-secret",
    { expiresIn: "24h" }
  );

  res.json({
    status: "success",
    token,
    role,
  });
});
