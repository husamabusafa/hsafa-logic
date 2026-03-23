import { redis } from './redis.js';
import { prisma } from './db.js';
import type { SenseEvent } from '../agent-builder/types.js';
import type { UserContentPart } from './consciousness.js';

// =============================================================================
// Event System (v6 — Event-Driven Interrupt/Rerun)
//
// Simplified from v5's inbox/queue system. No more batching, draining, or
// cycle-based event processing.
//
// Redis list (fast wakeup) + Postgres InboxEvent (durable audit log).
// Events are pushed with LPUSH, consumed with BRPOP (single event wakeup).
// The agent process handles one event (or debounced batch) per run.
//
// Key change from v5: pushEvent writes to `events:{haseefId}` (not `inbox:`).
// The process wakes immediately on any event. If already running, the
// current run is interrupted by agent-process.ts.
// =============================================================================

const EVENT_PREFIX = 'events:';

/** Maximum time (seconds) to block on BRPOP before re-checking. */
const BRPOP_TIMEOUT = 30;

// =============================================================================
// Push — Add an event (called by API routes)
// =============================================================================

/**
 * Push a SenseEvent for a Haseef.
 * Dual-write: Redis (fast wakeup) + Postgres (durable log).
 */
export async function pushEvent(
  haseefId: string,
  event: SenseEvent,
): Promise<void> {
  const key = `${EVENT_PREFIX}${haseefId}`;

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

  // Fast write — Redis list (wakes BRPOP)
  await redis.lpush(key, JSON.stringify(event));
}

// =============================================================================
// Wait — Block until an event arrives (zero CPU sleep)
// =============================================================================

/**
 * Block until at least one event arrives.
 * Uses a dedicated Redis connection (BRPOP blocks the connection).
 * Returns the event that triggered the wakeup.
 */
export async function waitForEvent(
  haseefId: string,
  blockingRedis: import('ioredis').default,
  signal?: AbortSignal,
): Promise<SenseEvent | null> {
  const key = `${EVENT_PREFIX}${haseefId}`;

  while (!signal?.aborted) {
    try {
      const result = await blockingRedis.brpop(key, BRPOP_TIMEOUT);
      if (result) {
        const [, item] = result;
        try {
          return JSON.parse(item) as SenseEvent;
        } catch {
          console.warn('[events] Failed to parse BRPOP item:', item);
        }
      }
    } catch (err) {
      if (signal?.aborted) return null;
      console.error('[events] BRPOP error:', err);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  return null;
}

// =============================================================================
// Log — Write event to Postgres audit trail (run-scoped)
// =============================================================================

/**
 * Log an event to Postgres, associated with a specific run.
 * The event may already exist from pushEvent — we just update its status.
 */
export async function logEvent(
  haseefId: string,
  event: SenseEvent,
  _runId: string,
): Promise<void> {
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
      status: 'processed',
      processedAt: new Date(),
    },
    update: {
      status: 'processed',
      processedAt: new Date(),
    },
  });
}

// =============================================================================
// Recovery — Re-push unprocessed events after a crash
// =============================================================================

/**
 * Crash recovery: find events stuck as 'pending' (never processed)
 * and re-push them to Redis so the agent process picks them up.
 */
export async function recoverUnprocessedEvents(haseefId: string): Promise<number> {
  const stuck = await prisma.inboxEvent.findMany({
    where: {
      haseefId,
      status: 'pending',
    },
    orderBy: { createdAt: 'asc' },
  });

  if (stuck.length === 0) return 0;

  const key = `${EVENT_PREFIX}${haseefId}`;
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

  return stuck.length;
}

// =============================================================================
// Format — Convert events to content for consciousness injection
// =============================================================================

/**
 * Sort events by importance.
 * Priority: human messages > tool results > other.
 * Within the same priority tier, preserve FIFO order.
 */
function prioritizeEvents(events: SenseEvent[]): SenseEvent[] {
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
 * Format events into consciousness content.
 * Returns plain string when no images are present, or a multimodal
 * UserContentPart[] array when events carry image attachments.
 *
 * v6: Uses "EVENT" prefix instead of "SENSE EVENTS" — consciousness.ts
 * uses this to detect run boundaries for archival.
 */
export function formatEventForConsciousness(events: SenseEvent[]): string | UserContentPart[] {
  const sorted = prioritizeEvents(events);
  const blocks: string[] = [];

  for (const e of sorted) {
    const data = e.data as Record<string, unknown>;

    // Services can provide a pre-formatted context string
    const formatted = data.formattedContext as string | undefined;
    if (formatted) {
      blocks.push(formatted);
    } else {
      blocks.push(`[${e.scope}:${e.type}] ${JSON.stringify(data)}`);
    }
  }

  // Header — consciousness.ts isRunStart() uses this prefix
  // to detect run boundaries for pruning and archival.
  const header = `EVENT (${sorted.length} event${sorted.length !== 1 ? 's' : ''})`;
  const textContent = [header, ...blocks].join('\n\n');

  // Collect image attachments from all events
  const imageParts: UserContentPart[] = [];
  for (const e of sorted) {
    if (e.attachments) {
      for (const att of e.attachments) {
        if (att.type === 'image' && att.url) {
          imageParts.push({ type: 'image', image: att.url, mimeType: att.mimeType });
        }
      }
    }
  }

  if (imageParts.length > 0) {
    return [
      { type: 'text', text: textContent },
      ...imageParts,
    ];
  }

  return textContent;
}

// =============================================================================
// Legacy aliases — for backward compatibility during migration
// =============================================================================

/** @deprecated Use pushEvent instead */
export const pushToInbox = pushEvent;
