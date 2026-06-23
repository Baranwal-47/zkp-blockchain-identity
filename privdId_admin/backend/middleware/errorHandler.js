import multer from "multer";

import AppError from "../utils/appError.js";

export function notFound(_req, _res, next) {
  next(new AppError("Route not found", 404));
}

export function errorHandler(error, _req, res, _next) {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      status: "fail",
      message: error.message,
    });
  }

  if (error.code === 11000) {
    const duplicateFields = Object.keys(error.keyValue || {});
    return res.status(409).json({
      status: "fail",
      message: `Duplicate value for ${duplicateFields.join(", ") || "unique field"}.`,
    });
  }

  if (error.name === "ValidationError") {
    return res.status(400).json({
      status: "fail",
      message: error.message,
    });
  }

  if (error.isJoi) {
    return res.status(400).json({
      status: "fail",
      message: "Validation failed",
      details: error.details,
    });
  }

  const statusCode = error.statusCode || 500;
  if (statusCode >= 500) {
    console.error(`[error] ${error.message}`, error.stack?.split("\n")[1]?.trim() || "");
  }
  const payload = {
    status: error.status || "error",
    message: error.message || "Internal server error",
  };

  if (error.details) {
    payload.details = error.details;
  }

  return res.status(statusCode).json(payload);
}