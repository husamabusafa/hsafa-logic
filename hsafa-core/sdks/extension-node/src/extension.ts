import { CoreClient } from './client.js';
import type {
  HsafaExtensionConfig,
  ToolDefinition,
  ToolCallContext,
  ToolCallEvent,
  SenseEventInput,
  HaseefConnectionInfo,
  ExtensionSelfInfo,
} from './types.js';

// =============================================================================
// HsafaExtension — Main SDK Class
//
// Usage:
//   const ext = new HsafaExtension({ coreUrl, extensionKey, secretKey, redisUrl });
//
//   ext.tool('my_tool', {
//     description: 'Does something',
//     inputSchema: { type: 'object', properties: { ... } },
//     execute: async (args, ctx) => ({ result: 'done' }),
//   });
//
//   ext.instructions('You have access to my_tool...');
//
//   await ext.start();
// =============================================================================

export class HsafaExtension {
  private config: HsafaExtensionConfig;
  private client: CoreClient;
  private tools: Map<string, ToolDefinition> = new Map();
  private _instructions: string = '';
  private extensionId: string | null = null;
  private extensionName: string | null = null;
  private _connections: HaseefConnectionInfo[] = [];
  private running = false;
  private redisSubscriber: any = null;
  private pollTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private log: (...args: unknown[]) => void;

  constructor(config: HsafaExtensionConfig) {
    this.config = config;
    this.client = new CoreClient(config);
    this.log = (...args: unknown[]) => {
      const prefix = config.logPrefix ?? 'hsafa-ext';
      console.log(`[${prefix}]`, ...args);
    };
  }

  // ---------------------------------------------------------------------------
  // Public API: Register a tool
  // ---------------------------------------------------------------------------

  tool(
    name: string,
    opts: {
      description: string;
      inputSchema: Record<string, unknown>;
      execute: (args: Record<string, unknown>, context: ToolCallContext) => Promise<unknown>;
    },
  ): this {
    this.tools.set(name, {
      name,
      description: opts.description,
      inputSchema: opts.inputSchema,
      execute: opts.execute,
    });
    return this;
  }

  // ---------------------------------------------------------------------------
  // Public API: Set instructions
  // ---------------------------------------------------------------------------

  instructions(text: string): this {
    this._instructions = text;
    return this;
  }

  // ---------------------------------------------------------------------------
  // Public API: Push a sense event to a specific Haseef
  // ---------------------------------------------------------------------------

  async pushSenseEvent(haseefId: string, event: SenseEventInput): Promise<void> {
    await this.client.pushSenseEvent(haseefId, event);
  }

  // ---------------------------------------------------------------------------
  // Public API: Get connected Haseefs (available after start())
  // ---------------------------------------------------------------------------

  get connections(): readonly HaseefConnectionInfo[] {
    return this._connections;
  }

  // ---------------------------------------------------------------------------
  // Public API: Start the extension
  // ---------------------------------------------------------------------------

