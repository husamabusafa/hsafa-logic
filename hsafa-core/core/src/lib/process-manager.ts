import { prisma } from './db.js';
import { startHaseefProcess } from './agent-process.js';

// =============================================================================
// Process Manager (v5)
//
// Manages all Haseef processes. One process per Haseef.
// Spawns processes at startup, handles dynamic creation/deletion.
// =============================================================================

interface HaseefProcessHandle {
  haseefId: string;
  haseefName: string;
  abortController: AbortController;
  /** The running promise — resolves when the process exits */
  promise: Promise<void>;
}

const processes = new Map<string, HaseefProcessHandle>();

// =============================================================================
// Start / Stop individual processes
// =============================================================================

/**
 * Start a process for a single Haseef.
 * No-op if already running.
 */
export async function startProcess(
  haseefId: string,
  haseefName: string,
): Promise<void> {
  if (processes.has(haseefId)) {
    console.log(`[process-manager] ${haseefName} already running — skipping`);
    return;
  }

  const abortController = new AbortController();

  const promise = startHaseefProcess({
    haseefId,
    haseefName,
    signal: abortController.signal,
  }).catch((err: unknown) => {
    console.error(`[process-manager] ${haseefName} process crashed:`, err);
    processes.delete(haseefId);
  });

  processes.set(haseefId, {
    haseefId,
    haseefName,
    abortController,
    promise,
  });

  console.log(`[process-manager] Started process for ${haseefName} (${haseefId})`);
}

/**
 * Stop a process for a single Haseef.
 * Signals abort and waits for graceful shutdown.
 */
export async function stopProcess(haseefId: string): Promise<void> {
  const handle = processes.get(haseefId);
  if (!handle) return;

  console.log(`[process-manager] Stopping ${handle.haseefName}...`);
  handle.abortController.abort();

  // Wait for graceful shutdown (max 10s)
  await Promise.race([
    handle.promise,
    new Promise((r) => setTimeout(r, 10_000)),
  ]);

  processes.delete(haseefId);
  console.log(`[process-manager] Stopped ${handle.haseefName}`);
}

// =============================================================================
// Batch operations
// =============================================================================

/**
 * Start processes for ALL Haseefs in the database.
 * Called at gateway startup.
 */
export async function startAllProcesses(): Promise<void> {
  const haseefs = await prisma.haseef.findMany();

  console.log(`[process-manager] Starting ${haseefs.length} Haseef processes...`);

  for (const h of haseefs) {
    await startProcess(h.id, h.name);
  }

  console.log(`[process-manager] All ${haseefs.length} processes started`);
}

/**
 * Stop all running processes.
 * Called at graceful shutdown.
 */
export async function stopAllProcesses(): Promise<void> {
  console.log(`[process-manager] Stopping all ${processes.size} processes...`);

  const stopPromises = Array.from(processes.keys()).map((haseefId) =>
    stopProcess(haseefId),
  );

  await Promise.allSettled(stopPromises);
  console.log('[process-manager] All processes stopped');
}

// =============================================================================
// Query
// =============================================================================

/**
 * Check if a Haseef process is running.
 */
export function isProcessRunning(haseefId: string): boolean {
  return processes.has(haseefId);
}

/**
 * Get the count of running processes.
 */
export function getProcessCount(): number {
  return processes.size;
}

/**
 * Get status of all running processes.
 */
export function getProcessStatuses(): Array<{
  haseefId: string;
  haseefName: string;
}> {
  return Array.from(processes.values()).map((h) => ({
    haseefId: h.haseefId,
    haseefName: h.haseefName,
  }));
}
