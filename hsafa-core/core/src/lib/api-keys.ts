// =============================================================================
// API Key Generation & Validation
//
// Key format: hsk_{type}_{24 random hex chars}
//   hsk_haseef_abc123...  — per-haseef key
//   hsk_scope_abc123...   — per-scope key
//   hsk_service_abc123... — service (admin) key
//
// Keys are stored as SHA-256 hashes in the DB. The plaintext is returned
// exactly once on creation and never stored.
// =============================================================================

import crypto from 'crypto';
import { prisma } from './db.js';

export type KeyType = 'haseef' | 'scope' | 'service';

/** Generate a cryptographically random API key with type prefix */
function generateRawKey(type: KeyType): string {
  const random = crypto.randomBytes(24).toString('hex'); // 48 hex chars
  return `hsk_${type}_${random}`;
}

/** SHA-256 hash a key for storage */
export function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Create a new API key and store its hash in the DB.
 * Returns the plaintext key (one-time — never stored).
 */
export async function createApiKey(opts: {
  type: KeyType;
  resourceId?: string;
  description?: string;
}): Promise<{ key: string; record: { id: string; keyPrefix: string; keyType: string; resourceId: string | null } }> {
  const rawKey = generateRawKey(opts.type);
  const keyHashValue = hashKey(rawKey);
  const keyPrefix = rawKey.slice(0, 16); // "hsk_haseef_abcd" — enough to identify

  const record = await prisma.coreApiKey.create({
    data: {
      keyHash: keyHashValue,
      keyPrefix: keyPrefix,
      keyType: opts.type,
      resourceId: opts.resourceId ?? null,
      description: opts.description ?? null,
      active: true,
    },
    select: { id: true, keyPrefix: true, keyType: true, resourceId: true },
  });

  return { key: rawKey, record };
}

/**
 * Validate a key and return its metadata.
 * Returns null if the key is invalid or inactive.
 */
export async function validateKey(rawKey: string): Promise<{
  id: string;
  keyType: KeyType;
  resourceId: string | null;
} | null> {
  if (!rawKey || !rawKey.startsWith('hsk_')) return null;

  const keyHashValue = hashKey(rawKey);
  const record = await prisma.coreApiKey.findUnique({
    where: { keyHash: keyHashValue },
    select: { id: true, keyType: true, resourceId: true, active: true },
  });

  if (!record || !record.active) return null;

  // Touch lastUsedAt (fire-and-forget)
  prisma.coreApiKey.update({
    where: { id: record.id },
    data: { lastUsedAt: new Date() },
  }).catch(() => {});

  return {
    id: record.id,
    keyType: record.keyType as KeyType,
    resourceId: record.resourceId,
  };
}

/**
 * Revoke (deactivate) a key by ID.
 */
export async function revokeKey(keyId: string): Promise<boolean> {
  try {
    await prisma.coreApiKey.update({
      where: { id: keyId },
      data: { active: false },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Rotate a key: revoke the old one and create a new one for the same resource.
 * Returns the new plaintext key.
 */
export async function rotateKey(keyId: string): Promise<{ key: string } | null> {
  const existing = await prisma.coreApiKey.findUnique({
    where: { id: keyId },
    select: { keyType: true, resourceId: true, description: true },
  });
  if (!existing) return null;

  // Revoke old
  await revokeKey(keyId);

  // Create new
  const { key } = await createApiKey({
    type: existing.keyType as KeyType,
    resourceId: existing.resourceId ?? undefined,
    description: existing.description ?? undefined,
  });

  return { key };
}
