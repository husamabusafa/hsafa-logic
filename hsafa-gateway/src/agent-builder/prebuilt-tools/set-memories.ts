import { tool, jsonSchema } from 'ai';
import { prisma } from '../../lib/db.js';
import type { AgentProcessContext } from '../types.js';

// =============================================================================
// set_memories — Store or update persistent key-value memories
// =============================================================================

export function createSetMemoriesTool(ctx: AgentProcessContext) {
  return tool({
    description:
      'Store or update persistent key-value memories. Memories survive consciousness compaction and appear in your system prompt every cycle. Use for important facts, deadlines, preferences, and workflow state.',
    inputSchema: jsonSchema<{ memories: Array<{ key: string; value: string }> }>({
      type: 'object',
      properties: {
        memories: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string', description: 'Memory key (unique identifier)' },
              value: { type: 'string', description: 'Memory value' },
            },
            required: ['key', 'value'],
          },
          description: 'Memories to store or update',
        },
      },
      required: ['memories'],
    }),
    execute: async ({ memories }) => {
      let count = 0;
      for (const { key, value } of memories) {
        await prisma.memory.upsert({
          where: { entityId_key: { entityId: ctx.agentEntityId, key } },
          create: { entityId: ctx.agentEntityId, key, value },
          update: { value },
        });
        count++;
      }
      return { success: true, count };
    },
  });
}
