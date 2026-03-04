import Redis from 'ioredis';
import type { Config, HaseefConnection } from './config.js';

// =============================================================================
// Stream Bridge
//
// Subscribes to haseef-level stream channels (haseef:{entityId}:stream) and
// forwards streaming events to the spaces-app Redis channels so that SSE
// clients (use-case-app) see token-by-token updates.
//
// When the LLM calls send_space_message, the args stream in as partial JSON.
// This bridge:
//   1. Detects send_space_message tool calls via tool.started
//   2. Accumulates tool-input.delta to extract spaceId + text deltas
//   3. Publishes space.message.streaming events to smartspace:{spaceId}
//   4. On tool.ready (full args), emits the final chunk
//   5. On tool.done, emits space.message.streaming.done
//
// Extensions that don't support streaming (e.g. ext-whatsapp) simply don't
// create a StreamBridge — zero complexity on their side.
// =============================================================================

interface ActiveStream {
  toolCallId: string;
  toolName: string;
  haseefEntityId: string;
  runId: string;
  accumulated: string;      // Raw accumulated JSON args text
  spaceId: string | null;   // Extracted once available
  textSentLen: number;      // How many chars of text we've already forwarded
}

export class StreamBridge {
  private config: Config;
  private connections: Map<string, HaseefConnection>; // agentEntityId → connection
  /** Map from haseefId (core DB ID) → agentEntityId (spaces-app entity ID) */
  private haseefIdToEntityId: Map<string, string>;
  private subscriber: InstanceType<typeof Redis> | null = null;
  private publisher: InstanceType<typeof Redis> | null = null;
  private running = false;
  private activeStreams = new Map<string, ActiveStream>(); // toolCallId → state

