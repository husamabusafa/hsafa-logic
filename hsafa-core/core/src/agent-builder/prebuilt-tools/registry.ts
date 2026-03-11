import type { HaseefProcessContext } from '../types.js';
import { createPeekInboxTool } from './peek-inbox.js';
import { createSetMemoriesTool } from './set-memories.js';
import { createDeleteMemoriesTool } from './delete-memories.js';
import { createRecallMemoriesTool } from './recall-memories.js';

// =============================================================================
// Prebuilt Tools Registry (v5)
//
// Every Haseef receives these tools regardless of scoped tool config.
// They handle inbox and persistent memory.
// Domain-specific tools come from external services via HaseefTool DB rows.
//
// The AI finishes a cycle naturally when it has no more tool calls to make.
// No explicit "done" tool needed — streamText stops when the model generates
// only text (no tool calls) in a step.
// =============================================================================

/**
 * Build all prebuilt tools for a Haseef process.
 */
export function buildPrebuiltTools(ctx: HaseefProcessContext): Record<string, unknown> {
  return {
    peek_inbox: createPeekInboxTool(ctx),
    set_memories: createSetMemoriesTool(ctx),
    delete_memories: createDeleteMemoriesTool(ctx),
    recall_memories: createRecallMemoriesTool(ctx),
  };
}
