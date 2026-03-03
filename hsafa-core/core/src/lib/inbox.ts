import { redis } from './redis.js';
import { prisma } from './db.js';
import { relativeTime } from './time-utils.js';
import type { InboxEvent, SenseEvent, PlanEventData, ServiceEventData, ToolResultEventData } from '../agent-builder/types.js';
import { CHANNEL, SENSE_TYPE } from '../agent-builder/types.js';

// =============================================================================
// Inbox System (v4)
//
// Dual-write: Redis list (fast wakeup queue) + Postgres InboxEvent (durable log).
// Events are pushed with LPUSH, consumed with RPOP (FIFO order).
// Agent process blocks on BRPOP to sleep when idle.
// Postgres enables crash recovery, audit trail, and per-cycle event inspection.
//
// All events are SenseEvents with { channel, source, type, data }.
// =============================================================================

const INBOX_PREFIX = 'inbox:';
const WAKEUP_PREFIX = 'wakeup:';

/** Maximum time (seconds) to block on BRPOP before re-checking. 0 = infinite. */
const BRPOP_TIMEOUT = 30;

// =============================================================================
// Push — Add an event to an agent's inbox
// =============================================================================

/**
 * Push a SenseEvent to an agent's inbox and signal the process to wake up.
 * Dual-write: Redis (fast queue) + Postgres (durable log).
 * Uses LPUSH (left push) so RPOP (right pop) gives FIFO order.
 */
export async function pushToInbox(
  haseefEntityId: string,
  event: InboxEvent,
): Promise<void> {
  const key = `${INBOX_PREFIX}${haseefEntityId}`;

  // Durable write — Postgres (upsert to handle dedup on retry)
  // Store channel:type as the DB 'type' column for queryability
  await prisma.inboxEvent.upsert({
    where: {
      haseefEntityId_eventId: { haseefEntityId, eventId: event.eventId },
    },
    create: {
      haseefEntityId,
      eventId: event.eventId,
      type: `${event.channel}:${event.type}`,
      data: event.data as any,
      status: 'pending',
    },
    update: {}, // no-op if already exists (dedup)
  });

  // Fast write — Redis (queue + wakeup signal)
  await redis.lpush(key, JSON.stringify(event));
  await redis.publish(`${WAKEUP_PREFIX}${haseefEntityId}`, '1');
}

/**
 * Push a generic SenseEvent to an agent's inbox.
 * This is the primary API — all events flow through here.
 */
export async function pushSenseEvent(
  haseefEntityId: string,
  sense: SenseEvent & { eventId: string },
): Promise<void> {
  await pushToInbox(haseefEntityId, sense);
}

// =============================================================================
// Convenience wrappers (use well-known channels & types)
// =============================================================================

/**
 * Push a plan event (core channel).
 */
export async function pushPlanEvent(
  haseefEntityId: string,
  data: PlanEventData,
): Promise<void> {
  await pushToInbox(haseefEntityId, {
    eventId: `${data.planId}:${new Date().toISOString()}`,
    channel: CHANNEL.CORE,
    source: data.planId,
    type: SENSE_TYPE.PLAN,
    timestamp: new Date().toISOString(),
    data: data as unknown as Record<string, unknown>,
  });
}

/**
 * Push a service event (core channel).
 */
export async function pushServiceEvent(
  haseefEntityId: string,
  data: ServiceEventData,
): Promise<void> {
  await pushToInbox(haseefEntityId, {
    eventId: `svc:${crypto.randomUUID()}`,
    channel: CHANNEL.CORE,
    source: data.serviceName,
    type: SENSE_TYPE.SERVICE,
    timestamp: new Date().toISOString(),
    data: data as unknown as Record<string, unknown>,
  });
}

/**
 * Push a tool_result event (core channel).
 * Called when an async tool's result arrives (user submit, webhook callback).
 */
