import { addEpisode } from './episodic.js';

// =============================================================================
// Reflection (v7)
//
// Post-run reflection: extracts episodic memory from a completed run.
// Called by the invoker after a run finishes.
// Future: also extract social observations and procedural patterns.
// =============================================================================

export interface RunSummary {
  haseefId: string;
  runId: string;
  triggerScope?: string;
  triggerType?: string;
  toolsUsed: string[];
  summary: string;
}

/**
 * Perform post-run reflection.
 * Stores an episodic memory summarizing what happened.
 */
export async function reflect(run: RunSummary): Promise<void> {
  await addEpisode(run.haseefId, {
    runId: run.runId,
    summary: run.summary,
    context: {
      triggerScope: run.triggerScope,
      triggerType: run.triggerType,
      toolsUsed: run.toolsUsed,
    },
  });
}
