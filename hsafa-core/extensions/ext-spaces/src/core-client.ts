import type { Config } from './config.js';

// =============================================================================
// Core API Client
//
// HTTP client for interacting with hsafa-core's extension API.
// Uses extension key for pushing sense events.
// =============================================================================

export interface SenseEvent {
  eventId: string;
  channel: string;
  source: string;
  type: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface ExtensionInfo {
  id: string;
  name: string;
  connections: Array<{
    connectionId: string;
    haseefId: string;
    haseefName: string;
    config: Record<string, unknown> | null;
  }>;
}

export class CoreClient {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  // ---------------------------------------------------------------------------
  // Self-discovery (extension key)
  // ---------------------------------------------------------------------------

  async getMe(): Promise<ExtensionInfo> {
    const res = await fetch(`${this.config.coreUrl}/api/extensions/me`, {
      headers: { 'x-extension-key': this.config.extensionKey },
    });
    if (!res.ok) {
      throw new Error(`GET /api/extensions/me failed: ${res.status} ${await res.text()}`);
    }
    const body = await res.json() as { extension: ExtensionInfo };
    return body.extension;
  }

  // ---------------------------------------------------------------------------
  // Push sense events (extension key)
  // ---------------------------------------------------------------------------

  async pushSenseEvent(haseefId: string, event: SenseEvent): Promise<void> {
    const res = await fetch(`${this.config.coreUrl}/api/haseefs/${haseefId}/senses`, {
      method: 'POST',
      headers: {
        'x-extension-key': this.config.extensionKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ event }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`[core-client] pushSenseEvent failed for haseef=${haseefId}: ${res.status} ${text}`);
    }
  }
}
