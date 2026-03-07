// =============================================================================
// Extension Server
//
// Express server that handles the extension contract with Core:
//   - GET  /manifest  — serves auto-generated manifest
//   - POST /webhook   — receives tool calls + lifecycle events
//   - POST /context   — dynamic per-haseef instructions (optional)
//   - GET  /health    — health check
//
// Usage:
//   const hsafa = new Hsafa({ coreUrl, extensionKey });
//   const server = new ExtensionServer(hsafa, {
//     name: 'ext-calendar',
//     description: 'Calendar integration',
//     capabilities: ['sense', 'act'],
//   });
//
//   server.tool('create_event', {
//     description: 'Create a calendar event',
//     inputSchema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
//   }, async (args, ctx) => {
//     return { eventId: '123', title: args.title };
//   });
//
//   server.onLifecycle('haseef.connected', (event) => { ... });
//   server.onContext(async ({ haseefId, config }) => {
//     return `You are connected to calendar account: ${config.email}`;
//   });
//
//   await server.listen();
// =============================================================================

import express, { type Request, type Response } from 'express';
import type { Hsafa } from './hsafa.js';
import type {
  ToolDefinition,
  ToolHandler,
  ToolCallContext,
  ToolCallWebhook,
  LifecycleWebhook,
  LifecycleHandler,
  ContextHandler,
  ContextRequest,
  ExtensionManifest,
} from './types.js';

export interface ExtensionServerOptions {
  /** Port to listen on (default: 4200) */
  port?: number;
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
  /** Event types this extension emits (e.g. ['message', 'alert']) */
  events?: string[];
  /** Auto-connect to all Haseefs on install */
  autoConnect?: boolean;
  /** Config fields that MUST be set before activation */
  requiredConfig?: string[];
  /** What this extension provides */
  capabilities?: Array<'sense' | 'act'>;
  /**
   * Relative path for the context endpoint (e.g. "/context").
   * If set AND a contextHandler is registered, Core will POST { haseefId, config }
   * here at the start of each think cycle and inject the returned instructions.
   */
  contextUrl?: string;
}

interface RegisteredTool {
  definition: ToolDefinition;
  handler: ToolHandler;
}

export class ExtensionServer {
  private hsafa: Hsafa;
  private options: ExtensionServerOptions;
  private tools = new Map<string, RegisteredTool>();
  private lifecycleHandlers = new Map<string, LifecycleHandler[]>();
  private contextHandler: ContextHandler | null = null;
  private app = express();
  private server: ReturnType<typeof express.prototype.listen> | null = null;

  constructor(hsafa: Hsafa, options: ExtensionServerOptions = {}) {
    this.hsafa = hsafa;
    this.options = options;

    this.app.use(express.json());
    this.setupRoutes();
  }

  // ---------------------------------------------------------------------------
  // Registration API
  // ---------------------------------------------------------------------------

