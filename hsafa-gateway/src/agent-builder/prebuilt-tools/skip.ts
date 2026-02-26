import { jsonSchema } from 'ai';

// =============================================================================
// skip — Signal that inbox events are irrelevant, skip the cycle entirely
//
// No execute function — the SDK stops the loop immediately at step 0.
// The gateway detects this tool call and rolls back the entire cycle:
// no consciousness update, no run record, no cycle count increment.
// =============================================================================

export function createSkipTool() {
  return {
    description:
      'Call this ONLY when the inbox events are clearly not relevant to you and another agent or human will handle them. This skips the cycle entirely — no messages will be sent, no consciousness update. If a human has addressed you by name, do NOT skip — respond instead.',
    inputSchema: jsonSchema<{ reason?: string }>({
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Brief reason for skipping (internal log only, not shown to users)',
        },
      },
    }),
    // No execute — SDK stops the loop immediately
  };
}
