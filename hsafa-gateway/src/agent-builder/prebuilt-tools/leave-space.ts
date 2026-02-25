import { tool, jsonSchema } from 'ai';
import type { AgentProcessContext } from '../types.js';

// =============================================================================
// leave_space — Clear the active space
// =============================================================================

export function createLeaveSpaceTool(ctx: AgentProcessContext) {
  return tool({
    description:
      'Leave the current active space. After this, send_message will not work until you call enter_space again. Use this when you are done interacting with a space and do not want messages routed there.',
    inputSchema: jsonSchema<{}>({
      type: 'object',
      properties: {},
    }),
    execute: async () => {
      const currentSpaceId = ctx.getActiveSpaceId();
      if (!currentSpaceId) {
        return { success: false, error: 'You are not in any space.' };
      }

      ctx.clearActiveSpaceId();
      return { success: true, leftSpaceId: currentSpaceId };
    },
  });
}
