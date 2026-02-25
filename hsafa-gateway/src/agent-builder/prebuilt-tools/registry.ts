import type { AgentProcessContext } from '../types.js';
import { createEnterSpaceTool } from './enter-space.js';
import { createLeaveSpaceTool } from './leave-space.js';
import { createSendMessageTool } from './send-message.js';
import { createReadMessagesTool } from './read-messages.js';
import { createPeekInboxTool } from './peek-inbox.js';
import { createSkipTool } from './skip.js';
import { createSetMemoriesTool } from './set-memories.js';
import { createGetMemoriesTool } from './get-memories.js';
import { createDeleteMemoriesTool } from './delete-memories.js';
import { createSetGoalsTool } from './set-goals.js';
import { createDeleteGoalsTool } from './delete-goals.js';
import { createSetPlansTool } from './set-plans.js';
import { createGetPlansTool } from './get-plans.js';
import { createDeletePlansTool } from './delete-plans.js';

// =============================================================================
// Prebuilt Tools Registry (v3)
//
// Every agent receives these tools regardless of custom tool config.
// They handle space interaction, messaging, and persistent state.
// =============================================================================

export interface PrebuiltToolsResult {
  tools: Record<string, unknown>;
  visibleToolNames: Set<string>;
}

/**
 * Build all prebuilt tools for an agent process.
 * Returns tools + the set of visible tool names (only send_message).
 */
export function buildPrebuiltTools(ctx: AgentProcessContext): PrebuiltToolsResult {
  const tools: Record<string, unknown> = {
    // Space tools
    enter_space: createEnterSpaceTool(ctx),
    leave_space: createLeaveSpaceTool(ctx),
    send_message: createSendMessageTool(ctx),
    read_messages: createReadMessagesTool(ctx),
    peek_inbox: createPeekInboxTool(ctx),

    // Cycle control
    skip: createSkipTool(),

    // Memory tools
    set_memories: createSetMemoriesTool(ctx),
    get_memories: createGetMemoriesTool(ctx),
    delete_memories: createDeleteMemoriesTool(ctx),

    // Goal tools
    set_goals: createSetGoalsTool(ctx),
    delete_goals: createDeleteGoalsTool(ctx),

    // Plan tools
    set_plans: createSetPlansTool(ctx),
    get_plans: createGetPlansTool(ctx),
    delete_plans: createDeletePlansTool(ctx),
  };

  // Only send_message is visible (streamed to the active space)
  const visibleToolNames = new Set<string>(['send_message']);

  return { tools, visibleToolNames };
}
