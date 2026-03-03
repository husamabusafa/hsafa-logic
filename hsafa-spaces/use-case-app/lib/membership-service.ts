import { prisma } from "./db";

// =============================================================================
// Space Membership Service
//
// Cached membership queries for performance.
// =============================================================================

const CACHE_TTL_MS = 60_000;

// ── Types ────────────────────────────────────────────────────────────────────

export interface SpaceMember {
  entityId: string;
  displayName: string;
  type: string;
}

export interface SpaceMembershipInfo {
  spaceId: string;
  spaceName: string;
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

// ── Cache storage ────────────────────────────────────────────────────────────

/** entityId → spaces the entity belongs to */
const entitySpacesCache = new Map<string, CacheEntry<SpaceMembershipInfo[]>>();

/** spaceId → members in that space */
const spaceMembersCache = new Map<string, CacheEntry<SpaceMember[]>>();

function isExpired<T>(entry: CacheEntry<T> | undefined): boolean {
  return !entry || Date.now() > entry.expiresAt;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Get all spaces an entity belongs to.
 */
export async function getSpacesForEntity(
  entityId: string
): Promise<SpaceMembershipInfo[]> {
  const cached = entitySpacesCache.get(entityId);
  if (!isExpired(cached)) return cached!.data;

  const memberships = await prisma.smartSpaceMembership.findMany({
    where: { entityId },
    include: { smartSpace: { select: { id: true, name: true } } },
  });

  const data = memberships.map((m) => ({
    spaceId: m.smartSpaceId,
    spaceName: m.smartSpace.name ?? "Unnamed",
  }));

  entitySpacesCache.set(entityId, {
    data,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return data;
}

/**
 * Get all members of a space.
 */
export async function getMembersOfSpace(
  spaceId: string
): Promise<SpaceMember[]> {
  const cached = spaceMembersCache.get(spaceId);
  if (!isExpired(cached)) return cached!.data;

  const memberships = await prisma.smartSpaceMembership.findMany({
    where: { smartSpaceId: spaceId },
    include: {
      entity: { select: { id: true, displayName: true, type: true } },
    },
  });

  const data = memberships.map((m) => ({
    entityId: m.entity.id,
    displayName: m.entity.displayName ?? m.entity.id,
    type: m.entity.type,
  }));

  spaceMembersCache.set(spaceId, {
    data,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return data;
}

/**
 * Get the name of a space by ID.
 */
export async function getSpaceName(spaceId: string): Promise<string> {
  const space = await prisma.smartSpace.findUnique({
    where: { id: spaceId },
    select: { name: true },
  });
  return space?.name ?? "Unnamed";
}

/**
 * Invalidate all caches for a space. Call on member add/remove.
 */
export function invalidateSpace(spaceId: string): void {
  spaceMembersCache.delete(spaceId);
  entitySpacesCache.clear();
}

/**
 * Invalidate caches for a specific entity.
 */
export function invalidateEntity(entityId: string): void {
  entitySpacesCache.delete(entityId);
}
