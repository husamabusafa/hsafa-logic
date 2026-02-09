import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/db.js';
import { registerPrebuiltTool } from './registry.js';
import type { PrebuiltToolContext } from '../builder.js';

interface MemoryInput {
  id?: string;
  topic?: string;
  content: string;
  metadata?: Record<string, unknown>;
}

interface SetMemoriesInput {
  memories: MemoryInput[];
  clearExisting?: boolean;
}

registerPrebuiltTool('setMemories', {
  defaultDescription: 'Save or update memories. Use this to remember important information about the user, their preferences, context from conversations, or any knowledge you want to persist across sessions.',

  inputSchema: {
    type: 'object',
    properties: {
      memories: {
        type: 'array',
        description: 'Memories to save or update.',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Existing memory ID to update. Omit to create a new memory.',
            },
            topic: {
              type: 'string',
              description: 'Category or topic for this memory (e.g. "user_preferences", "project_context", "personal_info").',
            },
            content: {
              type: 'string',
              description: 'The memory content to store.',
            },
            metadata: {
              type: 'object',
              description: 'Optional structured metadata to attach.',
            },
          },
          required: ['content'],
        },
      },
      clearExisting: {
        type: 'boolean',
        description: 'If true, remove all existing memories before saving new ones. Default: false.',
      },
    },
    required: ['memories'],
  },

  async execute(input: unknown, context: PrebuiltToolContext) {
    const { memories, clearExisting } = input as SetMemoriesInput;
    const { agentEntityId } = context;

    if (clearExisting) {
      await prisma.memory.deleteMany({
        where: { entityId: agentEntityId },
      });
    }

    const results: Array<{ action: string; id: string; topic: string | null; content: string }> = [];

    for (const mem of memories) {
      if (mem.id) {
        const updated = await prisma.memory.update({
          where: { id: mem.id },
          data: {
            topic: mem.topic ?? undefined,
            content: mem.content,
            metadata: mem.metadata ? (mem.metadata as Prisma.InputJsonValue) : undefined,
          },
        });
        results.push({ action: 'updated', id: updated.id, topic: updated.topic, content: updated.content });
      } else {
        const created = await prisma.memory.create({
          data: {
            entityId: agentEntityId,
            topic: mem.topic ?? null,
            content: mem.content,
            metadata: mem.metadata ? (mem.metadata as Prisma.InputJsonValue) : undefined,
          },
        });
        results.push({ action: 'created', id: created.id, topic: created.topic, content: created.content });
      }
    }

    const allMemories = await prisma.memory.findMany({
      where: { entityId: agentEntityId },
      orderBy: [{ updatedAt: 'desc' }],
    });

    return {
      success: true,
      memoriesModified: results,
      currentMemories: allMemories.map((m) => ({
        id: m.id,
        topic: m.topic,
        content: m.content,
      })),
      totalMemories: allMemories.length,
    };
  },
});
