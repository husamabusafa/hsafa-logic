import type { HaseefProcessContext } from '../types.js';
import { createPeekInboxTool } from './peek-inbox.js';
import { createDoneTool } from './done.js';
import { createSetMemoriesTool } from './set-memories.js';
import { createDeleteMemoriesTool } from './delete-memories.js';
import { createSetGoalsTool } from './set-goals.js';
import { createDeleteGoalsTool } from './delete-goals.js';
import { createSetPlansTool } from './set-plans.js';
import { createDeletePlansTool } from './delete-plans.js';

// =============================================================================
// Prebuilt Tools Registry (v4)
//
// Every Haseef receives these tools regardless of custom tool config.
// They handle inbox, persistent state, and cycle control.
// Domain-specific tools (messaging, email, etc.) come from extensions.
// =============================================================================

export interface PrebuiltToolsResult {
  tools: Record<string, unknown>;
}

/**
 * Build all prebuilt tools for a Haseef process.
 * Returns the tools object.
 */
export async function buildPrebuiltTools(ctx: HaseefProcessContext): Promise<PrebuiltToolsResult> {
  const tools: Record<string, unknown> = {
    peek_inbox: createPeekInboxTool(ctx),

    // Cycle control — no execute, SDK stops immediately
    done: createDoneTool(),

    // Memory tools
    set_memories: createSetMemoriesTool(ctx),
    delete_memories: createDeleteMemoriesTool(ctx),

    // Goal tools
    set_goals: createSetGoalsTool(ctx),
    delete_goals: createDeleteGoalsTool(ctx),

    // Plan tools
    set_plans: createSetPlansTool(ctx),
    delete_plans: createDeletePlansTool(ctx),
  };

  return { tools };
}
