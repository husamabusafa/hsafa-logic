import { tool, jsonSchema, type ToolExecutionOptions } from 'ai';
import { createMCPClient } from '@ai-sdk/mcp';
import { prisma } from '../lib/db.js';
import { resolveModel } from '../lib/model-registry.js';
import { waitForToolResult } from '../lib/tool-result-wait.js';
import {
  HaseefConfigSchema,
  type HaseefConfig,
  type HaseefProcessContext,
  type BuiltHaseef,
  type ToolConfig,
} from './types.js';
import { buildPrebuiltTools } from './prebuilt-tools/registry.js';
import { emitToolWorkerEvent } from '../lib/tool-worker-events.js';
import { buildExtensionTools } from '../lib/extension-manager.js';

// =============================================================================
// Haseef Builder (v4)
//
// Resolves the LLM model, builds prebuilt + custom + extension tools,
// and returns a BuiltHaseef ready for streamText().
// =============================================================================

/**
 * Build a Haseef from its config JSON and process context.
 * Returns the model, tools, and metadata needed for streamText().
 */
export async function buildHaseef(
  rawConfig: unknown,
  context: HaseefProcessContext,
): Promise<BuiltHaseef> {
  // Parse and validate config
  const config = HaseefConfigSchema.parse(rawConfig);

  // Resolve LLM model via centralized registry (with default settings baked in via middleware)
  const model = resolveModel(config.model, {
    temperature: config.model.temperature,
    maxOutputTokens: config.model.maxTokens,
  });

  // Build prebuilt tools (done, peek_inbox, memory, goals, plans)
  const prebuilt = await buildPrebuiltTools(context);

  // Build custom tools from config
  const custom = buildCustomTools(config.tools ?? [], context);

  // Connect to MCP servers and load their tools
  const mcp = await connectMCPServers(config.mcp?.servers ?? [], context.haseefName);

  // v4: Build extension tools from connected extensions
  const extensions = await buildExtensionTools(context.haseefId, context);

  // Merge: prebuilt → custom → MCP → extension (later entries override earlier on name collision)
  const tools = { ...prebuilt.tools, ...custom.tools, ...mcp.tools, ...extensions.tools };

  return {
    tools,
    model,
    mcpClients: mcp.clients,
    extensionInstructions: extensions.staticInstructions,
  };
}

// Model resolution is now handled by the centralized model registry
// (see src/lib/model-registry.ts). The old per-provider switch statement
// has been replaced with: resolveModel({ provider, model })

// =============================================================================
// Custom Tool Building
// =============================================================================

interface CustomToolsResult {
  tools: Record<string, unknown>;
}

const DEFAULT_TOOL_TIMEOUT = 30_000;

function buildCustomTools(
  toolConfigs: ToolConfig[],
  context: HaseefProcessContext,
): CustomToolsResult {
  const tools: Record<string, unknown> = {};

  for (const tc of toolConfigs) {
    const exec = (tc.execution ?? {}) as Record<string, unknown>;
    const hasUrl = !!exec.url;
    const isAsync = tc.isAsync ?? false;
    const timeout = tc.timeout ?? DEFAULT_TOOL_TIMEOUT;

    const schema = (Object.keys(tc.inputSchema).length > 0)
      ? tc.inputSchema
      : { type: 'object' as const, properties: {} };

    const inputSchema = jsonSchema<Record<string, unknown>>(schema as any);

    if (tc.executionType === 'internal') {
      // Internal: return args as result immediately
      tools[tc.name] = tool({
        description: tc.description,
        inputSchema,
        execute: async (args: Record<string, unknown>) => {
          return { success: true, args };
        },
      });
    } else if (hasUrl) {
      // Inline HTTP call (gateway or external with URL)
      tools[tc.name] = tool({
        description: tc.description,
        inputSchema,
        execute: async (args: Record<string, unknown>) => {
          return executeHttpTool(tc, args as Record<string, unknown>);
        },
      });
    } else if (isAsync) {
      // Async: create PendingToolCall, return pending immediately, result via inbox
      tools[tc.name] = tool({
        description: tc.description,
        inputSchema,
        execute: async (args: Record<string, unknown>, options: ToolExecutionOptions) => {
          const toolCallId = options.toolCallId;
          await prisma.pendingToolCall.create({
            data: {
              haseefId: context.haseefId,
              runId: context.currentRunId!,
              toolCallId,
              toolName: tc.name,
              args: args as any,
              status: 'pending',
            },
          });
          return {
            status: 'pending',
            pendingToolCallId: toolCallId,
            message: 'Waiting for result. It will arrive in your inbox when ready.',
          };
        },
      });
    } else {
      // Sync with timeout: create PendingToolCall, notify worker via Redis,
      // then wait for result up to timeout. The agent NEVER waits forever.
      tools[tc.name] = tool({
        description: tc.description,
        inputSchema,
        execute: async (args: Record<string, unknown>, options: ToolExecutionOptions) => {
          const toolCallId = options.toolCallId;
          await prisma.pendingToolCall.create({
            data: {
              haseefId: context.haseefId,
              runId: context.currentRunId!,
              toolCallId,
              toolName: tc.name,
              args: args as any,
              status: 'waiting',
            },
          });

          // Notify all connected tool-worker SSE clients
          emitToolWorkerEvent({
            type: 'tool.call',
            toolCallId,
            toolName: tc.name,
            args,
            runId: context.currentRunId!,
            haseefId: context.haseefId,
            ts: new Date().toISOString(),
          }).catch((err: unknown) => console.warn('[builder] Failed to emit tool worker event:', err));

          const result = await waitForToolResult(toolCallId, timeout);
          if (result !== null) return result;

          return {
            error: `Tool "${tc.name}" timed out after ${timeout}ms. No result was received.`,
            toolCallId,
          };
        },
      });
    }
  }

  return { tools };
}