  async start(): Promise<void> {
    if (this.running) return;

    // 1. Self-discover
    this.log('Discovering self...');
    const me: ExtensionSelfInfo = await this.client.getMe();
    this.extensionId = me.id;
    this.extensionName = me.name;

    if (this.config.logPrefix === undefined) {
      this.log = (...args: unknown[]) => {
        console.log(`[${me.name}]`, ...args);
      };
    }

    this.log(`Extension ID: ${me.id}, name: ${me.name}`);
    this.log(`Connected to ${me.connections.length} haseef(s)`);

    // Parse connections
    this._connections = me.connections.map((c) => ({
      haseefId: c.haseefId,
      haseefName: c.haseefName,
      haseefEntityId: c.haseefEntityId,
      config: c.config,
    }));

    // 2. Sync tools
    if (this.tools.size > 0) {
      const toolDefs = Array.from(this.tools.values()).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      }));
      await this.client.syncTools(me.id, toolDefs);
      this.log(`Tools synced: ${toolDefs.map((t) => t.name).join(', ')}`);
    }

    // 3. Update instructions
    if (this._instructions) {
      await this.client.updateInstructions(me.id, this._instructions);
      this.log('Instructions updated');
    }

    // 4. Start listening for tool calls
    this.running = true;

    if (this.config.redisUrl) {
      await this.startRedisListener(me.id);
    } else {
      this.startPolling();
    }

    this.log('Ready');
  }

  // ---------------------------------------------------------------------------
  // Public API: Stop the extension
  // ---------------------------------------------------------------------------

  async stop(): Promise<void> {
    this.running = false;
    this.log('Stopping...');

    // Stop Redis subscriber
    if (this.redisSubscriber) {
      try {
        await this.redisSubscriber.unsubscribe();
        this.redisSubscriber.disconnect();
      } catch {
        // ignore
      }
      this.redisSubscriber = null;
    }

    // Stop polling timers
    for (const timer of this.pollTimers.values()) {
      clearInterval(timer);
    }
    this.pollTimers.clear();

    this.log('Stopped');
  }

  // ---------------------------------------------------------------------------
  // Redis tool call listener
  // ---------------------------------------------------------------------------

  private async startRedisListener(extensionId: string): Promise<void> {
    let Redis: any;
    try {
      Redis = (await import('ioredis')).default;
    } catch {
      this.log('ioredis not available, falling back to HTTP polling');
      this.startPolling();
      return;
    }

    const channel = `ext:${extensionId}:tools`;
    this.log(`Subscribing to Redis channel: ${channel}`);

    this.redisSubscriber = new Redis(this.config.redisUrl, {
      maxRetriesPerRequest: null,
    });

    this.redisSubscriber.subscribe(channel).catch((err: Error) => {
      this.log('Redis subscribe failed:', err.message);
    });

    this.redisSubscriber.on('message', (_ch: string, msg: string) => {
      this.handleToolCallMessage(msg).catch((err: unknown) => {
        this.log('Error handling tool call:', err);
      });
    });

    this.redisSubscriber.on('error', (err: Error) => {
      this.log('Redis error:', err.message);
    });
  }

  // ---------------------------------------------------------------------------
  // HTTP polling fallback
  // ---------------------------------------------------------------------------

  private startPolling(): void {
    const interval = this.config.pollIntervalMs ?? 2000;
    this.log(`Starting HTTP polling (interval: ${interval}ms)`);

    for (const conn of this._connections) {
      const timer = setInterval(() => {
        this.pollHaseef(conn.haseefId, conn.haseefEntityId).catch((err: unknown) => {
          this.log(`Poll error for ${conn.haseefName}:`, err);
        });
      }, interval);
      this.pollTimers.set(conn.haseefId, timer);
    }
  }

  private async pollHaseef(haseefId: string, haseefEntityId: string): Promise<void> {
    if (!this.running) return;

    const calls = await this.client.pollToolCalls(haseefId);
    for (const call of calls) {
      if (call.status !== 'waiting') continue;
      await this.executeToolCall(
        call.toolCallId,
        call.toolName,
        call.args,
        call.runId,
        haseefId,
        haseefEntityId,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Tool call handling
  // ---------------------------------------------------------------------------

  private async handleToolCallMessage(raw: string): Promise<void> {
    let event: ToolCallEvent;
    try {
      event = JSON.parse(raw) as ToolCallEvent;
    } catch {
      return;
    }

    if (event.type !== 'tool.call') return;

    // Find the haseefId for this haseefEntityId
    const conn = this._connections.find((c) => c.haseefEntityId === event.haseefEntityId);
    if (!conn) {
      this.log(`No connection for haseefEntityId=${event.haseefEntityId}`);
      return;
    }

    await this.executeToolCall(
      event.toolCallId,
      event.toolName,
      event.args,
      event.runId,
      conn.haseefId,
      event.haseefEntityId,
    );
  }

  private async executeToolCall(
    toolCallId: string,
    toolName: string,
    args: Record<string, unknown>,
    runId: string,
    haseefId: string,
    haseefEntityId: string,
  ): Promise<void> {
    const toolDef = this.tools.get(toolName);
    if (!toolDef) {
      this.log(`Unknown tool: ${toolName} (callId=${toolCallId})`);
      await this.client.returnToolResult(haseefId, toolCallId, {
        error: `Unknown tool: ${toolName}`,
      });
      return;
    }

    this.log(`Tool call: ${toolName} (callId=${toolCallId})`);

    const context: ToolCallContext = {
      haseefId,
      haseefEntityId,
      runId,
      toolCallId,
      pushSenseEvent: (event: SenseEventInput) => this.client.pushSenseEvent(haseefId, event),
    };

    let result: unknown;
    try {
      result = await toolDef.execute(args, context);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.log(`Tool execution error (${toolName}):`, errMsg);
      result = { error: errMsg };
    }

    await this.client.returnToolResult(haseefId, toolCallId, result);
  }
}
