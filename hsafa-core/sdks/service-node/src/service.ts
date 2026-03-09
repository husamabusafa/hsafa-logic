import { CoreClient } from './client.js';
import type {
  HsafaServiceConfig,
  ToolDefinition,
  ToolCallContext,
  ActionEvent,
  SenseEventInput,
} from './types.js';

// =============================================================================
// HsafaService — Main SDK Class
//
// Usage:
//   const svc = new HsafaService({
//     coreUrl: 'http://localhost:3001',
//     apiKey: 'sk_...',
//     scope: 'whatsapp',
//     haseefId: '...',
//   });
//
//   svc.tool('send_message', {
//     description: 'Send a WhatsApp message',
//     inputSchema: { type: 'object', properties: { ... } },
//     execute: async (args, ctx) => ({ success: true }),
//   });
//
//   await svc.start();
// =============================================================================

export interface HsafaServiceOptions extends HsafaServiceConfig {
  /** Scope name for this service (e.g. 'spaces', 'whatsapp', 'robot') */
  scope: string;
  /** Haseef ID(s) this service connects to. Can be single ID or array for multi-Haseef services. */
  haseefId: string | string[];
}

export class HsafaService {
  private config: HsafaServiceOptions;
  private client: CoreClient;
  private tools: Map<string, ToolDefinition> = new Map();
  private running = false;
  private redisClient: any = null;
  private sseAbortController: AbortController | null = null;
  private haseefIds: string[];
  private log: (...args: unknown[]) => void;

  constructor(config: HsafaServiceOptions) {
    this.config = config;
    this.client = new CoreClient(config);
    this.haseefIds = Array.isArray(config.haseefId) ? config.haseefId : [config.haseefId];
    this.log = (...args: unknown[]) => {
      const prefix = config.logPrefix ?? config.scope;
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
      mode?: 'sync' | 'fire_and_forget' | 'async';
      timeout?: number;
      execute: (args: Record<string, unknown>, context: ToolCallContext) => Promise<unknown>;
    },
  ): this {
    this.tools.set(name, {
      name,
      description: opts.description,
      inputSchema: opts.inputSchema,
      mode: opts.mode ?? 'sync',
      timeout: opts.timeout,
      execute: opts.execute,
    });
    return this;
  }

  // ---------------------------------------------------------------------------
  // Public API: Push a sense event
  // ---------------------------------------------------------------------------

  async pushSenseEvent(haseefId: string, event: SenseEventInput): Promise<void> {
    await this.client.pushSenseEvent(haseefId, event);
  }

  // ---------------------------------------------------------------------------
  // Public API: Start the service
  // ---------------------------------------------------------------------------

