import { tool, jsonSchema } from 'ai';
import { dispatchAction } from './action-dispatch.js';
import { dispatchToScope, emitLifecycleToScope } from './tool-dispatcher.js';
import { randomUUID } from 'crypto';

// =============================================================================
// Tool Builder
//
// v5: buildScopedTools — per-haseef tools dispatched via Redis Streams
// v7: buildV7Tools     — global scope tools dispatched via SSE with lifecycle events
// =============================================================================

/**
 * v5: Build AI SDK tools from per-haseef HaseefTool DB rows (Redis Streams dispatch).
 */
export function buildScopedTools(
  haseefId: string,
  dbTools: Array<{ name: string; description: string; inputSchema: unknown; scope: string; mode: string; timeout: number | null }>,
  defaultTimeout?: number,
): Record<string, unknown> {
  const tools: Record<string, unknown> = {};

  for (const dbTool of dbTools) {
    const mode = dbTool.mode as 'sync' | 'fire_and_forget' | 'async';
    const timeout = dbTool.timeout ?? defaultTimeout;
    const scope = dbTool.scope;
    const originalName = dbTool.name;
    const prefixedName = `${scope}_${originalName}`;

    const schema = jsonSchema<Record<string, unknown>>(dbTool.inputSchema as any);

    tools[prefixedName] = tool({
      description: dbTool.description,
      inputSchema: schema,
      execute: async (args: Record<string, unknown>) => {
        const actionId = randomUUID();
        return await dispatchAction({
          haseefId,
          scope,
          actionId,
          toolName: originalName,
          args,
          mode,
          timeout,
        });
      },
    });
  }

  return tools;
}

// =============================================================================
// V7: Global scope tools with SSE dispatch + tool lifecycle events
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
