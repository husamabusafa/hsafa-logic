import { prisma } from '../lib/db.js';

// =============================================================================
// Episodic Memory (v7)
//
// What happened in past runs — run summaries with context metadata.
// Future: pgvector embedding search for semantic retrieval.
// =============================================================================

export interface EpisodicEntry {
  runId?: string;
  summary: string;
  context?: Record<string, unknown>;
}

/**
 * Store a new episodic memory (typically post-run).
 */
export async function addEpisode(
  haseefId: string,
  entry: EpisodicEntry,
): Promise<void> {
  await prisma.episodicMemory.create({
    data: {
      haseefId,
      runId: entry.runId,
      summary: entry.summary,
      context: entry.context as any ?? undefined,
    },
  });
}

/**
 * Get recent episodes (most recent first).
 */
export async function getRecentEpisodes(
  haseefId: string,
  limit = 10,
): Promise<Array<{ summary: string; context: unknown; createdAt: Date }>> {
  return prisma.episodicMemory.findMany({
    where: { haseefId },
    select: { summary: true, context: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/**
 * Search episodes by keyword (basic ILIKE).
 * Future: pgvector cosine similarity.
 */
export async function searchEpisodes(
  haseefId: string,
  query: string,
  limit = 10,
): Promise<Array<{ summary: string; context: unknown; createdAt: Date }>> {
  return prisma.episodicMemory.findMany({
    where: {
      haseefId,
      summary: { contains: query, mode: 'insensitive' },
    },
    select: { summary: true, context: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
