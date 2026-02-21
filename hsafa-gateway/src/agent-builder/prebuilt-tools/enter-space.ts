// =============================================================================
// Prebuilt Tool: enter_space
// =============================================================================
// Sets the active space for the current run. All subsequent send_message calls
// and visible tool results will go to this space.
// For space_message triggers the trigger space is auto-entered at run start —
// the agent only needs this tool to switch to a *different* space.

import { tool } from 'ai';
import { z } from 'zod';
import { prisma } from '../../lib/db.js';
import { registerPrebuiltTool } from './registry.js';

// Default number of recent messages to include in the space history snapshot
const DEFAULT_HISTORY_LIMIT = 20;

registerPrebuiltTool('enter_space', {
  asTool: (context) =>
    tool({
      description:
        'Set the active space for this run. All subsequent messages and visible tool results go to this space. For space_message triggers the trigger space is already active — call this only to switch to a different space.',
      inputSchema: z.object({
        spaceId: z.string().describe('ID of the space to enter.'),
        limit: z
          .number()
          .optional()
          .describe(
            `Number of recent messages to load. Default: ${DEFAULT_HISTORY_LIMIT}.`,
          ),
      }),
      execute: async ({ spaceId, limit }) => {
        const historyLimit = limit ?? DEFAULT_HISTORY_LIMIT;

        // 1. Verify the agent is a member of the requested space
        const membership = await prisma.smartSpaceMembership.findUnique({
          where: {
            smartSpaceId_entityId: {
              smartSpaceId: spaceId,
              entityId: context.agentEntityId,
            },
          },
          include: {
            smartSpace: { select: { id: true, name: true } },
          },
        });

        if (!membership) {
          return {
            success: false,
            error: `Not a member of space ${spaceId}.`,
          };
        }

        // 2. Update activeSpaceId in DB + in-memory closure
        await context.setActiveSpaceId(spaceId);

        // 3. Load recent messages with [SEEN]/[NEW] markers
        const messages = await prisma.smartSpaceMessage.findMany({
          where: { smartSpaceId: spaceId },
          orderBy: { seq: 'desc' },
          take: historyLimit,
          include: {
            entity: { select: { id: true, displayName: true, type: true } },
          },
        });

        // Reverse so oldest-first for the agent to read chronologically
        messages.reverse();

        // Compute the seq of the last message the agent processed here
        let lastProcessedSeq = BigInt(0);
        if (membership.lastProcessedMessageId) {
          const lastMsg = await prisma.smartSpaceMessage.findUnique({
            where: { id: membership.lastProcessedMessageId },
            select: { seq: true },
          });
          lastProcessedSeq = lastMsg?.seq ?? BigInt(0);
        }

        const history = messages.map((msg) => ({
          id: msg.id,
          senderName: msg.entity.displayName ?? 'Unknown',
          senderType: msg.entity.type as string,
          senderId: msg.entity.id,
          content: msg.content ?? '',
          timestamp: msg.createdAt.toISOString(),
          seen: msg.seq <= lastProcessedSeq,
        }));

        const totalMessages = await prisma.smartSpaceMessage.count({
          where: { smartSpaceId: spaceId },
        });

        return {
          success: true,
          spaceId,
          spaceName: membership.smartSpace.name ?? spaceId,
          history,
          totalMessages,
        };
      },
    }),
});
