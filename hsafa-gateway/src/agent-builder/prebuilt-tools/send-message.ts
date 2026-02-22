// =============================================================================
// Prebuilt Tool: send_message
// =============================================================================
// Sends a message to the active space. This is the agent's only way to
// communicate externally. After persisting, other agent members are triggered.

import { tool } from 'ai';
import { z } from 'zod';
import { prisma } from '../../lib/db.js';
import { createSmartSpaceMessage } from '../../lib/smartspace-db.js';
import { emitSmartSpaceEvent } from '../../lib/smartspace-events.js';
import { registerPrebuiltTool } from './registry.js';

registerPrebuiltTool('send_message', {
  asTool: (context) =>
    tool({
      description:
        'Send a message to your ACTIVE space. You MUST call enter_space first to set an active space. ' +
        'Check the response to confirm WHO received it. ' +
        'Returns {success:true} on delivery — do NOT retry.',
      inputSchema: z.object({
        text: z.string().describe('The message content to send.'),
      }),
      execute: async ({ text }, { toolCallId }) => {
        // 1. Get the active spaceId from run state
        const activeSpaceId = context.getActiveSpaceId();
        if (!activeSpaceId) {
          return {
            success: false,
            error:
              'No active space. You MUST call enter_space(spaceId) first with a valid space ID from YOUR SPACES, then call send_message again.',
          };
        }

        // 2. Build run context metadata to embed in the message
        const actionsSoFar = context.actionLog.toSummary();
        const runContext: Record<string, unknown> = {
          runId: context.runId,
          trigger: context.triggerSummary,
          actionsBefore: {
            toolsCalled: actionsSoFar.toolsCalled,
            messagesSent: actionsSoFar.messagesSent,
            spacesEntered: actionsSoFar.spacesEntered,
          },
          isCrossSpace: activeSpaceId !== context.triggerSpaceId,
        };

        // 3. Persist the message with embedded run context
        const dbMessage = await createSmartSpaceMessage({
          smartSpaceId: activeSpaceId,
          entityId: context.agentEntityId,
          role: 'assistant',
          content: text,
          metadata: { runContext },
          runId: context.runId,
        });

        // 4. Emit persisted message event to the space.
        //    - Nested `message` object matches the human message format in smart-spaces.ts
        //    - `streamId` = toolCallId so the client can dedup streaming vs persisted
        await emitSmartSpaceEvent(activeSpaceId, {
          type: 'space.message',
          streamId: toolCallId,
          message: {
            id: dbMessage.id,
            smartSpaceId: activeSpaceId,
            entityId: context.agentEntityId,
            role: 'assistant',
            content: text,
            metadata: { runContext },
            seq: Number(dbMessage.seq),
            createdAt: dbMessage.createdAt.toISOString(),
          },
        });

        // 5. Look up space name + members so AI knows exactly who received it
        const space = await prisma.smartSpace.findUnique({
          where: { id: activeSpaceId },
          select: {
            name: true,
            memberships: {
              include: { entity: { select: { id: true, displayName: true, type: true } } },
            },
          },
        });
        const spaceName = space?.name ?? activeSpaceId;
        const recipients = (space?.memberships ?? [])
          .filter((m) => m.entityId !== context.agentEntityId)
          .map((m) => `${m.entity.displayName ?? 'Unknown'} (${m.entity.type})`);

        // 6. Log this action to the run action log
        context.actionLog.add({
          action: 'message_sent',
          spaceId: activeSpaceId,
          spaceName,
          messagePreview: text.length > 120 ? text.slice(0, 120) + '...' : text,
          messageId: dbMessage.id,
        });

        // 7. Trigger all other agent members of the space (sender excluded)
        //    Imported lazily to avoid circular dependency with agent-trigger.
        const { triggerAllAgents } = await import(
          '../../lib/agent-trigger.js'
        );
        await triggerAllAgents({
          spaceId: activeSpaceId,
          senderEntityId: context.agentEntityId,
          senderName: context.agentName,
          senderType: 'agent',
          messageContent: text,
          messageId: dbMessage.id,
        });

        return {
          success: true,
          messageId: dbMessage.id,
          deliveredTo: {
            spaceName,
            spaceId: activeSpaceId,
            recipients,
          },
        };
      },
    }),
});
