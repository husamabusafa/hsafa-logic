import { redis } from './redis.js';

// =============================================================================
// Stream Publisher (v7)
//
// Publishes real-time events to Redis Pub/Sub for:
//   1. Dashboard live feed (text deltas, reasoning, tool calls)
//   2. Per-haseef SSE streams
//
// Channel pattern: haseef:{haseefId}:stream
// =============================================================================

export interface StreamEvent {
  type: string;
  runId: string;
  haseefId: string;
  data: Record<string, unknown>;
  timestamp: number;
}

/**
 * Publish a stream event for a specific haseef.
 * Listeners (dashboard, SSE endpoints) subscribe to the channel.
 */
export function publishStreamEvent(event: StreamEvent): void {
  const channel = `haseef:${event.haseefId}:stream`;
  redis.publish(channel, JSON.stringify(event)).catch((err) => {
    console.error(`[stream-publisher] Failed to publish to ${channel}:`, err);
  });
}

/**
 * Convenience: publish a text delta event.
 */
export function publishTextDelta(
  haseefId: string,
  runId: string,
  text: string,
): void {
  publishStreamEvent({
    type: 'text.delta',
    runId,
    haseefId,
    data: { text },
    timestamp: Date.now(),
  });
}

/**
 * Convenience: publish a reasoning delta event.
 */
export function publishReasoningDelta(
  haseefId: string,
  runId: string,
  text: string,
): void {
  publishStreamEvent({
    type: 'reasoning.delta',
    runId,
    haseefId,
    data: { text },
    timestamp: Date.now(),
  });
}

/**
 * Convenience: publish a tool call event.
 */
export function publishToolEvent(
  haseefId: string,
  runId: string,
  eventType: string,
  toolData: Record<string, unknown>,
): void {
  publishStreamEvent({
    type: eventType,
    runId,
    haseefId,
    data: toolData,
    timestamp: Date.now(),
  });
}

/**
 * Convenience: publish run lifecycle events.
 */
export function publishRunEvent(
  haseefId: string,
  runId: string,
  eventType: 'run.started' | 'run.completed' | 'run.interrupted' | 'run.failed',
  data?: Record<string, unknown>,
): void {
  publishStreamEvent({
    type: eventType,
    runId,
    haseefId,
    data: data ?? {},
    timestamp: Date.now(),
  });
}
