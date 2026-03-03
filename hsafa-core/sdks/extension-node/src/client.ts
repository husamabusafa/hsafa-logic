import type {
  HsafaExtensionConfig,
  ExtensionSelfInfo,
  SenseEventInput,
} from './types.js';

// =============================================================================
// Core API Client
//
// HTTP client for interacting with hsafa-core's extension & admin APIs.
// =============================================================================

export class CoreClient {
  private coreUrl: string;
  private extensionKey: string;
  private secretKey: string;

  constructor(config: HsafaExtensionConfig) {
    this.coreUrl = config.coreUrl.replace(/\/+$/, '');
    this.extensionKey = config.extensionKey;
    this.secretKey = config.secretKey;
  }

  // ---------------------------------------------------------------------------
  // Self-discovery (extension key)
  // ---------------------------------------------------------------------------

  async getMe(): Promise<ExtensionSelfInfo> {
    const res = await fetch(`${this.coreUrl}/api/extensions/me`, {
      headers: { 'x-extension-key': this.extensionKey },
    });
    if (!res.ok) {
      throw new Error(`GET /api/extensions/me failed: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as { extension: ExtensionSelfInfo };
    return body.extension;
  }

  // ---------------------------------------------------------------------------
  // Push sense events (extension key)
  // ---------------------------------------------------------------------------

  async pushSenseEvent(haseefId: string, event: SenseEventInput): Promise<void> {
    const res = await fetch(`${this.coreUrl}/api/haseefs/${haseefId}/senses`, {
      method: 'POST',
      headers: {
        'x-extension-key': this.extensionKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event: {
          eventId: event.eventId,
          channel: event.channel,
          source: event.source ?? '',
          type: event.type,
          data: event.data ?? {},
          timestamp: event.timestamp ?? new Date().toISOString(),
        },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`pushSenseEvent failed for haseef=${haseefId}: ${res.status} ${text}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Return tool results (extension key)
  // ---------------------------------------------------------------------------

  async returnToolResult(haseefId: string, callId: string, result: unknown): Promise<void> {
    const res = await fetch(
      `${this.coreUrl}/api/haseefs/${haseefId}/tools/${callId}/result`,
      {
        method: 'POST',
        headers: {
          'x-extension-key': this.extensionKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ result }),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`returnToolResult failed callId=${callId}: ${res.status} ${text}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Poll pending tool calls (extension key)
  // ---------------------------------------------------------------------------

  async pollToolCalls(haseefId: string): Promise<
    Array<{
      toolCallId: string;
      toolName: string;
      args: Record<string, unknown>;
      runId: string;
      status: string;
      createdAt: string;
    }>
  > {
    const res = await fetch(`${this.coreUrl}/api/haseefs/${haseefId}/tools/calls`, {
      headers: { 'x-extension-key': this.extensionKey },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`pollToolCalls failed for haseef=${haseefId}: ${res.status} ${text}`);
    }
    const body = (await res.json()) as { calls: Array<{
      toolCallId: string;
      toolName: string;
      args: Record<string, unknown>;
      runId: string;
      status: string;
      createdAt: string;
    }> };
    return body.calls;
  }

  // ---------------------------------------------------------------------------
  // Bootstrap: sync tools (secret key)
  // ---------------------------------------------------------------------------

  async syncTools(
    extensionId: string,
    tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>,
  ): Promise<void> {
    const res = await fetch(`${this.coreUrl}/api/extensions/${extensionId}/tools`, {
      method: 'PUT',
      headers: {
        'x-secret-key': this.secretKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tools }),
    });
    if (!res.ok) {
      throw new Error(
        `PUT /api/extensions/${extensionId}/tools failed: ${res.status} ${await res.text()}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Bootstrap: update instructions (secret key)
  // ---------------------------------------------------------------------------

  async updateInstructions(extensionId: string, instructions: string): Promise<void> {
    const res = await fetch(`${this.coreUrl}/api/extensions/${extensionId}`, {
      method: 'PATCH',
      headers: {
        'x-secret-key': this.secretKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ instructions }),
    });
    if (!res.ok) {
      throw new Error(
        `PATCH /api/extensions/${extensionId} failed: ${res.status} ${await res.text()}`,
      );
    }
  }
}
