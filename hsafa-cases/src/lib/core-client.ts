/**
 * Browser HTTP client for Hsafa Core v5 API.
 */

export interface HaseefInfo {
  id: string;
  name: string;
  description?: string;
  profileJson?: Record<string, unknown>;
  configJson: Record<string, unknown>;
  configHash?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SenseEvent {
  eventId: string;
  scope: string;
  type: string;
  data: Record<string, unknown>;
  attachments?: Array<{
    type: 'image' | 'audio' | 'file';
    mimeType: string;
    url?: string;
    base64?: string;
    name?: string;
  }>;
  timestamp?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  mode?: 'sync' | 'fire_and_forget' | 'async';
  timeout?: number;
}

export interface ActionEvent {
  messageId: string;
  actionId: string;
  name: string;
  args: Record<string, unknown>;
  mode: string;
}

export interface StreamEvent {
  type: string;
  runId?: string;
  haseefId?: string;
  streamId?: string;
  toolName?: string;
  text?: string;
  delta?: string;
  args?: unknown;
  result?: unknown;
  error?: string;
  finishReason?: string;
  [key: string]: unknown;
}

export class CoreClient {
  constructor(
    private baseUrl: string,
    private apiKey: string,
  ) {}

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status}: ${text}`);
    }

    return res.json();
  }

  // ── Haseef CRUD ──

  async listHaseefs(): Promise<{ haseefs: HaseefInfo[] }> {
    return this.request('GET', '/api/haseefs');
  }

  async getHaseef(id: string): Promise<{ haseef: HaseefInfo }> {
    return this.request('GET', `/api/haseefs/${id}`);
  }

  // ── Status & Process ──

  async getStatus(id: string): Promise<{ running: boolean }> {
    return this.request('GET', `/api/haseefs/${id}/status`);
  }

  async start(id: string): Promise<{ status: string }> {
    return this.request('POST', `/api/haseefs/${id}/start`);
  }

  async stop(id: string): Promise<{ status: string }> {
    return this.request('POST', `/api/haseefs/${id}/stop`);
  }

  // ── Events ──

  async pushEvents(
    id: string,
    events: SenseEvent[],
  ): Promise<{ pushed: number }> {
    return this.request('POST', `/api/haseefs/${id}/events`, events);
  }

  // ── Tools ──

  async syncTools(
    id: string,
    scope: string,
    tools: ToolDefinition[],
  ): Promise<unknown> {
    return this.request(
      'PUT',
      `/api/haseefs/${id}/scopes/${scope}/tools`,
      { tools },
    );
  }

  async listTools(id: string): Promise<{ tools: unknown[] }> {
    return this.request('GET', `/api/haseefs/${id}/tools`);
  }

  async deleteScope(id: string, scope: string): Promise<unknown> {
    return this.request('DELETE', `/api/haseefs/${id}/scopes/${scope}`);
  }

  // ── Actions ──

  async submitActionResult(
    haseefId: string,
    actionId: string,
    result: unknown,
  ): Promise<{ success: boolean }> {
    return this.request(
      'POST',
      `/api/haseefs/${haseefId}/actions/${actionId}/result`,
      result,
    );
  }

  // ── SSE Streams (fetch-based — supports x-api-key header) ──

  connectStream(
    path: string,
    onData: (data: unknown) => void,
    onError?: (err: unknown) => void,
  ): AbortController {
    const controller = new AbortController()

    const run = async () => {
      try {
        const res = await fetch(`${this.baseUrl}${path}`, {
          headers: { 'x-api-key': this.apiKey },
          signal: controller.signal,
        })

        if (!res.ok || !res.body) {
          onError?.(new Error(`SSE connect failed: ${res.status}`))
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const parsed = JSON.parse(line.slice(6))
                onData(parsed)
              } catch {}
            }
          }
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          onError?.(err)
        }
      }
    }

    run()
    return controller
  }

  connectActionStream(
    haseefId: string,
    scope: string,
    onAction: (action: ActionEvent) => void,
    onError?: (err: unknown) => void,
  ): AbortController {
    return this.connectStream(
      `/api/haseefs/${haseefId}/scopes/${scope}/actions/stream`,
      (data) => onAction(data as ActionEvent),
      onError,
    )
  }

  connectThinkingStream(
    haseefId: string,
    onEvent: (event: StreamEvent) => void,
    onError?: (err: unknown) => void,
  ): AbortController {
    return this.connectStream(
      `/api/haseefs/${haseefId}/stream`,
      (data) => onEvent(data as StreamEvent),
      onError,
    )
  }

  // ── Snapshots ──

  async createSnapshot(id: string): Promise<unknown> {
    return this.request('POST', `/api/haseefs/${id}/snapshot`);
  }

  async listSnapshots(id: string): Promise<{ snapshots: unknown[] }> {
    return this.request('GET', `/api/haseefs/${id}/snapshots`);
  }

  // ── Health ──

  async health(): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}/health`);
    return res.json();
  }
}
