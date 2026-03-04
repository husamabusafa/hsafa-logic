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
//   text.delta       → space.message.streaming (phase: delta)
//   tool-input.delta → tool.streaming
//   tool-call        → tool.started / tool.done
//   tool-result      → tool.done (with result)
//   step.complete    → (ignored)
//   run.complete     → agent.inactive
//   run.started      → agent.active
//
// One bridge per haseef connection. Started/stopped via lifecycle webhooks.
// =============================================================================

const RECONNECT_DELAY_MS = 3000;

export interface StreamBridgeOptions {
  haseefId: string;
  haseefName: string;
  agentEntityId: string;
  spaceIds: string[];
}

export class HaseefStreamBridge {
  private config: Config;
  private opts: StreamBridgeOptions;
  private es: EventSource | null = null;
  private pub: Redis | null = null;
  private running = false;

  constructor(config: Config, opts: StreamBridgeOptions) {
    this.config = config;
    this.opts = opts;
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

      // Emit agent.active to all connected spaces
      this.emitToSpaces({
        type: 'agent.active',
        agentEntityId: this.opts.agentEntityId,
        data: {
          agentEntityId: this.opts.agentEntityId,
          agentName: this.opts.haseefName,
        },
      });
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
        await this.emitToSpaces({
          type: 'space.message.streaming',
          agentEntityId: this.opts.agentEntityId,
          runId: streamId,
          data: {
            streamId,
            agentEntityId: this.opts.agentEntityId,
            phase: 'delta',
            delta: event.delta as string,
            text: event.text as string,
          },
        });
        break;
      }

      case 'tool-input.delta': {
        // Forward as tool.streaming
        await this.emitToSpaces({
          type: 'tool.streaming',
          agentEntityId: this.opts.agentEntityId,
          runId: streamId,
          data: {
            streamId: event.toolCallId as string,
            toolName: event.toolName as string,
            partialArgs: event.partialArgs,
          },
        });
        break;
      }

      case 'tool-call': {
        // Forward as tool.started
        await this.emitToSpaces({
          type: 'tool.started',
          agentEntityId: this.opts.agentEntityId,
          runId: streamId,
          data: {
            streamId: event.toolCallId as string,
            toolName: event.toolName as string,
            args: event.args,
          },
        });
        break;
      }

      case 'tool-result': {
        // Forward as tool.done
        await this.emitToSpaces({
          type: 'tool.done',
          agentEntityId: this.opts.agentEntityId,
          runId: streamId,
          data: {
            streamId: event.toolCallId as string,
            toolName: event.toolName as string,
            result: event.result,
          },
        });
        break;
      }

      case 'run.started': {
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

      case 'run.complete': {
        // Emit agent.inactive + streaming done
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
