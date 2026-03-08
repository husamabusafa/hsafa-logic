import { redis } from "./redis";

// =============================================================================
// Redis Pub/Sub helpers for SmartSpace events
// =============================================================================

export interface SmartSpaceEvent {
  type: string;
  [key: string]: unknown;
}

/**
 * Publish an event to a SmartSpace channel.
 * All SSE clients subscribed to this space will receive it.
 */
export async function emitSmartSpaceEvent(
  spaceId: string,
  event: SmartSpaceEvent
): Promise<void> {
  const channel = `smartspace:${spaceId}`;
  await redis.publish(channel, JSON.stringify(event));
}

const ACTIVE_RUNS_TTL_SECONDS = 300;

function activeRunsKey(spaceId: string): string {
  return `smartspace:${spaceId}:active-runs`;
}

export interface ActiveRunEntry {
  runId: string;
  agentEntityId: string;
  agentName?: string;
}

/**
 * Persist active run state so newly connected SSE clients can restore the
 * current "Atlas is thinking" indicator even if they connect mid-run.
 */
export async function markSpaceRunActive(
  spaceId: string,
  entry: ActiveRunEntry
): Promise<void> {
  const key = activeRunsKey(spaceId);
  await redis.hset(key, entry.runId, JSON.stringify(entry));
  await redis.expire(key, ACTIVE_RUNS_TTL_SECONDS);
}

export async function clearSpaceRunActive(
  spaceId: string,
  runId: string
): Promise<void> {
  const key = activeRunsKey(spaceId);
  await redis.hdel(key, runId);
}

export async function listSpaceActiveRuns(
  spaceId: string
): Promise<ActiveRunEntry[]> {
  const raw = await redis.hvals(activeRunsKey(spaceId));
  const entries: ActiveRunEntry[] = [];
  for (const value of raw) {
    try {
      const parsed = JSON.parse(value) as ActiveRunEntry;
      if (parsed.runId && parsed.agentEntityId) {
        entries.push(parsed);
      }
    } catch {
      // Ignore malformed cached entries
    }
  }
  return entries;
}

