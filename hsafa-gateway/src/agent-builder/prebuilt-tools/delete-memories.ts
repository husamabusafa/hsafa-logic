// =============================================================================
// Prebuilt Tool: delete_memories
// =============================================================================
import { tool } from 'ai';
import { z } from 'zod';
import { prisma } from '../../lib/db.js';
import { registerPrebuiltTool } from './registry.js';

registerPrebuiltTool('delete_memories', {
  asTool: (context) =>
    tool({
      description: 'Delete one or more of your stored memories by key.',
      inputSchema: z.object({
        keys: z.array(z.string()).describe('Memory keys to delete.'),
      }),
      execute: async ({ keys }) => {
        const result = await prisma.memory.deleteMany({
          where: {
            entityId: context.agentEntityId,
            key: { in: keys },
          },
        });
        return { success: true, deleted: result.count };
      },
    }),
});
