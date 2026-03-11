import { tool, jsonSchema } from 'ai';
import { dispatchAction } from './action-dispatch.js';
import { randomUUID } from 'crypto';

// =============================================================================
// Tool Builder (v5)
//
// Converts HaseefTool DB rows into AI SDK–compatible tools.
// Each tool dispatches actions via Redis Streams to external services.
//
// Tool names are prefixed with their scope (e.g. "spaces_send_message")
// to avoid collisions when multiple scopes define tools with the same name.
// The dispatch sends the ORIGINAL name to the external service.
//
// Three execution modes:
//   sync           — Core waits for result (with timeout)
//   fire_and_forget — Core returns { ok: true } immediately
//   async          — Core returns { status: "pending" }, result arrives as event
// =============================================================================

/**
 * Build AI SDK tools from pre-fetched HaseefTool DB rows.
 * Tool names are prefixed: `{scope}_{name}` for the LLM.
 * Dispatch uses the original unprefixed name for the external service.
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
          toolName: originalName, // external service sees the original name
          args,
          mode,
          timeout,
        });
      },
    });
  }

  return tools;
}
