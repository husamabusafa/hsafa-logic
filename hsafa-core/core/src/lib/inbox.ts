import { redis } from './redis.js';
import { prisma } from './db.js';
import { relativeTime } from './time-utils.js';
import type { SenseEvent } from '../agent-builder/types.js';

// =============================================================================
// Inbox System (v5)
//
// Dual-write: Redis list (fast wakeup queue) + Postgres InboxEvent (durable log).
// Events are pushed with LPUSH, consumed with RPOP (FIFO order).
// Agent process blocks on BRPOP to sleep when idle.
// Postgres enables crash recovery and audit trail.
//
// All events are SenseEvents with { eventId, scope, type, data, attachments }.
// =============================================================================

const INBOX_PREFIX = 'inbox:';

/** Maximum time (seconds) to block on BRPOP before re-checking. */
const BRPOP_TIMEOUT = 30;

// =============================================================================
// Push — Add an event to a Haseef's inbox
// =============================================================================

/**
 * Push a SenseEvent to a Haseef's inbox.
 * Dual-write: Redis (fast queue) + Postgres (durable log).
 */
export async function pushToInbox(
  haseefId: string,
  event: SenseEvent,
): Promise<void> {
  const key = `${INBOX_PREFIX}${haseefId}`;

  // Durable write — Postgres (upsert for dedup on retry)
  await prisma.inboxEvent.upsert({
    where: {
      haseefId_eventId: { haseefId, eventId: event.eventId },
    },
    create: {
      haseefId,
      eventId: event.eventId,
      scope: event.scope,
      type: event.type,
      data: event.data as any,
      attachments: event.attachments ? (event.attachments as any) : undefined,
      status: 'pending',
    },
    update: {}, // no-op if already exists (dedup)
  });

  // Fast write — Redis queue
  await redis.lpush(key, JSON.stringify(event));
}

// =============================================================================
// Drain — Pull all pending events from the inbox
// =============================================================================

/**
 * Drain all events from the inbox. Returns them in FIFO order.
 * Deduplicates by eventId.
 */
export async function drainInbox(haseefId: string): Promise<SenseEvent[]> {
  const key = `${INBOX_PREFIX}${haseefId}`;
  const events: SenseEvent[] = [];
  const seen = new Set<string>();

  while (true) {
    const item = await redis.rpop(key);
    if (!item) break;

    try {
      const event = JSON.parse(item) as SenseEvent;
      if (!seen.has(event.eventId)) {
        seen.add(event.eventId);
        events.push(event);
      }
    } catch {
      console.warn('[inbox] Failed to parse inbox item:', item);
    }
  }

  return events;
}

// =============================================================================
// Wait — Block until the inbox has events (zero CPU sleep)
// =============================================================================

/**
 * Block until at least one event arrives in the inbox.
 * Uses a dedicated Redis connection (BRPOP blocks the connection).
 *
 * Returns the first event that triggered the wakeup.
 * The caller should then call `drainInbox` to get all pending events.
 */
