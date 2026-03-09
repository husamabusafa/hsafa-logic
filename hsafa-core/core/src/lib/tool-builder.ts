import { tool, jsonSchema } from 'ai';
import { dispatchAction } from './action-dispatch.js';
import { randomUUID } from 'crypto';

// =============================================================================
// Tool Builder (v5)
//
// Converts HaseefTool DB rows into AI SDK–compatible tools.
// Each tool dispatches actions via Redis Streams to external services.
//
// Three execution modes:
//   sync           — Core waits for result (with timeout)
//   fire_and_forget — Core returns { ok: true } immediately
//   async          — Core returns { status: "pending" }, result arrives as event
// =============================================================================

/**
 * Build AI SDK tools from pre-fetched HaseefTool DB rows.
 * Caller is responsible for fetching from DB (avoids double queries).
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
    const toolName = dbTool.name;

    // Build JSON Schema for the tool's input parameters
    const schema = jsonSchema<Record<string, unknown>>(dbTool.inputSchema as any);

    tools[toolName] = tool({
      description: dbTool.description,
      inputSchema: schema,
      execute: async (args: Record<string, unknown>) => {
        const actionId = randomUUID();
        return dispatchAction({
          haseefId,
          scope,
          actionId,
          toolName,
          args,
          mode,
          timeout,
        });
      },
    });
  }

  return tools;
}
