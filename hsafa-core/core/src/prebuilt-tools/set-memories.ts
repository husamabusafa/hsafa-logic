import { tool } from 'ai';
import { z } from 'zod';
import { setMemories } from '../memory/semantic.js';

// =============================================================================
// set_memories — Store semantic memories (v7 prebuilt tool)
// =============================================================================

export function buildSetMemoriesTool(haseefId: string) {
  return (tool as any)({
    description: 'Store or update one or more memories. Use importance 1-10 (10 = critical, never forget; 5 = normal; 1 = minor detail). Memories persist forever.',
    parameters: z.object({
      memories: z.array(z.object({
        key: z.string().describe('Short descriptive key (e.g. "husam_favorite_color", "project_deadline")'),
        value: z.string().describe('The information to remember'),
        importance: z.number().min(1).max(10).describe('How important this memory is (1-10)'),
      })),
    }),
    execute: async ({ memories }: { memories: Array<{ key: string; value: string; importance: number }> }) => {
      await setMemories(haseefId, memories);
      return { stored: memories.length, keys: memories.map((m) => m.key) };
    },
  });
}
