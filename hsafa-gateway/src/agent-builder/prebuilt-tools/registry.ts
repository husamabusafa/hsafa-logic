import type { PrebuiltToolContext } from '../builder.js';

export interface PrebuiltToolHandler {
  inputSchema: Record<string, unknown>;
  defaultDescription: string;
  strict?: boolean;
  inputExamples?: Array<{ input: unknown }>;
  execute: (input: unknown, context: PrebuiltToolContext) => Promise<unknown>;
}

const registry = new Map<string, PrebuiltToolHandler>();

export function registerPrebuiltTool(action: string, handler: PrebuiltToolHandler): void {
  registry.set(action, handler);
}

let _initPromise: Promise<void> | null = null;

export async function initPrebuiltTools(): Promise<void> {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    await import('./set-goals.js');
    await import('./delete-goals.js');
    // getMemories removed — memories are injected into the system prompt directly
    await import('./set-memories.js');
    await import('./delete-memories.js');
    await import('./get-plans.js'); // registers getPreviousPlans (active plans are in system prompt)
    await import('./set-plans.js');
    await import('./delete-plans.js');
    await import('./send-space-message.js');
    await import('./get-space-messages.js');
    await import('./get-my-runs.js');
    await import('./skip-response.js');
    await import('./delegate-agent.js');
    // mentionAgent removed — superseded by sendSpaceMessage's `mention` field
  })();
  return _initPromise;
}

export function getPrebuiltHandler(action: string): PrebuiltToolHandler | undefined {
  return registry.get(action);
}

export function getAllPrebuiltHandlers(): Map<string, PrebuiltToolHandler> {
  return registry;
}
