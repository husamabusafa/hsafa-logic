import { EventSource } from 'eventsource';
import Redis from 'ioredis';
import type { Config } from './config.js';

// =============================================================================
// Haseef Stream Bridge
//
// Subscribes to Core's haseef stream SSE endpoint and forwards relevant
// streaming events to the spaces-app's Redis channels so the React SDK
// can show typing indicators and live token streaming.
//
// Event mapping (Core → spaces-app):
//
// For message_tools (messageTool: true in manifest):
//   tool.started     → space.message.streaming (phase: start, toolName)
//   tool-input.delta → space.message.streaming (phase: delta, toolName, partialArgs)
//   tool.ready       → space.message.streaming (phase: args_complete, toolName, args)
//   tool.done        → (no-op — persist happens in webhook handler)
//
// For regular tools:
//   tool-input.delta → tool.streaming
//   tool.started     → tool.started
//   tool.ready       → tool.ready (with args)
//   tool.done        → tool.done (with result)
//
// Always:
//   text.delta       → space.message.streaming (phase: delta)
//   run.start        → agent.active
//   run.finish       → agent.inactive + space.message.streaming (phase: done)
//
// One bridge per haseef connection. Started/stopped via lifecycle webhooks.
// =============================================================================

const RECONNECT_DELAY_MS = 3000;

export interface StreamBridgeOptions {
  haseefId: string;
  haseefName: string;
  agentEntityId: string;
  spaceIds: string[];
  messageToolNames: Set<string>;
}

export class HaseefStreamBridge {
  private config: Config;
  private opts: StreamBridgeOptions;
  private es: EventSource | null = null;
  private pub: Redis | null = null;
  private running = false;

  private messageToolNames: Set<string>;

