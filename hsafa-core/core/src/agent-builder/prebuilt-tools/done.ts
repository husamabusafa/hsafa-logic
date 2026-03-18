import { tool } from 'ai';
import { z } from 'zod';

// =============================================================================
// done — Signal cycle completion (replaces skip)
//
// The agent calls this to say "I'm finished". The execute function returns
// immediately, and hasToolCall('done') in stopWhen stops the loop AFTER
// execution — ensuring a proper tool-result is included in consciousness.
//
// NOTE: The execute function is required. Without it, no tool-result is
// generated, and OpenAI's Responses API rejects the next cycle with
// "No tool output found for function call".
//
// Every cycle is real — no rollback, no amnesia. Even "nothing to do" cycles
// are tracked so the agent remembers evaluating the inbox.
// =============================================================================

export function createDoneTool() {
  return tool({
    description:
      'Call this when you are finished with this cycle. If you accomplished something, provide a brief summary — ONE SHORT SENTENCE ONLY (10 words max). Examples: "Sent reply to Sarah." or "No action needed." If nothing to do, If there was nothing to do, just call done without a summary.',
    inputSchema: z.object({
      summary: z
        .string()
        .optional()
        .describe('One short sentence (10 words max). Examples: "Sent reply to Sarah." "No action needed." Omit if nothing to do.'),
    }),
    execute: async ({ summary }) => {
      return { done: true, ...(summary ? { summary } : {}) };
    },
  });
}
