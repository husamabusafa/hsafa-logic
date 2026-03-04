import type { HttpClient } from '../http.js';
import type {
  SubmitRunToolResultParams,
  ToolCallEvent,
  ToolWorkerHandlers,
  ToolWorkerInstance,
} from '../types.js';
import { SSEStream } from '../sse.js';

export class ToolsResource {
  constructor(private http: HttpClient) {}

  /**
   * Submit an async tool result for a pending tool call.
   *
   * v3: Resolves the PendingToolCall record and pushes a `tool_result`
   * inbox event so the agent processes the result in its next cycle.
   * The agent never blocks — async tools return `{ status: 'pending' }`
   * immediately and the real result arrives here.
   */
  async submitResult(runId: string, params: SubmitRunToolResultParams): Promise<{ success: boolean; agentEntityId?: string }> {
    return this.http.post(`/api/runs/${runId}/tool-results`, params);
  }

  /**
   * Connect to the gateway SSE tool-worker stream and listen for external
   * tool calls. When an agent uses a tool with `executionType: 'external'`,
   * the gateway emits it here. The matching handler runs and its return
   * value is submitted back automatically.
   *
   * Authentication uses the `secretKey` from the client options.
   *
   * @example
   * const worker = client.tools.listen({
   *   async fetchExternalData({ query }) {
   *     const data = await myDatabase.search(query);
   *     return { results: data };
   *   },
   *   async sendEmail({ to, subject, body }) {
   *     await mailer.send({ to, subject, body });
   *     return { sent: true };
   *   },
   * });
   *
   * // Graceful shutdown:
   * process.on('SIGINT', () => { worker.close(); process.exit(0); });
   */
  listen(handlers: ToolWorkerHandlers): ToolWorkerInstance {
    const options = this.http.getOptions();
    const secret = options.secretKey;

    if (!secret) {
      throw new Error(
        '[HsafaToolWorker] secretKey is required in HsafaClient options to use tools.listen()',
      );
    }

    const baseUrl = this.http.getBaseUrl();
    const url = `${baseUrl}/api/tools/stream`;

    const stream = new SSEStream({
      url,
      headers: this.http.getAuthHeaders(),
      reconnect: true,
      reconnectDelay: 2000,
      onOpen: () => {
        console.log('[HsafaToolWorker] Connected — listening for tool calls');
      },
      onError: (err) => {
        console.error('[HsafaToolWorker] Stream error:', err.message);
      },
    });

    stream.on('tool.call', async (event) => {
      const data = event.data as unknown as ToolCallEvent;
      const { toolCallId, toolName, args, runId } = data;

      const handler = handlers[toolName];
      if (!handler) {
        return;
      }

      console.log(`[HsafaToolWorker] → ${toolName}(${JSON.stringify(args)})`);

      try {
        const result = await handler(args);
        await this.submitResult(runId, { callId: toolCallId, result });
        console.log(`[HsafaToolWorker] ✓ ${toolName} result submitted`);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error(`[HsafaToolWorker] ✗ ${toolName} handler error:`, errorMessage);
        await this.submitResult(runId, {
          callId: toolCallId,
          result: { error: errorMessage },
        }).catch(() => {});
      }
    });

    return { close: () => stream.close() };
  }
}
