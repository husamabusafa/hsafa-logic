import { registerPrebuiltTool } from './registry.js';

registerPrebuiltTool('mentionAgent', {
  defaultDescription:
    'After your response, trigger another agent to continue the conversation. ' +
    'Set expectReply=true if you need to continue your task after they respond — you will be automatically re-triggered when they finish. ' +
    'If you don\'t mention anyone, the conversation waits for the next human message. ' +
    'The available agents and their entity IDs are listed in your system prompt.',

  inputSchema: {
    type: 'object',
    properties: {
      targetAgentEntityId: {
        type: 'string',
        description: 'Entity ID of the agent to trigger next (from your system prompt)',
      },
      reason: {
        type: 'string',
        description: 'Brief context for why this agent should respond (injected into their prompt)',
      },
      expectReply: {
        type: 'boolean',
        description:
          'If true, you will be re-triggered after the target agent finishes. Use when you need their output to continue your task.',
      },
    },
    required: ['targetAgentEntityId'],
  },

  async execute(input: unknown) {
    const { targetAgentEntityId, reason, expectReply } = input as {
      targetAgentEntityId: string;
      reason?: string;
      expectReply?: boolean;
    };
    // Actual triggering is handled by run-runner after the stream completes.
    // This just returns a signal so run-runner can detect it.
    return {
      mentioned: true,
      targetAgentEntityId,
      reason: reason ?? null,
      expectReply: expectReply ?? false,
    };
  },
});
