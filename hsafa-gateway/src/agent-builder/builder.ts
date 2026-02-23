import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createXai } from '@ai-sdk/xai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { tool, jsonSchema } from 'ai';
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
    clientToolNames: custom.clientToolNames,
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
  clientToolNames: Set<string>;
}

function buildCustomTools(
  toolConfigs: ToolConfig[],
  context: AgentProcessContext,
): CustomToolsResult {
  const tools: Record<string, unknown> = {};
  const visibleToolNames = new Set<string>();
  const clientToolNames = new Set<string>();

  for (const tc of toolConfigs) {
    const isVisible = tc.visible ?? (tc.executionType !== 'internal');
    if (isVisible) visibleToolNames.add(tc.name);

    // Tools without server-side execution (space/external) become client tools
    const isClientTool = tc.executionType === 'space' || tc.executionType === 'external';
    if (isClientTool) clientToolNames.add(tc.name);

    // Use the tool's own JSON Schema from configJson, falling back to open object
    const schema = (Object.keys(tc.inputSchema).length > 0)
      ? tc.inputSchema
      : { type: 'object' as const, properties: {} };

    const inputSchema = jsonSchema<Record<string, unknown>>(schema as any);

    if (isClientTool) {
      // Client tools: no execute — SDK stops the loop, cycle enters waiting_tool
      tools[tc.name] = { description: tc.description, inputSchema };
    } else {
      // Server tools: use tool() helper for type-safe execute inference
      tools[tc.name] = tool({
        description: tc.description,
        inputSchema,
        execute: async (args) => {
          return executeGatewayTool(tc, args as Record<string, unknown>, context);
        },
      });
    }
  }

  return { tools, visibleToolNames, clientToolNames };
}

// =============================================================================
// Gateway Tool Execution
// =============================================================================

async function executeGatewayTool(
  config: ToolConfig,
  args: Record<string, unknown>,
  _context: AgentProcessContext,
): Promise<unknown> {
  const exec = config.execution ?? {};

  switch (config.executionType) {
    case 'gateway': {
      // HTTP request tool
      const url = exec.url as string;
      const method = (exec.method as string) ?? 'POST';
      const headers = (exec.headers as Record<string, string>) ?? {};
      const timeout = (exec.timeout as number) ?? 30_000;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

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

        const data = await response.json();
        return data;
      } catch (err) {
        clearTimeout(timer);
        return {
          error: err instanceof Error ? err.message : 'Gateway tool execution failed',
        };
      }
    }

    case 'internal': {
      // Internal tools return a static/computed result
      return { success: true, args };
    }

    default:
      return { error: `Unsupported execution type: ${config.executionType}` };
  }
}
