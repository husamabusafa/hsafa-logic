import { redis } from './redis.js';

// =============================================================================
// Redis Pub/Sub helpers for Run events
//
// Run-level events for pub/sub streaming to SDK subscribers.
// =============================================================================

export interface RunEvent {
  type: string;
  [key: string]: unknown;
}

/**
 * Publish an event to a run-specific channel AND a haseef-level stream channel.
 *
 * - `run:{runId}` — for run-specific subscribers (e.g. admin SSE endpoint)
 * - `haseef:{haseefId}:stream` — for extension subscribers that want
 *   real-time streaming without knowing runIds ahead of time
 */
export async function emitRunEvent(
  runId: string,
  event: RunEvent,
): Promise<void> {
  const json = JSON.stringify(event);
  const runChannel = `run:${runId}`;
  await redis.publish(runChannel, json);

  // Also publish to haseef-level stream channel for extensions
  if (event.haseefId && typeof event.haseefId === 'string') {
    const haseefChannel = `haseef:${event.haseefId}:stream`;
    await redis.publish(haseefChannel, json);
  }
}
