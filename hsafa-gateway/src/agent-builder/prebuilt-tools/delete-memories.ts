import { prisma } from '../../lib/db.js';
import { registerPrebuiltTool } from './registry.js';
import type { PrebuiltToolContext } from '../builder.js';

interface DeleteMemoriesInput {
  memoryIds?: string[];
  topic?: string;
  deleteAll?: boolean;
}

registerPrebuiltTool('deleteMemories', {
  defaultDescription: 'Delete specific memories by ID, by topic, or delete all memories at once. Use this when information is no longer relevant or the user asks you to forget something.',

  inputSchema: {
    type: 'object',
    properties: {
      memoryIds: {
        type: 'array',
        description: 'IDs of specific memories to delete.',
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
    const { memoryIds, topic, deleteAll } = (input || {}) as DeleteMemoriesInput;
    const { agentEntityId } = context;

    const deleted: Array<{ id: string; topic: string | null; content: string }> = [];

    if (deleteAll) {
      const all = await prisma.memory.findMany({
        where: { entityId: agentEntityId },
      });
      await prisma.memory.deleteMany({
        where: { entityId: agentEntityId },
      });
      for (const m of all) {
        deleted.push({ id: m.id, topic: m.topic, content: m.content });
      }
    } else if (topic) {
      const byTopic = await prisma.memory.findMany({
        where: { entityId: agentEntityId, topic },
      });
      await prisma.memory.deleteMany({
        where: { entityId: agentEntityId, topic },
      });
      for (const m of byTopic) {
        deleted.push({ id: m.id, topic: m.topic, content: m.content });
      }
    } else if (memoryIds && memoryIds.length > 0) {
      const toDelete = await prisma.memory.findMany({
        where: { id: { in: memoryIds }, entityId: agentEntityId },
      });
      await prisma.memory.deleteMany({
        where: { id: { in: memoryIds }, entityId: agentEntityId },
      });
      for (const m of toDelete) {
        deleted.push({ id: m.id, topic: m.topic, content: m.content });
      }
    }

    const remaining = await prisma.memory.findMany({
      where: { entityId: agentEntityId },
      orderBy: [{ updatedAt: 'desc' }],
    });

    return {
      success: true,
      deleted,
      deletedCount: deleted.length,
      remainingMemories: remaining.map((m) => ({
        id: m.id,
        topic: m.topic,
        content: m.content,
      })),
      totalRemaining: remaining.length,
    };
  },
});
