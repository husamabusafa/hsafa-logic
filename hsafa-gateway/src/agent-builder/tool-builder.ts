import { jsonSchema, tool, type ToolExecutionOptions } from 'ai';
import type { ToolConfig } from './types.js';
import type { PrebuiltToolContext } from './builder.js';
import { executeBasic, isNoExecutionBasic } from './tools/basic.js';
import { executeRequest } from './tools/request.js';
import { executeWaiting } from './tools/waiting.js';
import { executeCompute } from './tools/compute.js';
import { executeAiAgent } from './tools/ai-agent.js';
import { executeImageGenerator } from './tools/image-generator.js';
import { getPrebuiltHandler } from './prebuilt-tools/registry.js';

/**
 * Determines the execution target for a tool based on its configuration.
 * - 'client': Tool has no server-side execution (no-execution mode or missing execution)
 * - 'server': Tool executes on server (static, pass-through, request, etc.)
 * - 'external': Reserved for future use (external services)
 */
export function getToolExecutionTarget(
  toolConfig: ToolConfig | undefined
): 'server' | 'client' | 'external' {
  if (!toolConfig) return 'client';

  if (toolConfig.executionType === 'basic') {
    const execution = toolConfig.execution ?? null;
    if (isNoExecutionBasic(execution)) {
      return 'client';
    }
    return 'server';
  }

  // All other execution types (request, compute, ai-agent, image-generator, waiting, prebuilt) run on server
  return 'server';
}

const defaultPromptSchema = {
  type: 'object',
  properties: {
    prompt: { type: 'string' },
  },
  required: ['prompt'],
} as const;

const emptyObjectSchema = { type: 'object', properties: {} } as const;

/**
 * Wraps an execute function to strip displayTool routing field (targetSpaceId)
 * before passing args to the actual tool execute.
 */
function wrapExecuteForDisplayTool<T extends (...args: any[]) => any>(
  executeFn: T,
  isDisplayTool: boolean
): T {
  if (!isDisplayTool) return executeFn;
  return (async (input: unknown, ...rest: any[]) => {
    const cleaned = { ...(input as Record<string, unknown>) };
    delete cleaned.targetSpaceId;
    return executeFn(cleaned, ...rest);
  }) as unknown as T;
}

export function buildTool(config: ToolConfig, runContext?: PrebuiltToolContext) {
  const isDisplayTool = !!(config as any).displayTool;

  const inputSchema =
    config.inputSchema ??
    (config.executionType === 'ai-agent' || config.executionType === 'image-generator' ? defaultPromptSchema : emptyObjectSchema);

  const schema = jsonSchema(inputSchema as Parameters<typeof jsonSchema>[0]);

  if (config.executionType === 'basic') {
    const execution = config.execution ?? null;

    if (isNoExecutionBasic(execution)) {
      return tool({ description: config.description, inputSchema: schema });
    }

    return tool({
      description: config.description,
      inputSchema: schema,
      execute: wrapExecuteForDisplayTool(
        async (input: unknown) => executeBasic(execution, input),
        isDisplayTool
      ),
    });
  }

  if (config.executionType === 'request') {
    return tool({
      description: config.description,
      inputSchema: schema,
      execute: wrapExecuteForDisplayTool(
        async (input: unknown, options: ToolExecutionOptions) => executeRequest(config.execution, input, options),
        isDisplayTool
      ),
    });
  }

  if (config.executionType === 'waiting') {
    const execution = config.execution ?? null;
    return tool({
      description: config.description,
      inputSchema: schema,
      execute: wrapExecuteForDisplayTool(
        async (input: unknown) => executeWaiting(execution, input),
        isDisplayTool
      ),
    });
  }

  if (config.executionType === 'compute') {
    return tool({
      description: config.description,
      inputSchema: schema,
      execute: wrapExecuteForDisplayTool(
        async (input: unknown) => executeCompute(config.execution, input),
        isDisplayTool
      ),
    });
  }

  if (config.executionType === 'ai-agent') {
    return tool({
      description: config.description,
      inputSchema: schema,
      execute: wrapExecuteForDisplayTool(
        (input: unknown, options: ToolExecutionOptions) => executeAiAgent(config.execution, input, options),
        isDisplayTool
      ),
    });
  }

  if (config.executionType === 'image-generator') {
    return tool({
      description: config.description,
      inputSchema: schema,
      execute: wrapExecuteForDisplayTool(
        async (input: unknown, options: ToolExecutionOptions) => executeImageGenerator(config.execution, input, options),
        isDisplayTool
      ),
    });
  }

  if (config.executionType === 'prebuilt') {
    const handler = getPrebuiltHandler(config.execution.action);
    if (!handler) {
      throw new Error(`Unknown prebuilt tool action: ${config.execution.action}`);
    }

    const finalSchema = config.inputSchema
      ? schema
      : jsonSchema(handler.inputSchema as Parameters<typeof jsonSchema>[0]);
    const description = config.description || handler.defaultDescription;

    return tool({
      description,
      inputSchema: finalSchema,
      execute: async (input: unknown, execOptions: ToolExecutionOptions) => {
        if (!runContext) {
          throw new Error('Prebuilt tools require a run context');
        }
        return handler.execute(input, { ...runContext, toolCallId: execOptions.toolCallId });
      },
    });
  }

  const _exhaustive: never = config;
  void _exhaustive;
  throw new Error(`Unknown execution type`);
}
