import { registerPrebuiltTool } from './registry.js';
import type { PrebuiltToolContext } from '../builder.js';
import { prisma } from '../../lib/db.js';
import { createSmartSpaceMessage } from '../../lib/smartspace-db.js';
import { emitSmartSpaceEvent } from '../../lib/smartspace-events.js';
import { triggerMentionedAgent } from '../../lib/agent-trigger.js';
import { redis } from '../../lib/redis.js';
import { Prisma } from '@prisma/client';

/**
 * sendSpaceMessage — Unified send + optional mention + optional wait.
 *
 * This is the agent's PRIMARY tool for all communication.
 * Replaces: old sendSpaceMessage, sendSpaceMessageAndWait, mentionAgent.
 *
 * The `text` argument streams via tool-input-delta interception in stream-processor.ts
 * for real LLM streaming to the target space.
 */

registerPrebuiltTool('sendSpaceMessage', {
  inputSchema: {
    type: 'object',
    properties: {
      spaceId: {
        type: 'string',
        description: 'ID of the space to send to. Must be a space you are a member of.',
      },
      text: {
        type: 'string',
        description: 'Message content to send.',
      },
      mention: {
        type: 'string',
        description: 'Optional: Entity ID of an agent to mention. This agent will be triggered to respond after your message is posted.',
      },
      wait: {
        type: 'object',
        description: 'Optional: Wait for a reply after sending. The tool blocks until a matching reply arrives or timeout.',
        properties: {
          for: {
            type: 'array',
            description: 'Wait conditions (OR logic — first match wins).',
            items: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: ['any', 'agent', 'human', 'entity'],
                  description: "'any' = any message, 'agent' = any agent reply, 'human' = any human reply, 'entity' = specific entity.",
                },
                entityId: {
                  type: 'string',
                  description: "Required when type='entity'. The specific entity ID to wait for.",
                },
              },
              required: ['type'],
            },
            minItems: 1,
          },
          timeout: {
            type: 'number',
            description: 'Max seconds to wait (default 60, max 120).',
            default: 60,
          },
        },
        required: ['for'],
      },
    },
    required: ['spaceId', 'text'],
  },
  defaultDescription:
    'Send a message to a space you are a member of. This is your primary way to communicate. Optionally mention an agent to trigger them. Optionally wait for a reply.',

  execute: async (input: unknown, context: PrebuiltToolContext) => {
    const { spaceId, text, mention, wait } = input as {
      spaceId: string;
      text: string;
      mention?: string;
      wait?: {
        for: Array<{ type: 'any' | 'agent' | 'human' | 'entity'; entityId?: string }>;
        timeout?: number;
      };
    };

    // Validate membership
    const membership = await prisma.smartSpaceMembership.findUnique({
      where: {
        smartSpaceId_entityId: {
          smartSpaceId: spaceId,
          entityId: context.agentEntityId,
        },
      },
    });

    if (!membership) {
      return { error: `You are not a member of space ${spaceId}` };
    }

    // Get agent display name for events
    const agentEntity = await prisma.entity.findUnique({
      where: { id: context.agentEntityId },
      select: { displayName: true },
    });
    const agentName = agentEntity?.displayName || 'AI Assistant';

    // Persist the message
    const dbMessage = await createSmartSpaceMessage({
      smartSpaceId: spaceId,
      entityId: context.agentEntityId,
      role: 'assistant',
      content: text,
      metadata: {
        runId: context.runId,
        sentViaTool: true,
      } as unknown as Prisma.InputJsonValue,
      runId: context.runId,
    });

    // Emit message event to the space
    const uiMessage = {
      id: dbMessage.id,
      role: 'assistant',
      parts: [{ type: 'text', text }],
      entityId: context.agentEntityId,
      entityType: 'agent',
      entityName: agentName,
    };

    await emitSmartSpaceEvent(
      spaceId,
      'smartSpace.message',
      { message: uiMessage },
      { runId: context.runId, entityId: context.agentEntityId, entityType: 'agent', agentEntityId: context.agentEntityId }
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

    // If no wait, return immediately (fire-and-forget)
    if (!wait) {
      return { messageId: dbMessage.id, sent: true };
    }

    // Blocking wait: subscribe to the space's Redis pub/sub and wait for a matching reply
    const timeout = Math.min(Math.max(wait.timeout ?? 60, 1), 120);
    const conditions = wait.for;

    return new Promise<unknown>((resolve) => {
      const notifyChannel = `smartSpace:${spaceId}:notify`;
      const streamKey = `smartSpace:${spaceId}:stream`;
      let lastSeenId = '$';
      let settled = false;

      const subscriber = redis.duplicate();

      const cleanup = async () => {
        if (settled) return;
        settled = true;
        try {
          await subscriber.unsubscribe(notifyChannel);
          await subscriber.quit();
        } catch {
          // ignore
        }
      };

      // Timeout handler
      const timer = setTimeout(async () => {
        await cleanup();
        resolve({ messageId: dbMessage.id, sent: true, timedOut: true, reply: null });
      }, timeout * 1000);

      // Check if an incoming message matches any wait condition
      const matchesCondition = (
        senderEntityId: string,
        senderType: string,
      ): boolean => {
        // Don't match our own messages
        if (senderEntityId === context.agentEntityId) return false;

        for (const cond of conditions) {
          if (cond.type === 'any') return true;
          if (cond.type === 'agent' && senderType === 'agent') return true;
          if (cond.type === 'human' && senderType === 'human') return true;
          if (cond.type === 'entity' && cond.entityId === senderEntityId) return true;
        }
        return false;
      };

      subscriber.on('message', async (channel: string) => {
        if (channel !== notifyChannel || settled) return;

        try {
          const newEvents = await redis.xread('STREAMS', streamKey, lastSeenId);
          if (!newEvents || newEvents.length === 0) return;

          for (const [, messages] of newEvents) {
            for (const [id, fields] of messages) {
              lastSeenId = id;
              if (settled) return;

              // Parse the event
              const typeIdx = fields.indexOf('type');
              const payloadIdx = fields.indexOf('payload');
              if (typeIdx === -1 || payloadIdx === -1) continue;

              const eventType = fields[typeIdx + 1];
              if (eventType !== 'smartSpace.message') continue;

              let payload: any;
              try {
                payload = JSON.parse(fields[payloadIdx + 1]);
              } catch {
                continue;
              }

              const senderEntityId = payload?.entityId;
              const senderType = payload?.entityType;
              const msgData = payload?.data?.message;

              if (!senderEntityId || !msgData) continue;

              if (matchesCondition(senderEntityId, senderType)) {
                clearTimeout(timer);
                await cleanup();

                // Look up sender name
                const senderEntity = await prisma.entity.findUnique({
                  where: { id: senderEntityId },
                  select: { displayName: true, type: true },
                });

                resolve({
                  messageId: dbMessage.id,
                  sent: true,
                  timedOut: false,
                  reply: {
                    text: msgData.parts?.[0]?.text || msgData.content || '',
                    entityId: senderEntityId,
                    entityName: senderEntity?.displayName || 'Unknown',
                    entityType: senderEntity?.type || senderType,
                  },
                });
                return;
              }
            }
          }
        } catch (err) {
          console.error(`[sendSpaceMessage.wait] Error reading stream:`, err);
        }
      });

      // Initialize: get last stream ID, then subscribe
      (async () => {
        try {
          const last = await redis.xrevrange(streamKey, '+', '-', 'COUNT', 1);
          if (Array.isArray(last) && last.length > 0) {
            lastSeenId = last[0][0];
          } else {
            lastSeenId = '0-0';
          }
          await subscriber.subscribe(notifyChannel);
        } catch (err) {
          console.error(`[sendSpaceMessage.wait] Failed to subscribe:`, err);
          clearTimeout(timer);
          await cleanup();
          resolve({ messageId: dbMessage.id, sent: true, timedOut: true, reply: null, error: 'Subscribe failed' });
        }
      })();
    });
  },
});
