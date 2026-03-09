import type {
  HsafaServiceConfig,
  SenseEventInput,
} from './types.js';

// =============================================================================
// Core API Client
//
// HTTP client for interacting with hsafa-core's API.
// =============================================================================

export class CoreClient {
  private coreUrl: string;
  private apiKey: string;

  constructor(config: HsafaServiceConfig) {
    this.coreUrl = config.coreUrl.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
  }

  // ---------------------------------------------------------------------------
  // Push sense events
  // ---------------------------------------------------------------------------

  async pushSenseEvent(haseefId: string, event: SenseEventInput): Promise<void> {
    const res = await fetch(`${this.coreUrl}/api/haseefs/${haseefId}/events`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        events: [{
          eventId: event.eventId,
          scope: event.scope,
          type: event.type,
          data: event.data ?? {},
          timestamp: event.timestamp ?? new Date().toISOString(),
        }],
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`pushSenseEvent failed for haseef=${haseefId}: ${res.status} ${text}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Sync tools for a scope
  // ---------------------------------------------------------------------------

  async syncTools(
    haseefId: string,
    scope: string,
    tools: Array<{ 
      name: string; 
      description: string; 
      inputSchema: Record<string, unknown>; 
      mode?: 'sync' | 'fire_and_forget' | 'async'; 
      timeout?: number 
    }>,
  ): Promise<void> {
    const res = await fetch(`${this.coreUrl}/api/haseefs/${haseefId}/scopes/${scope}/tools`, {
      method: 'PUT',
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tools }),
    });
    if (!res.ok) {
      throw new Error(
        `PUT scopes/${scope}/tools failed: ${res.status} ${await res.text()}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Submit action result
  // ---------------------------------------------------------------------------

  async submitActionResult(haseefId: string, actionId: string, result: unknown): Promise<void> {
    const res = await fetch(
      `${this.coreUrl}/api/haseefs/${haseefId}/actions/${actionId}/result`,
      {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ result }),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`submitActionResult failed actionId=${actionId}: ${res.status} ${text}`);
    }
  }

  // ---------------------------------------------------------------------------
  // SSE stream for actions
  // ---------------------------------------------------------------------------

  async *streamActions(
    haseefId: string,
    scope: string,
    signal?: AbortSignal,
  ): AsyncGenerator<{ actionId: string; toolName: string; args: Record<string, unknown> }> {
    const res = await fetch(
      `${this.coreUrl}/api/haseefs/${haseefId}/scopes/${scope}/actions/stream`,
      {
        headers: { 'x-api-key': this.apiKey },
        signal,
      },
    );
    if (!res.ok) {
      throw new Error(`SSE stream failed: ${res.status} ${await res.text()}`);
    }
    if (!res.body) {
      throw new Error('No response body');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'action') {
                yield {
                  actionId: data.actionId,
                  toolName: data.toolName,
                  args: data.args,
                };
              }
            } catch {
              // ignore malformed JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
