import { tool, jsonSchema } from 'ai';
import { prisma } from '../../lib/db.js';
import type { HaseefProcessContext } from '../types.js';

// =============================================================================
// set_memories — Store or update persistent memories with importance
// =============================================================================

export function createSetMemoriesTool(ctx: HaseefProcessContext) {
  return tool({
    description:
      'Store or update persistent memories. Memories appear in your system prompt and survive consciousness archiving. ' +
      'Each memory has an importance level (1-10): 9-10 = critical (always shown), 4-8 = relevant (shown when budget allows), 1-3 = minor. ' +
      'Key conventions: "self:identity", "self:values", "self:capabilities", "self:personality" for self-model. ' +
      '"person-model:{name}" for mental models of people. All other keys are general knowledge.',
    inputSchema: jsonSchema<{ memories: Array<{ key: string; value: string; importance?: number }> }>({
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
                  'Memory key. Use "self:*" for self-model. Use "person-model:{name}" for person models. Any other key for general knowledge.',
              },
              value: {
                type: 'string',
                description: 'Memory value — be specific and honest.',
              },
              importance: {
                type: 'number',
                description: 'Importance level 1-10. 9-10=critical (always in prompt), 4-8=relevant, 1-3=minor. Default: 5.',
              },
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
      for (const { key, value, importance } of memories) {
        const imp = Math.max(1, Math.min(10, importance ?? 5));
        await prisma.memory.upsert({
          where: { haseefId_key: { haseefId: ctx.haseefId, key } },
          create: { haseefId: ctx.haseefId, key, value, importance: imp },
          update: { value, importance: imp },
        });
        count++;
      }
      return { success: true, count };
    },
  });
}
