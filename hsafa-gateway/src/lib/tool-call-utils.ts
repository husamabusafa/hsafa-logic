// =============================================================================
// Tool Call Utilities
// =============================================================================
// Centralized helpers for building tool-call metadata shapes used in
// SmartSpaceMessage records. Previously this shape was hand-built in 5+ places
// (stream-processor, runs route, etc.) — now there's one source of truth.

// =============================================================================
// Types
// =============================================================================

export type ToolCallStatus =
  | 'streaming'        // Args still arriving (partial JSON)
  | 'running'          // Server tool executing
  | 'requires_action'  // Client tool waiting for user input
  | 'complete'         // Finished with result
  | 'error';           // Failed

export interface ToolCallPart {
  type: 'tool_call';
  toolCallId: string;
  toolName: string;
  args: unknown;
  result: unknown;
  status: ToolCallStatus;
}

export interface ToolCallMessageMeta {
  toolCallId: string;
  runId: string;
  uiMessage: {
    parts: ToolCallPart[];
  };
}

// =============================================================================
// Builders
// =============================================================================

/**
 * Build a single tool_call content part for SmartSpaceMessage metadata.
 */
export function buildToolCallPart(params: {
  toolCallId: string;
  toolName: string;
  args: unknown;
  result: unknown;
  status: ToolCallStatus;
}): ToolCallPart {
  return {
    type: 'tool_call',
    toolCallId: params.toolCallId,
    toolName: params.toolName,
    args: params.args,
    result: params.result,
    status: params.status,
  };
}

/**
 * Build the full metadata object for a SmartSpaceMessage that represents
 * a tool call. Wraps a ToolCallPart in the standard envelope.
 */
export function buildToolCallMessageMeta(params: {
  toolCallId: string;
  toolName: string;
  args: unknown;
  result: unknown;
  status: ToolCallStatus;
  runId: string;
}): ToolCallMessageMeta {
  return {
    toolCallId: params.toolCallId,
    runId: params.runId,
    uiMessage: {
      parts: [
        buildToolCallPart({
          toolCallId: params.toolCallId,
          toolName: params.toolName,
          args: params.args,
          result: params.result,
          status: params.status,
        }),
      ],
    },
  };
}

/**
 * Build a fake SmartSpaceMessage-like object for SSE emission.
 * Used when emitting `space.message` events with tool call data.
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
    content: null,
    metadata: buildToolCallMessageMeta({
      toolCallId: params.toolCallId,
      toolName: params.toolName,
      args: params.args,
      result: params.result,
      status: params.status,
      runId: params.runId,
    }),
    seq: 0,
    createdAt: new Date().toISOString(),
  };
}
