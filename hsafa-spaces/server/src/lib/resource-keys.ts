// =============================================================================
// Per-Resource API Key Helpers
//
// Retrieve and decrypt stored per-haseef and per-scope Core API keys.
// Used by attach/detach routes to prove dual ownership to Core.
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

// ── Scope Keys ──────────────────────────────────────────────────────────────

/**
 * Get the decrypted Core scope key for a scope instance.
 * Returns null if the instance doesn't exist or has no stored key.
 */
export async function getDecryptedScopeKey(
  instanceId: string,
): Promise<string | null> {
  const instance = await prisma.scopeInstance.findUnique({
    where: { id: instanceId },
    select: { coreScopeKey: true },
  });
  if (!instance?.coreScopeKey) return null;
  return decrypt(instance.coreScopeKey);
}

/**
 * Get the decrypted Core scope key by scope name.
 */
export async function getDecryptedScopeKeyByName(
  scopeName: string,
): Promise<string | null> {
  const instance = await prisma.scopeInstance.findUnique({
    where: { scopeName },
    select: { coreScopeKey: true },
  });
  if (!instance?.coreScopeKey) return null;
  return decrypt(instance.coreScopeKey);
}

// ── Scope Key Provisioning ──────────────────────────────────────────────────

/**
 * Request a fresh scope key from Core for a scope instance, store it encrypted.
 * Uses the service key for admin access.
 */
export async function provisionAndStoreScopeKey(
  instanceId: string,
  scopeName: string,
): Promise<string | null> {
  const coreUrl = process.env.HSAFA_CORE_URL || process.env.HSAFA_GATEWAY_URL || "http://localhost:3001";
  const serviceKey = process.env.CORE_SERVICE_KEY || "";
  if (!serviceKey) return null;

  const authHeaders = { "Content-Type": "application/json", "x-api-key": serviceKey };

  // Revoke existing scope keys for this scope (cleanup)
  try {
    const listRes = await fetch(
      `${coreUrl}/api/keys?type=scope&resourceId=${encodeURIComponent(scopeName)}`,
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
  } catch { /* best-effort cleanup */ }

  // Create fresh scope key
  const res = await fetch(`${coreUrl}/api/keys`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      type: "scope",
      resourceId: scopeName,
      description: `Scope key for "${scopeName}" (provisioned by Spaces)`,
    }),
  });

  if (!res.ok) {
    console.error(`[resource-keys] Failed to provision scope key for "${scopeName}" (${res.status})`);
    return null;
  }

  const { key } = await res.json();

  // Store encrypted
  await prisma.scopeInstance.update({
    where: { id: instanceId },
    data: { coreScopeKey: encrypt(key) },
  });

  return key;
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

/**
 * Rotate a scope instance's Core API key.
 */
export async function rotateScopeKey(
  instanceId: string,
): Promise<{ newKeyHint: string } | null> {
  const instance = await prisma.scopeInstance.findUnique({
    where: { id: instanceId },
    select: { scopeName: true },
  });
  if (!instance) return null;

  const newKey = await provisionAndStoreScopeKey(instanceId, instance.scopeName);
  if (!newKey) return null;

  return { newKeyHint: "..." + newKey.slice(-4) };
}
