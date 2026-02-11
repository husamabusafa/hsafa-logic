import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/db.js';
import { registerPrebuiltTool } from './registry.js';
import type { PrebuiltToolContext } from '../builder.js';

interface MemoryInput {
  match?: string;
  topic?: string;
  content: string;
  metadata?: Record<string, unknown>;
}

interface SetMemoriesInput {
  memories: MemoryInput[];
  clearExisting?: boolean;
}

registerPrebuiltTool('setMemories', {
  defaultDescription: 'Save or update memories. To update an existing memory, provide a "match" string that partially matches its content. Omit "match" to create a new memory.',

  inputSchema: {
    type: 'object',
    properties: {
      memories: {
        type: 'array',
        description: 'Memories to save or update.',
        items: {
          type: 'object',
          properties: {
            match: {
              type: 'string',
              description: 'A unique phrase from the existing memory you want to update. Use a distinctive multi-word phrase to avoid ambiguity — never a single common word. Omit to create a new memory.',
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

    const results: Array<{ action: string; topic: string | null; content: string; ambiguousCandidates?: string[] }> = [];

    // Load all memories once for matching
    const existingMemories = await prisma.memory.findMany({
      where: { entityId: agentEntityId },
    });

    for (const mem of memories) {
      if (mem.match) {
        const lower = mem.match.toLowerCase();
        const found = existingMemories.filter((m) => m.content.toLowerCase().includes(lower));

        if (found.length === 0) {
          results.push({ action: 'not_found', topic: mem.topic ?? null, content: mem.content, ambiguousCandidates: [] });
        } else if (found.length === 1) {
          await prisma.memory.update({
            where: { id: found[0].id },
            data: {
              topic: mem.topic ?? undefined,
              content: mem.content,
              metadata: mem.metadata ? (mem.metadata as Prisma.InputJsonValue) : undefined,
            },
          });
          results.push({ action: 'updated', topic: mem.topic ?? found[0].topic, content: mem.content });
        } else {
          results.push({ action: 'ambiguous', topic: mem.topic ?? null, content: mem.content, ambiguousCandidates: found.map((m) => m.content) });
        }
      } else {
        await prisma.memory.create({
          data: {
            entityId: agentEntityId,
            topic: mem.topic ?? null,
            content: mem.content,
            metadata: mem.metadata ? (mem.metadata as Prisma.InputJsonValue) : undefined,
          },
        });
        results.push({ action: 'created', topic: mem.topic ?? null, content: mem.content });
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
        topic: m.topic,
        content: m.content,
      })),
      totalMemories: allMemories.length,
    };
  },
});
