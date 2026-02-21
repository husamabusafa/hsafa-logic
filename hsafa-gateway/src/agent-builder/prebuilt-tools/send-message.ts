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
        'Send a message to the active space. This is your only way to communicate. ' +
        'The trigger space is already active — use enter_space only to switch spaces. ' +
        'Returns {success:true} on delivery — do NOT retry.',
      inputSchema: z.object({
        text: z.string().describe('The message content to send.'),
      }),
      execute: async ({ text }) => {
        // 1. Get the active spaceId from run state
        const activeSpaceId = context.getActiveSpaceId();
        if (!activeSpaceId) {
          return {
            success: false,
            error:
              'No active space. Call enter_space first before sending a message.',
          };
        }

        // 2. Persist the message
        const dbMessage = await createSmartSpaceMessage({
          smartSpaceId: activeSpaceId,
          entityId: context.agentEntityId,
          role: 'assistant',
          content: text,
          runId: context.runId,
        });

        // 3. Emit persisted message event to the space (with streamId so the
        //    client can replace the streaming entry with this record)
        await emitSmartSpaceEvent(activeSpaceId, {
          type: 'space.message',
          messageId: dbMessage.id,
          spaceId: activeSpaceId,
          entityId: context.agentEntityId,
          // streamId matches the toolCallId used during space.message.streaming
          // The run-runner sets this on the context before tool execution so the
          // client can dedup streaming vs persisted entries.
          content: text,
          role: 'assistant',
          createdAt: dbMessage.createdAt.toISOString(),
        });

        // 4. Trigger all other agent members of the space (sender excluded)
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
          status: 'delivered',
        };
      },
    }),
});
