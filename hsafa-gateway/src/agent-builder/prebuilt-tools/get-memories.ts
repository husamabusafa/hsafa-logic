import { prisma } from '../../lib/db.js';
import { registerPrebuiltTool } from './registry.js';
import type { PrebuiltToolContext } from '../builder.js';

interface GetMemoriesInput {
  topic?: string;
  limit?: number;
}

registerPrebuiltTool('getMemories', {
  defaultDescription: 'Retrieve your stored memories. Use this to recall information you previously saved about the user, preferences, context, or any other persistent knowledge.',

  inputSchema: {
    type: 'object',
    properties: {
      topic: {
        type: 'string',
        description: 'Filter memories by topic/category. Omit to return all memories.',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of memories to return. Default: 50.',
      },
    },
  },

  async execute(input: unknown, context: PrebuiltToolContext) {
    const { topic, limit } = (input || {}) as GetMemoriesInput;
    const { agentEntityId } = context;

    const where: any = { entityId: agentEntityId };

    if (topic) {
      where.topic = topic;
    }

    const memories = await prisma.memory.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }],
      take: limit ?? 50,
    });

    return {
      memories: memories.map((m) => ({
        id: m.id,
        topic: m.topic,
        content: m.content,
        metadata: m.metadata,
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString(),
      })),
      totalMemories: memories.length,
    };
  },
});
