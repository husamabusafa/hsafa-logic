// =============================================================================
// Role-Based Authorization Helpers
//
// Enforces owner > admin > member role hierarchy for space operations.
// =============================================================================

import { prisma } from "./db.js";

export type SpaceRole = "owner" | "admin" | "member";

const ROLE_RANK: Record<SpaceRole, number> = {
  owner: 3,
  admin: 2,
  member: 1,
};

/**
 * Check if `role` is at least `minRole` in the hierarchy.
 */
export function isAtLeast(role: string | null | undefined, minRole: SpaceRole): boolean {
  if (!role) return false;
  const rank = ROLE_RANK[role as SpaceRole];
  const minRank = ROLE_RANK[minRole];
  if (rank === undefined || minRank === undefined) return false;
  return rank >= minRank;
}

/**
 * Get the role of an entity in a space. Returns null if not a member.
 */
export async function getMemberRole(
  smartSpaceId: string,
  entityId: string
): Promise<SpaceRole | null> {
  const membership = await prisma.smartSpaceMembership.findUnique({
    where: { smartSpaceId_entityId: { smartSpaceId, entityId } },
    select: { role: true },
  });
  if (!membership || !membership.role) return null;
  return membership.role as SpaceRole;
}

/**
 * Require that an entity has at least `minRole` in a space.
 * Returns the membership if authorized, throws an object with { status, error } if not.
 */
export async function requireRole(
  smartSpaceId: string,
  entityId: string,
  minRole: SpaceRole
): Promise<{ role: SpaceRole }> {
  const role = await getMemberRole(smartSpaceId, entityId);
  if (!role) {
    throw { status: 403, error: "Not a member of this space" };
  }
  if (!isAtLeast(role, minRole)) {
    throw {
      status: 403,
      error: `Requires ${minRole} role or higher (you are ${role})`,
    };
  }
  return { role };
}
