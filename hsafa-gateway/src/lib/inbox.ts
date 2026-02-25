import { redis } from './redis.js';
import { prisma } from './db.js';
import type { InboxEvent, SpaceMessageEventData, SpaceMessageContextEntry, PlanEventData, ServiceEventData, ToolResultEventData } from '../agent-builder/types.js';

// =============================================================================
// Inbox System (v3)
//
// Dual-write: Redis list (fast wakeup queue) + Postgres InboxEvent (durable log).
// Events are pushed with LPUSH, consumed with RPOP (FIFO order).
// Agent process blocks on BRPOP to sleep when idle.
// Postgres enables crash recovery, audit trail, and per-cycle event inspection.
// =============================================================================

const INBOX_PREFIX = 'inbox:';
const WAKEUP_PREFIX = 'wakeup:';

/** Maximum time (seconds) to block on BRPOP before re-checking. 0 = infinite. */
const BRPOP_TIMEOUT = 30;

// =============================================================================
// Push — Add an event to an agent's inbox
// =============================================================================

/**
 * Push an event to an agent's inbox and signal the process to wake up.
 * Dual-write: Redis (fast queue) + Postgres (durable log).
 * Uses LPUSH (left push) so RPOP (right pop) gives FIFO order.
 */
export async function pushToInbox(
  agentEntityId: string,
  event: InboxEvent,
): Promise<void> {
  const key = `${INBOX_PREFIX}${agentEntityId}`;

  // Durable write — Postgres (upsert to handle dedup on retry)
  await prisma.inboxEvent.upsert({
    where: {
      agentEntityId_eventId: { agentEntityId, eventId: event.eventId },
    },
    create: {
      agentEntityId,
      eventId: event.eventId,
      type: event.type,
      data: event.data as any,
      status: 'pending',
    },
    update: {}, // no-op if already exists (dedup)
  });

  // Fast write — Redis (queue + wakeup signal)
  await redis.lpush(key, JSON.stringify(event));
  await redis.publish(`${WAKEUP_PREFIX}${agentEntityId}`, '1');
}

/**
 * Push a space_message event to an agent's inbox.
 * Convenience wrapper with correct event structure.
 */
export async function pushSpaceMessageEvent(
  agentEntityId: string,
  data: SpaceMessageEventData,
): Promise<void> {
  const event: InboxEvent = {
    eventId: data.messageId, // dedup key
    type: 'space_message',
    timestamp: new Date().toISOString(),
    data,
  };
  await pushToInbox(agentEntityId, event);
}

/**
 * Push a plan event to an agent's inbox.
 */
export async function pushPlanEvent(
  agentEntityId: string,
  data: PlanEventData,
): Promise<void> {
  const event: InboxEvent = {
    eventId: `${data.planId}:${new Date().toISOString()}`,
    type: 'plan',
    timestamp: new Date().toISOString(),
    data,
  };
  await pushToInbox(agentEntityId, event);
}

/**
 * Push a service event to an agent's inbox.
 */
export async function pushServiceEvent(
  agentEntityId: string,
  data: ServiceEventData,
): Promise<void> {
  const event: InboxEvent = {
    eventId: `svc:${crypto.randomUUID()}`,
    type: 'service',
    timestamp: new Date().toISOString(),
    data,
  };
  await pushToInbox(agentEntityId, event);
}

/**
 * Push a tool_result event to an agent's inbox.
 * Called when an async tool's result arrives (user submit, webhook callback).
 */
export async function pushToolResultEvent(
  agentEntityId: string,
  data: ToolResultEventData,
): Promise<void> {
  const event: InboxEvent = {
    eventId: `tr:${data.toolCallId}`,
    type: 'tool_result',
    timestamp: new Date().toISOString(),
    data,
  };
  await pushToInbox(agentEntityId, event);
}

// =============================================================================
// Drain — Pull all pending events from the inbox
// =============================================================================

/**
 * Drain all events from the inbox. Returns them in FIFO order.
 * Deduplicates by eventId — if the same event was pushed twice
 * (e.g. during reconnect), it's only returned once.
 */
