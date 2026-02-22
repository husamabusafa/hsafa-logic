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
        'Enter a space so you can send messages there. Check ACTIVE SPACE in your prompt first — if you are already in a space, you do NOT need this tool unless you want to switch to a different space. Pass a spaceId from YOUR SPACES.',
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
        try {
          // 0. Validate spaceId format
          if (!spaceId || typeof spaceId !== 'string' || spaceId.trim().length === 0) {
            return {
              success: false,
              error: 'Invalid spaceId. Provide a valid space ID from YOUR SPACES.',
            };
          }

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
              error: `You are not a member of space "${spaceId}". Check YOUR SPACES for valid space IDs.`,
            };
          }

          // 2. Update activeSpaceId in DB + in-memory closure
          try {
            await context.setActiveSpaceId(spaceId);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return {
              success: false,
              error: `Failed to set active space: ${msg}. Try again.`,
            };
          }

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

          const history = messages.map((msg) => {
            const isYou = msg.entity.id === context.agentEntityId;
            const entry: Record<string, unknown> = {
              id: msg.id,
              senderName: isYou ? 'You (agent)' : (msg.entity.displayName ?? 'Unknown'),
              senderType: msg.entity.type as string,
              senderId: msg.entity.id,
              content: msg.content ?? '',
              timestamp: msg.createdAt.toISOString(),
              seen: msg.seq <= lastProcessedSeq,
            };

            // For the agent's own messages: include WHY it sent them
            if (isYou && msg.metadata) {
              const meta = msg.metadata as Record<string, unknown>;
              const rc = meta.runContext as Record<string, unknown> | undefined;
              if (rc) {
                entry.runContext = {
                  trigger: rc.trigger,
                  isCrossSpace: rc.isCrossSpace,
                  actionsBefore: rc.actionsBefore,
                };
              }
            }

            return entry;
          });

          const totalMessages = await prisma.smartSpaceMessage.count({
            where: { smartSpaceId: spaceId },
          });

          // Log this action to the run action log
          context.actionLog.add({
            action: 'space_entered',
            spaceId,
            spaceName: membership.smartSpace.name ?? spaceId,
          });

          return {
            success: true,
            status: 'entered',
            message: `You are now in space "${membership.smartSpace.name ?? spaceId}". You can call send_message to communicate here.`,
            spaceId,
            spaceName: membership.smartSpace.name ?? spaceId,
            history,
            totalMessages,
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return {
            success: false,
            error: `enter_space failed: ${msg}`,
          };
        }
      },
    }),
});
