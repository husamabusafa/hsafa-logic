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

/** entityId → { displayName, type } */
const entityInfoCache = new Map<string, CacheEntry<{ displayName: string; type: string }>>();

/** spaceId → spaceName */
const spaceNameCache = new Map<string, CacheEntry<string>>();

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
 * Get entity display name and type (cached).
 */
export async function getEntityInfo(
  entityId: string,
): Promise<{ displayName: string; type: string }> {
  const cached = entityInfoCache.get(entityId);
  if (!isExpired(cached)) return cached!.data;

  const entity = await prisma.entity.findUnique({
    where: { id: entityId },
    select: { displayName: true, type: true },
  });

  const data = {
    displayName: entity?.displayName ?? "Unknown",
    type: entity?.type ?? "human",
  };

  entityInfoCache.set(entityId, {
    data,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return data;
}

/**
 * Get space name (cached).
 */
export async function getSpaceName(
  spaceId: string,
): Promise<string> {
  const cached = spaceNameCache.get(spaceId);
  if (!isExpired(cached)) return cached!.data;

  const space = await prisma.smartSpace.findUnique({
    where: { id: spaceId },
    select: { name: true },
  });

  const name = space?.name ?? spaceId;

  spaceNameCache.set(spaceId, {
    data: name,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return name;
}

/**
 * Invalidate all caches for a space. Call on member add/remove.
 */
export function invalidateSpace(spaceId: string): void {
  spaceMembersCache.delete(spaceId);
  spaceNameCache.delete(spaceId);
  entitySpacesCache.clear();
}

