import Redis from 'ioredis';
import type { Config, HaseefConnection } from './config.js';
import type { CoreClient } from './core-client.js';
import type { SpacesClient } from './spaces-client.js';

// =============================================================================
// Tool Handler
//
// Subscribes to the extension-specific Redis channel for tool calls from core.
// When a tool call arrives, executes it via the Spaces App API and returns
// the result to core.
//
// Tools handled:
//   - enter_space          → GET space info + members + messages (context loading)
//   - send_space_message   → POST /api/smart-spaces/:spaceId/messages
//   - read_space_messages  → GET  /api/smart-spaces/:spaceId/messages
// =============================================================================

interface ToolCallEvent {
  type: 'tool.call';
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  runId: string;
  haseefId: string;       // The haseef ID from core (= agentId in HaseefConnection)
  extensionId: string;
  ts: string;
}

export class ToolHandler {
  private config: Config;
  private coreClient: CoreClient;
  private spacesClient: SpacesClient;
  private connectionsByEntityId: Map<string, HaseefConnection>; // agentEntityId → connection
  private connectionsByHaseefId: Map<string, HaseefConnection>; // agentId (haseefId) → connection
  private subscriber: InstanceType<typeof Redis> | null = null;
  private extensionId: string;
  private running = false;

  constructor(
    config: Config,
    coreClient: CoreClient,
    spacesClient: SpacesClient,
    extensionId: string,
    connections: HaseefConnection[],
  ) {
    this.config = config;
    this.coreClient = coreClient;
    this.spacesClient = spacesClient;
    this.extensionId = extensionId;
    this.connectionsByEntityId = new Map(connections.map((c) => [c.agentEntityId, c]));
    this.connectionsByHaseefId = new Map(connections.map((c) => [c.agentId, c]));
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    const channel = `ext:${this.extensionId}:tools`;
    console.log(`[tool-handler] Subscribing to Redis channel: ${channel}`);

    this.subscriber = new Redis(this.config.redisUrl, {
      maxRetriesPerRequest: null,
    });

    this.subscriber.subscribe(channel).catch((err: Error) => {
      console.error('[tool-handler] Failed to subscribe:', err);
    });

    this.subscriber.on('message', (_ch: string, msg: string) => {
      this.handleMessage(msg).catch((err) =>
        console.error('[tool-handler] Error handling tool call:', err),
      );
    });

    this.subscriber.on('error', (err: Error) => {
      console.error('[tool-handler] Redis error:', err);
    });
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.subscriber) {
      await this.subscriber.unsubscribe().catch(() => {});
      this.subscriber.disconnect();
      this.subscriber = null;
    }
  }

  // Update connections at runtime (e.g. after a new haseef connects)
  updateConnections(connections: HaseefConnection[]): void {
    this.connectionsByEntityId = new Map(connections.map((c) => [c.agentEntityId, c]));
    this.connectionsByHaseefId = new Map(connections.map((c) => [c.agentId, c]));
  }

  private async handleMessage(raw: string): Promise<void> {
    let event: ToolCallEvent;
    try {
      event = JSON.parse(raw) as ToolCallEvent;
    } catch {
      console.warn('[tool-handler] Failed to parse message:', raw);
      return;
    }

    if (event.type !== 'tool.call') return;

    // Core sends haseefId (= agentId), look up by that
    const conn = this.connectionsByHaseefId.get(event.haseefId);
    if (!conn) {
      console.warn(`[tool-handler] No connection for haseefId=${event.haseefId}`);
      return;
    }

    console.log(
      `[tool-handler] Tool call: ${event.toolName} (callId=${event.toolCallId}) ` +
      `for ${conn.agentName}`,
    );

    let result: unknown;
    try {
      switch (event.toolName) {
        case 'enter_space':
          result = await this.executeEnterSpace(event.args, conn);
          break;
        case 'send_space_message':
          result = await this.executeSendMessage(event.args, conn);
          break;
        case 'read_space_messages':
          result = await this.executeReadMessages(event.args);
          break;
        default:
          result = { error: `Unknown tool: ${event.toolName}` };
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[tool-handler] Tool execution error:`, errMsg);
      result = { error: errMsg };
    }

    // Return result to core
    await this.coreClient.returnToolResult(conn.agentId, event.toolCallId, result);
  }

  // ---------------------------------------------------------------------------
  // Tool executors
  // ---------------------------------------------------------------------------

  private async executeEnterSpace(
    args: Record<string, unknown>,
    conn: HaseefConnection,
  ): Promise<unknown> {
    const spaceId = args.spaceId as string;
    if (!spaceId) {
      return { error: 'spaceId is required' };
    }

    // Fetch space info, members, and recent messages in parallel
    const [space, members, messagesResult] = await Promise.all([
      this.spacesClient.getSpace(spaceId).catch(() => null),
      this.spacesClient.getMembers(spaceId).catch(() => []),
      this.spacesClient.readMessages(spaceId, 20).catch(() => ({ messages: [] })),
    ]);

    if (!space) {
      return { error: `Space not found: ${spaceId}` };
    }

    return {
      success: true,
      space: {
        id: space.id,
        name: space.name,
      },
      members: members.map((m) => ({
        entityId: m.entityId,
        displayName: m.displayName,
        type: m.type,
        isMe: m.entityId === conn.agentEntityId,
      })),
      messages: messagesResult.messages.map((m) => ({
        id: m.id,
        content: m.content,
        role: m.role,
        entityId: m.entityId,
        createdAt: m.createdAt,
      })),
    };
  }

  private async executeSendMessage(
    args: Record<string, unknown>,
    conn: HaseefConnection,
  ): Promise<unknown> {
    const spaceId = args.spaceId as string;
    const text = args.text as string;

    if (!spaceId || !text) {
      return { error: 'spaceId and text are required' };
    }

    const { message } = await this.spacesClient.sendMessage(
      spaceId,
      conn.agentEntityId,
      text,
    );

    return { success: true, messageId: message.id };
  }

  private async executeReadMessages(args: Record<string, unknown>): Promise<unknown> {
    const spaceId = args.spaceId as string;
    const limit = (args.limit as number) || 20;

    if (!spaceId) {
      return { error: 'spaceId is required' };
    }

    const { messages } = await this.spacesClient.readMessages(spaceId, limit);

    return {
      messages: messages.map((m) => ({
        id: m.id,
        content: m.content,
        role: m.role,
        entityId: m.entityId,
        createdAt: m.createdAt,
      })),
    };
  }
}
