// =============================================================================
// Agent Builder
// =============================================================================
// Reads an agent's configJson and produces everything needed to call the LLM:
//  - Resolved AI SDK model instance
//  - All tools (prebuilt + custom) ready for streamText()
//  - Set of visible tool names (for stream-processor routing)

import { tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { xai } from '@ai-sdk/xai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { z } from 'zod';
import { jsonSchema } from 'ai';
import { prisma } from '../lib/db.js';
import { AgentConfigSchema, type RunContext, type BuiltAgent } from './types.js';
import { initPrebuiltTools, getPrebuiltTools } from './prebuilt-tools/registry.js';

// =============================================================================
// Provider resolution
// =============================================================================

/** Default model used if provider config is missing or unknown */
const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_PROVIDER = 'openai';

/**
 * Resolve an AI SDK model instance from the agent's model config.
 * Model names come from the DB — never hardcoded here.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveModel(providerName: string, modelName: string): any {
  switch (providerName.toLowerCase()) {
    case 'openai':
      return openai(modelName);
    case 'anthropic':
      return anthropic(modelName);
    case 'google':
      return google(modelName);
    case 'xai':
      return xai(modelName);
    case 'openrouter': {
      const router = createOpenRouter({
        apiKey: process.env.OPENROUTER_API_KEY ?? '',
      });
      return router(modelName);
    }
    default:
      console.warn(
        `[builder] Unknown provider "${providerName}", falling back to ${DEFAULT_PROVIDER}/${DEFAULT_MODEL}`,
      );
      return openai(DEFAULT_MODEL);
  }
}

// =============================================================================
// Custom tool builder
// =============================================================================

/**
 * Convert one custom ToolConfig from agent configJson into an AI SDK tool.
 * executionType determines whether the tool has an execute function:
 *  - gateway  → server-side HTTP request
 *  - internal → no-op / static output
 *  - external / space → no execute (run pauses at waiting_tool — handled by run-runner)
 *
 * Uses 'any' throughout because tool schemas come from JSON config at runtime
 * and AI SDK's tool() generic constraints don't accommodate dynamic schema objects.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildCustomTool(toolConfig: any, context: RunContext): any {
  const { name, description, inputSchema, executionType, execution } = toolConfig;

  // Build the input schema — config uses raw JSON Schema objects
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const schema = jsonSchema(inputSchema as any);

  // For gateway tools: execute via HTTP or compute
  if (executionType === 'gateway' && execution) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return tool({
      description: String(description),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inputSchema: schema as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      execute: async (input: any) => {
        return executeGatewayTool(String(name), execution, input, context);
      },
    });
  }

  // For internal tools: static output or no-op
  if (executionType === 'internal') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const staticOutput = (execution as any)?.output ?? { status: 'ok' };
    return tool({
      description: String(description),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inputSchema: schema as any,
      execute: async () => staticOutput,
    });
  }

  // For external / space tools: no execute — run-runner handles waiting_tool
  return tool({
    description: String(description),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    inputSchema: schema as any,
    // No execute → AI SDK emits tool-call but does not execute it server-side.
    // run-runner detects pending tool calls and transitions run to waiting_tool.
  });
}

// =============================================================================
// Gateway tool execution (HTTP)
// =============================================================================

async function executeGatewayTool(
  toolName: string,
  execution: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input: any,
  _context: RunContext,
): Promise<unknown> {
  const url = execution.url as string | undefined;
  const method = (execution.method as string | undefined) ?? 'POST';
  const timeout = (execution.timeout as number | undefined) ?? 30_000;

  if (!url) {
    return { error: `Tool "${toolName}" has no execution URL configured.` };
  }

  // Template variable substitution: {{input.field}}
  const resolvedUrl = url.replace(/\{\{input\.(\w+)\}\}/g, (_, key) => {
    const val = input[key];
    return val !== undefined ? String(val) : '';
  });

  // Build headers — substitute ${env.VAR} references
  const rawHeaders = (execution.headers as Record<string, string> | undefined) ?? {};
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  for (const [k, v] of Object.entries(rawHeaders)) {
    headers[k] = v.replace(/\$\{env\.(\w+)\}/g, (_, envVar) => process.env[envVar] ?? '');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(resolvedUrl, {
      method,
      headers,
      ...(method !== 'GET' ? { body: JSON.stringify(input) } : {}),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return { error: `HTTP ${response.status}: ${response.statusText}` };
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      return await response.json();
    }
    return { result: await response.text() };
  } catch (err) {
    clearTimeout(timeoutId);
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `Tool "${toolName}" request failed: ${msg}` };
  }
}

// =============================================================================
// buildAgent — main export
// =============================================================================

/**
 * Build all agent artifacts from a Run record.
 * Fetches the agent config from DB, resolves the LLM model, constructs all tools.
 *
 * @param runId — ID of the Run being executed
 * @param context — RunContext with closures for activeSpaceId
 */
export async function buildAgent(runId: string, context: RunContext): Promise<BuiltAgent> {
  // 1. Load agent from DB
  const run = await prisma.run.findUniqueOrThrow({
    where: { id: runId },
    include: { agent: { select: { configJson: true } } },
  });

  // 2. Parse + validate config — fall back to raw cast if validation fails
  const parseResult = AgentConfigSchema.safeParse(run.agent.configJson);
  if (!parseResult.success) {
    console.warn(
      `[builder] Agent config validation issues for run ${runId}:`,
      parseResult.error.issues.map((i) => i.message).join('; '),
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config: import('./types.js').AgentConfig = parseResult.success
    ? parseResult.data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    : (run.agent.configJson as any);

  // 3. Resolve LLM model
  const providerName = config.model?.provider ?? DEFAULT_PROVIDER;
  const modelName = config.model?.model ?? DEFAULT_MODEL;
  const model = resolveModel(providerName, modelName);

  // 4. Init prebuilt tools (idempotent) and bind to context
  await initPrebuiltTools();
  const prebuiltTools = getPrebuiltTools(context);

  // 5. Build custom tools from config
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const customToolConfigs: any[] = config.tools ?? [];
  const customTools: Record<string, ReturnType<typeof tool>> = {};
  const visibleToolNames = new Set<string>();
  const clientToolNames = new Set<string>();

  for (const toolConfig of customToolConfigs) {
    const builtTool = buildCustomTool(toolConfig, context);
    customTools[toolConfig.name as string] = builtTool;

    // Determine visibility — default true for gateway/external/space, false for internal
    const defaultVisible = toolConfig.executionType !== 'internal';
    const isVisible = toolConfig.visible !== undefined ? toolConfig.visible : defaultVisible;
    if (isVisible) {
      visibleToolNames.add(toolConfig.name as string);
    }

    // Track tools without execute (external/space) — these trigger waiting_tool
    if (toolConfig.executionType === 'external' || toolConfig.executionType === 'space') {
      clientToolNames.add(toolConfig.name as string);
    }
  }

  // 6. Merge prebuilt + custom (custom can override prebuilt names if needed)
  const tools = { ...prebuiltTools, ...customTools };

  return { tools, visibleToolNames, clientToolNames, model };
}
