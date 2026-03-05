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

