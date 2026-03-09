import { resolveModel } from '../lib/model-registry.js';
import {
  HaseefConfigSchema,
  type HaseefProcessContext,
  type BuiltHaseef,
} from './types.js';
import { buildPrebuiltTools } from './prebuilt-tools/registry.js';
import { buildScopedTools } from '../lib/tool-builder.js';

// =============================================================================
// Haseef Builder (v5)
//
// Resolves the LLM model, builds prebuilt + scoped tools from HaseefTool DB
// rows, and returns a BuiltHaseef ready for streamText().
//
// No extensions. No MCP. No custom tools from config.
// =============================================================================

/**
 * Build a Haseef from its config JSON, process context, and pre-fetched DB tools.
 * Returns the model and tools needed for streamText().
 */
export function buildHaseef(
  rawConfig: unknown,
  context: HaseefProcessContext,
  dbTools: Array<{ name: string; description: string; inputSchema: unknown; scope: string; mode: string; timeout: number | null }>,
): BuiltHaseef {
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

  // Merge: prebuilt → scoped (scoped tools override on name collision)
  const tools = { ...prebuilt, ...scoped };

  return { tools, model };
}
