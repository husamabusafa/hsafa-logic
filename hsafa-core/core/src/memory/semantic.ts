import { prisma } from '../lib/db.js';

// =============================================================================
// Semantic Memory (v7)
//
// Facts the haseef knows — key-value pairs with importance scoring.
// Future: pgvector embedding search for semantic retrieval.
// =============================================================================

export interface SemanticEntry {
  key: string;
  value: string;
  importance: number;
}

/**
 * Set (upsert) one or more semantic memories.
 */
export async function setMemories(
  haseefId: string,
  entries: SemanticEntry[],
): Promise<void> {
  for (const entry of entries) {
    await prisma.semanticMemory.upsert({
      where: { haseefId_key: { haseefId, key: entry.key } },
      create: {
        haseefId,
        key: entry.key,
        value: entry.value,
        importance: entry.importance,
      },
      update: {
        value: entry.value,
        importance: entry.importance,
      },
    });
  }
}

/**
 * Delete semantic memories by key.
 */
export async function deleteMemories(
  haseefId: string,
  keys: string[],
): Promise<number> {
  const result = await prisma.semanticMemory.deleteMany({
    where: { haseefId, key: { in: keys } },
  });
  return result.count;
}

/**
 * Get all semantic memories for a haseef, ordered by importance.
 */
export async function getAllMemories(
  haseefId: string,
): Promise<Array<{ key: string; value: string; importance: number }>> {
  return prisma.semanticMemory.findMany({
    where: { haseefId },
    select: { key: true, value: true, importance: true },
    orderBy: { importance: 'desc' },
  });
}

/**
 * Search semantic memories by keyword (basic ILIKE search).
 * Future: pgvector cosine similarity search.
 */
export async function searchMemories(
  haseefId: string,
  query: string,
  limit = 20,
): Promise<Array<{ key: string; value: string; importance: number }>> {
  const results = await prisma.semanticMemory.findMany({
    where: {
      haseefId,
      OR: [
        { key: { contains: query, mode: 'insensitive' } },
        { value: { contains: query, mode: 'insensitive' } },
      ],
    },
    select: { key: true, value: true, importance: true },
    orderBy: { importance: 'desc' },
    take: limit,
  });

  // Touch lastRecalledAt for returned memories
  if (results.length > 0) {
    const keys = results.map((r) => r.key);
    await prisma.semanticMemory.updateMany({
      where: { haseefId, key: { in: keys } },
      data: { lastRecalledAt: new Date() },
    });
  }

  return results;
}

/**
 * Get the top N most important memories (for system prompt injection).
 */
export async function getTopMemories(
  haseefId: string,
  limit = 30,
): Promise<Array<{ key: string; value: string; importance: number }>> {
  return prisma.semanticMemory.findMany({
    where: { haseefId },
    select: { key: true, value: true, importance: true },
    orderBy: { importance: 'desc' },
    take: limit,
  });
}
