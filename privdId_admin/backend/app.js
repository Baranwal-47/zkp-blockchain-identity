import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

import studentRoutes from "./routes/studentRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import safeRoutes from "./routes/safeRoutes.js";
import custodianRoutes from "./routes/custodianRoutes.js";
import recoveryRoutes from "./routes/recoveryRoutes.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";

const app = express();
app.set("etag", false);

app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || true,
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(':method :url :status :res[content-length] - :response-time ms'));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", message: "Student service is healthy" });
});

app.use("/api/students", studentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/safe", safeRoutes);
app.use("/api/custodians", custodianRoutes);
app.use("/api/recovery", recoveryRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;