export async function pushToolResultEvent(
  haseefEntityId: string,
  data: ToolResultEventData,
): Promise<void> {
  await pushToInbox(haseefEntityId, {
    eventId: `tr:${data.toolCallId}`,
    channel: CHANNEL.CORE,
    source: data.toolName,
    type: SENSE_TYPE.TOOL_RESULT,
    timestamp: new Date().toISOString(),
    data: data as unknown as Record<string, unknown>,
  });
}

// =============================================================================
// Drain — Pull all pending events from the inbox
// =============================================================================

/**
 * Drain all events from the inbox. Returns them in FIFO order.
 * Deduplicates by eventId — if the same event was pushed twice
 * (e.g. during reconnect), it's only returned once.
 */
export async function drainInbox(haseefEntityId: string): Promise<InboxEvent[]> {
  const key = `${INBOX_PREFIX}${haseefEntityId}`;
  const events: InboxEvent[] = [];
  const seen = new Set<string>();

  while (true) {
    const item = await redis.rpop(key);
    if (!item) break;

    try {
      const event = JSON.parse(item) as InboxEvent;
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
 *
 * @param blockingRedis - A dedicated Redis connection for blocking ops
 * @param signal - AbortSignal for graceful shutdown
 */
export async function waitForInbox(
  haseefEntityId: string,
  blockingRedis: import('ioredis').default,
  signal?: AbortSignal,
): Promise<InboxEvent | null> {
  const key = `${INBOX_PREFIX}${haseefEntityId}`;

  while (!signal?.aborted) {
    try {
      // BRPOP blocks until an item arrives or timeout expires
      const result = await blockingRedis.brpop(key, BRPOP_TIMEOUT);
      if (result) {
        const [, item] = result;
        try {
          return JSON.parse(item) as InboxEvent;
        } catch {
          console.warn('[inbox] Failed to parse BRPOP item:', item);
        }
      }
      // Timeout expired — loop back and check abort signal
    } catch (err) {
      if (signal?.aborted) return null;
      console.error('[inbox] BRPOP error:', err);
      // Wait before retrying
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
  haseefEntityId: string,
  count: number = 10,
): Promise<InboxEvent[]> {
  const key = `${INBOX_PREFIX}${haseefEntityId}`;
  // LRANGE with negative indices: -count to -1 gives the oldest `count` items
  // (since we LPUSH and RPOP, the right side is oldest)
  const items = await redis.lrange(key, 0, count - 1);

  const events: InboxEvent[] = [];
  for (const item of items) {
    try {
      events.push(JSON.parse(item) as InboxEvent);
    } catch {
      // Skip unparseable
    }
  }

  return events;
}

/**
 * Get the count of pending events in the inbox.
 */
export async function inboxSize(haseefEntityId: string): Promise<number> {
  const key = `${INBOX_PREFIX}${haseefEntityId}`;
  return redis.llen(key);
}

// =============================================================================
// Lifecycle — Mark events as processing / processed / failed in Postgres
// =============================================================================

/**
 * Mark a batch of events as 'processing' and link them to a run.
 * Called at the start of a think cycle, after drain.
 */
export async function markEventsProcessing(
  haseefEntityId: string,
  eventIds: string[],
  runId: string,
): Promise<void> {
  if (eventIds.length === 0) return;
  await prisma.inboxEvent.updateMany({
    where: {
      haseefEntityId,
      eventId: { in: eventIds },
      status: 'pending',
    },
    data: {
      status: 'processing',
      runId,
    },
  });
}

/**
 * Mark a batch of events as 'processed' after a successful think cycle.
 */
export async function markEventsProcessed(
  haseefEntityId: string,
  eventIds: string[],
): Promise<void> {
  if (eventIds.length === 0) return;
  await prisma.inboxEvent.updateMany({
    where: {
      haseefEntityId,
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
 * Mark a batch of events as 'failed' when a think cycle errors.
 */
export async function markEventsFailed(
  haseefEntityId: string,
  eventIds: string[],
): Promise<void> {
  if (eventIds.length === 0) return;
  await prisma.inboxEvent.updateMany({
    where: {
      haseefEntityId,
      eventId: { in: eventIds },
      status: 'processing',
    },
    data: {
      status: 'failed',
    },
  });
}

/**
 * Crash recovery: find events stuck in 'processing' or orphaned as 'pending'
 * (Redis signals lost after gateway restart) and re-push them to the Redis
 * inbox so the agent process picks them up.
 */
export async function recoverStuckEvents(haseefEntityId: string): Promise<number> {
  const stuck = await prisma.inboxEvent.findMany({
    where: {
      haseefEntityId,
      status: { in: ['processing', 'pending'] },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (stuck.length === 0) return 0;

  const key = `${INBOX_PREFIX}${haseefEntityId}`;
  for (const row of stuck) {
    // Reconstruct SenseEvent from DB row.
    // DB 'type' column stores "channel:type" (e.g. "ext-email:message", "core:plan").
    // For legacy rows that used flat types, migrate on read.
    const [channel, ...rest] = row.type.includes(':') ? row.type.split(':') : migrateLegacyType(row.type);
    const event: InboxEvent = {
      eventId: row.eventId,
      channel,
      source: (row.data as any)?.source ?? (row.data as any)?.planId ?? (row.data as any)?.serviceName ?? '',
      type: rest.join(':') || row.type,
      timestamp: row.createdAt.toISOString(),
      data: row.data as any,
    };
    await redis.lpush(key, JSON.stringify(event));
  }

  // Reset any 'processing' events back to 'pending' so they'll be marked processing again
  const processingCount = stuck.filter((e) => e.status === 'processing').length;
  if (processingCount > 0) {
    await prisma.inboxEvent.updateMany({
      where: {
        haseefEntityId,
        status: 'processing',
      },
      data: {
        status: 'pending',
        runId: null,
      },
    });
  }

  return stuck.length;
}

// =============================================================================
// Legacy migration helper
// =============================================================================

/** Convert v3 flat event type to [channel, type] tuple for crash-recovered events */
function migrateLegacyType(legacyType: string): [string, string] {
  switch (legacyType) {
    case 'space_message': return ['legacy', SENSE_TYPE.MESSAGE];
    case 'plan':          return [CHANNEL.CORE, SENSE_TYPE.PLAN];
    case 'service':       return [CHANNEL.CORE, SENSE_TYPE.SERVICE];
    case 'tool_result':   return [CHANNEL.CORE, SENSE_TYPE.TOOL_RESULT];
    default:              return ['unknown', legacyType];
  }
}

// =============================================================================
// Format — Convert inbox events to a user message string for consciousness
// =============================================================================

// =============================================================================
// Attention Prioritization (Ship #10)
// =============================================================================

/**
 * Sort inbox events by importance so the agent handles urgent matters first.
 * Priority: human messages > tool results > plan events > service/other > agent messages.
 * Within the same priority tier, preserve FIFO order.
 */
export function prioritizeEvents(events: InboxEvent[]): InboxEvent[] {
  return [...events].sort((a, b) => {
    const pa = eventPriority(a);
    const pb = eventPriority(b);
    return pa - pb; // Lower number = higher priority
  });
}

function eventPriority(e: InboxEvent): number {
  // Priority based on event type (extension-agnostic)
  // Human-originated messages from any extension get highest priority
  const data = e.data as Record<string, unknown>;
  if (e.type === SENSE_TYPE.MESSAGE && data.senderType === 'human') return 0;
  if (e.type === SENSE_TYPE.TOOL_RESULT) return 1;
  if (e.type === SENSE_TYPE.PLAN) return 2;
  if (e.type === SENSE_TYPE.SERVICE) return 2;
  // Extension messages from non-humans
  if (e.type === SENSE_TYPE.MESSAGE) return 3;
  // Unknown extension events — medium priority
  return 4;
}

/**
 * Format drained inbox events into a single user-message string.
 * This becomes the injected user message in consciousness.
 * Events are sorted by priority before formatting.
 *
 * Format uses channel/source/type for fully extension-agnostic display.
 * Core events (plan, service, tool_result) get rich formatting;
 * extension events use a generic format based on data fields.
 */
export function formatInboxEvents(events: InboxEvent[]): string {
  const now = new Date();
  const sorted = prioritizeEvents(events);

  const lines = sorted.map((e) => {
    const ts = e.timestamp ? `${relativeTime(e.timestamp, now)}` : '';

    // Core: plan events
    if (e.channel === CHANNEL.CORE && e.type === SENSE_TYPE.PLAN) {
      const d = e.data as unknown as PlanEventData;
      return `[${e.channel}] source=${e.source} type=${e.type}${ts ? ` ${ts}` : ''}\n  Plan "${d.planName}": ${d.instruction}`;
    }

    // Well-known: core service events
    if (e.channel === CHANNEL.CORE && e.type === SENSE_TYPE.SERVICE) {
      const d = e.data as unknown as ServiceEventData;
      return `[${e.channel}] source=${e.source} type=${e.type}${ts ? ` ${ts}` : ''}\n  Service "${d.serviceName}": ${JSON.stringify(d.payload)}`;
    }

    // Well-known: tool results
    if (e.type === SENSE_TYPE.TOOL_RESULT) {
      const d = e.data as unknown as ToolResultEventData;
      const resultPreview = typeof d.result === 'string' ? d.result : JSON.stringify(d.result);
      return `[${e.channel}] source=${e.source} type=${e.type}${ts ? ` ${ts}` : ''}\n  Tool "${d.toolName}" (callId: ${d.toolCallId}): ${resultPreview}`;
    }

    // Extension events — generic format using well-known data fields
    // Extensions should include senderName, content, etc. in their data
    const data = e.data as Record<string, unknown>;
    const senderName = data.senderName as string | undefined;
    const senderType = data.senderType as string | undefined;
    const content = data.content as string | undefined;
    const sourceName = data.spaceName ?? data.sourceName ?? e.source;

    if (content && senderName) {
      return `[${e.channel}] source=${sourceName} type=${e.type}${ts ? ` ${ts}` : ''}\n  ${senderName}${senderType ? ` (${senderType})` : ''}: "${content}"`;
    }

    return `[${e.channel}] source=${e.source} type=${e.type}${ts ? ` ${ts}` : ''}\n  ${JSON.stringify(e.data)}`;
  });

  return `SENSE EVENTS (${events.length}, now=${now.toISOString()}):\n${lines.join('\n\n')}`;
}

/**
 * Format a lightweight preview of pending events for mid-cycle awareness.
 * Only includes channel, source, and first 50 chars of relevant content.
 */
export function formatInboxPreview(events: InboxEvent[]): string {
  const previews = events.map((e) => {
    // Core: plan
    if (e.channel === CHANNEL.CORE && e.type === SENSE_TYPE.PLAN) {
      const d = e.data as unknown as PlanEventData;
      return `  [${e.channel}] Plan: ${d.planName}`;
    }

    // Well-known: core service
    if (e.channel === CHANNEL.CORE && e.type === SENSE_TYPE.SERVICE) {
      const d = e.data as unknown as ServiceEventData;
      return `  [${e.channel}] Service: ${d.serviceName}`;
    }

    // Well-known: tool result
    if (e.type === SENSE_TYPE.TOOL_RESULT) {
      const d = e.data as unknown as ToolResultEventData;
      return `  [${e.channel}] Tool Result: ${d.toolName}`;
    }

    // Generic
    return `  [${e.channel}] ${e.type} from ${e.source}`;
  });

  return `[INBOX PREVIEW — ${events.length} new event(s) waiting]\n${previews.join('\n')}\n(These will be fully processed in your next cycle. If any are urgent or change your current task, adapt accordingly.)`;
}
