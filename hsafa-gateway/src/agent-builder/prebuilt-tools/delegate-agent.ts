import { registerPrebuiltTool } from './registry.js';

/**
 * delegateToAgent — Admin-only silent handoff.
 * 
 * When called, the current run is canceled (no message posted) and the
 * target agent is triggered with the ORIGINAL human trigger context.
 * The human never sees the switch.
 * 
 * Only available to the admin agent in multi-agent spaces.
 */

registerPrebuiltTool('delegateToAgent', {
  inputSchema: {
    type: 'object',
    properties: {
      targetAgentEntityId: {
        type: 'string',
        description: 'Entity ID of the agent to delegate to. Must be another agent in this space.',
      },
      reason: {
        type: 'string',
        description: 'Brief reason for delegating (for internal logging only).',
      },
    },
    required: ['targetAgentEntityId'],
  },
  defaultDescription:
    'Silently hand off to another agent. Your run is canceled (no message posted) and the target agent receives the original human message as their trigger. Use when another agent is better suited for this task.',

  execute: async (input: unknown) => {
    const { targetAgentEntityId, reason } = input as {
      targetAgentEntityId: string;
      reason?: string;
    };

    return {
      __delegateSignal: true,
      targetAgentEntityId,
      reason: reason || null,
    };
  },
});
