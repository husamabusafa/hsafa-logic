// =============================================================================
// Prebuilt Tool: read_messages
// =============================================================================
// Reads recent messages from a space. Defaults to the active space.

import { tool } from 'ai';
import { z } from 'zod';
import { prisma } from '../../lib/db.js';
import { registerPrebuiltTool } from './registry.js';

const DEFAULT_LIMIT = 50;

registerPrebuiltTool('read_messages', {
  asTool: (context) =>
    tool({
      description:
        'Read recent messages from a space. Defaults to the active space. ' +
        'Use spaceId to read a different space you belong to. ' +
        'Use offset to page back through older messages.',
      inputSchema: z.object({
        spaceId: z
          .string()
          .optional()
          .describe('Space ID to read. Defaults to the active space.'),
        limit: z
          .number()
          .optional()
          .describe(`Max messages to return. Default: ${DEFAULT_LIMIT}.`),
        offset: z
          .number()
          .optional()
          .describe('Offset for paging back through older messages. Default: 0.'),
      }),
      execute: async ({ spaceId, limit, offset }) => {
        // Resolve target space
        let targetSpaceId = spaceId;
        if (!targetSpaceId) {
          targetSpaceId = context.getActiveSpaceId() ?? undefined;
        }
        if (!targetSpaceId) {
          return {
            success: false,
            error: 'No active space and no spaceId provided. Call enter_space first.',
          };
        }

        // Verify membership
        const membership = await prisma.smartSpaceMembership.findUnique({
          where: {
            smartSpaceId_entityId: {
              smartSpaceId: targetSpaceId,
              entityId: context.agentEntityId,
            },
          },
        });
        if (!membership) {
          return {
            success: false,
            error: `Not a member of space ${targetSpaceId}.`,
          };
        }

        const pageLimit = limit ?? DEFAULT_LIMIT;
        const pageOffset = offset ?? 0;

        const [messages, total] = await Promise.all([
          prisma.smartSpaceMessage.findMany({
            where: { smartSpaceId: targetSpaceId },
            orderBy: { seq: 'desc' },
            skip: pageOffset,
            take: pageLimit,
            include: {
              entity: {
                select: { id: true, displayName: true, type: true },
              },
            },
          }),
          prisma.smartSpaceMessage.count({
            where: { smartSpaceId: targetSpaceId },
          }),
        ]);

        // Return oldest-first
        messages.reverse();

        return {
          success: true,
          messages: messages.map((msg) => ({
            id: msg.id,
            content: msg.content ?? '',
            senderName: msg.entity.displayName ?? 'Unknown',
            senderType: msg.entity.type as string,
            senderId: msg.entity.id,
            timestamp: msg.createdAt.toISOString(),
          })),
          total,
        };
      },
    }),
});
