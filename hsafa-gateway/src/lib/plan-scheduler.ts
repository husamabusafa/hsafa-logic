import { executeDuePlans } from './plan-executor.js';

/**
 * Plan Scheduler
 *
 * Runs on an interval, checking for due plans and executing them.
 * Starts automatically when startPlanScheduler() is called (typically at gateway boot).
 */

const DEFAULT_INTERVAL_MS = 30_000; // Check every 30 seconds

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

async function tick(): Promise<void> {
  if (isRunning) {
    // Previous tick still running — skip this one to avoid overlapping executions
    return;
  }
  isRunning = true;
  try {
    await executeDuePlans();
  } catch (err) {
    console.error('[plan-scheduler] Error in plan execution cycle:', err);
  } finally {
    isRunning = false;
  }
}

export function startPlanScheduler(intervalMs = DEFAULT_INTERVAL_MS): void {
  if (intervalHandle) {
    console.warn('[plan-scheduler] Already running');
    return;
  }

  console.log(`⏰ Plan scheduler started (checking every ${intervalMs / 1000}s)`);
  intervalHandle = setInterval(tick, intervalMs);

  // Run immediately on start to catch any overdue plans
  tick();
}

export function stopPlanScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log('[plan-scheduler] Stopped');
  }
}
