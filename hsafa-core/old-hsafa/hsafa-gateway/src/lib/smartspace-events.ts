import { redis } from './redis.js';

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
  event: SmartSpaceEvent,
): Promise<void> {
  const channel = `smartspace:${spaceId}`;
  await redis.publish(channel, JSON.stringify(event));
}

/**
 * Publish an event to an entity-specific channel.
 * Used for per-entity SSE connections (e.g. admin dashboard).
 */
export async function emitEntityEvent(
  entityId: string,
  event: SmartSpaceEvent,
): Promise<void> {
  const channel = `entity:${entityId}`;
  await redis.publish(channel, JSON.stringify(event));
}

/**
 * Publish an event to a run-specific channel.
 * Used by node-sdk `runs.subscribe`.
 */
export async function emitRunEvent(
  runId: string,
  event: SmartSpaceEvent,
): Promise<void> {
  const channel = `run:${runId}`;
  await redis.publish(channel, JSON.stringify(event));
}
