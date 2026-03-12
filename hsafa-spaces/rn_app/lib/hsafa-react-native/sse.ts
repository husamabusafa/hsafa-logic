import type { StreamEvent, StreamEventHandler, HsafaStream } from './types';

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

/**
 * SSE client for React Native using XMLHttpRequest.
 *
 * React Native does not support fetch streaming (getReader/ReadableStream),
 * so we use XHR with onprogress to process incoming chunks incrementally.
 * XMLHttpRequest is a React Native built-in — no extra dependencies needed.
 */
export class SSEStream implements HsafaStream {
  private xhr: XMLHttpRequest | null = null;
  private handlers: Map<string, Set<StreamEventHandler>> = new Map();
  private closed = false;
  private reconnectAttempts = 0;
  private lastIndex = 0;
  private buffer = '';
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
    if (this.xhr) {
      this.xhr.abort();
      this.xhr = null;
    }
    this.options.onClose?.();
  }

  private emit(eventType: string, event: StreamEvent): void {
    this.handlers.get(eventType)?.forEach((handler) => handler(event));
    this.handlers.get('*')?.forEach((handler) => handler(event));
    this.handlers.get('hsafa')?.forEach((handler) => handler(event));
  }

  private connect(): void {
    if (this.closed) return;

    const xhr = new XMLHttpRequest();
    this.xhr = xhr;
    this.lastIndex = 0;
    this.buffer = '';

    xhr.open('GET', this.options.url, true);

    const allHeaders: Record<string, string> = {
      ...this.options.headers,
      'Accept': 'text/event-stream',
      'Cache-Control': 'no-cache',
    };
    for (const [key, value] of Object.entries(allHeaders)) {
      xhr.setRequestHeader(key, value);
    }

    xhr.onprogress = () => {
      if (this.closed) return;
      const newText = xhr.responseText.slice(this.lastIndex);
      this.lastIndex = xhr.responseText.length;
      this.processChunk(newText);
    };

    xhr.onload = () => {
      if (this.closed) return;
      // Process any remaining buffered data
      if (this.buffer.trim()) {
        this.processChunk('\n');
      }
      // Stream ended cleanly — reconnect
      if (this.options.reconnect !== false) {
        this.scheduleReconnect();
      }
    };

    xhr.onerror = () => {
      if (this.closed) return;
      const err = new Error('SSE connection failed');
      this.options.onError?.(err);
      this.handlers.get('error')?.forEach((handler) =>
        handler({ id: '', type: 'error', ts: new Date().toISOString(), data: { error: err.message } } as StreamEvent)
      );
      if (this.options.reconnect !== false) {
        this.scheduleReconnect();
      }
    };

    xhr.onreadystatechange = () => {
      if (xhr.readyState === XMLHttpRequest.OPENED) {
        this.reconnectAttempts = 0;
        this.options.onOpen?.();
      }
    };

    xhr.send();
  }

  private processChunk(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

    let currentEvent: { id?: string; type?: string; data: string[] } = { data: [] };

    for (const line of lines) {
      if (line.startsWith(':')) {
        // Comment line (keepalive), ignore
        continue;
      }

      if (line === '') {
        // Empty line = end of SSE event block
        if (currentEvent.data.length > 0) {
          this.processEvent(currentEvent);
        }
        currentEvent = { data: [] };
        continue;
      }

      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;

      const field = line.slice(0, colonIdx);
      const value = line.slice(colonIdx + 1).trimStart();

      switch (field) {
        case 'id':
          currentEvent.id = value;
          break;
        case 'event':
          currentEvent.type = value;
          break;
        case 'data':
          currentEvent.data.push(value);
          break;
      }
    }
  }

  private processEvent(raw: { id?: string; type?: string; data: string[] }): void {
    const dataStr = raw.data.join('\n');
    if (!dataStr) return;

    try {
      const parsed = JSON.parse(dataStr);

      // Unwrap gateway envelope: { seq, smartSpaceId, entityId, ..., data: <actual event data> }
      const outer = parsed.data != null && typeof parsed.data === 'object' && !Array.isArray(parsed.data)
        ? parsed.data
        : {};
      const hasEnvelope = 'data' in outer && typeof outer.data === 'object' && outer.data !== null;
      const eventData = hasEnvelope ? outer.data : (parsed.data ?? parsed);

      const event: StreamEvent = {
        id: raw.id || parsed.id || '',
        type: parsed.type || raw.type || 'unknown',
        ts: parsed.ts || new Date().toISOString(),
        data: eventData,
        smartSpaceId: parsed.smartSpaceId || outer.smartSpaceId,
        runId: parsed.runId || outer.runId || eventData?.runId,
        entityId: parsed.entityId || outer.entityId || eventData?.entityId,
        entityType: parsed.entityType || outer.entityType,
        agentEntityId: parsed.agentEntityId || outer.agentEntityId || eventData?.agentEntityId,
        seq: parsed.seq || outer.seq,
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
    const baseDelay = this.options.reconnectDelay ?? 1000;
    const maxDelay = this.options.maxReconnectDelay ?? 30000;
    const delay = Math.min(baseDelay * Math.pow(2, this.reconnectAttempts - 1), maxDelay);

    setTimeout(() => {
      if (!this.closed) {
        this.connect();
      }
    }, delay);
  }
}

export function createSSEStream(options: SSEStreamOptions): SSEStream {
  return new SSEStream(options);
}
