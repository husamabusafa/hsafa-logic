// =============================================================================
// @hsafa/sdk — HsafaSDK class
// =============================================================================

import type {
  SdkOptions,
  ToolDefinition,
  ToolHandler,
  PushEventPayload,
  SdkEventType,
  SdkEventMap,
  ToolCallContext,
} from './types.js';
import { inputToJsonSchema, parsePartialJson } from './schema.js';

const DEFAULT_RECONNECT_DELAY = 2_000;
const MAX_RECONNECT_DELAY = 30_000;

export class HsafaSDK {
  private readonly coreUrl: string;
  private readonly apiKey: string;
  readonly scope: string;

  private toolHandlers = new Map<string, ToolHandler>();
  private eventListeners = new Map<string, Set<(data: unknown) => void>>();
  private isConnected = false;
  private abortController: AbortController | null = null;

  constructor(opts: SdkOptions) {
    this.coreUrl = opts.coreUrl.replace(/\/$/, '');
    this.apiKey = opts.apiKey;
    this.scope = opts.scope;
  }

  // ── 1. REGISTER ─────────────────────────────────────────────────────────────

  async registerTools(tools: ToolDefinition[]): Promise<void> {
    const body = tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema ?? inputToJsonSchema(t.input ?? {}),
    }));

    const res = await fetch(`${this.coreUrl}/api/scopes/${this.scope}/tools`, {
      method: 'PUT',
      headers: { 'x-api-key': this.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tools: body }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`registerTools failed (${res.status}): ${text}`);
    }
  }

  // ── 2. HANDLE ────────────────────────────────────────────────────────────────

  onToolCall(name: string, handler: ToolHandler): void {
    this.toolHandlers.set(name, handler);
  }

  // ── 3. PUSH ──────────────────────────────────────────────────────────────────

  async pushEvent(event: PushEventPayload): Promise<void> {
    const res = await fetch(`${this.coreUrl}/api/events`, {
      method: 'POST',
      headers: { 'x-api-key': this.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: this.scope, ...event }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`pushEvent failed (${res.status}): ${text}`);
    }
  }

  // ── 4. LISTEN ────────────────────────────────────────────────────────────────

  on<K extends SdkEventType>(event: K, listener: (data: SdkEventMap[K]) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener as (data: unknown) => void);
  }

  off<K extends SdkEventType>(event: K, listener: (data: SdkEventMap[K]) => void): void {
    this.eventListeners.get(event)?.delete(listener as (data: unknown) => void);
  }

  // ── CONNECT ──────────────────────────────────────────────────────────────────

  connect(): void {
    if (this.isConnected) return;
    this.isConnected = true;
    void this.sseLoop();
  }

  disconnect(): void {
    this.isConnected = false;
    this.abortController?.abort();
    this.abortController = null;
  }

  // ── Internals ────────────────────────────────────────────────────────────────

  private emit(event: string, data: unknown): void {
    const listeners = this.eventListeners.get(event);
    if (!listeners) return;
    for (const l of listeners) {
      try { l(data); } catch { /* swallow listener errors */ }
    }
  }

  private async sseLoop(): Promise<void> {
    let delay = DEFAULT_RECONNECT_DELAY;

    while (this.isConnected) {
      try {
        this.abortController = new AbortController();
        await this.openSSE(this.abortController.signal);
        delay = DEFAULT_RECONNECT_DELAY;
      } catch {
        if (!this.isConnected) break;
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(delay * 2, MAX_RECONNECT_DELAY);
      }
    }
  }

  private async openSSE(signal: AbortSignal): Promise<void> {
    const url = `${this.coreUrl}/api/scopes/${this.scope}/actions/stream`;
    const res = await fetch(url, {
      headers: { 'x-api-key': this.apiKey, Accept: 'text/event-stream' },
      signal,
    });

    if (!res.ok || !res.body) {
      throw new Error(`SSE connection failed: ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      let dataLine = '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          dataLine = line.slice(6).trim();
        } else if (line === '' && dataLine) {
          try {
            await this.handleMessage(JSON.parse(dataLine));
          } catch { /* ignore parse errors */ }
          dataLine = '';
        }
      }
    }
  }

  private async handleMessage(msg: Record<string, unknown>): Promise<void> {
    const type = msg.type as string;

    // Lifecycle events → forward to on() listeners
    const lifecycleEvents: SdkEventType[] = [
      'tool.input.start', 'tool.input.delta', 'tool.call',
      'tool.result', 'tool.error', 'run.started', 'run.completed',
    ];
    if (lifecycleEvents.includes(type as SdkEventType)) {
      this.emit(type, msg.data);
      return;
    }

    // Action request → route to onToolCall handler
    if (type === 'action') {
      const { actionId, toolName, args, haseef } = msg as {
        actionId: string;
        toolName: string;
        args: Record<string, unknown>;
        haseef: ToolCallContext['haseef'];
      };

      const handler = this.toolHandlers.get(toolName);
      if (!handler) {
        await this.postResult(actionId, { error: `No handler registered for tool "${toolName}"` });
        return;
      }

      try {
        const result = await handler(args ?? {}, { actionId, haseef });
        await this.postResult(actionId, result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await this.postResult(actionId, { error: message });
      }
    }

    // tool.input.delta with accumulated args for partial parsing
    if (type === 'tool.input.delta.raw') {
      const data = msg.data as { actionId: string; toolName: string; accumulatedText: string; haseef: unknown };
      const partialArgs = parsePartialJson(data.accumulatedText);
      this.emit('tool.input.delta', {
        actionId: data.actionId,
        toolName: data.toolName,
        delta: data.accumulatedText,
        partialArgs,
        haseef: data.haseef,
      });
    }
  }

  private async postResult(actionId: string, result: unknown): Promise<void> {
    try {
      await fetch(`${this.coreUrl}/api/actions/${actionId}/result`, {
        method: 'POST',
        headers: { 'x-api-key': this.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ result }),
      });
    } catch (err) {
      console.error(`[HsafaSDK:${this.scope}] Failed to submit result for action ${actionId}:`, err);
    }
  }
}