export async function drainInbox(agentEntityId: string): Promise<InboxEvent[]> {
  const key = `${INBOX_PREFIX}${agentEntityId}`;
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
  agentEntityId: string,
  blockingRedis: import('ioredis').default,
  signal?: AbortSignal,
): Promise<InboxEvent | null> {
  const key = `${INBOX_PREFIX}${agentEntityId}`;

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
  agentEntityId: string,
  count: number = 10,
): Promise<InboxEvent[]> {
  const key = `${INBOX_PREFIX}${agentEntityId}`;
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
export async function inboxSize(agentEntityId: string): Promise<number> {
  const key = `${INBOX_PREFIX}${agentEntityId}`;
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
  agentEntityId: string,
  eventIds: string[],
  runId: string,
): Promise<void> {
  if (eventIds.length === 0) return;
  await prisma.inboxEvent.updateMany({
    where: {
      agentEntityId,
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
  agentEntityId: string,
  eventIds: string[],
): Promise<void> {
  if (eventIds.length === 0) return;
  await prisma.inboxEvent.updateMany({
    where: {
      agentEntityId,
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
  agentEntityId: string,
  eventIds: string[],
): Promise<void> {
  if (eventIds.length === 0) return;
  await prisma.inboxEvent.updateMany({
    where: {
      agentEntityId,
      eventId: { in: eventIds },
      status: 'processing',
    },
    data: {
      status: 'failed',
    },
  });
}

/**
 * Crash recovery: find events stuck in 'processing' (agent crashed mid-cycle)
 * and re-push them to the Redis inbox for reprocessing.
 */
export async function recoverStuckEvents(agentEntityId: string): Promise<number> {
  const stuck = await prisma.inboxEvent.findMany({
    where: {
      agentEntityId,
      status: 'processing',
    },
    orderBy: { createdAt: 'asc' },
  });

  if (stuck.length === 0) return 0;

  const key = `${INBOX_PREFIX}${agentEntityId}`;
  for (const row of stuck) {
    const event: InboxEvent = {
      eventId: row.eventId,
      type: row.type as InboxEvent['type'],
      timestamp: row.createdAt.toISOString(),
      data: row.data as any,
    };
    await redis.lpush(key, JSON.stringify(event));
  }

  // Reset status back to pending so they'll be marked processing again
  await prisma.inboxEvent.updateMany({
    where: {
      agentEntityId,
      status: 'processing',
    },
    data: {
      status: 'pending',
      runId: null,
    },
  });

  return stuck.length;
}

// =============================================================================
// Recent Context — Fetch last N messages from a space for inbox enrichment
// =============================================================================

const DEFAULT_CONTEXT_COUNT = 5;

/**
 * Fetch the last N messages from a space (before a specific message) to provide
 * conversation context in inbox events. Returns oldest-first.
 */
export async function fetchRecentSpaceContext(
  spaceId: string,
  beforeMessageId: string,
  count: number = DEFAULT_CONTEXT_COUNT,
): Promise<SpaceMessageContextEntry[]> {
  // First get the seq of the triggering message so we fetch messages BEFORE it
  const triggerMsg = await prisma.smartSpaceMessage.findUnique({
    where: { id: beforeMessageId },
    select: { seq: true },
  });

  if (!triggerMsg) return [];

  const messages = await prisma.smartSpaceMessage.findMany({
    where: {
      smartSpaceId: spaceId,
      seq: { lt: triggerMsg.seq },
    },
    orderBy: { seq: 'desc' },
    take: count,
    include: {
      entity: { select: { displayName: true, type: true } },
    },
  });

  // Reverse to oldest-first
  return messages.reverse().map((m) => ({
    senderName: m.entity.displayName ?? 'Unknown',
    senderType: (m.entity.type === 'agent' ? 'agent' : 'human') as 'human' | 'agent',
    content: m.content ?? '',
  }));
}

// =============================================================================
// Format — Convert inbox events to a user message string for consciousness
// =============================================================================

/**
 * Format drained inbox events into a single user-message string.
 * This becomes the injected user message in consciousness.
 */
export function formatInboxEvents(events: InboxEvent[]): string {
  const lines = events.map((e) => {
    switch (e.type) {
      case 'space_message': {
        const d = e.data as SpaceMessageEventData;
        let line = `[${d.spaceName}] ${d.senderName} (${d.senderType}): "${d.content}"`;
        if (d.recentContext && d.recentContext.length > 0) {
          const ctx = d.recentContext
            .map((c) => `    ${c.senderName} (${c.senderType}): "${c.content}"`)
            .join('\n');
          line += `\n  Recent conversation in this space:\n${ctx}`;
        }
        return line;
      }
      case 'plan': {
        const d = e.data as PlanEventData;
        return `[Plan: ${d.planName}] ${d.instruction}`;
      }
      case 'service': {
        const d = e.data as ServiceEventData;
        return `[Service: ${d.serviceName}] ${JSON.stringify(d.payload)}`;
      }
      case 'tool_result': {
        const d = e.data as ToolResultEventData;
        const resultPreview = typeof d.result === 'string' ? d.result : JSON.stringify(d.result);
        return `[Tool Result: ${d.toolName}] (callId: ${d.toolCallId}) ${resultPreview}`;
      }
      default:
        return `[Unknown event type: ${e.type}]`;
    }
  });

  return `INBOX (${events.length} event${events.length !== 1 ? 's' : ''}, ${new Date().toISOString()}):\n${lines.join('\n')}`;
}

/**
 * Format a lightweight preview of pending events for mid-cycle awareness.
 * Only includes sender, source, and first 50 chars of content.
 */
export function formatInboxPreview(events: InboxEvent[]): string {
  const previews = events.map((e) => {
    switch (e.type) {
      case 'space_message': {
        const d = e.data as SpaceMessageEventData;
        const snippet = d.content.slice(0, 50);
        return `  [${d.spaceName}] ${d.senderName}: "${snippet}${d.content.length > 50 ? '...' : ''}"`;
      }
      case 'plan': {
        const d = e.data as PlanEventData;
        return `  [Plan: ${d.planName}] ${(d.instruction || '').slice(0, 50)}...`;
      }
      case 'service': {
        const d = e.data as ServiceEventData;
        return `  [Service: ${d.serviceName}]`;
      }
      case 'tool_result': {
        const d = e.data as ToolResultEventData;
        return `  [Tool Result: ${d.toolName}] result arrived`;
      }
      default:
        return `  [Unknown]`;
    }
  });

  return `[INBOX PREVIEW — ${events.length} new event(s) waiting]\n${previews.join('\n')}\n(These will be fully processed in your next cycle. If any are urgent or change your current task, adapt accordingly.)`;
}
