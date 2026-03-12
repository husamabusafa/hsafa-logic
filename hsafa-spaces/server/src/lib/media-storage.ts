import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { prisma } from "./db.js";

// =============================================================================
// Media Storage — local disk storage with thumbnail generation
//
// Configurable via MEDIA_STORAGE_PATH env var (defaults to ./uploads)
// =============================================================================

const STORAGE_PATH = process.env.MEDIA_STORAGE_PATH || "./uploads";
const THUMB_DIR = "thumbnails";
const THUMB_MAX_WIDTH = 400;
const THUMB_MAX_HEIGHT = 400;

const IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/bmp",
  "image/tiff",
];

// =============================================================================
// Ensure storage directories exist
// =============================================================================

export async function ensureStorageDirs(): Promise<void> {
  await fs.mkdir(path.join(STORAGE_PATH, THUMB_DIR), { recursive: true });
}

// =============================================================================
// Store a file and create a MediaAsset record
// =============================================================================

export interface StoreFileParams {
  entityId: string;
  file: {
    originalname: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
  };
  baseUrl: string;
}

export interface StoreFileResult {
  mediaId: string;
  url: string;
  thumbnailUrl: string | null;
  mimeType: string;
  size: number;
  metadata: Record<string, unknown>;
}

export async function storeFile(params: StoreFileParams): Promise<StoreFileResult> {
  const { entityId, file, baseUrl } = params;

  await ensureStorageDirs();

  // Generate unique filename
  const ext = path.extname(file.originalname) || mimeToExt(file.mimetype);
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
  const filePath = path.join(STORAGE_PATH, filename);

  // Write file to disk
  await fs.writeFile(filePath, file.buffer);

  // Build URL
  const url = `${baseUrl}/api/media/files/${filename}`;

  // Generate thumbnail for images
  let thumbnailUrl: string | null = null;
  const assetMetadata: Record<string, unknown> = {
    originalName: file.originalname,
  };

  if (IMAGE_MIME_TYPES.includes(file.mimetype)) {
    try {
      const image = sharp(file.buffer);
      const imageMetadata = await image.metadata();

      assetMetadata.width = imageMetadata.width;
      assetMetadata.height = imageMetadata.height;

      // Generate thumbnail
      const thumbFilename = `thumb-${filename}`;
      const thumbPath = path.join(STORAGE_PATH, THUMB_DIR, thumbFilename);

      await image
        .resize(THUMB_MAX_WIDTH, THUMB_MAX_HEIGHT, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toFile(thumbPath);

      thumbnailUrl = `${baseUrl}/api/media/files/${THUMB_DIR}/${thumbFilename}`;
    } catch (err) {
      console.warn("[media-storage] Thumbnail generation failed:", err);
    }
  }

  // Create database record
  const asset = await prisma.mediaAsset.create({
    data: {
      entityId,
      mimeType: file.mimetype,
      size: file.size,
      url,
      thumbnailUrl,
      metadata: assetMetadata as any,
    },
  });

  return {
    mediaId: asset.id,
    url,
    thumbnailUrl,
    mimeType: file.mimetype,
    size: file.size,
    metadata: assetMetadata,
  };
}

// =============================================================================
// Get file path for serving
// =============================================================================

export function getFilePath(filename: string): string {
  return path.join(STORAGE_PATH, filename);
}

export function getStoragePath(): string {
  return STORAGE_PATH;
}

// =============================================================================
// Helpers
// =============================================================================

function mimeToExt(mimeType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/ogg": ".ogg",
    "audio/webm": ".webm",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "application/pdf": ".pdf",
    "text/plain": ".txt",
  };
  return map[mimeType] || ".bin";
}
