import type { HttpClient } from '../http.js';
import type { Agent, CreateAgentParams, ListParams } from '../types.js';

export class AgentsResource {
  constructor(private http: HttpClient) {}

  async create(params: CreateAgentParams): Promise<{ agentId: string; configHash: string; created: boolean }> {
    return this.http.post('/api/agents', params);
  }

  async list(params?: ListParams): Promise<{ agents: Agent[] }> {
    return this.http.get('/api/agents', {
      limit: params?.limit,
      offset: params?.offset,
    });
  }

  async get(agentId: string): Promise<{ agent: Agent }> {
    return this.http.get(`/api/agents/${agentId}`);
  }

  async delete(agentId: string): Promise<{ success: boolean }> {
    return this.http.delete(`/api/agents/${agentId}`);
  }
}
