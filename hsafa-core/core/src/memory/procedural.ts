import { prisma } from '../lib/db.js';

// =============================================================================
// Procedural Memory (v7)
//
// Learned patterns — what works in specific situations.
// Confidence increases with successful use, decreases on failure.
// =============================================================================

export interface ProceduralEntry {
  trigger: string;
  response: string;
  confidence?: number;
}

/**
 * Add a new procedural memory.
 */
export async function addProcedure(
  haseefId: string,
  entry: ProceduralEntry,
): Promise<void> {
  await prisma.proceduralMemory.create({
    data: {
      haseefId,
      trigger: entry.trigger,
      response: entry.response,
      confidence: entry.confidence ?? 0.5,
    },
  });
}

/**
 * Record a successful use of a procedure (increase confidence).
 */
export async function recordHit(procedureId: string): Promise<void> {
  await prisma.proceduralMemory.update({
    where: { id: procedureId },
    data: {
      hitCount: { increment: 1 },
      confidence: { increment: 0.05 },
    },
  });
}

/**
 * Get all procedural memories for a haseef, ordered by confidence.
 */
export async function getAllProcedures(
  haseefId: string,
): Promise<Array<{ id: string; trigger: string; response: string; confidence: number; hitCount: number }>> {
  return prisma.proceduralMemory.findMany({
    where: { haseefId },
    select: { id: true, trigger: true, response: true, confidence: true, hitCount: true },
    orderBy: { confidence: 'desc' },
  });
}

/**
 * Search procedures by trigger keyword (basic ILIKE).
 */
export async function searchProcedures(
  haseefId: string,
  query: string,
  limit = 5,
): Promise<Array<{ trigger: string; response: string; confidence: number }>> {
  return prisma.proceduralMemory.findMany({
    where: {
      haseefId,
      trigger: { contains: query, mode: 'insensitive' },
    },
    select: { trigger: true, response: true, confidence: true },
    orderBy: { confidence: 'desc' },
    take: limit,
  });
}
