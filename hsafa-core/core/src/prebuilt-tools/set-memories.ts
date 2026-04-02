import { tool, jsonSchema } from 'ai';
import { setMemories } from '../memory/semantic.js';

// =============================================================================
// set_memories — Store semantic memories (v7 prebuilt tool)
// =============================================================================

export function buildSetMemoriesTool(haseefId: string) {
  return (tool as any)({
    description: 'Store or update one or more memories. Use importance 1-10 (10 = critical, never forget; 5 = normal; 1 = minor detail). Memories persist forever.',
    inputSchema: jsonSchema<{ memories: Array<{ key: string; value: string; importance: number }> }>({
      type: 'object',
      properties: {
        memories: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string', description: 'Short descriptive key (e.g. "husam_favorite_color", "project_deadline")' },
              value: { type: 'string', description: 'The information to remember' },
              importance: { type: 'number', description: 'How important this memory is (1-10)', minimum: 1, maximum: 10 },
            },
            required: ['key', 'value', 'importance'],
          },
        },
      },
      required: ['memories'],
    }),
    execute: async ({ memories }: { memories: Array<{ key: string; value: string; importance: number }> }) => {
      await setMemories(haseefId, memories);
      return { stored: memories.length, keys: memories.map((m) => m.key) };
    },
  });
}
