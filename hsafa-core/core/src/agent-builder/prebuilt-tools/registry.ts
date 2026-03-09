import type { HaseefProcessContext } from '../types.js';
import { createPeekInboxTool } from './peek-inbox.js';
import { createDoneTool } from './done.js';
import { createSetMemoriesTool } from './set-memories.js';
import { createDeleteMemoriesTool } from './delete-memories.js';
import { createRecallMemoriesTool } from './recall-memories.js';

// =============================================================================
// Prebuilt Tools Registry (v5)
//
// Every Haseef receives these tools regardless of scoped tool config.
// They handle inbox, persistent memory, and cycle control.
// Domain-specific tools come from external services via HaseefTool DB rows.
// =============================================================================

/**
 * Build all prebuilt tools for a Haseef process.
 */
export function buildPrebuiltTools(ctx: HaseefProcessContext): Record<string, unknown> {
  return {
    peek_inbox: createPeekInboxTool(ctx),
    done: createDoneTool(),
    set_memories: createSetMemoriesTool(ctx),
    delete_memories: createDeleteMemoriesTool(ctx),
    recall_memories: createRecallMemoriesTool(ctx),
  };
}
