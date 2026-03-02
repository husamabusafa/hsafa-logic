import { prisma } from './db.js';

// =============================================================================
// SmartSpace message persistence helpers
// =============================================================================

const MAX_SEQ_RETRIES = 5;

export interface CreateMessageParams {
  smartSpaceId: string;
  entityId: string;
  role: string;
  content: string | null;
  metadata?: Record<string, unknown>;
  runId?: string;
}

/**
 * Create a SmartSpaceMessage with auto-incrementing seq.
 * Uses a retry loop to handle concurrent inserts (seq collision).
 */
export async function createSmartSpaceMessage(params: CreateMessageParams) {
  const { smartSpaceId, entityId, role, content, metadata, runId } = params;

  for (let attempt = 0; attempt < MAX_SEQ_RETRIES; attempt++) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        // Get next seq
        const latest = await tx.smartSpaceMessage.findFirst({
          where: { smartSpaceId },
          orderBy: { seq: 'desc' },
          select: { seq: true },
        });
        const nextSeq = (latest?.seq ?? BigInt(0)) + BigInt(1);

        return tx.smartSpaceMessage.create({
          data: {
            smartSpaceId,
            entityId,
            role,
            content,
            metadata: (metadata ?? undefined) as any,
            seq: nextSeq,
            runId: runId ?? undefined,
          },
        });
      });

      return result;
    } catch (error: unknown) {
      const isUniqueViolation =
        error instanceof Error &&
        error.message.includes('Unique constraint failed');

      if (isUniqueViolation && attempt < MAX_SEQ_RETRIES - 1) {
        // Seq collision — retry with backoff
        await new Promise((r) => setTimeout(r, 10 * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }

  throw new Error('Failed to create message after max retries');
}
