import { prisma } from './db.js';
import Redis from 'ioredis';

// =============================================================================
// Shared Tool Result Wait
//
// Waits for a PendingToolCall to be resolved via Redis pub/sub.
// Used by both custom tool execution (builder.ts) and extension tool
// execution (extension-manager.ts) — single implementation, no duplication.
// =============================================================================

const TOOL_RESULT_CHANNEL = 'tool-result:';

/**
 * Wait for a PendingToolCall to be resolved using Redis pub/sub.
 * Returns the result instantly when published, or null on timeout.
 *
 * On timeout, flips status 'waiting' → 'pending' so that if the result
 * arrives later, the tool-results API pushes it to the inbox.
 */
export async function waitForToolResult(
  toolCallId: string,
  timeoutMs: number,
): Promise<unknown | null> {
  // Check if already resolved (e.g. very fast worker)
  const existing = await prisma.pendingToolCall.findUnique({ where: { toolCallId } });
  if (existing?.status === 'resolved') return existing.result;

  return new Promise((resolve) => {
    const channel = `${TOOL_RESULT_CHANNEL}${toolCallId}`;
    const subscriber = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });

    const timer = setTimeout(async () => {
      subscriber.unsubscribe(channel).catch(() => {});
      subscriber.disconnect();

      // Timeout — flip to 'pending' so late results reach the agent via inbox
      await prisma.pendingToolCall.updateMany({
        where: { toolCallId, status: 'waiting' },
        data: { status: 'pending' },
      });

      // Final check — result may have arrived between subscribe end and status flip
      const final = await prisma.pendingToolCall.findUnique({ where: { toolCallId } });
      if (final?.status === 'resolved') {
        resolve(final.result);
      } else {
        resolve(null);
      }
    }, timeoutMs);

    subscriber.subscribe(channel).catch(() => {
      clearTimeout(timer);
      subscriber.disconnect();
      resolve(null);
    });

    subscriber.on('message', (_ch: string, msg: string) => {
      clearTimeout(timer);
      subscriber.unsubscribe(channel).catch(() => {});
      subscriber.disconnect();
      try {
        resolve(JSON.parse(msg));
      } catch {
        resolve(msg);
      }
    });
  });
}
