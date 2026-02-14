import { registerPrebuiltTool } from './registry.js';

registerPrebuiltTool('delegateToAgent', {
  defaultDescription:
    'Delegate this message to another agent who is better suited to respond. ' +
    'You will NOT produce a response — your run will be silently canceled and the target agent will handle it instead. ' +
    'Use this when the message is clearly meant for another agent or when another agent has the right tools/expertise. ' +
    'Decide BEFORE generating any text. The available agents and their entity IDs are listed in your system prompt.',

  inputSchema: {
    type: 'object',
    properties: {
      targetAgentEntityId: {
        type: 'string',
        description: 'Entity ID of the agent to delegate to (from your system prompt)',
      },
      reason: {
        type: 'string',
        description: 'Why this agent is better suited (passed as context to them)',
      },
    },
    required: ['targetAgentEntityId'],
  },

  async execute(input: unknown) {
    const { targetAgentEntityId, reason } = input as {
      targetAgentEntityId: string;
      reason?: string;
    };
    // Actual delegation is handled by run-runner after the stream completes.
    // This returns a signal similar to skipResponse.
    return {
      delegated: true,
      targetAgentEntityId,
      reason: reason ?? null,
    };
  },
});
