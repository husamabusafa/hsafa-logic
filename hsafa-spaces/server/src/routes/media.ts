import { Router } from "express";
import type { Request, Response } from "express";
import multer from "multer";
import { prisma } from "../lib/db.js";
import {
  requireAnyAuth,
  isAuthError,
} from "../lib/spaces-auth.js";
import { storeFile, ensureStorageDirs, getStoragePath } from "../lib/media-storage.js";
import { speechToText } from "../lib/cartesia.js";
import express from "express";

const router = Router();

// Multer config — memory storage (buffer), 50MB limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// =============================================================================
// POST /api/media/upload — Upload a file
// =============================================================================
router.post("/upload", upload.single("file"), async (req: Request, res: Response) => {
  const auth = await requireAnyAuth(req);
  if (isAuthError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const entityId = auth.entityId;
    if (!entityId) {
      res.status(400).json({ error: "No entity resolved" });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }

    const protocol = req.protocol;
    const hostHeader = req.get("host");
    const host = (Array.isArray(hostHeader) ? hostHeader[0] : hostHeader) || "localhost:3005";
    const baseUrl = `${protocol}://${host}`;

    const result = await storeFile({
      entityId,
      file: {
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        buffer: file.buffer,
      },
      baseUrl,
    });

    res.status(201).json(result);
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Failed to upload file" });
  }
});

// =============================================================================
// GET /api/media/:id — Get asset info
// =============================================================================
router.get("/:id", async (req: Request, res: Response) => {
  const auth = await requireAnyAuth(req);
  if (isAuthError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const assetId = req.params.id as string;
    const asset = await prisma.mediaAsset.findUnique({
      where: { id: assetId },
    });

    if (!asset) {
      res.status(404).json({ error: "Asset not found" });
      return;
    }

    res.json({
      id: asset.id,
      entityId: asset.entityId,
      mimeType: asset.mimeType,
      size: asset.size,
      url: asset.url,
      thumbnailUrl: asset.thumbnailUrl,
      metadata: asset.metadata,
      createdAt: asset.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("Get asset error:", error);
    res.status(500).json({ error: "Failed to get asset" });
  }
});

// =============================================================================
// POST /api/media/upload-voice — Upload voice + run STT transcription
// =============================================================================
router.post("/upload-voice", upload.single("file"), async (req: Request, res: Response) => {
  const auth = await requireAnyAuth(req);
  if (isAuthError(auth)) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  try {
    const entityId = auth.entityId;
    if (!entityId) {
      res.status(400).json({ error: "No entity resolved" });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }

    const protocol = req.protocol;
    const hostHeader = req.get("host");
    const host = (Array.isArray(hostHeader) ? hostHeader[0] : hostHeader) || "localhost:3005";
    const baseUrl = `${protocol}://${host}`;

    // Store the audio file
    const storeResult = await storeFile({
      entityId,
      file: {
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        buffer: file.buffer,
      },
      baseUrl,
    });

    // Run STT transcription via Cartesia
    let transcription = "";
    try {
      const sttResult = await speechToText(file.buffer, file.mimetype);
      transcription = sttResult.text;
    } catch (sttErr) {
      console.warn("[media] STT transcription failed:", sttErr);
      // Non-fatal — return the file without transcription
    }

    res.status(201).json({
      ...storeResult,
      transcription,
    });
  } catch (error) {
    console.error("Voice upload error:", error);
    res.status(500).json({ error: "Failed to upload voice message" });
  }
});

// =============================================================================
// Static file serving for uploaded files — mounted as /api/media/files
// =============================================================================
export async function mountStaticServing(mediaRouter: Router): Promise<void> {
  await ensureStorageDirs();
  mediaRouter.use("/files", express.static(getStoragePath()));
}

export default router;
