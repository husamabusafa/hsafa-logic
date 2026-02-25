import { redis } from './redis.js';

// =============================================================================
// Tool Worker SSE Channel
// =============================================================================

/** Redis pub/sub channel that all tool-worker SSE clients subscribe to. */
export const TOOL_WORKERS_CHANNEL = 'tool-workers';

/**
 * Shape of the event published to the tool-workers channel when an agent
 * calls an `external` tool that has no inline URL.
 */
export interface ToolCallWorkerEvent {
  type: 'tool.call';
  toolCallId: string;
  toolName: string;
  args: unknown;
  runId: string;
  agentEntityId: string;
  ts: string;
}

/**
 * Publish a tool.call event to the tool-workers Redis channel.
 * All SSE clients connected to GET /api/tools/stream will receive it.
 */
export async function emitToolWorkerEvent(event: ToolCallWorkerEvent): Promise<void> {
  await redis.publish(TOOL_WORKERS_CHANNEL, JSON.stringify(event));
}
