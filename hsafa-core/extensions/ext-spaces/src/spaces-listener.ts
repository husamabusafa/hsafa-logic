import { EventSource } from 'eventsource';
import type { Config } from './config.js';
import type { CoreClient } from './core-client.js';

// =============================================================================
// Spaces Listener
//
// Connects to hsafa-spaces/spaces-app SSE stream and pushes relevant events
// to hsafa-core as SenseEvents. One listener per haseef connection.
//
// Sensory filtering:
//   - Skip messages from the haseef itself (avoid loops)
//   - Only pass meaningful events (messages, not typing indicators)
//
// Lifecycle:
//   - Created when Core sends haseef.connected webhook
//   - Destroyed when Core sends haseef.disconnected webhook
// =============================================================================

const RECONNECT_DELAY_MS = 3000;

export interface ListenerOptions {
  haseefId: string;
  haseefName: string;
  agentEntityId: string;
  spaceIds: string[];
}

export class SpacesListener {
  private config: Config;
  private coreClient: CoreClient;
  private opts: ListenerOptions;
  private eventSources: Map<string, EventSource> = new Map();
  private running = false;

  constructor(config: Config, coreClient: CoreClient, opts: ListenerOptions) {
    this.config = config;
    this.coreClient = coreClient;
    this.opts = opts;
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    if (this.opts.spaceIds.length > 0) {
      for (const spaceId of this.opts.spaceIds) {
        this.connectToSpace(spaceId);
      }
    } else {
      console.warn(`[spaces-listener] No spaces for ${this.opts.haseefName} — no SSE listeners started`);
    }
  }

  stop(): void {
    this.running = false;
    for (const es of this.eventSources.values()) {
      es.close();
    }
    this.eventSources.clear();
  }

  private connectToSpace(spaceId: string): void {
    if (!this.running) return;

    const url = `${this.config.spacesAppUrl}/api/smart-spaces/${spaceId}/stream`;

    console.log(`[spaces-listener] Connecting SSE for ${this.opts.haseefName} space=${spaceId}`);

    const es = new EventSource(url, {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          headers: {
            ...(init?.headers as Record<string, string> | undefined),
            'x-secret-key': this.config.spacesAppSecretKey,
          },
        }),
    });

    es.onopen = () => {
      console.log(`[spaces-listener] SSE connected for ${this.opts.haseefName} space=${spaceId}`);
    };

    es.addEventListener('space.message', (event: MessageEvent) => {
      this.handleSpaceMessage(event.data).catch((err) =>
        console.error(`[spaces-listener] Error handling space.message:`, err),
      );
    });

    es.onerror = (_err: Event) => {
      console.error(`[spaces-listener] SSE error for ${this.opts.haseefName} space=${spaceId}`);
      es.close();
      this.eventSources.delete(spaceId);

      if (this.running) {
        setTimeout(() => this.connectToSpace(spaceId), RECONNECT_DELAY_MS);
      }
    };

    this.eventSources.set(spaceId, es);
  }

  private async handleSpaceMessage(rawData: string): Promise<void> {
    const data = JSON.parse(rawData) as {
      type: string;
      message?: {
        id: string;
        smartSpaceId: string;
        entityId: string;
        content: string | null;
        metadata?: Record<string, unknown>;
      };
      spaceName?: string;
      senderName?: string;
      senderType?: string;
    };

    const msg = data.message;
    if (!msg) return;

    // SENSORY FILTER: Skip messages from the haseef itself (avoid loops)
    if (msg.entityId === this.opts.agentEntityId) return;

    const senseEvent = {
      eventId: msg.id,
      channel: 'ext-spaces',
      source: msg.smartSpaceId,
      type: 'message',
      timestamp: new Date().toISOString(),
      data: {
        messageId: msg.id,
        spaceId: msg.smartSpaceId,
        spaceName: data.spaceName ?? msg.smartSpaceId,
        senderId: msg.entityId,
        senderName: data.senderName ?? 'Unknown',
        senderType: data.senderType ?? 'human',
        content: msg.content ?? '',
      },
    };

    console.log(
      `[spaces-listener] → sense: ${senseEvent.data.senderName} in "${senseEvent.data.spaceName}": "${(senseEvent.data.content as string).slice(0, 50)}"`,
    );

    await this.coreClient.pushSenseEvent(this.opts.haseefId, senseEvent);
  }
}
