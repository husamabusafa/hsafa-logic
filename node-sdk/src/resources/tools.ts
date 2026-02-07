import type { HttpClient } from '../http.js';
import type { SubmitToolResultParams, SubmitRunToolResultParams } from '../types.js';

export class ToolsResource {
  constructor(private http: HttpClient) {}

  async submitResult(smartSpaceId: string, params: SubmitToolResultParams): Promise<{ success: boolean }> {
    return this.http.post(`/api/smart-spaces/${smartSpaceId}/tool-results`, params);
  }

  async submitRunResult(runId: string, params: SubmitRunToolResultParams): Promise<{ success: boolean }> {
    return this.http.post(`/api/runs/${runId}/tool-results`, params);
  }
}
