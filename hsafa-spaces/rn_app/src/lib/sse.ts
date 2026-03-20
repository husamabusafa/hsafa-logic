import { getToken } from './api';
import { SERVER_URL } from '../../config';

// =============================================================================
// SSE Client for React Native
//
// Uses XMLHttpRequest with onprogress + periodic responseText polling.
// NOTE: fetch() in React Native buffers the entire response body before
// resolving, making it unusable for SSE (infinite streams). XHR is the
// only viable approach.
// =============================================================================

export interface SSEEvent {
  event: string;
  data: string;
}

export type SSEHandler = (event: SSEEvent) => void;

export interface SSEConnection {
  close: () => void;
}

/**
 * Parse complete SSE messages from a buffer.
 * Returns the remaining (incomplete) buffer.
 */
function drainSSEBuffer(buffer: string, onEvent: SSEHandler): string {
  const chunks = buffer.split('\n\n');
  const remainder = chunks.pop() || '';

  for (const chunk of chunks) {
    if (!chunk.trim()) continue;

    let eventName = 'message';
    let eventData = '';

    for (const line of chunk.split('\n')) {
      if (line.startsWith('event:')) {
        eventName = line.substring(6).trim();
      } else if (line.startsWith('data:')) {
        // Support multi-line data fields (SSE spec concatenates with \n)
        eventData += (eventData ? '\n' : '') + line.substring(5).trim();
      }
      // Lines starting with ':' are comments (keepalive) — ignored
    }

    if (eventData || eventName !== 'message') {
      onEvent({ event: eventName, data: eventData });
    }
  }

  return remainder;
}

/**
 * Connect to an SSE endpoint using XHR with responseText polling.
 */
export async function connectSSE(
  path: string,
  onEvent: SSEHandler,
  onError?: (error: Error) => void,
  onOpen?: () => void,
): Promise<SSEConnection> {
  const token = await getToken();
  const sep = path.includes('?') ? '&' : '?';
  const url = `${SERVER_URL}${path}${token ? `${sep}token=${token}` : ''}`;

  console.log(`[SSE] Connecting to: ${url.substring(0, url.indexOf('?') + 1)}...`);

  let closed = false;
  let processedLen = 0;
  let buffer = '';
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let opened = false;

  const xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.setRequestHeader('Accept', 'text/event-stream');
  xhr.setRequestHeader('Cache-Control', 'no-cache');

  const drain = () => {
    if (closed) return;
    let text: string;
    try {
      text = xhr.responseText;
    } catch {
      return; // responseText not available yet
    }
    if (!text || text.length <= processedLen) return;
    const newData = text.substring(processedLen);
    console.log(`[SSE] Received ${newData.length} new bytes`);
    buffer += newData;
    processedLen = text.length;
    buffer = drainSSEBuffer(buffer, onEvent);
  };

  xhr.onreadystatechange = () => {
    if (closed) return;
    console.log(`[SSE] readyState=${xhr.readyState}, status=${xhr.status}`);

    if (xhr.readyState >= XMLHttpRequest.HEADERS_RECEIVED && !opened) {
      opened = true;
      console.log('[SSE] Connection opened');
      onOpen?.();
      // Poll responseText every 200ms — safety net for platforms where
      // onprogress doesn't fire per-chunk
      pollTimer = setInterval(drain, 200);
    }

    if (xhr.readyState >= XMLHttpRequest.LOADING) drain();

    // Handle connection close — trigger reconnection via onError
    if (xhr.readyState === XMLHttpRequest.DONE) {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      drain();
      console.log(`[SSE] Connection closed, status=${xhr.status}`);
      if (!closed) onError?.(new Error('SSE connection closed'));
    }
  };

  // onprogress fires for each data chunk (when supported by the platform)
  xhr.onprogress = () => {
    drain();
  };

  xhr.onerror = () => {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    console.log('[SSE] Connection error');
    if (!closed) onError?.(new Error('SSE connection error'));
  };

  xhr.ontimeout = () => {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    console.log('[SSE] Connection timeout');
    if (!closed) onError?.(new Error('SSE connection timeout'));
  };

  xhr.send();
  console.log('[SSE] XHR request sent');

  return {
    close: () => {
      closed = true;
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      xhr.abort();
    },
  };
}
