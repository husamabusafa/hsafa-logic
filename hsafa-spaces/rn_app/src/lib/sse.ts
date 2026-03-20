import { getToken } from './api';
import { SERVER_URL } from '../../config';

// =============================================================================
// SSE Client for React Native
// Uses XMLHttpRequest (built into RN, zero extra deps) since fetch-based
// ReadableStream is not reliably supported in React Native.
// =============================================================================

export interface SSEEvent {
  event: string;
  data: string;
}

export type SSEHandler = (event: SSEEvent) => void;

export interface SSEConnection {
  close: () => void;
}

export async function connectSSE(
  path: string,
  onEvent: SSEHandler,
  onError?: (error: Error) => void,
  onOpen?: () => void,
): Promise<SSEConnection> {
  const token = await getToken();
  const url = `${SERVER_URL}${path}${path.includes('?') ? '&' : '?'}token=${token}`;

  let closed = false;
  let processedLength = 0;
  let buffer = '';

  const xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.setRequestHeader('Accept', 'text/event-stream');
  xhr.setRequestHeader('Cache-Control', 'no-cache');

  xhr.onreadystatechange = () => {
    if (closed) return;

    if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED) {
      onOpen?.();
    }

    if (xhr.readyState >= XMLHttpRequest.LOADING && xhr.responseText) {
      const newData = xhr.responseText.substring(processedLength);
      processedLength = xhr.responseText.length;
      buffer += newData;

      // Parse SSE format: "event: name\ndata: payload\n\n"
      const messages = buffer.split('\n\n');
      // Keep the last incomplete chunk in the buffer
      buffer = messages.pop() || '';

      for (const message of messages) {
        if (!message.trim()) continue;

        let eventName = 'message';
        let eventData = '';

        const lines = message.split('\n');
        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventName = line.substring(6).trim();
          } else if (line.startsWith('data:')) {
            eventData = line.substring(5).trim();
          } else if (line.startsWith(':')) {
            // Comment / heartbeat — ignore
          }
        }

        if (eventData || eventName !== 'message') {
          onEvent({ event: eventName, data: eventData });
        }
      }
    }
  };

  xhr.onerror = () => {
    if (!closed) {
      onError?.(new Error('SSE connection error'));
    }
  };

  xhr.ontimeout = () => {
    if (!closed) {
      onError?.(new Error('SSE connection timeout'));
    }
  };

  xhr.send();

  return {
    close: () => {
      closed = true;
      xhr.abort();
    },
  };
}
