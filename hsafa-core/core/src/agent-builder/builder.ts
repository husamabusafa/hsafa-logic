import { resolveModel } from '../lib/model-registry.js';
import {
  HaseefConfigSchema,
  type HaseefProcessContext,
  type BuiltHaseef,
  type MCPServerConfig,
} from './types.js';
import { buildPrebuiltTools } from './prebuilt-tools/registry.js';
import { buildScopedTools } from '../lib/tool-builder.js';

// =============================================================================
// Haseef Builder (v5)
//
// Resolves the LLM model, builds prebuilt + scoped + MCP tools from HaseefTool
// DB rows and configured MCP servers, returns a BuiltHaseef ready for
// streamText().
// =============================================================================

/**
 * Connect to configured MCP servers and collect their tools.
 * Returns the merged MCP tools and a list of clients to close after the cycle.
 */
async function loadMCPTools(
  mcpServers: MCPServerConfig[],
  haseefName: string,
): Promise<{ tools: Record<string, unknown>; clients: Array<{ close(): Promise<void> }> }> {
  if (mcpServers.length === 0) return { tools: {}, clients: [] };

  const { createMCPClient } = await import('@ai-sdk/mcp');
  const tools: Record<string, unknown> = {};
  const clients: Array<{ close(): Promise<void> }> = [];

  for (const serverConfig of mcpServers) {
    const label = serverConfig.name ?? serverConfig.url ?? serverConfig.command ?? 'mcp';
    try {
      let transport: any;

      if (serverConfig.transport === 'http') {
        if (!serverConfig.url) {
          console.warn(`[builder] MCP server "${label}" — http transport requires url, skipping`);
          continue;
        }
        transport = {
          type: 'http' as const,
          url: serverConfig.url,
          ...(serverConfig.headers ? { headers: serverConfig.headers } : {}),
        };
      } else if (serverConfig.transport === 'sse') {
        if (!serverConfig.url) {
          console.warn(`[builder] MCP server "${label}" — sse transport requires url, skipping`);
          continue;
        }
        transport = {
          type: 'sse' as const,
          url: serverConfig.url,
          ...(serverConfig.headers ? { headers: serverConfig.headers } : {}),
        };
      } else if (serverConfig.transport === 'stdio') {
        if (!serverConfig.command) {
          console.warn(`[builder] MCP server "${label}" — stdio transport requires command, skipping`);
          continue;
        }
        const { Experimental_StdioMCPTransport } = await import('@ai-sdk/mcp/mcp-stdio');
        transport = new Experimental_StdioMCPTransport({
          command: serverConfig.command,
          args: serverConfig.args,
        });
      } else {
        console.warn(`[builder] MCP server "${label}" — unknown transport "${serverConfig.transport}", skipping`);
        continue;
      }

      const client = await createMCPClient({ transport });
      clients.push(client);

      const mcpTools = await client.tools();
      Object.assign(tools, mcpTools);

      console.log(`[builder] ${haseefName} connected to MCP server "${label}" (${Object.keys(mcpTools).length} tools)`);
    } catch (err) {
      console.error(`[builder] ${haseefName} failed to connect to MCP server "${label}":`, err instanceof Error ? err.message : err);
    }
  }

  return { tools, clients };
}

/**
 * Build a Haseef from its config JSON, process context, and pre-fetched DB tools.
 * Returns the model and tools needed for streamText().
 *
 * Async because MCP client connections are async.
 */
export async function buildHaseef(
  rawConfig: unknown,
  context: HaseefProcessContext,
  dbTools: Array<{ name: string; description: string; inputSchema: unknown; scope: string; mode: string; timeout: number | null }>,
): Promise<BuiltHaseef> {
  const config = HaseefConfigSchema.parse(rawConfig);

  const model = resolveModel(config.model, {
    temperature: config.model.temperature,
    maxOutputTokens: config.model.maxTokens,
  });

  // Build prebuilt tools (done, set_memories, delete_memories, recall_memories, peek_inbox)
  const prebuilt = buildPrebuiltTools(context);

  // Build scoped tools from pre-fetched HaseefTool DB rows
  const scoped = buildScopedTools(
    context.haseefId,
    dbTools,
    config.actionTimeout,
  );

  // Connect to MCP servers and load their tools
  const mcpServers = config.mcpServers ?? [];
  const mcp = await loadMCPTools(mcpServers, context.haseefName);

  // Merge: prebuilt → scoped → MCP (later sources override on name collision)
  const tools = { ...prebuilt, ...scoped, ...mcp.tools };

  return { tools, model, mcpClients: mcp.clients };
}
