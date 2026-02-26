import { tool, jsonSchema } from 'ai';
import { prisma } from '../../lib/db.js';
import { relativeTime } from '../../lib/time-utils.js';
import { getSpacesForEntity } from '../../lib/membership-service.js';
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

const HISTORY_LIMIT = 100;

/**
 * Create the enter_space tool. Async because it loads the agent's
 * memberships from DB to build the spaceId enum.
 */
export async function createEnterSpaceTool(ctx: AgentProcessContext) {
  // Load memberships ONCE at tool creation time for the enum (cached)
  const spaces = await getSpacesForEntity(ctx.agentEntityId);

  const validSpaceIds = spaces.map((s) => s.spaceId);
  const spaceLabels = spaces
    .map((s) => `${s.spaceId} = "${s.spaceName}"`)
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
      'Enter a space and load its conversation history. Call this first to see what was said. IMPORTANT: your text output is invisible — after reading the history you MUST call send_message({ text }) to actually deliver a reply. Calling enter_space alone sends nothing.',
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

      try {
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
      } catch (err) {
        console.error(`[enter_space] ${ctx.agentName} FAILED to enter space ${spaceId}:`, err);
        return {
          success: false,
          error: `Failed to enter space — internal error: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  });
}
