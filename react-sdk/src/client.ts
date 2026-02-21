import { HttpClient } from './http.js';
import { SSEStream } from './sse.js';
import type {
  HsafaClientOptions,
  Agent,
  Entity,
  SmartSpace,
  SmartSpaceMessage,
  Membership,
  Run,
  RunEvent,
  Client as ClientRecord,
  HsafaStream,
  CreateAgentParams,
  CreateEntityParams,
  CreateAgentEntityParams,
  UpdateEntityParams,
  CreateSmartSpaceParams,
  UpdateSmartSpaceParams,
  AddMemberParams,
  UpdateMemberParams,
  SendMessageParams,
  ListMessagesParams,
  CreateRunParams,
  SubmitRunToolResultParams,
  RegisterClientParams,
  ListParams,
  ListRunsParams,
  ListEntitiesParams,
  SubscribeOptions,
} from './types.js';

// =============================================================================
// Resource Classes
// =============================================================================

class AgentsResource {
  constructor(private http: HttpClient) {}

  async create(params: CreateAgentParams): Promise<{ agent: Agent & { entityId?: string } }> {
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

class EntitiesResource {
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

class SpacesResource {
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

  async listRuns(smartSpaceId: string, params?: { status?: string; limit?: number; offset?: number }): Promise<{ runs: Run[] }> {
    return this.http.get(`/api/smart-spaces/${smartSpaceId}/runs`, {
      status: params?.status,
      limit: params?.limit,
      offset: params?.offset,
    });
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

class MessagesResource {
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
}

class RunsResource {
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

class ToolsResource {
  constructor(private http: HttpClient) {}

  async submitResult(runId: string, params: SubmitRunToolResultParams): Promise<{ success: boolean }> {
    return this.http.post(`/api/runs/${runId}/tool-results`, params);
  }

  async submitRunResult(runId: string, params: SubmitRunToolResultParams): Promise<{ success: boolean }> {
    return this.http.post(`/api/runs/${runId}/tool-results`, params);
  }
}

class ClientsResource {
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

// =============================================================================
// Main Client
// =============================================================================

export class HsafaClient {
  private http: HttpClient;

  readonly agents: AgentsResource;
  readonly entities: EntitiesResource;
  readonly spaces: SpacesResource;
  readonly messages: MessagesResource;
  readonly runs: RunsResource;
  readonly tools: ToolsResource;
  readonly clients: ClientsResource;

  constructor(options: HsafaClientOptions) {
    this.http = new HttpClient(options);
    this.agents = new AgentsResource(this.http);
    this.entities = new EntitiesResource(this.http);
    this.spaces = new SpacesResource(this.http);
    this.messages = new MessagesResource(this.http);
    this.runs = new RunsResource(this.http);
    this.tools = new ToolsResource(this.http);
    this.clients = new ClientsResource(this.http);
  }

  updateOptions(options: Partial<HsafaClientOptions>): void {
    this.http.updateOptions(options);
  }

  getOptions(): HsafaClientOptions {
    return this.http.getOptions();
  }
}
