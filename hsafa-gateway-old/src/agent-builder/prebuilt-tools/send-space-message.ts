import { registerPrebuiltTool } from './registry.js';
import type { PrebuiltToolContext } from '../builder.js';
import { prisma } from '../../lib/db.js';
import { createSmartSpaceMessage } from '../../lib/smartspace-db.js';
import { emitSmartSpaceEvent } from '../../lib/smartspace-events.js';
import { triggerMentionedAgent } from '../../lib/agent-trigger.js';
import { Prisma } from '@prisma/client';

/**
 * sendSpaceMessage — The agent's only way to communicate.
 *
 * Sends a message to any space the agent belongs to.
 * The `text` argument streams in real-time via tool-input-delta interception
 * in stream-processor.ts — actual LLM token speed, no simulation.
 *
 * Optionally mention another agent to trigger them to respond.
 */

registerPrebuiltTool('sendSpaceMessage', {
  inputSchema: {
    type: 'object',
    properties: {
      spaceId: {
        type: 'string',
        description: 'Space ID to send to.',
      },
      text: {
        type: 'string',
        description: 'Message text.',
      },
      mention: {
        type: ['string', 'null'],
        description: 'Entity ID of an agent to trigger after posting, or null.',
      },
    },
    required: ['spaceId', 'text', 'mention'],
    additionalProperties: false,
  },
  strict: true,
  inputExamples: [
    { input: { spaceId: 'space-123', text: 'Hello!', mention: null } },
    { input: { spaceId: 'space-456', text: 'Check this out', mention: 'entity-789' } },
  ],
  defaultDescription: 'Send a message to a space. Returns {success:true} on delivery — do NOT retry.',

  execute: async (input: unknown, context: PrebuiltToolContext) => {
    const { spaceId, text, mention } = input as {
      spaceId: string;
      text: string;
      mention?: string;
    };

    // Validate membership
    const membership = await prisma.smartSpaceMembership.findUnique({
      where: { smartSpaceId_entityId: { smartSpaceId: spaceId, entityId: context.agentEntityId } },
    });
    if (!membership) {
      return { error: `You are not a member of space ${spaceId}` };
    }

    // Get agent display name
    const agentEntity = await prisma.entity.findUnique({
      where: { id: context.agentEntityId },
      select: { displayName: true },
    });
    const agentName = agentEntity?.displayName || 'AI Assistant';

    // Build origin context for cross-space messages
    // This tells the agent WHY it sent this message when triggered in this space later
    let origin: Record<string, unknown> | undefined;
    const isCrossSpace = context.triggerSpaceId && spaceId !== context.triggerSpaceId;
    if (isCrossSpace) {
      const [run, triggerSpace] = await Promise.all([
        prisma.run.findUnique({
          where: { id: context.runId },
          select: {
            triggerType: true,
            triggerSpaceId: true,
            triggerMessageContent: true,
            triggerSenderName: true,
            triggerServiceName: true,
            triggerPlanName: true,
          },
        }),
        prisma.smartSpace.findUnique({
          where: { id: context.triggerSpaceId! },
          select: { name: true },
        }),
      ]);
      if (run) {
        origin = {
          triggerType: run.triggerType,
          ...(run.triggerSpaceId ? { triggerSpaceId: run.triggerSpaceId } : {}),
          ...(triggerSpace?.name ? { triggerSpaceName: triggerSpace.name } : {}),
          ...(run.triggerSenderName ? { triggerSenderName: run.triggerSenderName } : {}),
          ...(run.triggerMessageContent ? { triggerMessage: run.triggerMessageContent } : {}),
          ...(run.triggerServiceName ? { triggerServiceName: run.triggerServiceName } : {}),
          ...(run.triggerPlanName ? { triggerPlanName: run.triggerPlanName } : {}),
        };
      }
    }

    // Persist the message
    const streamId = context.toolCallId || null;
    const dbMessage = await createSmartSpaceMessage({
      smartSpaceId: spaceId,
      entityId: context.agentEntityId,
      role: 'assistant',
      content: text,
      metadata: {
        runId: context.runId,
        ...(streamId ? { streamId } : {}),
        ...(origin ? { origin } : {}),
      } as unknown as Prisma.InputJsonValue,
      runId: context.runId,
    });

    // Emit persisted message event to the space
    await emitSmartSpaceEvent(
      spaceId,
      'smartSpace.message',
      {
        message: {
          id: dbMessage.id,
          role: 'assistant',
          parts: [{ type: 'text', text }],
          entityId: context.agentEntityId,
          entityType: 'agent',
          entityName: agentName,
        },
        ...(streamId ? { streamId } : {}),
      },
      { runId: context.runId, entityId: context.agentEntityId, entityType: 'agent', agentEntityId: context.agentEntityId },
    );

    // Trigger mentioned agent if provided
    if (mention) {
      await triggerMentionedAgent({
        spaceId,
        callerEntityId: context.agentEntityId,
        callerName: agentName,
        targetAgentEntityId: mention,
        messageContent: text,
      });
    }

    return { success: true, messageId: dbMessage.id };
  },
});
