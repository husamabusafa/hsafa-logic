// =============================================================================
// Webhook Handler (for embedded extensions)
//
// When you can't use ExtensionServer (e.g. Next.js API routes, serverless),
// use this helper to parse and route incoming webhook payloads from Core.
//
// Usage in a Next.js API route:
//
//   import { WebhookHandler } from '@hsafa/node';
//
//   const handler = new WebhookHandler();
//   handler.onTool('get_weather', async (args, ctx) => {
//     return { temperature: 72, city: args.city };
//   });
//   handler.onLifecycle('haseef.connected', (event) => { ... });
//
//   // In your route handler:
//   export async function POST(req) {
//     const body = await req.json();
//     const result = await handler.handle(body);
//     return Response.json(result);
//   }
// =============================================================================

import type {
  ToolHandler,
  ToolCallContext,
  ToolCallWebhook,
  LifecycleWebhook,
  LifecycleHandler,
  ExtensionManifest,
  ToolDefinition,
} from './types.js';

export interface WebhookHandlerOptions {
  /** Extension name (used in manifest) */
  name?: string;
  /** Extension description */
  description?: string;
  /** Extension version */
  version?: string;
  /** Instructions injected into Haseef's system prompt */
  instructions?: string;
}

interface RegisteredTool {
  definition: ToolDefinition;
  handler: ToolHandler;
}

export class WebhookHandler {
  private tools = new Map<string, RegisteredTool>();
  private lifecycleHandlers = new Map<string, LifecycleHandler[]>();
  private options: WebhookHandlerOptions;

  constructor(options: WebhookHandlerOptions = {}) {
    this.options = options;
  }

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  /** Register a tool handler */
  onTool(
    name: string,
    definition: Omit<ToolDefinition, 'name'>,
    handler: ToolHandler,
  ): this {
    this.tools.set(name, {
      definition: { name, ...definition },
      handler,
    });
    return this;
  }

  /** Register a lifecycle event handler */
  onLifecycle(type: string, handler: LifecycleHandler): this {
    const handlers = this.lifecycleHandlers.get(type) ?? [];
    handlers.push(handler);
    this.lifecycleHandlers.set(type, handlers);
    return this;
  }

  // ---------------------------------------------------------------------------
  // Manifest
  // ---------------------------------------------------------------------------

  /** Generate manifest from registered tools */
  buildManifest(): ExtensionManifest {
    return {
      name: this.options.name ?? 'unnamed-extension',
      description: this.options.description,
      version: this.options.version ?? '1.0.0',
      tools: Array.from(this.tools.values()).map((t) => t.definition),
      instructions: this.options.instructions,
    };
  }

  // ---------------------------------------------------------------------------
  // Handle incoming webhook
  // ---------------------------------------------------------------------------

  /**
   * Process an incoming webhook payload from Core.
   * Returns the response body to send back.
   *
   * For tool_call events: returns { result: ... }
   * For lifecycle events: returns { ok: true }
   * For manifest requests: returns the manifest
   */
  async handle(body: Record<string, unknown>): Promise<unknown> {
    const type = body.type as string;

    if (!type) {
      return { error: 'Missing event type' };
    }

    // Tool call
    if (type === 'tool_call') {
      return this.handleToolCall(body as unknown as ToolCallWebhook);
    }

    // Lifecycle event
    await this.handleLifecycleEvent(body as unknown as LifecycleWebhook);
    return { ok: true };
  }

  private async handleToolCall(event: ToolCallWebhook): Promise<unknown> {
    const registered = this.tools.get(event.toolName);
    if (!registered) {
      return { error: `Unknown tool: ${event.toolName}` };
    }

    const context: ToolCallContext = {
      toolCallId: event.toolCallId,
      haseefId: event.haseefId,
      haseefName: event.haseefName,
      runId: event.runId,
    };

    try {
      const result = await registered.handler(event.args, context);
      return { result };
    } catch (error) {
      console.error(`[webhook-handler] Tool ${event.toolName} error:`, error);
      return {
        result: { error: error instanceof Error ? error.message : 'Tool execution failed' },
      };
    }
  }

  private async handleLifecycleEvent(event: LifecycleWebhook): Promise<void> {
    const handlers = this.lifecycleHandlers.get(event.type) ?? [];
    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (error) {
        console.error(`[webhook-handler] Lifecycle handler error for ${event.type}:`, error);
      }
    }
  }
}
