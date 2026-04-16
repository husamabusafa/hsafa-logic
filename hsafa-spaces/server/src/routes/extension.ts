import { Router } from "express";
import type { Request, Response } from "express";

const router = Router();

// =============================================================================
// Extension Routes (v7)
//
// NOTE: The old V5 manifest + context endpoints have been removed.
//   - Tools are now registered globally via SDK.registerTools()
//   - Per-haseef instructions are synced via core-api.ts → PATCH configJson
//
// Remaining: GET /api/extension/status — health check for the service module
// =============================================================================

// GET /api/extension/status — Service health check
router.get("/status", (_req: Request, res: Response) => {
  res.json({ status: "ok", message: "Spaces service v7 — SDK over SSE" });
});

export default router;
