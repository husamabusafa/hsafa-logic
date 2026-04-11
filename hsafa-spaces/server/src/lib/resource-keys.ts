// =============================================================================
// Per-Resource API Key Helpers
//
// Retrieve and decrypt stored per-haseef Core API keys.
// =============================================================================

import { prisma } from "./db.js";
import { decrypt, encrypt } from "./encryption.js";

// ── Haseef Keys ─────────────────────────────────────────────────────────────

/**
 * Get the decrypted Core API key for a haseef owned by a user.
 * Returns null if the ownership record doesn't exist or has no stored key.
 */
export async function getDecryptedHaseefKey(
  userId: string,
  haseefId: string,
): Promise<string | null> {
  const ownership = await prisma.haseefOwnership.findUnique({
    where: { userId_haseefId: { userId, haseefId } },
    select: { coreApiKey: true },
  });
  if (!ownership?.coreApiKey) return null;
  return decrypt(ownership.coreApiKey);
}

// ── Key Rotation ────────────────────────────────────────────────────────────

/**
 * Rotate a haseef's Core API key: ask Core to issue a new key, update local storage.
 */
export async function rotateHaseefKey(
  userId: string,
  haseefId: string,
): Promise<{ newKeyHint: string } | null> {
  const coreUrl = process.env.HSAFA_CORE_URL || process.env.HSAFA_GATEWAY_URL || "http://localhost:3001";
  const serviceKey = process.env.CORE_SERVICE_KEY || "";
  if (!serviceKey) return null;

  const authHeaders = { "Content-Type": "application/json", "x-api-key": serviceKey };

  // List existing haseef keys and revoke them
  try {
    const listRes = await fetch(
      `${coreUrl}/api/keys?type=haseef&resourceId=${encodeURIComponent(haseefId)}`,
      { headers: authHeaders },
    );
    if (listRes.ok) {
      const { keys } = await listRes.json();
      for (const k of keys ?? []) {
        await fetch(`${coreUrl}/api/keys/${k.id}/revoke`, {
          method: "POST",
          headers: authHeaders,
        });
      }
    }
  } catch { /* best-effort */ }

  // Create new haseef key
  const res = await fetch(`${coreUrl}/api/keys`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      type: "haseef",
      resourceId: haseefId,
      description: `Haseef key (rotated by Spaces)`,
    }),
  });

  if (!res.ok) return null;

  const { key } = await res.json();

  // Update encrypted key in ownership record
  await prisma.haseefOwnership.updateMany({
    where: { userId, haseefId },
    data: { coreApiKey: encrypt(key) },
  });

  return { newKeyHint: "..." + key.slice(-4) };
}
