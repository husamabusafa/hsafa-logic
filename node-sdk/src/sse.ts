import type { StreamEvent, StreamEventHandler, HsafaStream } from './types.js';

export interface SSEStreamOptions {
  url: string;
  headers: Record<string, string>;
  onEvent?: (event: StreamEvent) => void;
  onError?: (error: Error) => void;
  onOpen?: () => void;
  onClose?: () => void;
  reconnect?: boolean;
  reconnectDelay?: number;
  maxReconnectDelay?: number;
}

export class SSEStream implements HsafaStream {
  private abortController: AbortController | null = null;
  private handlers: Map<string, Set<StreamEventHandler>> = new Map();
  private closed = false;
  private reconnectAttempts = 0;
  private options: SSEStreamOptions;

  constructor(options: SSEStreamOptions) {
    this.options = options;
    this.connect();
  }

  on(event: string, handler: StreamEventHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
  }

  off(event: string, handler: StreamEventHandler): void {
    this.handlers.get(event)?.delete(handler);
  }

  close(): void {
    this.closed = true;
    this.abortController?.abort();
    this.abortController = null;
    this.options.onClose?.();
  }

  private emit(eventType: string, event: StreamEvent): void {
    // Emit to specific type handlers
    this.handlers.get(eventType)?.forEach((handler) => handler(event));
    // Emit to wildcard handlers
    this.handlers.get('*')?.forEach((handler) => handler(event));
    // Emit to the generic 'hsafa' handler
    this.handlers.get('hsafa')?.forEach((handler) => handler(event));
  }

  private async connect(): Promise<void> {
    if (this.closed) return;

    this.abortController = new AbortController();

    try {
      const response = await fetch(this.options.url, {
        method: 'GET',
        headers: {
          ...this.options.headers,
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`SSE connection failed: ${response.status} ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('SSE response has no body');
      }

      this.reconnectAttempts = 0;
      this.options.onOpen?.();

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!this.closed) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent: { id?: string; type?: string; data: string[] } = { data: [] };

        for (const line of lines) {
          if (line.startsWith(':')) {
            // Comment line (keepalive), ignore
            continue;
          }

          if (line === '') {
            // Empty line = end of event
            if (currentEvent.data.length > 0) {
              this.processEvent(currentEvent);
            }
            currentEvent = { data: [] };
            continue;
          }

          const colonIdx = line.indexOf(':');
          if (colonIdx === -1) continue;

          const field = line.slice(0, colonIdx);
          const fieldValue = line.slice(colonIdx + 1).trimStart();

          switch (field) {
            case 'id':
              currentEvent.id = fieldValue;
              break;
            case 'event':
              currentEvent.type = fieldValue;
              break;
            case 'data':
              currentEvent.data.push(fieldValue);
              break;
          }
        }
      }
    } catch (error) {
      if (this.closed) return;

      const err = error instanceof Error ? error : new Error(String(error));
      this.options.onError?.(err);
      this.handlers.get('error')?.forEach((handler) =>
        handler({ id: '', type: 'error', ts: new Date().toISOString(), data: { error: err.message } } as StreamEvent)
      );

      if (this.options.reconnect !== false) {
        this.scheduleReconnect();
      }
    }
  }

  private processEvent(raw: { id?: string; type?: string; data: string[] }): void {
    const dataStr = raw.data.join('\n');
    if (!dataStr) return;

    try {
      const parsed = JSON.parse(dataStr);

      const event: StreamEvent = {
        id: raw.id || parsed.id || '',
        type: parsed.type || raw.type || 'unknown',
        ts: parsed.ts || new Date().toISOString(),
        data: parsed.data || parsed,
        smartSpaceId: parsed.smartSpaceId,
        runId: parsed.runId || parsed.data?.runId,
        entityId: parsed.entityId || parsed.data?.entityId,
        entityType: parsed.entityType,
        agentEntityId: parsed.agentEntityId,
        seq: parsed.seq,
      };

      this.options.onEvent?.(event);
      this.emit(event.type, event);
    } catch {
      // Ignore malformed events
    }
  }

  private scheduleReconnect(): void {
    if (this.closed) return;

    this.reconnectAttempts++;
    const baseDelay = this.options.reconnectDelay || 1000;
    const maxDelay = this.options.maxReconnectDelay || 30000;
    const delay = Math.min(baseDelay * Math.pow(2, this.reconnectAttempts - 1), maxDelay);

    setTimeout(() => {
      if (!this.closed) {
        this.connect();
      }
    }, delay);
  }
}
