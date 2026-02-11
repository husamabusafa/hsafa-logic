import { prisma } from '../../lib/db.js';
import { registerPrebuiltTool } from './registry.js';
import type { PrebuiltToolContext } from '../builder.js';

interface DeleteMemoriesInput {
  matches?: string[];
  topic?: string;
  deleteAll?: boolean;
}

registerPrebuiltTool('deleteMemories', {
  defaultDescription: 'Delete memories by describing them, by topic, or delete all at once. You do not need IDs — just describe which memory to remove using a word or phrase from its content.',

  inputSchema: {
    type: 'object',
    properties: {
      matches: {
        type: 'array',
        description: 'A unique phrase from the memory you want to delete. Use a distinctive multi-word phrase to avoid ambiguity — never a single common word. Example: ["favorite color is blue", "project deadline in March"].',
        items: { type: 'string' },
      },
      topic: {
        type: 'string',
        description: 'Delete all memories with this topic.',
      },
      deleteAll: {
        type: 'boolean',
        description: 'If true, delete all memories. Default: false.',
      },
    },
  },

  async execute(input: unknown, context: PrebuiltToolContext) {
    const { matches, topic, deleteAll } = (input || {}) as DeleteMemoriesInput;
    const { agentEntityId } = context;

    const deleted: Array<{ topic: string | null; content: string }> = [];
    const ambiguous: Array<{ match: string; candidates: string[] }> = [];
    const notFound: string[] = [];

    if (deleteAll) {
      const all = await prisma.memory.findMany({
        where: { entityId: agentEntityId },
      });
      await prisma.memory.deleteMany({
        where: { entityId: agentEntityId },
      });
      for (const m of all) {
        deleted.push({ topic: m.topic, content: m.content });
      }
    } else if (topic) {
      const byTopic = await prisma.memory.findMany({
        where: { entityId: agentEntityId, topic },
      });
      await prisma.memory.deleteMany({
        where: { entityId: agentEntityId, topic },
      });
      for (const m of byTopic) {
        deleted.push({ topic: m.topic, content: m.content });
      }
    } else if (matches && matches.length > 0) {
      const allMemories = await prisma.memory.findMany({
        where: { entityId: agentEntityId },
      });

      const idsToDelete = new Set<string>();

      for (const match of matches) {
        const lower = match.toLowerCase();
        const found = allMemories.filter((m) => m.content.toLowerCase().includes(lower));

        if (found.length === 0) {
          notFound.push(match);
        } else if (found.length === 1) {
          idsToDelete.add(found[0].id);
          deleted.push({ topic: found[0].topic, content: found[0].content });
        } else {
          ambiguous.push({ match, candidates: found.map((m) => m.content) });
        }
      }

      if (idsToDelete.size > 0) {
        await prisma.memory.deleteMany({
          where: { id: { in: [...idsToDelete] }, entityId: agentEntityId },
        });
      }
    }

    const remaining = await prisma.memory.findMany({
      where: { entityId: agentEntityId },
      orderBy: [{ updatedAt: 'desc' }],
    });

    return {
      success: ambiguous.length === 0 && notFound.length === 0,
      deleted,
      deletedCount: deleted.length,
      ...(ambiguous.length > 0 ? { ambiguous, ambiguousMessage: 'Some matches found multiple memories. Be more specific.' } : {}),
      ...(notFound.length > 0 ? { notFound, notFoundMessage: 'No memories matched these terms.' } : {}),
      remainingMemories: remaining.map((m) => ({
        topic: m.topic,
        content: m.content,
      })),
      totalRemaining: remaining.length,
    };
  },
});
