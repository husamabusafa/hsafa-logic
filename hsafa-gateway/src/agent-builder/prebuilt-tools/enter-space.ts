import { tool, jsonSchema } from 'ai';
import { prisma } from '../../lib/db.js';
import { relativeTime } from '../../lib/time-utils.js';
import type { AgentProcessContext } from '../types.js';

// =============================================================================
// enter_space — Set the active space and return conversation history
//
// The spaceId input uses an enum populated from the agent's memberships at
// tool creation time. This forces ANY model to pick a real, valid UUID.
//
// Returns the last N messages from the space so the agent has full
// conversational context. This is the primary way the agent learns
// what has been said in the space.
// =============================================================================

const HISTORY_LIMIT = 20;

/**
 * Create the enter_space tool. Async because it loads the agent's
 * memberships from DB to build the spaceId enum.
 */
export async function createEnterSpaceTool(ctx: AgentProcessContext) {
  // Load memberships ONCE at tool creation time for the enum
  const memberships = await prisma.smartSpaceMembership.findMany({
    where: { entityId: ctx.agentEntityId },
    include: { smartSpace: { select: { id: true, name: true } } },
  });

  const validSpaceIds = memberships.map((m) => m.smartSpaceId);
  const spaceLabels = memberships
    .map((m) => `${m.smartSpaceId} = "${m.smartSpace.name ?? 'Unnamed'}"`)
    .join(', ');

  // Build the JSON Schema for spaceId — with enum if we have memberships
  const spaceIdSchema: Record<string, unknown> = {
    type: 'string',
    description: `UUID of the space to enter. Valid: ${spaceLabels || 'none'}`,
  };
  if (validSpaceIds.length > 0) {
    spaceIdSchema.enum = validSpaceIds;
  }

  return tool({
    description:
      'Enter a space to send messages and use tools there. Returns the recent conversation history so you can see what has been said.',
    inputSchema: jsonSchema<{ spaceId: string }>({
      type: 'object',
      properties: {
        spaceId: spaceIdSchema,
      },
      required: ['spaceId'],
    }),
    execute: async ({ spaceId }) => {
      // Validate UUID format
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!UUID_RE.test(spaceId)) {
        return {
          success: false,
          error: `"${spaceId}" is not a valid UUID. Use one of: ${spaceLabels || 'none'}`,
        };
      }

      // Validate membership
      const membership = await prisma.smartSpaceMembership.findUnique({
        where: {
          smartSpaceId_entityId: { smartSpaceId: spaceId, entityId: ctx.agentEntityId },
        },
        include: {
          smartSpace: { select: { name: true } },
        },
      });

      if (!membership) {
        return { success: false, error: 'Not a member of this space.' };
      }

      // Set active space
      ctx.setActiveSpaceId(spaceId);

      // Load recent conversation history
      const messages = await prisma.smartSpaceMessage.findMany({
        where: { smartSpaceId: spaceId },
        orderBy: { seq: 'desc' },
        take: HISTORY_LIMIT,
        include: {
          entity: { select: { id: true, displayName: true, type: true } },
        },
      });

      // Format as readable timeline (oldest first) with timestamps
      const now = new Date();
      const history = messages.reverse().map((m) => {
        const isYou = m.entityId === ctx.agentEntityId;
        const name = isYou ? 'You' : (m.entity.displayName ?? 'Unknown');
        const ago = relativeTime(m.createdAt, now);
        return `[${ago}] ${name}: "${m.content ?? ''}"`;
      });

      return {
        success: true,
        spaceId,
        spaceName: membership.smartSpace.name ?? 'Unnamed',
        history: history.length > 0 ? history : ['(no messages yet)'],
        totalMessages: messages.length,
      };
    },
  });
}
