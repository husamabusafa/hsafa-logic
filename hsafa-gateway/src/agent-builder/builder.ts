import { ToolLoopAgent, stepCountIs, jsonSchema, tool, type ToolExecutionOptions } from 'ai';
import { validateAgentConfig, interpolateConfigEnvVars } from './parser.js';
import { resolveModel, getModelSettings } from './model-resolver.js';
import { resolveTools } from './tool-resolver.js';
import { resolveMCPClients, loadMCPTools, closeMCPClients, type MCPClientWrapper } from './mcp-resolver.js';
import { initPrebuiltTools, getAllPrebuiltHandlers } from './prebuilt-tools/registry.js';
import type { AgentConfig } from './types.js';

export interface PrebuiltToolContext {
  runId: string;
  agentEntityId: string;
  agentId: string;
  triggerSpaceId?: string;
  isAdminAgent?: boolean;
  isMultiAgentSpace?: boolean;
  toolCallId?: string;
}

export interface BuildAgentOptions {
  config: AgentConfig;
  runContext?: PrebuiltToolContext;
}

export interface BuildAgentResult {
  agent: ToolLoopAgent;
  config: AgentConfig;
  mcpClients: MCPClientWrapper[];
}

export class AgentBuildError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'AgentBuildError';
  }
}

export async function buildAgent(options: BuildAgentOptions): Promise<BuildAgentResult> {
  const { config } = options;

  let validatedConfig: AgentConfig;
  try {
    validatedConfig = validateAgentConfig(config);
    validatedConfig = interpolateConfigEnvVars(validatedConfig);
  } catch (error) {
    throw new AgentBuildError(
      `Failed to parse agent configuration: ${error instanceof Error ? error.message : String(error)}`,
      error
    );
  }

  try {
    const model = resolveModel(validatedConfig.model);
    const modelSettings = getModelSettings(validatedConfig.model);

    // Ensure prebuilt tool handlers are registered
    await initPrebuiltTools();

    // Filter out any prebuilt entries from config (they're auto-injected below)
    const configTools = (validatedConfig.tools ?? []).filter(
      (t: any) => t.executionType !== 'prebuilt'
    );

    // Resolve static tools from agent config
    const staticTools = resolveTools(configTools, options.runContext);

    // Auto-inject prebuilt tools with conditional filtering:
    // - delegateToAgent: only for admin agent in multi-agent spaces
    const isMultiAgent = options.runContext?.isMultiAgentSpace ?? false;
    const isAdmin = options.runContext?.isAdminAgent ?? false;

    const prebuiltTools: Record<string, any> = {};
    for (const [action, handler] of getAllPrebuiltHandlers()) {
      // delegateToAgent is admin-only in multi-agent spaces
      if (action === 'delegateToAgent' && !(isMultiAgent && isAdmin)) continue;
      prebuiltTools[action] = tool({
        description: handler.defaultDescription,
        inputSchema: jsonSchema(handler.inputSchema as Parameters<typeof jsonSchema>[0]),
        ...(handler.strict ? { strict: true } : {}),
        ...(handler.inputExamples ? { inputExamples: handler.inputExamples } : {}),
        execute: async (input: unknown, execOptions: ToolExecutionOptions) => {
          if (!options.runContext) {
            throw new Error('Prebuilt tools require a run context');
          }
          return handler.execute(input, { ...options.runContext, toolCallId: execOptions.toolCallId });
        },
      });
    }

    // Resolve MCP tools
    const mcpClients = await resolveMCPClients(validatedConfig.mcp);
    const mcpTools = await loadMCPTools(mcpClients, validatedConfig.mcp);

    const mcpToolNames = Object.keys(mcpTools);
    if (mcpToolNames.length > 0) {
      console.log(`[agent-builder] MCP tools loaded (${mcpToolNames.length}): ${mcpToolNames.join(', ')}`);
    } else if (validatedConfig.mcp?.servers?.length) {
      console.warn(`[agent-builder] MCP servers configured but no tools loaded`);
    }

    // Merge all tools (prebuilt first, then config, then MCP)
    const allTools: Record<string, any> = { ...prebuiltTools, ...staticTools, ...mcpTools };

    const agent = new ToolLoopAgent({
      model,
      instructions: validatedConfig.agent.system,
      tools: allTools,
      toolChoice: (validatedConfig.loop?.toolChoice as any) ?? 'auto',
      stopWhen: stepCountIs(validatedConfig.loop?.maxSteps ?? 5),
      ...modelSettings,
    });

    return { agent, config: validatedConfig, mcpClients };
  } catch (error) {
    throw new AgentBuildError(
      `Failed to build agent: ${error instanceof Error ? error.message : String(error)}`,
      error
    );
  }
}
