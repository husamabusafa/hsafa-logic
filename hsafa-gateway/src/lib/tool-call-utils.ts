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

const MAX_CONTENT_LEN = 300;

/** Truncate a JSON string for display */
function truncJson(value: unknown, max = MAX_CONTENT_LEN): string {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  return s.length > max ? s.slice(0, max) + '...' : s;
}

/**
 * Build a human-readable `content` string for a tool call SmartSpaceMessage.
 * This makes tool calls work like regular messages:
 *  - Agents see them in space history
 *  - UI has fallback text if it doesn't parse metadata
 *  - Searchable content
 */
export function buildToolCallContent(
  toolName: string,
  args: unknown,
  result: unknown,
  status: ToolCallStatus,
): string {
  const parts: string[] = [`[Tool: ${toolName}]`];

  if (status === 'streaming') {
    parts.push('Processing...');
  } else if (args !== null && args !== undefined) {
    parts.push(`Input: ${truncJson(args)}`);
  }

  if (status === 'complete' && result !== null && result !== undefined) {
    parts.push(`Result: ${truncJson(result)}`);
  } else if (status === 'error') {
    parts.push('Error: execution failed');
  } else if (status === 'requires_action') {
    parts.push('(waiting for response)');
  } else if (status === 'running') {
    parts.push('(running)');
  }

  return parts.join(' ');
}

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
    content: buildToolCallContent(params.toolName, params.args, params.result, params.status),
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
