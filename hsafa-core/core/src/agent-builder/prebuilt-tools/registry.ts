import type { HaseefProcessContext } from '../types.js';
import { createDoneTool } from './done.js';
import { createPeekInboxTool } from './peek-inbox.js';
import { createSetMemoriesTool } from './set-memories.js';
import { createDeleteMemoriesTool } from './delete-memories.js';
import { createRecallMemoriesTool } from './recall-memories.js';

// =============================================================================
// Prebuilt Tools Registry (v5)
//
// Every Haseef receives these tools regardless of scoped tool config.
// They handle inbox, persistent memory, and cycle termination.
// Domain-specific tools come from external services via HaseefTool DB rows.
//
// Cycle termination: The `done` tool is mandatory. Combined with
// toolChoice: 'required' and hasToolCall('done') in stopWhen, the model
// MUST call done to end a cycle. This prevents bare text output (which
// would be invisible internal thought) and gives a clean exit signal.
// =============================================================================

/**
 * Build all prebuilt tools for a Haseef process.
 */
export function buildPrebuiltTools(ctx: HaseefProcessContext): Record<string, unknown> {
  return {
    done: createDoneTool(),
    peek_inbox: createPeekInboxTool(ctx),
    set_memories: createSetMemoriesTool(ctx),
    delete_memories: createDeleteMemoriesTool(ctx),
    recall_memories: createRecallMemoriesTool(ctx),
  };
}
