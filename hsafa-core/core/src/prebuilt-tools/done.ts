import { tool } from 'ai';
import { z } from 'zod';

// =============================================================================
// done — Signal run completion (v7 prebuilt tool)
//
// The LLM MUST call this as the last tool in every run.
// The summary is stored on the Run record and used for episodic memory.
// =============================================================================

export const doneTool = (tool as any)({
  description: 'Signal that you are done processing this event. You MUST call this as your last action. Include a brief summary of what you did.',
  parameters: z.object({
    summary: z.string().describe('Brief summary of what you accomplished in this run'),
  }),
  execute: async ({ summary }: { summary: string }) => {
    // The invoker detects the "done" tool call and stops the loop.
    // This execute function is a no-op — the invoker intercepts it.
    return { status: 'done', summary };
  },
});
