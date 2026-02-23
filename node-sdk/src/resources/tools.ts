import type { HttpClient } from '../http.js';
import type { SubmitRunToolResultParams } from '../types.js';

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
}