  constructor(config: Config, connections: HaseefConnection[]) {
    this.config = config;
    this.connections = new Map(connections.map((c) => [c.agentEntityId, c]));
    this.haseefIdToEntityId = new Map(connections.map((c) => [c.agentId, c.agentEntityId]));
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Subscriber for haseef stream channels
    this.subscriber = new Redis(this.config.redisUrl, { maxRetriesPerRequest: null });

    // Publisher for spaces-app channels
    this.publisher = new Redis(this.config.redisUrl, { maxRetriesPerRequest: null });

    // Subscribe to each connected haseef's stream channel.
    // Core publishes to haseef:{haseefId}:stream where haseefId = Haseef DB record ID = agentId.
    const channels: string[] = [];
    for (const conn of this.connections.values()) {
      channels.push(`haseef:${conn.agentId}:stream`);
    }

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

  // ---------------------------------------------------------------------------
  // Event handler
  // ---------------------------------------------------------------------------

  private async handleEvent(raw: string): Promise<void> {
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(raw);
    } catch {
      return;
    }

    const type = event.type as string;

    switch (type) {
      case 'tool.started':
        this.onToolStarted(event);
        break;
      case 'tool-input.delta':
        await this.onToolInputDelta(event);
        break;
      case 'tool.ready':
        await this.onToolReady(event);
        break;
      case 'tool.done':
        await this.onToolDone(event);
        break;
      case 'tool.error':
        this.onToolError(event);
        break;
      case 'run.start':
        await this.onRunStart(event);
        break;
      case 'run.finish':
        await this.onRunFinish(event);
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // tool.started — begin tracking if it's send_space_message
  // ---------------------------------------------------------------------------

  private onToolStarted(event: Record<string, unknown>): void {
    const toolName = event.toolName as string;
    if (toolName !== 'send_space_message') return;

    const toolCallId = (event.streamId ?? event.toolCallId) as string;
    // Core sends haseefId (DB record ID), map to agentEntityId (spaces-app entity ID)
    const haseefId = event.haseefId as string;
    const entityId = this.haseefIdToEntityId.get(haseefId) ?? haseefId;

    this.activeStreams.set(toolCallId, {
      toolCallId,
      toolName,
      haseefEntityId: entityId,
      runId: event.runId as string,
      accumulated: '',
      spaceId: null,
      textSentLen: 0,
    });
  }

  // ---------------------------------------------------------------------------
  // tool-input.delta — accumulate args, extract spaceId + stream text deltas
  // ---------------------------------------------------------------------------

  private async onToolInputDelta(event: Record<string, unknown>): Promise<void> {
    const toolCallId = (event.streamId ?? event.toolCallId) as string;
    const stream = this.activeStreams.get(toolCallId);
    if (!stream) return;

    const delta = event.delta as string;
    if (!delta) return;

    stream.accumulated += delta;

    // Try to extract spaceId if we don't have it yet
    if (!stream.spaceId) {
      stream.spaceId = this.extractSpaceId(stream.accumulated);
    }

    // If we have spaceId, try to extract and forward new text
    if (stream.spaceId) {
      const fullText = this.extractPartialText(stream.accumulated);
      if (fullText && fullText.length > stream.textSentLen) {
        const newText = fullText.slice(stream.textSentLen);
        stream.textSentLen = fullText.length;

        await this.emitStreamingEvent(stream.spaceId, {
          type: 'space.message.streaming',
          runId: stream.runId,
          data: {
            phase: 'delta',
            delta: newText,
          },
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // tool.ready — full args available, send any remaining text
  //
  // When the model doesn't produce tool-input-delta parts (common with many
  // providers), textSentLen will be 0 and we get the entire text here at once.
  // In that case, simulate token-by-token streaming by emitting word-sized
  // chunks with small delays so the UI shows a typing effect.
  // ---------------------------------------------------------------------------

  private async onToolReady(event: Record<string, unknown>): Promise<void> {
    const toolCallId = (event.streamId ?? event.toolCallId) as string;
    const stream = this.activeStreams.get(toolCallId);
    if (!stream) return;

    const args = event.args as Record<string, unknown> | undefined;
    if (!args) return;

    const spaceId = args.spaceId as string;
    const text = args.text as string;

    if (spaceId && text && text.length > stream.textSentLen) {
      const remaining = text.slice(stream.textSentLen);

      // If deltas were already streamed, just send the leftover tail
      if (stream.textSentLen > 0) {
        await this.emitStreamingEvent(spaceId, {
          type: 'space.message.streaming',
          runId: stream.runId,
          data: { phase: 'delta', delta: remaining },
        });
      } else {
        // No deltas were streamed — simulate token-by-token from the full text
        await this.emitChunked(spaceId, stream.runId, remaining);
      }

      stream.textSentLen = text.length;
    }
  }

  // ---------------------------------------------------------------------------
  // emitChunked — simulate token-by-token streaming for a full text block
  // ---------------------------------------------------------------------------

  private async emitChunked(
    spaceId: string,
    runId: string,
    text: string,
  ): Promise<void> {
    // Split into word-boundary chunks (~1-3 words each)
    const tokens = text.match(/\S+\s*/g) ?? [text];
    const DELAY_MS = 25; // small delay between chunks

    for (let i = 0; i < tokens.length; i++) {
      await this.emitStreamingEvent(spaceId, {
        type: 'space.message.streaming',
        runId,
        data: { phase: 'delta', delta: tokens[i] },
      });
      if (i < tokens.length - 1) {
        await new Promise((r) => setTimeout(r, DELAY_MS));
      }
    }
  }

  // ---------------------------------------------------------------------------
  // tool.done — streaming complete, emit done marker
  // ---------------------------------------------------------------------------

  private async onToolDone(event: Record<string, unknown>): Promise<void> {
    const toolCallId = (event.streamId ?? event.toolCallId) as string;
    const stream = this.activeStreams.get(toolCallId);
    if (!stream) {
      this.activeStreams.delete(toolCallId);
      return;
    }

    const spaceId = stream.spaceId;
    if (spaceId) {
      await this.emitStreamingEvent(spaceId, {
        type: 'space.message.streaming.done',
        streamId: toolCallId,
        entityId: stream.haseefEntityId,
      });
    }

    this.activeStreams.delete(toolCallId);
  }

  // ---------------------------------------------------------------------------
  // tool.error — clean up
  // ---------------------------------------------------------------------------

  private onToolError(event: Record<string, unknown>): void {
    const toolCallId = (event.streamId ?? event.toolCallId) as string;
    this.activeStreams.delete(toolCallId);
  }

  // ---------------------------------------------------------------------------
  // agent.active / agent.inactive — emitted when a run starts/finishes
  // ---------------------------------------------------------------------------

  private async onRunStart(event: Record<string, unknown>): Promise<void> {
    const haseefId = event.haseefId as string;
    const entityId = this.haseefIdToEntityId.get(haseefId);
    if (!entityId) return;

    const conn = this.connections.get(entityId);
    if (!conn) return;

    const payload = {
      type: 'agent.active',
      agentEntityId: entityId,
      agentName: conn.agentName,
      runId: event.runId as string,
    };

    // Emit to all connected spaces for this haseef
    await Promise.all(
      conn.connectedSpaceIds.map((spaceId) => this.emitStreamingEvent(spaceId, payload)),
    );
  }

  private async onRunFinish(event: Record<string, unknown>): Promise<void> {
    const haseefId = event.haseefId as string;
    const entityId = this.haseefIdToEntityId.get(haseefId);
    if (!entityId) return;

    const conn = this.connections.get(entityId);
    if (!conn) return;

    const payload = {
      type: 'agent.inactive',
      agentEntityId: entityId,
      agentName: conn.agentName,
      runId: event.runId as string,
    };

    // Emit to all connected spaces for this haseef
    await Promise.all(
      conn.connectedSpaceIds.map((spaceId) => this.emitStreamingEvent(spaceId, payload)),
    );
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Extract spaceId from partial JSON args.
   * Args look like: {"spaceId":"abc123","text":"Hello...
   * We look for the spaceId value once enough has accumulated.
   */
  private extractSpaceId(partial: string): string | null {
    const match = partial.match(/"spaceId"\s*:\s*"([^"]+)"/);
    return match ? match[1] : null;
  }

  /**
   * Extract the partial text value from accumulated JSON args.
   * Args look like: {"spaceId":"abc","text":"Hello, how are
   * We extract everything after "text":" up to the last unescaped quote or end.
   */
  private extractPartialText(partial: string): string | null {
    const textStart = partial.indexOf('"text"');
    if (textStart === -1) return null;

    // Find the opening quote of the text value
    const colonIdx = partial.indexOf(':', textStart + 6);
    if (colonIdx === -1) return null;

    // Find the opening quote after the colon
    const openQuote = partial.indexOf('"', colonIdx + 1);
    if (openQuote === -1) return null;

    // Extract text content (handle escape sequences)
    const afterQuote = partial.slice(openQuote + 1);

    // Check if text value is complete (ends with unescaped ")
    const closeIdx = this.findUnescapedQuote(afterQuote);
    if (closeIdx >= 0) {
      // Complete value
      return this.unescapeJson(afterQuote.slice(0, closeIdx));
    }

    // Incomplete — return what we have so far
    return this.unescapeJson(afterQuote);
  }

  /**
   * Find the index of the first unescaped double quote in a string.
   */
  private findUnescapedQuote(s: string): number {
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '\\') {
        i++; // skip escaped char
        continue;
      }
      if (s[i] === '"') return i;
    }
    return -1;
  }

  /**
   * Unescape basic JSON string escape sequences.
   */
  private unescapeJson(s: string): string {
    return s
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }

  /**
   * Publish a streaming event to a spaces-app Redis channel.
   */
  private async emitStreamingEvent(
    spaceId: string,
    event: Record<string, unknown>,
  ): Promise<void> {
    if (!this.publisher) return;
    const channel = `smartspace:${spaceId}`;
    await this.publisher.publish(channel, JSON.stringify(event));
  }
}
