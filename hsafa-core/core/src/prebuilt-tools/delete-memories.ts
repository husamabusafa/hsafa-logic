import { tool, jsonSchema } from 'ai';
import { deleteMemories } from '../memory/semantic.js';

// =============================================================================
// delete_memories — Remove semantic memories (v7 prebuilt tool)
// =============================================================================

export function buildDeleteMemoriesTool(haseefId: string) {
  return (tool as any)({
    description: 'Delete one or more memories by key. Use this to remove outdated or incorrect information.',
    inputSchema: jsonSchema<{ keys: string[] }>({
      type: 'object',
      properties: {
        keys: { type: 'array', items: { type: 'string' }, description: 'Memory keys to delete' },
      },
      required: ['keys'],
    }),
    execute: async ({ keys }: { keys: string[] }) => {
      const deleted = await deleteMemories(haseefId, keys);
      return { deleted, keys };
    },
  });
}
