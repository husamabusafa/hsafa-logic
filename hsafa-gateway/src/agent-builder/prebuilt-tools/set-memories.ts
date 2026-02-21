// =============================================================================
// Prebuilt Tool: set_memories
// =============================================================================
import { tool } from 'ai';
import { z } from 'zod';
import { prisma } from '../../lib/db.js';
import { registerPrebuiltTool } from './registry.js';

registerPrebuiltTool('set_memories', {
  asTool: (context) =>
    tool({
      description:
        'Store or update persistent key-value memories that survive across runs. ' +
        'Memories are injected into the system prompt of every future run.',
      inputSchema: z.object({
        memories: z.array(
          z.object({
            key: z.string().describe('Memory key (e.g. "project_deadline")'),
            value: z.string().describe('Memory value to store'),
          }),
        ),
      }),
      execute: async ({ memories }) => {
        // Upsert each memory (unique on entityId + key)
        await Promise.all(
          memories.map((m) =>
            prisma.memory.upsert({
              where: {
                entityId_key: {
                  entityId: context.agentEntityId,
                  key: m.key,
                },
              },
              update: { value: m.value },
              create: {
                entityId: context.agentEntityId,
                key: m.key,
                value: m.value,
              },
            }),
          ),
        );
        return { success: true, count: memories.length };
      },
    }),
});