export async function waitForInbox(
  haseefId: string,
  blockingRedis: import('ioredis').default,
  signal?: AbortSignal,
): Promise<SenseEvent | null> {
  const key = `${INBOX_PREFIX}${haseefId}`;

  while (!signal?.aborted) {
    try {
      const result = await blockingRedis.brpop(key, BRPOP_TIMEOUT);
      if (result) {
        const [, item] = result;
        try {
          return JSON.parse(item) as SenseEvent;
        } catch {
          console.warn('[inbox] Failed to parse BRPOP item:', item);
        }
      }
    } catch (err) {
      if (signal?.aborted) return null;
      console.error('[inbox] BRPOP error:', err);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  return null;
}

// =============================================================================
// Peek — Read pending events without removing them
// =============================================================================

/**
 * Peek at pending inbox events without removing them.
 * Used by prepareStep for mid-cycle inbox awareness.
 */
export async function peekInbox(
  haseefId: string,
  count: number = 10,
): Promise<SenseEvent[]> {
  const key = `${INBOX_PREFIX}${haseefId}`;
  const items = await redis.lrange(key, 0, count - 1);

  const events: SenseEvent[] = [];
  for (const item of items) {
    try {
      events.push(JSON.parse(item) as SenseEvent);
    } catch {
      // Skip unparseable
    }
  }

  return events;
}

/**
 * Get the count of pending events in the inbox.
 */
export async function inboxSize(haseefId: string): Promise<number> {
  const key = `${INBOX_PREFIX}${haseefId}`;
  return redis.llen(key);
}

// =============================================================================
// Lifecycle — Mark events as processing / processed in Postgres
// =============================================================================

/**
 * Mark a batch of events as 'processing'.
 * Called at the start of a think cycle, after drain.
 */
export async function markEventsProcessing(
  haseefId: string,
  eventIds: string[],
): Promise<void> {
  if (eventIds.length === 0) return;
  await prisma.inboxEvent.updateMany({
    where: {
      haseefId,
      eventId: { in: eventIds },
      status: 'pending',
    },
    data: {
      status: 'processing',
    },
  });
}

/**
 * Mark a batch of events as 'processed' after a successful think cycle.
 */
export async function markEventsProcessed(
  haseefId: string,
  eventIds: string[],
): Promise<void> {
  if (eventIds.length === 0) return;
  await prisma.inboxEvent.updateMany({
    where: {
      haseefId,
      eventId: { in: eventIds },
      status: 'processing',
    },
    data: {
      status: 'processed',
      processedAt: new Date(),
    },
  });
}

/**
 * Crash recovery: find events stuck in 'processing' or orphaned as 'pending'
 * and re-push them to Redis so the agent process picks them up.
 */
export async function recoverStuckEvents(haseefId: string): Promise<number> {
  const stuck = await prisma.inboxEvent.findMany({
    where: {
      haseefId,
      status: { in: ['processing', 'pending'] },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (stuck.length === 0) return 0;

  const key = `${INBOX_PREFIX}${haseefId}`;
  for (const row of stuck) {
    const event: SenseEvent = {
      eventId: row.eventId,
      scope: row.scope,
      type: row.type,
      data: row.data as Record<string, unknown>,
      attachments: row.attachments as any ?? undefined,
      timestamp: row.createdAt.toISOString(),
    };
    await redis.lpush(key, JSON.stringify(event));
  }

  // Reset 'processing' events back to 'pending'
  const processingCount = stuck.filter((e) => e.status === 'processing').length;
  if (processingCount > 0) {
    await prisma.inboxEvent.updateMany({
      where: {
        haseefId,
        status: 'processing',
      },
      data: {
        status: 'pending',
      },
    });
  }

  return stuck.length;
}

// =============================================================================
// Format — Convert inbox events to content for consciousness injection
// =============================================================================

/**
 * Sort inbox events by importance.
 * Priority: human messages > tool results > other.
 * Within the same priority tier, preserve FIFO order.
 */
export function prioritizeEvents(events: SenseEvent[]): SenseEvent[] {
  return [...events].sort((a, b) => {
    const pa = eventPriority(a);
    const pb = eventPriority(b);
    return pa - pb;
  });
}

function eventPriority(e: SenseEvent): number {
  const data = e.data as Record<string, unknown>;
  if (e.type === 'message' && data.senderType === 'human') return 0;
  if (e.type === 'tool_result') return 1;
  if (e.type === 'message') return 2;
  return 3;
}

/**
 * Format drained inbox events into a single user-message string.
 * This becomes the injected user message in consciousness.
 * Events are sorted by priority before formatting.
 */
export function formatInboxEvents(events: SenseEvent[]): string {
  const now = new Date();
  const sorted = prioritizeEvents(events);

  const lines = sorted.map((e) => {
    const ts = e.timestamp ? ` (${relativeTime(e.timestamp, now)})` : '';
    const data = e.data as Record<string, unknown>;

    // Message events with sender info
    const senderName = data.senderName as string | undefined;
    const content = data.content as string | undefined;
    if (content && senderName) {
      const spaceName = data.spaceName as string | undefined;
      const spaceId = data.spaceId as string | undefined;
      const spaceInfo = spaceName && spaceId ? ` in "${spaceName}" (spaceId:${spaceId})` : '';
      return `[${e.scope}:${e.type}]${ts} ${senderName}${spaceInfo}: "${content}"`;
    }

    // Generic format
    return `[${e.scope}:${e.type}]${ts} ${JSON.stringify(e.data)}`;
  });

  return `SENSE EVENTS (${events.length}, now=${now.toISOString()}):\n${lines.join('\n')}`;
}

/**
 * Format a lightweight preview of pending events for mid-cycle awareness.
 */
export function formatInboxPreview(events: SenseEvent[]): string {
  const previews = events.map((e) => {
    const data = e.data as Record<string, unknown>;
    const senderName = data.senderName as string | undefined;
    if (senderName) {
      return `  [${e.scope}:${e.type}] from ${senderName}`;
    }
    return `  [${e.scope}:${e.type}]`;
  });

  return `[INBOX PREVIEW — ${events.length} new event(s) waiting]\n${previews.join('\n')}\n(These will be fully processed in your next cycle. If any are urgent, adapt accordingly.)`;
}
