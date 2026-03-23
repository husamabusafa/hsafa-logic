import { tool } from 'ai';
import { z } from 'zod';

// =============================================================================
// done — Signal run completion (v6 — Event-Driven)
//
// The agent calls this to say "I'm finished processing this event."
// hasToolCall('done') in stopWhen stops the stream loop AFTER execution,
// ensuring a proper tool-result is included in consciousness.
//
// The done summary is used by extractRunSummary() in consciousness.ts
// for archive compaction — this is why keeping done is valuable.
//
// NOTE: The execute function is required. Without it, no tool-result is
// generated, and OpenAI's Responses API rejects the next run with
// "No tool output found for function call".
// =============================================================================

export function createDoneTool() {
  return tool({
    description:
      'Call this when you are finished processing events. Provide a brief summary — ONE SHORT SENTENCE ONLY (10 words max). Examples: "Sent reply to Sarah." or "No action needed." If nothing to do, just call done without a summary.',
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
