import { tool } from 'ai';
import { z } from 'zod';
import { deleteMemories } from '../memory/semantic.js';

// =============================================================================
// delete_memories — Remove semantic memories (v7 prebuilt tool)
// =============================================================================

export function buildDeleteMemoriesTool(haseefId: string) {
  return (tool as any)({
    description: 'Delete one or more memories by key. Use this to remove outdated or incorrect information.',
    parameters: z.object({
      keys: z.array(z.string()).describe('Memory keys to delete'),
    }),
    execute: async ({ keys }: { keys: string[] }) => {
      const deleted = await deleteMemories(haseefId, keys);
      return { deleted, keys };
    },
  });
}
