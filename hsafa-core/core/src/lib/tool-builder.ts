import { tool, jsonSchema } from 'ai';
import { dispatchToScope, emitLifecycleToScope } from './tool-dispatcher.js';

// =============================================================================
// Tool Builder (v7)
//
// Builds AI SDK tools from global ScopeTool rows.
// Dispatches via SSE (tool-dispatcher) with lifecycle events.
// =============================================================================

export interface V7ToolRow {
  name: string;
  description: string;
  inputSchema: unknown;
  scopeName: string;
}

export interface V7HaseefContext {
  id: string;
  name: string;
  profile: Record<string, unknown>;
  scopes: string[];
}

/**
 * v7: Build AI SDK tools from global ScopeTool rows.
 * Dispatches via SSE (tool-dispatcher) instead of Redis Streams.
 * Emits tool lifecycle events (tool.input.start, tool.input.delta,
 * tool.call, tool.result, tool.error) to the scope SSE channel so
 * services can display typing indicators and track execution.
 */
export function buildV7Tools(
  haseef: V7HaseefContext,
  globalTools: V7ToolRow[],
  defaultTimeout?: number,
): Record<string, unknown> {
  const tools: Record<string, unknown> = {};

  const haseefCtx = {
    id: haseef.id,
    name: haseef.name,
    profile: haseef.profile,
  };

  for (const dbTool of globalTools) {
    const scope = dbTool.scopeName;
    const toolName = dbTool.name;
    const prefixedName = `${scope}_${toolName}`;

    const schema = jsonSchema<Record<string, unknown>>(dbTool.inputSchema as any);

    tools[prefixedName] = tool({
      description: dbTool.description,
      inputSchema: schema,

      onInputStart: ({ toolCallId }: { toolCallId: string }) => {
        emitLifecycleToScope(scope, 'tool.input.start', {
          actionId: toolCallId,
          toolName,
          haseef: haseefCtx,
        });
      },

      onInputDelta: ({ toolCallId, inputTextDelta }: { toolCallId: string; inputTextDelta: string }) => {
        emitLifecycleToScope(scope, 'tool.input.delta', {
          actionId: toolCallId,
          toolName,
          delta: inputTextDelta,
          haseef: haseefCtx,
        });
      },

      onInputAvailable: ({ toolCallId, input }: { toolCallId: string; input: unknown }) => {
        emitLifecycleToScope(scope, 'tool.call', {
          actionId: toolCallId,
          toolName,
          args: input,
          haseef: haseefCtx,
        });
      },

      execute: async (args: Record<string, unknown>, { toolCallId }: { toolCallId: string }) => {
        const startedAt = Date.now();
        try {
          const result = await dispatchToScope({
            scope,
            actionId: toolCallId,
            toolName,
            args,
            haseef: haseefCtx,
            timeout: defaultTimeout,
          });

          emitLifecycleToScope(scope, 'tool.result', {
            actionId: toolCallId,
            toolName,
            args,
            result,
            durationMs: Date.now() - startedAt,
            haseef: haseefCtx,
          });

          return result;
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          emitLifecycleToScope(scope, 'tool.error', {
            actionId: toolCallId,
            toolName,
            error: errMsg,
            haseef: haseefCtx,
          });
          return { error: errMsg };
        }
      },
    });
  }

  return tools;
}
