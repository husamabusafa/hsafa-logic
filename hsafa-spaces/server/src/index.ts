import express from "express";
import cors from "cors";
import { bootstrapExtension } from "./lib/service/index.js";
import authRoutes from "./routes/auth.js";
import smartSpacesRoutes from "./routes/smart-spaces.js";
import entitiesRoutes from "./routes/entities.js";
import clientsRoutes from "./routes/clients.js";
import extensionRoutes from "./routes/extension.js";

const app = express();
const PORT = parseInt(process.env.PORT || "3005", 10);

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api", authRoutes);
app.use("/api/smart-spaces", smartSpacesRoutes);
app.use("/api/entities", entitiesRoutes);
app.use("/api/clients", clientsRoutes);
app.use("/api/extension", extensionRoutes);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "hsafa-spaces-server" });
});

// Start
app.listen(PORT, async () => {
  console.log(`[spaces-server] Listening on port ${PORT}`);

  // Bootstrap the extension service (connect to Core, sync tools, etc.)
  try {
    await bootstrapExtension();
  } catch (err) {
    console.error("[spaces-server] Extension bootstrap failed:", err);
  }
});
