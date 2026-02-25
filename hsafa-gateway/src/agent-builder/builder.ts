import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createXai } from '@ai-sdk/xai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { tool, jsonSchema, type ToolExecutionOptions } from 'ai';
import { prisma } from '../lib/db.js';
import {
  AgentConfigSchema,
  type AgentConfig,
  type AgentProcessContext,
  type BuiltAgent,
  type ToolConfig,
} from './types.js';
import { buildPrebuiltTools } from './prebuilt-tools/registry.js';

// =============================================================================
// Agent Builder (v3)
//
// Resolves the LLM model, builds prebuilt + custom tools, and returns
// a BuiltAgent ready for streamText().
// =============================================================================

/**
 * Build an agent from its config JSON and process context.
 * Returns the model, tools, and metadata needed for streamText().
 */
export async function buildAgent(
  rawConfig: unknown,
  context: AgentProcessContext,
): Promise<BuiltAgent> {
  // Parse and validate config
  const config = AgentConfigSchema.parse(rawConfig);

  // Resolve LLM model
  const model = resolveModel(config);

  // Build prebuilt tools (enter_space, send_message, skip, etc.)
  const prebuilt = buildPrebuiltTools(context);

  // Build custom tools from config
  const custom = buildCustomTools(config.tools ?? [], context);

  // Merge: prebuilt first, custom can override if needed
  const tools = { ...prebuilt.tools, ...custom.tools };
  const visibleToolNames = new Set([...prebuilt.visibleToolNames, ...custom.visibleToolNames]);

  return {
    tools,
    visibleToolNames,
    asyncToolNames: custom.asyncToolNames,
    model,
  };
}

// =============================================================================
// Model Resolution
// =============================================================================

function resolveModel(config: AgentConfig): unknown {
  const { provider, model: modelName } = config.model;

  // In AI SDK v6, model constructors take 1 arg (model ID).
  // temperature, maxTokens, etc. go on the streamText() call.
  switch (provider) {
    case 'openai': {
      const openai = createOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
      return openai(modelName);
    }
    case 'anthropic': {
      const anthropic = createAnthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
      return anthropic(modelName);
    }
    case 'google': {
      const google = createGoogleGenerativeAI({
        apiKey: process.env.GOOGLE_API_KEY,
      });
      return google(modelName);
    }
    case 'xai': {
      const xai = createXai({
        apiKey: process.env.XAI_API_KEY,
      });
      return xai(modelName);
    }
    case 'openrouter': {
      const openrouter = createOpenRouter({
        apiKey: process.env.OPENROUTER_API_KEY,
      });
      return openrouter(modelName);
    }
    default:
      throw new Error(`Unknown model provider: ${provider}`);
  }
}

// =============================================================================
// Custom Tool Building
// =============================================================================

interface CustomToolsResult {
  tools: Record<string, unknown>;
  visibleToolNames: Set<string>;
  asyncToolNames: Set<string>;
}

const DEFAULT_TOOL_TIMEOUT = 30_000;

function buildCustomTools(
  toolConfigs: ToolConfig[],
  context: AgentProcessContext,
): CustomToolsResult {
  const tools: Record<string, unknown> = {};
  const visibleToolNames = new Set<string>();
  const asyncToolNames = new Set<string>();

  for (const tc of toolConfigs) {
    const isVisible = tc.visible ?? (tc.executionType !== 'internal');
    if (isVisible) visibleToolNames.add(tc.name);

    const exec = (tc.execution ?? {}) as Record<string, unknown>;
    const hasUrl = !!exec.url;
    const isAsync = tc.isAsync ?? false;
    const timeout = tc.timeout ?? DEFAULT_TOOL_TIMEOUT;

    if (isAsync) asyncToolNames.add(tc.name);

    const schema = (Object.keys(tc.inputSchema).length > 0)
      ? tc.inputSchema
      : { type: 'object' as const, properties: {} };

    const inputSchema = jsonSchema<Record<string, unknown>>(schema as any);

    if (tc.executionType === 'internal') {
      // Internal: return args as result immediately
      tools[tc.name] = tool({
        description: tc.description,
        inputSchema,
        execute: async (args) => {
          if (isVisible && !context.getActiveSpaceId()) {
            return { error: `Tool "${tc.name}" is visible but you are not in a space. Call enter_space first.` };
          }
          return { success: true, args };
        },
      });
    } else if (hasUrl) {
      // Inline HTTP call (gateway or external with URL)
      tools[tc.name] = tool({
        description: tc.description,
        inputSchema,
        execute: async (args) => {
          if (isVisible && !context.getActiveSpaceId()) {
            return { error: `Tool "${tc.name}" is visible but you are not in a space. Call enter_space first.` };
          }
          return executeHttpTool(tc, args as Record<string, unknown>);
        },
      });
    } else if (isAsync) {
      // Async: create PendingToolCall, return pending immediately, result via inbox
      tools[tc.name] = tool({
        description: tc.description,
        inputSchema,
        execute: async (args: Record<string, unknown>, options: ToolExecutionOptions) => {
          if (isVisible && !context.getActiveSpaceId()) {
            return { error: `Tool "${tc.name}" is visible but you are not in a space. Call enter_space first.` };
          }
          const toolCallId = options.toolCallId;
          await prisma.pendingToolCall.create({
            data: {
              agentEntityId: context.agentEntityId,
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
      // Sync with timeout: create PendingToolCall, wait for result up to timeout.
      // The agent NEVER waits forever — timeout always applies.
      tools[tc.name] = tool({
        description: tc.description,
        inputSchema,
        execute: async (args: Record<string, unknown>, options: ToolExecutionOptions) => {
          if (isVisible && !context.getActiveSpaceId()) {
            return { error: `Tool "${tc.name}" is visible but you are not in a space. Call enter_space first.` };
          }
          const toolCallId = options.toolCallId;
          await prisma.pendingToolCall.create({
            data: {
              agentEntityId: context.agentEntityId,
              runId: context.currentRunId!,
              toolCallId,
              toolName: tc.name,
              args: args as any,
              status: 'waiting',
            },
          });

          const result = await waitForPendingResult(toolCallId, timeout);
          if (result !== null) return result;

          return {
            error: `Tool "${tc.name}" timed out after ${timeout}ms. No result was received.`,
            toolCallId,
          };
        },
      });
    }
  }

  return { tools, visibleToolNames, asyncToolNames };
}

/**
 * Poll PendingToolCall for resolution within the given timeout.
 * Returns the result if resolved, or null if the timeout expires.
 * On timeout, flips status 'waiting' → 'pending' so that if the result
 * arrives later, the tool-results API pushes it to the inbox.
 */
async function waitForPendingResult(
  toolCallId: string,
  timeoutMs: number,
): Promise<unknown | null> {
  const deadline = Date.now() + timeoutMs;
  const POLL_INTERVAL = 500;

  while (Date.now() < deadline) {
    const pending = await prisma.pendingToolCall.findUnique({
      where: { toolCallId },
    });
    if (pending?.status === 'resolved') {
      return pending.result;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await new Promise((r) => setTimeout(r, Math.min(POLL_INTERVAL, remaining)));
  }

  // Timeout — flip to 'pending' so late results still reach the agent via inbox
  await prisma.pendingToolCall.updateMany({
    where: { toolCallId, status: 'waiting' },
    data: { status: 'pending' },
  });

  // Final check — result may have arrived between last poll and status flip
  const final = await prisma.pendingToolCall.findUnique({ where: { toolCallId } });
  if (final?.status === 'resolved') return final.result;

  return null;
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
