import type { HaseefProcessContext } from '../types.js';
import { createDoneTool } from './done.js';
import { createSetMemoriesTool } from './set-memories.js';
import { createDeleteMemoriesTool } from './delete-memories.js';
import { createRecallMemoriesTool } from './recall-memories.js';

// =============================================================================
// Prebuilt Tools Registry (v6 — Event-Driven)
//
// Every Haseef receives these tools regardless of scoped tool config.
// They handle run termination and persistent memory. Domain-specific tools
// come from external services via HaseefTool DB rows.
//
// v6 changes:
//   - Kept `done` tool — provides clean termination + summaries for archival
//   - Removed `peek_inbox` tool — no inbox to peek (event-driven, not batched)
//
// Run termination: The `done` tool is mandatory. Combined with
// toolChoice: 'required' and hasToolCall('done') in stopWhen, the model
// MUST call done to finish processing. This prevents bare text output
// and provides summaries for consciousness archival.
// =============================================================================

/**
 * Build all prebuilt tools for a Haseef process.
 */
export function buildPrebuiltTools(ctx: HaseefProcessContext): Record<string, unknown> {
  return {
    done: createDoneTool(),
    set_memories: createSetMemoriesTool(ctx),
    delete_memories: createDeleteMemoriesTool(ctx),
    recall_memories: createRecallMemoriesTool(ctx),
  };
}
