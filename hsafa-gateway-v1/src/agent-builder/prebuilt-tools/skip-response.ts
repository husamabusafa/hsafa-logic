import { registerPrebuiltTool } from './registry.js';

registerPrebuiltTool('skipResponse', {
  defaultDescription:
    'Call this tool to skip responding in this conversation. Use it when you have nothing meaningful to add — your run will be silently canceled and no message will be posted. Decide BEFORE generating any text.',

  inputSchema: {
    type: 'object',
    properties: {
      reason: {
        type: 'string',
        description: 'Optional internal reason for skipping (not shown to anyone).',
      },
    },
  },

  async execute(input: unknown) {
    // The actual skip logic is handled by the stream processor + run runner.
    // This execute just returns a signal — the stream processor detects the
    // tool name and sets the skipped flag.
    return { skipped: true };
  },
});
