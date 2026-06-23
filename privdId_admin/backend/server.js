import app from "./app.js";
import { connectDatabase } from "./config/db.js";
import { clearStuckIssuerNonce } from "./services/credentialService.js";

const port = process.env.PORT || 5000;

async function startServer() {
  await connectDatabase();
  await clearStuckIssuerNonce().catch((err) =>
    console.error("[startup] Stuck-nonce check failed (continuing):", err.message)
  );

  app.listen(port, () => {
    console.log(`API server running on port ${port}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});