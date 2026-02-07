import type { HttpClient } from '../http.js';
import type {
  SmartSpace,
  Membership,
  HsafaStream,
  CreateSmartSpaceParams,
  UpdateSmartSpaceParams,
  AddMemberParams,
  UpdateMemberParams,
  ListParams,
  SubscribeOptions,
} from '../types.js';
import { SSEStream } from '../sse.js';

export class SpacesResource {
  constructor(private http: HttpClient) {}

  async create(params: CreateSmartSpaceParams): Promise<{ smartSpace: SmartSpace }> {
    return this.http.post('/api/smart-spaces', params);
  }

  async list(params?: ListParams & { entityId?: string }): Promise<{ smartSpaces: SmartSpace[] }> {
    return this.http.get('/api/smart-spaces', {
      entityId: params?.entityId,
      limit: params?.limit,
      offset: params?.offset,
    });
  }

  async get(smartSpaceId: string): Promise<{ smartSpace: SmartSpace }> {
    return this.http.get(`/api/smart-spaces/${smartSpaceId}`);
  }

  async update(smartSpaceId: string, params: UpdateSmartSpaceParams): Promise<{ smartSpace: SmartSpace }> {
    return this.http.patch(`/api/smart-spaces/${smartSpaceId}`, params);
  }

  async delete(smartSpaceId: string): Promise<{ success: boolean }> {
    return this.http.delete(`/api/smart-spaces/${smartSpaceId}`);
  }

  async addMember(smartSpaceId: string, params: AddMemberParams): Promise<{ membership: Membership }> {
    return this.http.post(`/api/smart-spaces/${smartSpaceId}/members`, params);
  }

  async listMembers(smartSpaceId: string): Promise<{ members: Membership[] }> {
    return this.http.get(`/api/smart-spaces/${smartSpaceId}/members`);
  }

  async updateMember(smartSpaceId: string, entityId: string, params: UpdateMemberParams): Promise<{ membership: Membership }> {
    return this.http.patch(`/api/smart-spaces/${smartSpaceId}/members/${entityId}`, params);
  }

  async removeMember(smartSpaceId: string, entityId: string): Promise<{ success: boolean }> {
    return this.http.delete(`/api/smart-spaces/${smartSpaceId}/members/${entityId}`);
  }

  subscribe(smartSpaceId: string, options?: SubscribeOptions): HsafaStream {
    const baseUrl = this.http.getBaseUrl();
    const headers = this.http.getAuthHeaders();
    const params = new URLSearchParams();

    if (options?.afterSeq !== undefined) {
      params.set('afterSeq', String(options.afterSeq));
    }
    if (options?.since) {
      params.set('since', options.since);
    }

    const queryStr = params.toString();
    const url = `${baseUrl}/api/smart-spaces/${smartSpaceId}/stream${queryStr ? `?${queryStr}` : ''}`;

    return new SSEStream({
      url,
      headers,
      reconnect: true,
    });
  }
}
