// =============================================================================
// Webhook Handler (for embedded extensions)
//
// When you can't use ExtensionServer (e.g. Next.js API routes, serverless),
// use this helper to parse and route incoming webhook payloads from Core.
//
// Usage in a Next.js API route:
//
//   import { Hsafa, WebhookHandler } from '@hsafa/node';
//
//   const hsafa = new Hsafa({ coreUrl, extensionKey });
//   const handler = new WebhookHandler({ name: 'ext-spaces', hsafa });
//
//   handler.onTool('get_weather', {
//     description: 'Get weather', inputSchema: { ... },
//   }, async (args, ctx) => {
//     return { temperature: 72, city: args.city };
//   });
//
//   handler.onLifecycle('haseef.connected', (event) => { ... });
//
//   handler.onContext(async ({ haseefId, config }) => {
//     return `User account: ${config.email}`;
//   });
//
//   // In your route handlers:
//   // GET /manifest  → Response.json(handler.buildManifest())
//   // POST /webhook  → Response.json(await handler.handle(body))
//   // POST /context  → Response.json(await handler.handleContext(body))
// =============================================================================

import type {
  Hsafa,
} from './hsafa.js';
import type {
  ToolHandler,
  ToolCallContext,
  ToolCallWebhook,
  LifecycleWebhook,
  LifecycleHandler,
  ContextHandler,
  ContextRequest,
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
  /** JSON Schema for per-haseef config */
  configSchema?: Record<string, unknown>;
  /** Event types this extension emits */
  events?: string[];
  /** Auto-connect to all Haseefs on install */
  autoConnect?: boolean;
  /** Config fields that MUST be set before activation */
  requiredConfig?: string[];
  /** Health check endpoint path (e.g. "/api/health") */
  healthCheck?: string;
  /** What this extension provides */
  capabilities?: Array<'sense' | 'act'>;
  /** Relative path for context endpoint */
  contextUrl?: string;
  /** Hsafa client instance — enables pushSense on ToolCallContext */
  hsafa?: Hsafa;
}

interface RegisteredTool {
  definition: ToolDefinition;
  handler: ToolHandler;
}

export class WebhookHandler {
  private tools = new Map<string, RegisteredTool>();
  private lifecycleHandlers = new Map<string, LifecycleHandler[]>();
  private _contextHandler: ContextHandler | null = null;
  private options: WebhookHandlerOptions;
  private hsafa: Hsafa | null;

  constructor(options: WebhookHandlerOptions = {}) {
    this.options = options;
    this.hsafa = options.hsafa ?? null;
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

  /**
   * Register a dynamic context handler.
   * Return instructions to inject into the haseef's system prompt.
   */
  onContext(handler: ContextHandler): this {
    this._contextHandler = handler;
    return this;
  }

  // ---------------------------------------------------------------------------
  // Manifest
  // ---------------------------------------------------------------------------

  /** Generate manifest from registered tools and options */
  buildManifest(): ExtensionManifest {
    const manifest: ExtensionManifest = {
      name: this.options.name ?? 'unnamed-extension',
      description: this.options.description,
      version: this.options.version ?? '1.0.0',
      tools: Array.from(this.tools.values()).map((t) => t.definition),
      instructions: this.options.instructions,
    };

    if (this.options.configSchema) manifest.configSchema = this.options.configSchema;
    if (this.options.events) manifest.events = this.options.events;
    if (this.options.autoConnect !== undefined) manifest.autoConnect = this.options.autoConnect;
    if (this.options.requiredConfig) manifest.requiredConfig = this.options.requiredConfig;
    if (this.options.healthCheck) manifest.healthCheck = this.options.healthCheck;
    if (this.options.capabilities) manifest.capabilities = this.options.capabilities;
    if (this.options.contextUrl) manifest.contextUrl = this.options.contextUrl;

    return manifest;
  }

  // ---------------------------------------------------------------------------
  // Handle incoming webhook
  // ---------------------------------------------------------------------------

  /**
   * Process an incoming webhook payload from Core.
   * Returns the response body to send back.
   *
   * For tool_call events: returns the tool result directly
   * For lifecycle events: returns { ok: true }
   */
  async handle(body: Record<string, unknown>): Promise<unknown> {
    const type = body.type as string;

    if (!type) {
      return { error: 'Missing event type' };
    }

    if (type === 'tool_call') {
      return this.handleToolCall(body as unknown as ToolCallWebhook);
    }

    if (type.startsWith('haseef.') || type === 'extension.installed') {
      this.handleLifecycleEvent(body as unknown as LifecycleWebhook).catch((err) => {
        console.error(`[webhook-handler] Lifecycle handler error for ${type}:`, err);
      });
      return { ok: true };
    }

    return { error: `Unknown webhook type: ${type}` };
  }

  /**
   * Process an incoming context request from Core.
   * Returns { instructions: string }.
   */
  async handleContext(body: Record<string, unknown>): Promise<{ instructions: string }> {
    if (!this._contextHandler) {
      return { instructions: '' };
    }

    try {
      const request = body as unknown as ContextRequest;
      const instructions = await this._contextHandler(request);
      return { instructions: instructions || '' };
    } catch (error) {
      console.error('[webhook-handler] Context handler error:', error);
      return { instructions: '' };
    }
  }

  private async handleToolCall(event: ToolCallWebhook): Promise<unknown> {
    const registered = this.tools.get(event.toolName);
    if (!registered) {
      return { error: `Unknown tool: ${event.toolName}` };
    }

    const hsafa = this.hsafa;
    const context: ToolCallContext = {
      toolCallId: event.toolCallId,
      haseefId: event.haseefId,
      haseefName: event.haseefName,
      runId: event.runId,
      config: event.config ?? null,
      pushSense: hsafa
        ? (senseEvent) => hsafa.pushSense(event.haseefId, senseEvent)
        : async () => {
            console.warn('[webhook-handler] pushSense called but no Hsafa client provided');
          },
    };

    try {
      const result = await registered.handler(event.args, context);
      return result;
    } catch (error) {
      console.error(`[webhook-handler] Tool ${event.toolName} error:`, error);
      return {
        error: error instanceof Error ? error.message : 'Tool execution failed',
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
