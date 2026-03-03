import { tool, jsonSchema } from 'ai';
import { prisma } from '../../lib/db.js';
import type { HaseefProcessContext } from '../types.js';

// =============================================================================
// set_memories — Store or update persistent key-value memories
// =============================================================================

export function createSetMemoriesTool(ctx: HaseefProcessContext) {
  return tool({
    description:
      'Store or update persistent key-value memories. Memories survive consciousness compaction and appear in your system prompt every cycle. ' +
      'Key conventions: "self:identity", "self:values", "self:capabilities", "self:personality", "self:limitations", "self:purpose", "self:growth" for self-model. ' +
      '"person-model:{name}" for mental models of people. All other keys are general knowledge.',
    inputSchema: jsonSchema<{ memories: Array<{ key: string; value: string }> }>({
      type: 'object',
      properties: {
        memories: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              key: {
                type: 'string',
                description:
                  'Memory key. Use "self:*" for self-model (identity, values, capabilities, personality, limitations, purpose, growth). ' +
                  'Use "person-model:{name}" for person models. Use any other key for general knowledge.',
              },
              value: { type: 'string', description: 'Memory value — be specific and honest. Self-model entries should reflect genuine self-knowledge, not aspirational descriptions.' },
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
          where: { haseefId_key: { haseefId: ctx.haseefId, key } },
          create: { haseefId: ctx.haseefId, key, value },
          update: { value },
        });
        count++;
      }
      return { success: true, count };
    },
  });
}
