// =============================================================================
// Prebuilt Tool Registry
// =============================================================================
// Lazy-loaded registry. Use initPrebuiltTools() once before calling
// getPrebuiltTools(). Dynamic imports prevent circular init issues.

import type { RunContext } from '../types.js';

// =============================================================================
// Registry types
// =============================================================================

export interface PrebuiltToolDefinition {
  /** AI SDK tool object ready to drop into streamText({ tools: ... }) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  asTool: (context: RunContext) => any;
}

// Registry: toolName → definition factory
const registry = new Map<string, PrebuiltToolDefinition>();

let initialized = false;

// =============================================================================
// Public API
// =============================================================================

/**
 * Dynamically import and register all prebuilt tool modules.
 * Must be called once before getPrebuiltTools(). Safe to call multiple times.
 */
export async function initPrebuiltTools(): Promise<void> {
  if (initialized) return;
  initialized = true;

  // Import order doesn't matter — each module self-registers via registerPrebuiltTool
  await import('./enter-space.js');
  await import('./send-message.js');
  await import('./read-messages.js');
  await import('./get-my-runs.js');
  await import('./stop-run.js');
  await import('./set-memories.js');
  await import('./get-memories.js');
  await import('./delete-memories.js');
  await import('./set-goals.js');
  await import('./delete-goals.js');
  await import('./set-plans.js');
  await import('./get-plans.js');
  await import('./delete-plans.js');
}

/**
 * Register a prebuilt tool. Called from each tool's module at load time.
 */
export function registerPrebuiltTool(
  name: string,
  definition: PrebuiltToolDefinition,
): void {
  registry.set(name, definition);
}

/**
 * Build all registered prebuilt tools bound to the given RunContext.
 * Returns a Record suitable for spreading into streamText({ tools }).
 */
export function getPrebuiltTools(
  context: RunContext,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [name, def] of registry) {
    result[name] = def.asTool(context);
  }
  return result;
}
