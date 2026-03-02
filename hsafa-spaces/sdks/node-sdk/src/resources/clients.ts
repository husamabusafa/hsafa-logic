import type { HttpClient } from '../http.js';
import type { Client as ClientRecord, RegisterClientParams } from '../types.js';

export class ClientsResource {
  constructor(private http: HttpClient) {}

  async register(params: RegisterClientParams): Promise<{ client: ClientRecord }> {
    return this.http.post('/api/clients/register', params);
  }

  async list(entityId: string): Promise<{ clients: ClientRecord[] }> {
    return this.http.get('/api/clients', { entityId });
  }

  async delete(clientId: string): Promise<{ success: boolean }> {
    return this.http.delete(`/api/clients/${clientId}`);
  }
}
