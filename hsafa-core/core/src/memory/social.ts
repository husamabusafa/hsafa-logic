import { prisma } from '../lib/db.js';

// =============================================================================
// Social Memory (v7)
//
// Person models — what the haseef knows about people it interacts with.
// Stores observations, preferences, and relationship info.
// =============================================================================

export interface SocialEntry {
  entityName: string;
  observations?: Record<string, unknown>;
  relationship?: string;
}

/**
 * Upsert a social memory entry for a person.
 */
export async function upsertSocialMemory(
  haseefId: string,
  entry: SocialEntry,
): Promise<void> {
  await prisma.socialMemory.upsert({
    where: { haseefId_entityName: { haseefId, entityName: entry.entityName } },
    create: {
      haseefId,
      entityName: entry.entityName,
      observations: (entry.observations as any) ?? undefined,
      relationship: entry.relationship,
      lastInteraction: new Date(),
    },
    update: {
      ...(entry.observations ? { observations: entry.observations as any } : {}),
      ...(entry.relationship ? { relationship: entry.relationship } : {}),
      lastInteraction: new Date(),
    },
  });
}

/**
 * Get all social memories for a haseef.
 */
export async function getAllSocialMemories(
  haseefId: string,
): Promise<Array<{ entityName: string; observations: unknown; relationship: string | null; lastInteraction: Date | null }>> {
  return prisma.socialMemory.findMany({
    where: { haseefId },
    select: { entityName: true, observations: true, relationship: true, lastInteraction: true },
    orderBy: { lastInteraction: 'desc' },
  });
}

/**
 * Get social memory for a specific person.
 */
export async function getSocialMemory(
  haseefId: string,
  entityName: string,
): Promise<{ entityName: string; observations: unknown; relationship: string | null } | null> {
  return prisma.socialMemory.findUnique({
    where: { haseefId_entityName: { haseefId, entityName } },
    select: { entityName: true, observations: true, relationship: true },
  });
}
