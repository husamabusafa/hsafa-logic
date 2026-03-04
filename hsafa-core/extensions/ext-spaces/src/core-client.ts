import type { Config, HaseefConnection } from './config.js';

// =============================================================================
// Core API Client
//
// HTTP client for interacting with hsafa-core's extension API.
// Uses extension key for runtime ops, secret key for bootstrap ops.
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

  async pushSenseEvent(agentId: string, event: SenseEvent): Promise<void> {
    const res = await fetch(`${this.config.coreUrl}/api/haseefs/${agentId}/senses`, {
      method: 'POST',
      headers: {
        'x-extension-key': this.config.extensionKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ event }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`[core-client] pushSenseEvent failed for agent=${agentId}: ${res.status} ${text}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Return tool results (extension key)
  // ---------------------------------------------------------------------------

  async returnToolResult(agentId: string, callId: string, result: unknown): Promise<void> {
    const res = await fetch(
      `${this.config.coreUrl}/api/haseefs/${agentId}/tools/${callId}/result`,
      {
        method: 'POST',
        headers: {
          'x-extension-key': this.config.extensionKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ result }),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      console.error(`[core-client] returnToolResult failed callId=${callId}: ${res.status} ${text}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Bootstrap: sync tools + instructions (secret key)
  // ---------------------------------------------------------------------------

  async syncTools(extensionId: string, tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>): Promise<void> {
    const res = await fetch(`${this.config.coreUrl}/api/extensions/${extensionId}/tools`, {
      method: 'PUT',
      headers: {
        'x-secret-key': this.config.secretKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tools }),
    });
    if (!res.ok) {
      throw new Error(`PUT /api/extensions/${extensionId}/tools failed: ${res.status} ${await res.text()}`);
    }
  }

  async updateInstructions(extensionId: string, instructions: string): Promise<void> {
    const res = await fetch(`${this.config.coreUrl}/api/extensions/${extensionId}`, {
      method: 'PATCH',
      headers: {
        'x-secret-key': this.config.secretKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ instructions }),
    });
    if (!res.ok) {
      throw new Error(`PATCH /api/extensions/${extensionId} failed: ${res.status} ${await res.text()}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Parse connection config into HaseefConnection
  // ---------------------------------------------------------------------------

  parseConnection(conn: ExtensionInfo['connections'][number]): Omit<HaseefConnection, 'agentEntityId' | 'connectedSpaceIds'> & { agentEntityId?: string; connectedSpaceIds: string[] } {
    const cfg = (conn.config ?? {}) as Record<string, unknown>;
    return {
      agentId: conn.haseefId,
      agentName: conn.haseefName,
      agentEntityId: (cfg.agentEntityId as string) ?? undefined,
      connectedSpaceIds: (cfg.connectedSpaceIds as string[]) ?? [],
    };
  }
}
