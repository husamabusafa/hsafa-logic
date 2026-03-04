import type { HttpClient } from '../http.js';
import type {
  Run,
  RunEvent,
  HsafaStream,
  CreateRunParams,
  ListRunsParams,
} from '../types.js';
import { SSEStream } from '../sse.js';

export class RunsResource {
  constructor(private http: HttpClient) {}

  async list(params?: ListRunsParams): Promise<{ runs: Run[] }> {
    return this.http.get('/api/runs', {
      smartSpaceId: params?.smartSpaceId,
      agentEntityId: params?.agentEntityId,
      agentId: params?.agentId,
      status: params?.status,
      limit: params?.limit,
      offset: params?.offset,
    });
  }

  async get(runId: string): Promise<{ run: Run }> {
    return this.http.get(`/api/runs/${runId}`);
  }

  async create(params: CreateRunParams): Promise<{ run: Run }> {
    return this.http.post('/api/runs', params);
  }

  async cancel(runId: string): Promise<{ success: boolean; status: string }> {
    return this.http.post(`/api/runs/${runId}/cancel`);
  }

  async delete(runId: string): Promise<{ success: boolean }> {
    return this.http.delete(`/api/runs/${runId}`);
  }

  async getEvents(runId: string): Promise<{ events: RunEvent[] }> {
    return this.http.get(`/api/runs/${runId}/events`);
  }

  subscribe(runId: string, options?: { since?: string }): HsafaStream {
    const baseUrl = this.http.getBaseUrl();
    const headers = this.http.getAuthHeaders();
    const params = new URLSearchParams();

    if (options?.since) {
      params.set('since', options.since);
    }

    const queryStr = params.toString();
    const url = `${baseUrl}/api/runs/${runId}/stream${queryStr ? `?${queryStr}` : ''}`;

    return new SSEStream({
      url,
      headers,
      reconnect: true,
    });
  }
}
