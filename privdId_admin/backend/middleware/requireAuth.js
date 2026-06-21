import jwt from "jsonwebtoken";

import AppError from "../utils/appError.js";

// Stateless JWT verification only — no bcrypt, no session store (HARD-01
// stays deferred). Verifies against the SAME secret + fallback adminController
// uses to sign role-login tokens (jwt.sign({ role }, process.env.JWT_SECRET ||
// "privid-admin-secret", ...)), so role-login tokens validate here.
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return next(new AppError("Authentication required.", 401));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "privid-admin-secret");
    req.user = decoded;
    return next();
  } catch (_error) {
    return next(new AppError("Invalid or expired session.", 401));
  }
}

export default requireAuth;
