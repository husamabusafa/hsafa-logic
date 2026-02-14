import { Prisma } from '@prisma/client';
import { prisma } from './db.js';

export function toBigInt(value: unknown): bigint | null {
  try {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value));
    if (typeof value === 'string' && value.trim().length > 0) return BigInt(value);
    return null;
  } catch {
    return null;
  }
}

export async function createSmartSpaceMessage(input: {
  smartSpaceId: string;
  entityId: string;
  role: string;
  content?: string | null;
  metadata?: Prisma.InputJsonValue | null;
  runId?: string | null;
}) {
  // Retry loop: concurrent calls for the same space can race on seq,
  // causing a transaction conflict. Retry with the updated seq value.
  const MAX_RETRIES = 5;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const last = await tx.smartSpaceMessage.findFirst({
          where: { smartSpaceId: input.smartSpaceId },
          orderBy: { seq: 'desc' },
          select: { seq: true },
        });

        const nextSeq = (last?.seq ?? 0n) + 1n;

        return tx.smartSpaceMessage.create({
          data: {
            smartSpaceId: input.smartSpaceId,
            entityId: input.entityId,
            role: input.role,
            content: input.content ?? null,
            metadata: input.metadata ?? undefined,
            seq: nextSeq,
            runId: input.runId ?? null,
          },
        });
      });
    } catch (error) {
      if (attempt === MAX_RETRIES - 1) throw error;
      // Brief backoff before retry
      await new Promise((r) => setTimeout(r, 15 * (attempt + 1)));
    }
  }
  throw new Error('createSmartSpaceMessage: unreachable');
}

export function serializeBigInt(value: bigint): string {
  return value.toString();
}
