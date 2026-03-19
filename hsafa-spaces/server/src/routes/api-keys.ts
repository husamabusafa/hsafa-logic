import { Router } from "express";
import type { Request, Response } from "express";
import { prisma } from "../lib/db.js";
import { verifyToken } from "../lib/auth.js";
import { encrypt, decrypt, keyHint } from "../lib/encryption.js";

const router = Router();

const VALID_PROVIDERS = ["openai", "anthropic", "openrouter"];

// ── JWT auth helper ──────────────────────────────────────────────────────────

async function requireUser(req: Request): Promise<
  { userId: string } | { status: number; error: string }
> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return { status: 401, error: "Unauthorized" };
  }
  const payload = await verifyToken(authHeader.slice(7));
  if (!payload) {
    return { status: 401, error: "Invalid or expired token" };
  }
  return { userId: payload.sub };
}

function isError(r: any): r is { status: number; error: string } {
  return "error" in r;
}

// =============================================================================
// GET /api/api-keys — List user's API keys (hints only, never full key)
// =============================================================================
router.get("/", async (req: Request, res: Response) => {
  const auth = await requireUser(req);
  if (isError(auth)) { res.status(auth.status).json({ error: auth.error }); return; }

  try {
    const keys = await prisma.apiKey.findMany({
      where: { userId: auth.userId },
      select: { id: true, provider: true, keyHint: true, createdAt: true, updatedAt: true },
      orderBy: { provider: "asc" },
    });

    res.json({ apiKeys: keys });
  } catch (error) {
    console.error("List API keys error:", error);
    res.status(500).json({ error: "Failed to list API keys" });
  }
});

// =============================================================================
// PUT /api/api-keys/:provider — Set (create or update) an API key for a provider
// Body: { key: "sk-..." }
// =============================================================================
router.put("/:provider", async (req: Request, res: Response) => {
  const auth = await requireUser(req);
  if (isError(auth)) { res.status(auth.status).json({ error: auth.error }); return; }

  try {
    const provider = req.params.provider as string;
    if (!VALID_PROVIDERS.includes(provider)) {
      res.status(400).json({ error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(", ")}` });
      return;
    }

    const { key } = req.body;
    if (!key || typeof key !== "string" || key.trim().length < 8) {
      res.status(400).json({ error: "A valid API key is required (minimum 8 characters)" });
      return;
    }

    const trimmedKey = key.trim();
    const encryptedKey = encrypt(trimmedKey);
    const hint = keyHint(trimmedKey);

    const apiKey = await prisma.apiKey.upsert({
      where: { userId_provider: { userId: auth.userId, provider } },
      create: {
        userId: auth.userId,
        provider,
        encryptedKey,
        keyHint: hint,
      },
      update: {
        encryptedKey,
        keyHint: hint,
      },
      select: { id: true, provider: true, keyHint: true, createdAt: true, updatedAt: true },
    });

    res.json({ apiKey });
  } catch (error) {
    console.error("Set API key error:", error);
    res.status(500).json({ error: "Failed to save API key" });
  }
});

// =============================================================================
// DELETE /api/api-keys/:provider — Remove an API key
// =============================================================================
router.delete("/:provider", async (req: Request, res: Response) => {
  const auth = await requireUser(req);
  if (isError(auth)) { res.status(auth.status).json({ error: auth.error }); return; }

  try {
    const provider = req.params.provider as string;
    if (!VALID_PROVIDERS.includes(provider)) {
      res.status(400).json({ error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(", ")}` });
      return;
    }

    await prisma.apiKey.deleteMany({
      where: { userId: auth.userId, provider },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Delete API key error:", error);
    res.status(500).json({ error: "Failed to delete API key" });
  }
});

// =============================================================================
// Internal helper: Get decrypted API key for a user + provider
// Used by service layer when triggering haseef runs
// =============================================================================
export async function getDecryptedApiKey(
  userId: string,
  provider: string,
): Promise<string | null> {
  const record = await prisma.apiKey.findUnique({
    where: { userId_provider: { userId, provider } },
    select: { encryptedKey: true },
  });
  if (!record) return null;
  return decrypt(record.encryptedKey);
}

export default router;
