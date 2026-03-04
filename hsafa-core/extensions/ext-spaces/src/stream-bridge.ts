import Redis from 'ioredis';
import type { Config, HaseefConnection } from './config.js';

// =============================================================================
// Stream Bridge (simplified)
//
// Subscribes to haseef-level stream channels (haseef:{haseefId}:stream) and
// forwards streaming events to spaces-app Redis channels for SSE clients.
//
// Core's stream-processor now provides pre-parsed `partialArgs` on each
// tool-input.delta event, so this bridge is a thin forwarder — no manual
// JSON parsing, no fake streaming.
//
// For send_space_message:
//   1. tool.started → begin tracking
//   2. tool-input.delta → read partialArgs.spaceId + partialArgs.text, forward delta
//   3. tool.ready → send any remaining text (full args available)
//   4. tool.done → emit streaming done marker
//
// For run lifecycle:
//   run.start → agent.active, run.finish → agent.inactive
// =============================================================================

interface ActiveStream {
  toolCallId: string;
  haseefEntityId: string;
  runId: string;
  spaceId: string | null;
  textSentLen: number;
}

export class StreamBridge {
  private config: Config;
  private connections: Map<string, HaseefConnection>;
  private haseefIdToEntityId: Map<string, string>;
  private subscriber: InstanceType<typeof Redis> | null = null;
  private publisher: InstanceType<typeof Redis> | null = null;
  private running = false;
  private activeStreams = new Map<string, ActiveStream>();

  constructor(config: Config, connections: HaseefConnection[]) {
    this.config = config;
    this.connections = new Map(connections.map((c) => [c.agentEntityId, c]));
    this.haseefIdToEntityId = new Map(connections.map((c) => [c.agentId, c.agentEntityId]));
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    this.subscriber = new Redis(this.config.redisUrl, { maxRetriesPerRequest: null });
    this.publisher = new Redis(this.config.redisUrl, { maxRetriesPerRequest: null });

    const channels = [...this.connections.values()].map((c) => `haseef:${c.agentId}:stream`);
    if (channels.length === 0) return;

    console.log(`[stream-bridge] Subscribing to ${channels.length} haseef stream channel(s)`);
    await this.subscriber.subscribe(...channels).catch((err: Error) => {
      console.error('[stream-bridge] Subscribe failed:', err);
    });

    this.subscriber.on('message', (_ch: string, msg: string) => {
      this.handleEvent(msg).catch((err) =>
        console.error('[stream-bridge] Error handling stream event:', err),
      );
    });

    this.subscriber.on('error', (err: Error) => {
      console.error('[stream-bridge] Redis error:', err);
    });
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.subscriber) {
      await this.subscriber.unsubscribe().catch(() => {});
      this.subscriber.disconnect();
      this.subscriber = null;
    }
    if (this.publisher) {
      this.publisher.disconnect();
      this.publisher = null;
    }
    this.activeStreams.clear();
  }

  private async handleEvent(raw: string): Promise<void> {
    let event: Record<string, unknown>;
    try { event = JSON.parse(raw); } catch { return; }

    const type = event.type as string;
    const toolCallId = (event.streamId ?? event.toolCallId) as string;

    switch (type) {
      case 'tool.started': {
        if ((event.toolName as string) !== 'send_space_message') break;
        const haseefId = event.haseefId as string;
        const entityId = this.haseefIdToEntityId.get(haseefId) ?? haseefId;
        this.activeStreams.set(toolCallId, {
          toolCallId, haseefEntityId: entityId,
          runId: event.runId as string, spaceId: null, textSentLen: 0,
        });
        break;
      }

      case 'tool-input.delta': {
        const stream = this.activeStreams.get(toolCallId);
        if (!stream) break;

        // Use core's pre-parsed partialArgs — no manual JSON parsing needed
        const partialArgs = event.partialArgs as Record<string, unknown> | undefined;
        if (!partialArgs) break;

        if (!stream.spaceId && partialArgs.spaceId) {
          stream.spaceId = partialArgs.spaceId as string;
        }

        if (stream.spaceId && typeof partialArgs.text === 'string') {
          const text = partialArgs.text as string;
          if (text.length > stream.textSentLen) {
            const newText = text.slice(stream.textSentLen);
            stream.textSentLen = text.length;
            await this.emitToSpace(stream.spaceId, {
              type: 'space.message.streaming',
              runId: stream.runId,
              data: { phase: 'delta', delta: newText },
            });
          }
        }
        break;
      }

      case 'tool.ready': {
        const stream = this.activeStreams.get(toolCallId);
        if (!stream) break;

        const args = event.args as Record<string, unknown> | undefined;
        if (!args) break;

        const spaceId = args.spaceId as string;
        const text = args.text as string;

        if (spaceId && text && text.length > stream.textSentLen) {
          const remaining = text.slice(stream.textSentLen);

          if (stream.textSentLen > 0) {
            // Deltas were already streamed — just send the leftover tail
            await this.emitToSpace(spaceId, {
              type: 'space.message.streaming',
              runId: stream.runId,
              data: { phase: 'delta', delta: remaining },
            });
          } else {
            // No deltas were streamed (model doesn't emit tool-input-delta,
            // e.g. OpenAI Responses API) — simulate token-by-token streaming
            await this.emitChunked(spaceId, stream.runId, remaining);
          }

          stream.textSentLen = text.length;
        }
        break;
      }

      case 'tool.done': {
        const stream = this.activeStreams.get(toolCallId);
        if (stream?.spaceId) {
          await this.emitToSpace(stream.spaceId, {
            type: 'space.message.streaming.done',
            streamId: toolCallId,
            entityId: stream.haseefEntityId,
          });
        }
        this.activeStreams.delete(toolCallId);
        break;
      }

      case 'tool.error':
        this.activeStreams.delete(toolCallId);
        break;

      case 'run.start':
        await this.emitRunLifecycle(event, 'agent.active');
        break;

      case 'run.finish':
        await this.emitRunLifecycle(event, 'agent.inactive');
        break;
    }
  }

  private async emitRunLifecycle(event: Record<string, unknown>, type: string): Promise<void> {
    const haseefId = event.haseefId as string;
    const entityId = this.haseefIdToEntityId.get(haseefId);
    if (!entityId) return;

    const conn = this.connections.get(entityId);
    if (!conn) return;

    const payload = {
      type,
      agentEntityId: entityId,
      agentName: conn.agentName,
      runId: event.runId as string,
    };

    await Promise.all(
      conn.connectedSpaceIds.map((spaceId) => this.emitToSpace(spaceId, payload)),
    );
  }

  private async emitChunked(spaceId: string, runId: string, text: string): Promise<void> {
    const words = text.match(/\S+\s*/g) ?? [text];
    const WORDS_PER_CHUNK = 3;
    const DELAY_MS = 35;

    for (let i = 0; i < words.length; i += WORDS_PER_CHUNK) {
      const chunk = words.slice(i, i + WORDS_PER_CHUNK).join('');
      await this.emitToSpace(spaceId, {
        type: 'space.message.streaming',
        runId,
        data: { phase: 'delta', delta: chunk },
      });
      if (i + WORDS_PER_CHUNK < words.length) {
        await new Promise((r) => setTimeout(r, DELAY_MS));
      }
    }
  }

  private async emitToSpace(spaceId: string, event: Record<string, unknown>): Promise<void> {
    if (!this.publisher) return;
    await this.publisher.publish(`smartspace:${spaceId}`, JSON.stringify(event));
  }
}
