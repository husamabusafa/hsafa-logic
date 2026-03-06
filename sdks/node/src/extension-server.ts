// =============================================================================
// Extension Server
//
// Express server that handles the extension contract with Core:
//   - GET  /manifest  — serves auto-generated manifest
//   - POST /webhook   — receives tool calls + lifecycle events
//   - GET  /health    — health check
//
// Usage:
//   const hsafa = new Hsafa({ coreUrl, extensionKey });
//   const server = new ExtensionServer(hsafa, { port: 4200 });
//
//   server.tool('get_weather', {
//     description: 'Get current weather',
//     inputSchema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
//   }, async (args, ctx) => {
//     return { temperature: 72, city: args.city };
//   });
//
//   server.onLifecycle('haseef.connected', (event) => { ... });
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
  ExtensionManifest,
} from './types.js';

export interface ExtensionServerOptions {
  /** Port to listen on (default: 4200) */
  port?: number;
  /** Extension name (used in manifest if not discovered) */
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

export class ExtensionServer {
  private hsafa: Hsafa;
  private options: ExtensionServerOptions;
  private tools = new Map<string, RegisteredTool>();
  private lifecycleHandlers = new Map<string, LifecycleHandler[]>();
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

  // ---------------------------------------------------------------------------
  // Manifest Generation
  // ---------------------------------------------------------------------------

  private buildManifest(): ExtensionManifest {
    return {
      name: this.options.name ?? 'unnamed-extension',
      description: this.options.description,
      version: this.options.version ?? '1.0.0',
      tools: Array.from(this.tools.values()).map((t) => t.definition),
      instructions: this.options.instructions,
    };
  }

  // ---------------------------------------------------------------------------
  // Routes
  // ---------------------------------------------------------------------------

  private setupRoutes(): void {
    // GET /manifest — auto-generated from registered tools
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

        // Tool call
        if (event.type === 'tool_call') {
          await this.handleToolCall(event as unknown as ToolCallWebhook, res);
          return;
        }

        // Lifecycle event
        await this.handleLifecycle(event as unknown as LifecycleWebhook);
        res.json({ ok: true });
      } catch (error) {
        console.error('[extension-server] Webhook error:', error);
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Internal error',
        });
      }
    });

    // GET /health
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({
        status: 'ok',
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

    const context: ToolCallContext = {
      toolCallId: event.toolCallId,
      haseefId: event.haseefId,
      haseefName: event.haseefName,
      runId: event.runId,
    };

    try {
      const result = await registered.handler(event.args, context);
      res.json({ result });
    } catch (error) {
      console.error(`[extension-server] Tool ${event.toolName} error:`, error);
      res.json({
        result: { error: error instanceof Error ? error.message : 'Tool execution failed' },
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
        console.log(`[extension-server] Listening on http://localhost:${p}`);
        console.log(`[extension-server] Tools: ${Array.from(this.tools.keys()).join(', ') || '(none)'}`);
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
