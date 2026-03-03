import { EventSource } from 'eventsource';
import type { Config, HaseefConnection } from './config.js';
import type { CoreClient } from './core-client.js';

// =============================================================================
// Spaces Listener
//
// Connects to hsafa-spaces/spaces-app SSE stream and pushes relevant events
// to hsafa-core as SenseEvents. One listener per haseef connection.
//
// Sensory filtering:
//   - Skip messages from the haseef itself (avoid loops)
//   - Skip messages from non-connected spaces
//   - Only pass meaningful events (messages, not typing indicators)
// =============================================================================

const RECONNECT_DELAY_MS = 3000;

export class SpacesListener {
  private config: Config;
  private coreClient: CoreClient;
  private connection: HaseefConnection;
  private eventSources: Map<string, EventSource> = new Map();
  private running = false;

  constructor(config: Config, coreClient: CoreClient, connection: HaseefConnection) {
    this.config = config;
    this.coreClient = coreClient;
    this.connection = connection;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.connect();
  }

  stop(): void {
    this.running = false;
    for (const es of this.eventSources.values()) {
      es.close();
    }
    this.eventSources.clear();
  }

  private connect(): void {
    if (!this.running) return;

    const { agentEntityId, agentName, connectedSpaceIds } = this.connection;

    // Connect to per-space SSE streams (one EventSource per space)
    if (connectedSpaceIds.length > 0) {
      for (const spaceId of connectedSpaceIds) {
        this.connectToSpace(spaceId);
      }
      return;
    }

    // Fallback: if no specific spaces, log warning
    console.warn(`[spaces-listener] No connected spaces for ${agentName} — no SSE listeners started`);
  }

  private connectToSpace(spaceId: string): void {
    if (!this.running) return;

    const { agentEntityId, agentName } = this.connection;
    const url = `${this.config.spacesAppUrl}/api/smart-spaces/${spaceId}/stream`;

    console.log(`[spaces-listener] Connecting SSE for ${agentName} space=${spaceId} → ${url}`);

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
      console.log(`[spaces-listener] SSE connected for ${agentName}`);
    };

    // Listen for space.message events
    es.addEventListener('space.message', (event: MessageEvent) => {
      this.handleSpaceMessage(event.data).catch((err) =>
        console.error(`[spaces-listener] Error handling space.message:`, err),
      );
    });

    es.onerror = (err: Event) => {
      console.error(`[spaces-listener] SSE error for ${agentName} space=${spaceId}:`, err);
      es.close();
      this.eventSources.delete(spaceId);

      if (this.running) {
        console.log(`[spaces-listener] Reconnecting space=${spaceId} in ${RECONNECT_DELAY_MS}ms...`);
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

    const { agentEntityId, agentId, connectedSpaceIds } = this.connection;

    // SENSORY FILTER: Skip messages from the haseef itself (avoid loops)
    if (msg.entityId === agentEntityId) return;

    // SENSORY FILTER: Skip messages from non-connected spaces
    if (connectedSpaceIds.length > 0 && !connectedSpaceIds.includes(msg.smartSpaceId)) return;

    // Push to core as a SenseEvent
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
      `[spaces-listener] → Pushing sense event for ${this.connection.agentName}: ` +
      `${senseEvent.data.senderName} in "${senseEvent.data.spaceName}": "${(senseEvent.data.content as string).slice(0, 50)}"`,
    );

    await this.coreClient.pushSenseEvent(agentId, senseEvent);
  }
}
