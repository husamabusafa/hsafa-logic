import type { HttpClient } from '../http.js';
import type {
  Entity,
  HsafaStream,
  CreateEntityParams,
  CreateAgentEntityParams,
  UpdateEntityParams,
  ListEntitiesParams,
} from '../types.js';
import { SSEStream } from '../sse.js';

export class EntitiesResource {
  constructor(private http: HttpClient) {}

  async create(params: CreateEntityParams): Promise<{ entity: Entity }> {
    return this.http.post('/api/entities', params);
  }

  async createAgent(params: CreateAgentEntityParams): Promise<{ entity: Entity }> {
    return this.http.post('/api/entities/agent', params);
  }

  async list(params?: ListEntitiesParams): Promise<{ entities: Entity[] }> {
    return this.http.get('/api/entities', {
      type: params?.type,
      limit: params?.limit,
      offset: params?.offset,
    });
  }

  async get(entityId: string): Promise<{ entity: Entity }> {
    return this.http.get(`/api/entities/${entityId}`);
  }

  async update(entityId: string, params: UpdateEntityParams): Promise<{ entity: Entity }> {
    return this.http.patch(`/api/entities/${entityId}`, params);
  }

  async delete(entityId: string): Promise<{ success: boolean }> {
    return this.http.delete(`/api/entities/${entityId}`);
  }

  subscribe(entityId: string): HsafaStream {
    const baseUrl = this.http.getBaseUrl();
    const headers = this.http.getAuthHeaders();
    const url = `${baseUrl}/api/entities/${entityId}/stream`;

    return new SSEStream({
      url,
      headers,
      reconnect: true,
    });
  }
}
