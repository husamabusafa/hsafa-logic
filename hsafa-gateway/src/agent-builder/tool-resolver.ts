import type { ToolConfig } from './types.js';
import type { PrebuiltToolContext } from './builder.js';
import { buildTool } from './tool-builder.js';

export function resolveTools(
  configs: ToolConfig[],
  runContext?: PrebuiltToolContext
): Record<string, ReturnType<typeof buildTool>> {
  const tools: Record<string, ReturnType<typeof buildTool>> = {};

  for (const config of configs) {
    tools[config.name] = buildTool(config, runContext);
  }

  return tools;
}
