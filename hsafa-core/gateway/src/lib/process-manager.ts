import { prisma } from './db.js';
import { startAgentProcess } from './agent-process.js';

// =============================================================================
// Process Manager (v3)
//
// Manages all agent processes. One process per agent.
// Spawns processes at startup, handles dynamic creation/deletion.
// =============================================================================

interface AgentProcessHandle {
  agentId: string;
  agentEntityId: string;
  agentName: string;
  abortController: AbortController;
  /** The running promise — resolves when the process exits */
  promise: Promise<void>;
}

const processes = new Map<string, AgentProcessHandle>();

// =============================================================================
// Start / Stop individual processes
// =============================================================================

/**
 * Start a process for a single agent.
 * No-op if already running.
 */
export async function startProcess(
  agentId: string,
  agentEntityId: string,
  agentName: string,
): Promise<void> {
  if (processes.has(agentEntityId)) {
    console.log(`[process-manager] ${agentName} already running — skipping`);
    return;
  }

  const abortController = new AbortController();

  const promise = startAgentProcess({
    agentId,
    agentEntityId,
    agentName,
    signal: abortController.signal,
  }).catch((err) => {
    console.error(`[process-manager] ${agentName} process crashed:`, err);
    processes.delete(agentEntityId);
  });

  processes.set(agentEntityId, {
    agentId,
    agentEntityId,
    agentName,
    abortController,
    promise,
  });

  console.log(`[process-manager] Started process for ${agentName} (${agentEntityId})`);
}

/**
 * Stop a process for a single agent.
 * Signals abort and waits for graceful shutdown.
 */
export async function stopProcess(agentEntityId: string): Promise<void> {
  const handle = processes.get(agentEntityId);
  if (!handle) return;

  console.log(`[process-manager] Stopping ${handle.agentName}...`);
  handle.abortController.abort();

  // Wait for graceful shutdown (max 10s)
  await Promise.race([
    handle.promise,
    new Promise((r) => setTimeout(r, 10_000)),
  ]);

  processes.delete(agentEntityId);
  console.log(`[process-manager] Stopped ${handle.agentName}`);
}

// =============================================================================
// Batch operations
// =============================================================================

/**
 * Start processes for ALL agents in the database.
 * Called at gateway startup.
 */
export async function startAllProcesses(): Promise<void> {
  const agents = await prisma.agent.findMany({
    include: {
      entity: {
        select: { id: true, displayName: true },
      },
    },
  });

  console.log(`[process-manager] Starting ${agents.length} agent processes...`);

  for (const agent of agents) {
    if (!agent.entity) {
      console.warn(`[process-manager] Agent ${agent.name} has no entity — skipping`);
      continue;
    }

    await startProcess(
      agent.id,
      agent.entity.id,
      agent.name,
    );
  }

  console.log(`[process-manager] All ${agents.length} processes started`);
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
 * Check if an agent process is running.
 */
export function isProcessRunning(agentEntityId: string): boolean {
  return processes.has(agentEntityId);
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
  agentId: string;
  agentEntityId: string;
  agentName: string;
}> {
  return Array.from(processes.values()).map((h) => ({
    agentId: h.agentId,
    agentEntityId: h.agentEntityId,
    agentName: h.agentName,
  }));
}
