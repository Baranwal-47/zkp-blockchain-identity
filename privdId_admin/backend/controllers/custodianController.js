import fs from "fs";
import { asyncHandler } from "../middleware/asyncHandler.js";
import AppError from "../utils/appError.js";
import { registerCustodianPublicKey } from "../services/custodianService.js";

const ROLE_PATH_ENV = { registrar: "REGISTRAR_PUBLIC_KEY_PATH", dean: "DEAN_PUBLIC_KEY_PATH" };

export const getCustodianStatus = asyncHandler(async (req, res) => {
  const statuses = {};
  for (const [role, envVar] of Object.entries(ROLE_PATH_ENV)) {
    const p = process.env[envVar];
    statuses[role] = p ? fs.existsSync(p) : false;
  }
  res.json({ status: "success", registered: statuses });
});

export const registerCustodianKey = asyncHandler(async (req, res) => {
  const { role, publicKeyPem } = req.body;

  if (!role || !["registrar", "dean"].includes(role)) {
    throw new AppError("role must be 'registrar' or 'dean'.", 400);
  }
  if (typeof publicKeyPem !== "string" || !publicKeyPem.trim()) {
    throw new AppError("publicKeyPem must be a non-empty string.", 400);
  }

  // Role-ownership: an official may only register their own role's key (V4 access control).
  if (req.user.role !== role) {
    throw new AppError("You may only register your own role's custodian key.", 403);
  }

  await registerCustodianPublicKey(role, publicKeyPem);
  res.json({ status: "success", role });
});