  async start(): Promise<void> {
    if (this.running) return;

    this.log(`Connecting to ${this.haseefIds.length} haseef(s), scope=${this.config.scope}`);

    // 1. Sync tools to all Haseefs
    if (this.tools.size > 0) {
      const toolDefs = Array.from(this.tools.values()).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        mode: t.mode,
        timeout: t.timeout,
      }));
      
      await Promise.all(
        this.haseefIds.map((haseefId) =>
          this.client.syncTools(haseefId, this.config.scope, toolDefs)
        )
      );
      this.log(`Tools synced: ${toolDefs.map((t) => t.name).join(', ')}`);
    }

    // 2. Start listening for action requests
    this.running = true;

    if (this.config.redisUrl) {
      await this.startRedisStreamsListener();
    } else {
      await this.startSSEListener();
    }

    this.log('Ready');
  }

  // ---------------------------------------------------------------------------
  // Public API: Stop the service
  // ---------------------------------------------------------------------------

  async stop(): Promise<void> {
    this.running = false;
    this.log('Stopping...');

    if (this.redisClient) {
      try {
        this.redisClient.disconnect();
      } catch {
        // ignore
      }
      this.redisClient = null;
    }

    if (this.sseAbortController) {
      this.sseAbortController.abort();
      this.sseAbortController = null;
    }

    this.log('Stopped');
  }

  // ---------------------------------------------------------------------------
  // Redis Streams listener (XREADGROUP)
  // ---------------------------------------------------------------------------

  private async startRedisStreamsListener(): Promise<void> {
    let Redis: any;
    try {
      Redis = (await import('ioredis')).default;
    } catch {
      this.log('ioredis not available — falling back to SSE');
      await this.startSSEListener();
      return;
    }

    this.redisClient = new Redis(this.config.redisUrl, {
      maxRetriesPerRequest: null,
    });

    const consumerGroup = `${this.config.scope}-consumer`;
    const consumerName = `client-${Date.now()}`;

    // Create consumer groups for all Haseefs
    for (const haseefId of this.haseefIds) {
      const streamKey = `actions:${haseefId}:${this.config.scope}`;
      try {
        await this.redisClient.xgroup('CREATE', streamKey, consumerGroup, '0', 'MKSTREAM');
      } catch (err: any) {
        if (!err.message.includes('BUSYGROUP')) {
          this.log(`Failed to create consumer group for ${streamKey}:`, err.message);
        }
      }
    }

    this.log(`Listening via Redis Streams (consumer: ${consumerName})`);

    // Poll all streams
    const pollStreams = async () => {
      while (this.running) {
        try {
          const streamKeys = this.haseefIds.map(
            (id) => `actions:${id}:${this.config.scope}`
          );
          const streams = streamKeys.map((key) => [key, '>']);

          const results = await this.redisClient.xreadgroup(
            'GROUP',
            consumerGroup,
            consumerName,
            'BLOCK',
            5000,
            'STREAMS',
            ...streamKeys,
            ...Array(streamKeys.length).fill('>')
          );

          if (!results) continue;

          for (const [streamKey, messages] of results) {
            for (const [messageId, fields] of messages) {
              const data: Record<string, string> = {};
              for (let i = 0; i < fields.length; i += 2) {
                data[fields[i]] = fields[i + 1];
              }

              await this.executeAction(
                data.haseefId,
                data.actionId,
                data.toolName,
                JSON.parse(data.args ?? '{}')
              );

              // ACK the message
              await this.redisClient.xack(streamKey, consumerGroup, messageId);
            }
          }
        } catch (err: any) {
          if (this.running) {
            this.log('Redis stream error:', err.message);
          }
        }
      }
    };

    pollStreams().catch((err) => {
      this.log('Stream polling failed:', err);
    });
  }

  // ---------------------------------------------------------------------------
  // SSE listener
  // ---------------------------------------------------------------------------

  private async startSSEListener(): Promise<void> {
    this.log('Listening via SSE streams');
    this.sseAbortController = new AbortController();

    for (const haseefId of this.haseefIds) {
      this.listenToHaseefSSE(haseefId).catch((err) => {
        this.log(`SSE error for ${haseefId}:`, err);
      });
    }
  }

  private async listenToHaseefSSE(haseefId: string): Promise<void> {
    try {
      for await (const action of this.client.streamActions(
        haseefId,
        this.config.scope,
        this.sseAbortController?.signal
      )) {
        await this.executeAction(
          haseefId,
          action.actionId,
          action.toolName,
          action.args
        );
      }
    } catch (err: any) {
      if (err.name !== 'AbortError' && this.running) {
        this.log(`SSE stream error for ${haseefId}:`, err.message);
        // Retry after delay
        await new Promise((r) => setTimeout(r, 2000));
        if (this.running) {
          await this.listenToHaseefSSE(haseefId);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Action handling
  // ---------------------------------------------------------------------------

  private async executeAction(
    haseefId: string,
    actionId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<void> {
    const toolDef = this.tools.get(toolName);
    if (!toolDef) {
      this.log(`Unknown tool: ${toolName} (actionId=${actionId})`);
      await this.client.submitActionResult(haseefId, actionId, {
        error: `Unknown tool: ${toolName}`,
      });
      return;
    }

    this.log(`[${haseefId.slice(0, 8)}] ${toolName} (${actionId.slice(0, 8)})`);

    const context: ToolCallContext = {
      haseefId,
      toolCallId: actionId,
      pushSenseEvent: (event: SenseEventInput) =>
        this.client.pushSenseEvent(haseefId, event),
    };

    let result: unknown;
    try {
      result = await toolDef.execute(args, context);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.log(`Action execution error (${toolName}):`, errMsg);
      result = { error: errMsg };
    }

    await this.client.submitActionResult(haseefId, actionId, result);
  }
}
