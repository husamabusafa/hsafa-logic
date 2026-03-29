import type { RoutedEvent } from './event-router.js';
import { invoke } from './invoker.js';
import { publishRunEvent } from './stream-publisher.js';

// =============================================================================
// Coordinator (v7)
//
// Manages haseef triggering, concurrency, and interrupts.
// When an event arrives for a haseef that is already running, the current
// run is interrupted (aborted) and a new run starts with both the old
// context and the new event.
//
// Architecture:
//   routeEvent() → coordinator.trigger() → invoker.invoke()
// =============================================================================

interface ActiveRun {
  haseefId: string;
  runId: string;
  abortController: AbortController;
}

// Currently active runs per haseef (one at a time)
const activeRuns = new Map<string, ActiveRun>();

/**
 * Trigger a haseef with a routed event.
 * If the haseef is already running, interrupt the current run first.
 */
export async function trigger(event: RoutedEvent): Promise<{ runId: string }> {
  const existing = activeRuns.get(event.haseefId);

  if (existing) {
    // Interrupt the current run
    console.log(`[coordinator] Interrupting run ${existing.runId} for ${event.haseefName} (new event: ${event.type})`);
    existing.abortController.abort();
    activeRuns.delete(event.haseefId);

    // Mark the interrupted run
    publishRunEvent(event.haseefId, existing.runId, 'run.interrupted', {
      reason: `New ${event.type} event from ${event.scope}`,
    });
  }

  // Start a new run
  const abortController = new AbortController();
  const runId = crypto.randomUUID();

  activeRuns.set(event.haseefId, {
    haseefId: event.haseefId,
    runId,
    abortController,
  });

  // Fire and forget — the invoker handles its own lifecycle
  void runInvoker(event, runId, abortController).catch((err) => {
    console.error(`[coordinator] Run ${runId} for ${event.haseefName} failed:`, err);
  });

  return { runId };
}

async function runInvoker(
  event: RoutedEvent,
  runId: string,
  abortController: AbortController,
): Promise<void> {
  try {
    await invoke({
      haseefId: event.haseefId,
      haseefName: event.haseefName,
      runId,
      triggerScope: event.scope,
      triggerType: event.type,
      triggerData: event.data,
      attachments: event.attachments,
      signal: abortController.signal,
    });
  } finally {
    // Clean up — only if this is still the active run
    const current = activeRuns.get(event.haseefId);
    if (current && current.runId === runId) {
      activeRuns.delete(event.haseefId);
    }
  }
}

/**
 * Check if a haseef currently has an active run.
 */
export function isRunning(haseefId: string): boolean {
  return activeRuns.has(haseefId);
}

/**
 * Get the active run ID for a haseef, if any.
 */
export function getActiveRunId(haseefId: string): string | undefined {
  return activeRuns.get(haseefId)?.runId;
}

/**
 * Get all currently active haseef IDs.
 */
export function getActiveHaseefIds(): string[] {
  return [...activeRuns.keys()];
}
