import type { HttpClient } from '../http.js';
import type { SubmitRunToolResultParams } from '../types.js';

export class ToolsResource {
  constructor(private http: HttpClient) {}

  /**
   * Submit a client tool result for a run in `waiting_tool` status.
   * The gateway resumes the run once all pending tool calls have results.
   */
  async submitResult(runId: string, params: SubmitRunToolResultParams): Promise<{ success: boolean }> {
    return this.http.post(`/api/runs/${runId}/tool-results`, params);
  }
}
