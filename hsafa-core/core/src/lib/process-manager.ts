import { prisma } from './db.js';
import { startHaseefProcess } from './agent-process.js';

// =============================================================================
// Process Manager (v4)
//
// Manages all Haseef processes. One process per Haseef.
// Spawns processes at startup, handles dynamic creation/deletion.
// =============================================================================

interface HaseefProcessHandle {
  haseefId: string;
  haseefEntityId: string;
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
  haseefEntityId: string,
  haseefName: string,
): Promise<void> {
  if (processes.has(haseefEntityId)) {
    console.log(`[process-manager] ${haseefName} already running — skipping`);
    return;
  }

  const abortController = new AbortController();

  const promise = startHaseefProcess({
    haseefId,
    haseefEntityId,
    haseefName,
    signal: abortController.signal,
  }).catch((err) => {
    console.error(`[process-manager] ${haseefName} process crashed:`, err);
    processes.delete(haseefEntityId);
  });

  processes.set(haseefEntityId, {
    haseefId,
    haseefEntityId,
    haseefName,
    abortController,
    promise,
  });

  console.log(`[process-manager] Started process for ${haseefName} (${haseefEntityId})`);
}

/**
 * Stop a process for a single Haseef.
 * Signals abort and waits for graceful shutdown.
 */
export async function stopProcess(haseefEntityId: string): Promise<void> {
  const handle = processes.get(haseefEntityId);
  if (!handle) return;

  console.log(`[process-manager] Stopping ${handle.haseefName}...`);
  handle.abortController.abort();

  // Wait for graceful shutdown (max 10s)
  await Promise.race([
    handle.promise,
    new Promise((r) => setTimeout(r, 10_000)),
  ]);

  processes.delete(haseefEntityId);
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
  const haseefs = await prisma.haseef.findMany({
    include: {
      entity: {
        select: { id: true, displayName: true },
      },
    },
  });

  console.log(`[process-manager] Starting ${haseefs.length} Haseef processes...`);

  for (const h of haseefs) {
    if (!h.entity) {
      console.warn(`[process-manager] Haseef ${h.name} has no entity — skipping`);
      continue;
    }

    await startProcess(
      h.id,
      h.entity.id,
      h.name,
    );
  }

  console.log(`[process-manager] All ${haseefs.length} processes started`);
}

/**
 * Stop all running processes.
 * Called at graceful shutdown.
 */
export async function stopAllProcesses(): Promise<void> {
  console.log(`[process-manager] Stopping all ${processes.size} processes...`);

  const stopPromises = Array.from(processes.keys()).map((entityId) =>
    stopProcess(entityId),
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
export function isProcessRunning(haseefEntityId: string): boolean {
  return processes.has(haseefEntityId);
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
  haseefEntityId: string;
  haseefName: string;
}> {
  return Array.from(processes.values()).map((h) => ({
    haseefId: h.haseefId,
    haseefEntityId: h.haseefEntityId,
    haseefName: h.haseefName,
  }));
}