  /**
   * Register a tool that this extension provides.
   * Core will call this tool via webhook when a Haseef invokes it.
   */
  tool(
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

  /**
   * Register a lifecycle event handler.
   * Events: 'haseef.connected', 'haseef.disconnected', 'haseef.config_updated', 'extension.installed'
   */
  onLifecycle(type: string, handler: LifecycleHandler): this {
    const handlers = this.lifecycleHandlers.get(type) ?? [];
    handlers.push(handler);
    this.lifecycleHandlers.set(type, handlers);
    return this;
  }

  /**
   * Register a dynamic context handler.
   * Core calls this at the start of each think cycle with { haseefId, config }.
   * Return a string of instructions to inject into the haseef's system prompt.
   *
   * You must also set `contextUrl` in the server options (e.g. "/context")
   * so Core knows where to POST.
   */
  onContext(handler: ContextHandler): this {
    this.contextHandler = handler;
    return this;
  }

  // ---------------------------------------------------------------------------
  // Manifest Generation
  // ---------------------------------------------------------------------------

  private buildManifest(): ExtensionManifest {
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
    if (this.options.capabilities) manifest.capabilities = this.options.capabilities;

    manifest.healthCheck = '/health';

    if (this.options.contextUrl && this.contextHandler) {
      manifest.contextUrl = this.options.contextUrl;
    }

    return manifest;
  }

  // ---------------------------------------------------------------------------
  // Routes
  // ---------------------------------------------------------------------------

  private setupRoutes(): void {
    // GET /manifest — auto-generated from registered tools + options
    this.app.get('/manifest', (_req: Request, res: Response) => {
      res.json(this.buildManifest());
    });

    // POST /webhook — tool calls + lifecycle events from Core
    this.app.post('/webhook', async (req: Request, res: Response) => {
      try {
        const event = req.body as { type: string; [key: string]: unknown };

        if (!event.type) {
          res.status(400).json({ error: 'Missing event type' });
          return;
        }

        if (event.type === 'tool_call') {
          await this.handleToolCall(event as unknown as ToolCallWebhook, res);
          return;
        }

        // Lifecycle events — handle async, respond immediately
        if (event.type.startsWith('haseef.') || event.type === 'extension.installed') {
          this.handleLifecycle(event as unknown as LifecycleWebhook).catch((err) => {
            console.error(`[extension-server] Lifecycle handler error for ${event.type}:`, err);
          });
          res.json({ ok: true });
          return;
        }

        res.status(400).json({ error: `Unknown webhook type: ${event.type}` });
      } catch (error) {
        console.error('[extension-server] Webhook error:', error);
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Internal error',
        });
      }
    });

    // POST /context (or custom path) — dynamic per-haseef instructions
    const contextPath = this.options.contextUrl ?? '/context';
    if (this.contextHandler) {
      this.app.post(contextPath, async (req: Request, res: Response) => {
        try {
          const body = req.body as ContextRequest;
          const instructions = await this.contextHandler!(body);
          res.json({ instructions: instructions || '' });
        } catch (error) {
          console.error('[extension-server] Context handler error:', error);
          res.json({ instructions: '' });
        }
      });
    }

    // GET /health
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({
        status: 'ok',
        name: this.options.name ?? 'unnamed-extension',
        tools: Array.from(this.tools.keys()),
        uptime: process.uptime(),
      });
    });
  }

  private async handleToolCall(event: ToolCallWebhook, res: Response): Promise<void> {
    const registered = this.tools.get(event.toolName);
    if (!registered) {
      res.status(404).json({ error: `Unknown tool: ${event.toolName}` });
      return;
    }

    const hsafa = this.hsafa;
    const context: ToolCallContext = {
      toolCallId: event.toolCallId,
      haseefId: event.haseefId,
      haseefName: event.haseefName,
      runId: event.runId,
      config: event.config ?? null,
      pushSense: (senseEvent) => hsafa.pushSense(event.haseefId, senseEvent),
    };

    try {
      const result = await registered.handler(event.args, context);
      res.json(result);
    } catch (error) {
      console.error(`[extension-server] Tool ${event.toolName} error:`, error);
      res.json({
        error: error instanceof Error ? error.message : 'Tool execution failed',
      });
    }
  }

  private async handleLifecycle(event: LifecycleWebhook): Promise<void> {
    const handlers = this.lifecycleHandlers.get(event.type) ?? [];
    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (error) {
        console.error(`[extension-server] Lifecycle handler error for ${event.type}:`, error);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Server Lifecycle
  // ---------------------------------------------------------------------------

  /** Start the extension server */
  async listen(port?: number): Promise<void> {
    const p = port ?? this.options.port ?? 4200;
    return new Promise((resolve) => {
      this.server = this.app.listen(p, () => {
        const name = this.options.name ?? 'extension';
        console.log(`[${name}] Listening on http://localhost:${p}`);
        console.log(`[${name}] Tools: ${Array.from(this.tools.keys()).join(', ') || '(none)'}`);
        if (this.contextHandler) {
          console.log(`[${name}] Context: ${this.options.contextUrl ?? '/context'}`);
        }
        resolve();
      });
    });
  }

  /** Stop the extension server */
  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close((err: Error | undefined) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /** Get the underlying Express app (for custom routes) */
  getApp(): express.Express {
    return this.app;
  }

  /** Get the Hsafa client instance */
  getHsafa() {
    return this.hsafa;
  }
}
