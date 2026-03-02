// =============================================================================
// Tool Call Utilities
// =============================================================================
// Helpers for building tool call content and metadata for SmartSpaceMessage
// persistence. Used by stream-processor when persisting visible tool calls.

export type ToolCallStatus = 'running' | 'requires_action' | 'complete' | 'error';

/**
 * Build the `content` field for a SmartSpaceMessage that represents a tool call.
 */
export function buildToolCallContent(
  toolName: string,
  args: unknown,
  result: unknown,
  status: ToolCallStatus,
): string {
  return JSON.stringify({ type: 'tool_call', toolName, args, result, status });
}

/**
 * Build the `metadata` field for a SmartSpaceMessage that represents a tool call.
 */
export function buildToolCallMessageMeta(params: {
  toolCallId: string;
  toolName: string;
  args: unknown;
  result: unknown;
  status: ToolCallStatus;
  runId: string;
}): Record<string, unknown> {
  return {
    type: 'tool_call',
    toolCallId: params.toolCallId,
    toolName: params.toolName,
    args: params.args,
    result: params.result,
    status: params.status,
    runId: params.runId,
  };
}

/**
 * Build a full message payload for emitting as a `space.message` event.
 */
export function buildToolCallMessagePayload(params: {
  messageId: string;
  smartSpaceId: string;
  entityId: string;
  toolCallId: string;
  toolName: string;
  args: unknown;
  result: unknown;
  status: ToolCallStatus;
  runId: string;
}): Record<string, unknown> {
  return {
    id: params.messageId,
    smartSpaceId: params.smartSpaceId,
    entityId: params.entityId,
    role: 'assistant',
    content: buildToolCallContent(params.toolName, params.args, params.result, params.status),
    metadata: buildToolCallMessageMeta({
      toolCallId: params.toolCallId,
      toolName: params.toolName,
      args: params.args,
      result: params.result,
      status: params.status,
      runId: params.runId,
    }),
  };
}
