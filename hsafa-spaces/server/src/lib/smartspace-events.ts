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

// =============================================================================
// Online Presence Tracking — Redis SET per space, with TTL heartbeat
//
// Each online entity is tracked in a Redis SET: smartspace:{spaceId}:online
// An additional per-entity key with TTL handles stale cleanup.
// =============================================================================

const ONLINE_SET_KEY = (spaceId: string) =>
  `smartspace:${spaceId}:online`;

const PRESENCE_KEY = (spaceId: string, entityId: string) =>
  `smartspace:${spaceId}:presence:${entityId}`;

const PRESENCE_TTL = 120; // 2 minutes — heartbeat should refresh before this

/**
 * Mark entity as online in a space. Broadcasts user.online if newly online.
 * Returns true if this is a new online entry (wasn't already online).
 */
export async function markOnline(
  spaceId: string,
  entityId: string,
): Promise<boolean> {
  const added = await redis.sadd(ONLINE_SET_KEY(spaceId), entityId);
  await redis.set(PRESENCE_KEY(spaceId, entityId), "1", "EX", PRESENCE_TTL);
  if (added === 1) {
    await emitSmartSpaceEvent(spaceId, { type: "user.online", entityId });
  }
  return added === 1;
}

/**
 * Refresh presence TTL (called on heartbeat / keepalive).
 */
export async function refreshPresence(
  spaceId: string,
  entityId: string,
): Promise<void> {
  await redis.set(PRESENCE_KEY(spaceId, entityId), "1", "EX", PRESENCE_TTL);
}

/**
 * Mark entity as offline in a space. Broadcasts user.offline.
 */
export async function markOffline(
  spaceId: string,
  entityId: string,
): Promise<void> {
  const removed = await redis.srem(ONLINE_SET_KEY(spaceId), entityId);
  await redis.del(PRESENCE_KEY(spaceId, entityId));
  if (removed === 1) {
    await emitSmartSpaceEvent(spaceId, { type: "user.offline", entityId });
  }
}

/**
 * Get all currently online entity IDs for a space.
 */
export async function listOnlineEntities(
  spaceId: string,
): Promise<string[]> {
  return redis.smembers(ONLINE_SET_KEY(spaceId));
}

// =============================================================================
// Presence Cleanup — remove stale entries from online SETs
//
// The online SET has no TTL, only cleaned by markOffline(). If a process
// crashes without calling markOffline(), the entity stays in the SET forever.
// The per-entity presence key has a 120s TTL. This cleanup job compares
// the two and removes stale entries.
// =============================================================================

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start periodic presence cleanup. Call once at server startup.
 * Scans all tracked spaces and removes entities whose presence key expired.
 */
export function startPresenceCleanup(getTrackedSpaceIds: () => string[]): void {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(async () => {
    try {
      const spaceIds = getTrackedSpaceIds();
      for (const spaceId of spaceIds) {
        const onlineEntities = await redis.smembers(ONLINE_SET_KEY(spaceId));
        for (const entityId of onlineEntities) {
          const alive = await redis.exists(PRESENCE_KEY(spaceId, entityId));
          if (!alive) {
            await redis.srem(ONLINE_SET_KEY(spaceId), entityId);
            await emitSmartSpaceEvent(spaceId, { type: "user.offline", entityId });
            console.log(`[presence-cleanup] Removed stale entity ${entityId.slice(0, 8)} from space ${spaceId.slice(0, 8)}`);
          }
        }
      }
    } catch (err) {
      console.error("[presence-cleanup] Error:", err);
    }
  }, 60_000); // Run every 60 seconds
}

export function stopPresenceCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

// =============================================================================
// Typing Indicator — ephemeral event via Redis pub/sub (no persistence)
// =============================================================================

/**
 * Broadcast a typing indicator event to a space.
 */
export async function broadcastTyping(
  spaceId: string,
  entityId: string,
  entityName: string,
  typing: boolean,
): Promise<void> {
  await emitSmartSpaceEvent(spaceId, {
    type: "user.typing",
    entityId,
    entityName,
    typing,
  });
}

// =============================================================================
// Seen / Read Receipts — broadcast when a user sees messages
// =============================================================================

/**
 * Broadcast a message.seen event to a space.
 */
export async function broadcastSeen(
  spaceId: string,
  entityId: string,
  entityName: string,
  lastSeenMessageId: string,
): Promise<void> {
  await emitSmartSpaceEvent(spaceId, {
    type: "message.seen",
    entityId,
    entityName,
    lastSeenMessageId,
  });
}