// =============================================================================
// MCP Server Connection
// =============================================================================

interface MCPServerConfig {
  name: string;
  url: string;
  transport?: 'http' | 'sse' | 'stdio';
  allowedTools?: string[];
}

interface MCPResult {
  tools: Record<string, unknown>;
  clients: Array<{ name: string; close: () => Promise<void> }>;
}

/**
 * Connect to configured MCP servers and load their tools.
 * Each server becomes an MCP client whose tools are merged into the Haseef.
 * Clients must be closed on Haseef shutdown (tracked in BuiltHaseef.mcpClients).
 */
async function connectMCPServers(
  servers: MCPServerConfig[],
  haseefName: string,
): Promise<MCPResult> {
  if (servers.length === 0) return { tools: {}, clients: [] };

  const allTools: Record<string, unknown> = {};
  const clients: MCPResult['clients'] = [];

  for (const server of servers) {
    try {
      const transportType = server.transport ?? 'sse';

      const client = await createMCPClient({
        transport: {
          type: transportType as 'sse' | 'http',
          url: server.url,
        },
        name: `${haseefName}-mcp-${server.name}`,
        onUncaughtError: (error) => {
          console.warn(`[mcp] ${haseefName} uncaught error from "${server.name}":`, error);
        },
      });

      clients.push({ name: server.name, close: () => client.close() });

      // Load tools from this MCP server
      const mcpTools = await client.tools();

      // Filter tools if allowedTools is specified
      let toolCount = 0;
      for (const [toolName, toolDef] of Object.entries(mcpTools)) {
        if (server.allowedTools && !server.allowedTools.includes(toolName)) {
          continue;
        }
        allTools[toolName] = toolDef;
        toolCount++;
      }

      console.log(`[mcp] ${haseefName} connected to "${server.name}" (${server.url}) — ${toolCount} tools loaded`);
    } catch (err) {
      console.error(`[mcp] ${haseefName} failed to connect to "${server.name}" (${server.url}):`, err);
      // Non-fatal — continue with other servers
    }
  }

  return { tools: allTools, clients };
}

// =============================================================================
// HTTP Tool Execution
// =============================================================================

/**
 * Execute a tool by making an HTTP request to the configured URL.
 * Used for gateway and external tools that have a URL.
 */
async function executeHttpTool(
  config: ToolConfig,
  args: Record<string, unknown>,
): Promise<unknown> {
  const exec = (config.execution ?? {}) as Record<string, unknown>;
  const url = exec.url as string;
  const method = (exec.method as string) ?? 'POST';
  const headers = (exec.headers as Record<string, string>) ?? {};
  const httpTimeout = (exec.httpTimeout as number) ?? 30_000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), httpTimeout);

  try {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: method !== 'GET' ? JSON.stringify(args) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      return { error: `HTTP ${response.status}: ${response.statusText}` };
    }

    return await response.json();
  } catch (err) {
    clearTimeout(timer);
    return {
      error: err instanceof Error ? err.message : 'Tool HTTP execution failed',
    };
  }
}