  constructor(config: Config, opts: StreamBridgeOptions) {
    this.config = config;
    this.opts = opts;
    this.messageToolNames = opts.messageToolNames;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    this.pub = new Redis(this.config.spacesRedisUrl, { maxRetriesPerRequest: null });
    this.connect();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.es) {
      this.es.close();
      this.es = null;
    }
    if (this.pub) {
      this.pub.disconnect();
      this.pub = null;
    }
  }

  private connect(): void {
    if (!this.running) return;

    const url = `${this.config.coreUrl}/api/haseefs/${this.opts.haseefId}/stream`;

    console.log(`[stream-bridge] Connecting to haseef stream for ${this.opts.haseefName}`);

    this.es = new EventSource(url, {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          headers: {
            ...(init?.headers as Record<string, string> | undefined),
            'x-secret-key': this.config.secretKey,
          },
        }),
    });

    this.es.onopen = () => {
      console.log(`[stream-bridge] Connected to haseef stream for ${this.opts.haseefName}`);
    };

    this.es.onmessage = (event: MessageEvent) => {
      this.handleEvent(event.data).catch((err) =>
        console.error(`[stream-bridge] Error handling event:`, err),
      );
    };

    this.es.onerror = () => {
      console.error(`[stream-bridge] SSE error for ${this.opts.haseefName}`);
      if (this.es) {
        this.es.close();
        this.es = null;
      }
      if (this.running) {
        setTimeout(() => this.connect(), RECONNECT_DELAY_MS);
      }
    };
  }

  private async handleEvent(rawData: string): Promise<void> {
    const event = JSON.parse(rawData) as Record<string, unknown>;
    const type = event.type as string;

    if (!type || type === 'connected') return;

    const runId = event.runId as string | undefined;
    const streamId = runId || this.opts.haseefId;

    switch (type) {
      case 'text.delta': {
        // Forward as space.message.streaming for the React SDK
        const textDelta = (event.text as string) ?? '';
        await this.emitToSpaces({
          type: 'space.message.streaming',
          agentEntityId: this.opts.agentEntityId,
          runId: streamId,
          data: {
            streamId,
            agentEntityId: this.opts.agentEntityId,
            phase: 'delta',
            delta: textDelta,
            text: textDelta,
          },
        });
        break;
      }

      case 'tool-input.delta':
      case 'tool.started':
      case 'tool.ready':
      case 'tool.done': {
        const toolName = event.toolName as string;
        const toolStreamId = (event.streamId ?? event.toolCallId) as string;
        const isMsgTool = this.messageToolNames.has(toolName);

        if (isMsgTool) {
          // message_tool: stream as space.message.streaming so frontend renders as message
          await this.handleMessageToolEvent(type, event, toolStreamId, toolName, streamId);
        } else {
          // Regular tool: forward as tool.* events
          await this.handleRegularToolEvent(type, event, toolStreamId, toolName, streamId);
        }
        break;
      }

      case 'run.start': {
        await this.emitToSpaces({
          type: 'agent.active',
          agentEntityId: this.opts.agentEntityId,
          runId: event.runId as string,
          data: {
            runId: event.runId,
            agentEntityId: this.opts.agentEntityId,
            agentName: this.opts.haseefName,
          },
        });
        break;
      }

      case 'run.finish': {
        // Emit streaming done + agent.inactive
        await this.emitToSpaces({
          type: 'space.message.streaming',
          agentEntityId: this.opts.agentEntityId,
          runId: streamId,
          data: {
            streamId,
            phase: 'done',
          },
        });
        await this.emitToSpaces({
          type: 'agent.inactive',
          agentEntityId: this.opts.agentEntityId,
          runId: event.runId as string,
          data: {
            runId: event.runId,
            agentEntityId: this.opts.agentEntityId,
          },
        });
        break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // message_tool events → space.message.streaming (frontend renders as message)
  // ---------------------------------------------------------------------------

  private async handleMessageToolEvent(
    type: string,
    event: Record<string, unknown>,
    toolStreamId: string,
    toolName: string,
    runStreamId: string,
  ): Promise<void> {
    switch (type) {
      case 'tool.started':
        await this.emitToSpaces({
          type: 'space.message.streaming',
          agentEntityId: this.opts.agentEntityId,
          runId: runStreamId,
          data: {
            streamId: toolStreamId,
            agentEntityId: this.opts.agentEntityId,
            phase: 'start',
            toolName,
          },
        });
        break;

      case 'tool-input.delta':
        await this.emitToSpaces({
          type: 'space.message.streaming',
          agentEntityId: this.opts.agentEntityId,
          runId: runStreamId,
          data: {
            streamId: toolStreamId,
            agentEntityId: this.opts.agentEntityId,
            phase: 'delta',
            toolName,
            delta: event.delta as string,
            partialArgs: event.partialArgs,
          },
        });
        break;

      case 'tool.ready':
        await this.emitToSpaces({
          type: 'space.message.streaming',
          agentEntityId: this.opts.agentEntityId,
          runId: runStreamId,
          data: {
            streamId: toolStreamId,
            agentEntityId: this.opts.agentEntityId,
            phase: 'args_complete',
            toolName,
            args: event.args,
          },
        });
        break;

      case 'tool.done':
        // No-op for message_tools — the webhook handler persists the final message.
        // The space.message event from persistence is the authoritative "done" signal.
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Regular tool events → tool.* (not rendered as messages)
  // ---------------------------------------------------------------------------

  private async handleRegularToolEvent(
    type: string,
    event: Record<string, unknown>,
    toolStreamId: string,
    toolName: string,
    runStreamId: string,
  ): Promise<void> {
    switch (type) {
      case 'tool.started':
        await this.emitToSpaces({
          type: 'tool.started',
          agentEntityId: this.opts.agentEntityId,
          runId: runStreamId,
          data: { streamId: toolStreamId, toolName },
        });
        break;

      case 'tool-input.delta':
        await this.emitToSpaces({
          type: 'tool.streaming',
          agentEntityId: this.opts.agentEntityId,
          runId: runStreamId,
          data: {
            streamId: toolStreamId,
            toolName,
            delta: event.delta as string,
            partialArgs: event.partialArgs,
          },
        });
        break;

      case 'tool.ready':
        await this.emitToSpaces({
          type: 'tool.ready',
          agentEntityId: this.opts.agentEntityId,
          runId: runStreamId,
          data: { streamId: toolStreamId, toolName, args: event.args },
        });
        break;

      case 'tool.done':
        await this.emitToSpaces({
          type: 'tool.done',
          agentEntityId: this.opts.agentEntityId,
          runId: runStreamId,
          data: { streamId: toolStreamId, toolName, result: event.result },
        });
        break;
    }
  }

  // ---------------------------------------------------------------------------

  private async emitToSpaces(event: Record<string, unknown>): Promise<void> {
    if (!this.pub) return;

    const payload = JSON.stringify(event);
    for (const spaceId of this.opts.spaceIds) {
      const channel = `smartspace:${spaceId}`;
      await this.pub.publish(channel, payload).catch((err: unknown) =>
        console.error(`[stream-bridge] Redis publish error:`, err),
      );
    }
  }
}
