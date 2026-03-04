import { tool, jsonSchema } from 'ai';
import { drainInbox, inboxSize } from '../../lib/inbox.js';
import type { AgentProcessContext } from '../types.js';

// =============================================================================
// peek_inbox — Pull pending inbox events into the current cycle
// =============================================================================

export function createPeekInboxTool(ctx: AgentProcessContext) {
  return tool({
    description:
      'Pull pending inbox events into the current cycle. Events are removed from the inbox and become part of this cycle\'s context. Use when you see an urgent or relevant event in the INBOX PREVIEW.',
    inputSchema: jsonSchema<{ count?: number }>({
      type: 'object',
      properties: {
        count: { type: 'number', description: 'How many events to pull (default 1)' },
      },
    }),
    execute: async ({ count }) => {
      const pullCount = Math.min(count ?? 1, 10);
      const events = await drainInbox(ctx.agentEntityId);

      // Take only the requested number, push the rest back
      // Since drainInbox removes all, we re-push excess events
      const pulled = events.slice(0, pullCount);
      const remaining = events.slice(pullCount);

      if (remaining.length > 0) {
        // Re-push remaining events back to inbox
        const { redis } = await import('../../lib/redis.js');
        const key = `inbox:${ctx.agentEntityId}`;
        for (const evt of remaining.reverse()) {
          await redis.rpush(key, JSON.stringify(evt));
        }
      }

      const pendingCount = await inboxSize(ctx.agentEntityId);

      return {
        events: pulled.map((e) => ({
          eventId: e.eventId,
          type: e.type,
          timestamp: e.timestamp,
          data: e.data,
        })),
        remaining: pendingCount,
      };
    },
  });
}
