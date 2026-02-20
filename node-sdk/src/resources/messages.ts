import type { HttpClient } from '../http.js';
import type {
  SmartSpaceMessage,
  SendMessageParams,
  ListMessagesParams,
  SendAndWaitOptions,
  SendAndWaitResponse,
  StreamEvent,
} from '../types.js';
import { SSEStream } from '../sse.js';

export class MessagesResource {
  constructor(private http: HttpClient) {}

  async send(smartSpaceId: string, params: SendMessageParams): Promise<{
    message: SmartSpaceMessage;
    runs: Array<{ runId: string; agentEntityId: string }>;
  }> {
    return this.http.post(`/api/smart-spaces/${smartSpaceId}/messages`, params);
  }

  async list(smartSpaceId: string, params?: ListMessagesParams): Promise<{ messages: SmartSpaceMessage[] }> {
    return this.http.get(`/api/smart-spaces/${smartSpaceId}/messages`, {
      afterSeq: params?.afterSeq,
      beforeSeq: params?.beforeSeq,
      limit: params?.limit,
    });
  }

  /**
   * Send a message and wait for the agent to finish responding.
   *
   * Sends the message first (to get the runId), then subscribes to:
   * - The **run stream** for completion/failure signals
   * - The **space stream** for text deltas (from sendSpaceMessage interception)
   */
  async sendAndWait(smartSpaceId: string, params: SendAndWaitOptions): Promise<SendAndWaitResponse> {
    const timeout = params.timeout ?? 30000;
    const { timeout: _, ...sendParams } = params;

    // 1. Send the message and get the triggered runId
    const { runs } = await this.send(smartSpaceId, sendParams);

    if (!runs || runs.length === 0) {
      return { text: '', toolCalls: [] };
    }

    const runId = runs[0].runId;

    return new Promise<SendAndWaitResponse>((resolve, reject) => {
      let text = '';
      const toolCalls: SendAndWaitResponse['toolCalls'] = [];
      const activeToolCalls = new Map<string, { id: string; name: string; input: unknown; output?: unknown }>();
      let settled = false;

      // Subscribe to space stream for persisted messages (v2: no text streaming, text arrives as smartSpace.message)
      const spaceStream = new SSEStream({
        url: this.http.buildUrl(`/api/smart-spaces/${smartSpaceId}/stream`),
        headers: this.http.getAuthHeaders(),
        reconnect: false,
      });

      // Subscribe to run stream for completion signals and tool events
      const runStream = new SSEStream({
        url: this.http.buildUrl(`/api/runs/${runId}/stream`),
        headers: this.http.getAuthHeaders(),
        reconnect: false,
      });

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          cleanup();
          reject(new Error(`sendAndWait timed out after ${timeout}ms`));
        }
      }, timeout);

      const cleanup = () => {
        clearTimeout(timer);
        spaceStream.close();
        runStream.close();
      };

      // Space stream: collect agent text from persisted messages (v2 — no text streaming)
      spaceStream.on('smartSpace.message', (event: StreamEvent) => {
        const msg = (event.data as Record<string, unknown>)?.message as Record<string, unknown> | undefined;
        if (!msg) return;
        const role = msg.role as string;
        const agentEntityId = event.agentEntityId || (msg.entityId as string);
        // Only collect agent (assistant) messages, not the human message we just sent
        if (role !== 'assistant' && role !== 'agent') return;
        const content = msg.content as string | undefined;
        if (content) text += (text ? '\n' : '') + content;
      });

      // Run stream: tool events (v2 names)
      runStream.on('tool-call.start', (event: StreamEvent) => {
        const data = event.data as Record<string, unknown>;
        const callId = String(data.toolCallId || '');
        if (!callId) return;
        activeToolCalls.set(callId, {
          id: callId,
          name: String(data.toolName || ''),
          input: undefined,
        });
      });

      runStream.on('tool-call.complete', (event: StreamEvent) => {
        const data = event.data as Record<string, unknown>;
        const callId = String(data.toolCallId || '');
        const existing = activeToolCalls.get(callId);
        if (existing) {
          existing.input = data.input ?? existing.input;
          existing.output = data.output;
        }
      });

      // Run stream: completion signals
      runStream.on('run.completed', () => {
        if (!settled) {
          settled = true;
          cleanup();
          toolCalls.push(...activeToolCalls.values());
          resolve({ text, toolCalls, run: { id: runId } as any });
        }
      });

      runStream.on('run.failed', (event: StreamEvent) => {
        if (!settled) {
          settled = true;
          cleanup();
          const data = event.data as Record<string, unknown>;
          reject(new Error(String(data.errorMessage || 'Run failed')));
        }
      });

      // Error on either stream
      const onError = (event: StreamEvent) => {
        if (!settled) {
          settled = true;
          cleanup();
          reject(new Error(String((event.data as Record<string, unknown>).error || 'Stream error')));
        }
      };

      spaceStream.on('error', onError);
      runStream.on('error', onError);
    });
  }
}
