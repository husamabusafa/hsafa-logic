import { redis } from "./redis.js";

// =============================================================================
// SmartSpace Event Helpers — Redis pub/sub for real-time SSE
// =============================================================================

export async function emitSmartSpaceEvent(
  spaceId: string,
  event: Record<string, unknown>
): Promise<void> {
  const channel = `smartspace:${spaceId}`;
  await redis.publish(channel, JSON.stringify(event));
}

// ── Active Runs Tracking ────────────────────────────────────────────────────

const ACTIVE_RUNS_KEY = (spaceId: string) =>
  `smartspace:${spaceId}:active-runs`;

export async function setSpaceActiveRun(
  spaceId: string,
  runId: string,
  entityId: string,
  entityName: string
): Promise<void> {
  await redis.hset(
    ACTIVE_RUNS_KEY(spaceId),
    runId,
    JSON.stringify({ entityId, entityName, startedAt: Date.now() })
  );
}

export async function removeSpaceActiveRun(
  spaceId: string,
  runId: string
): Promise<void> {
  await redis.hdel(ACTIVE_RUNS_KEY(spaceId), runId);
}

export async function listSpaceActiveRuns(
  spaceId: string
): Promise<Array<{ runId: string; entityId: string; entityName: string }>> {
  const hash = await redis.hgetall(ACTIVE_RUNS_KEY(spaceId));
  return Object.entries(hash).map(([runId, json]) => {
    const data = JSON.parse(json);
    return { runId, entityId: data.entityId, entityName: data.entityName };
  });
}
