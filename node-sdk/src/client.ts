import { HttpClient } from './http.js';
import { AgentsResource } from './resources/agents.js';
import { EntitiesResource } from './resources/entities.js';
import { SpacesResource } from './resources/spaces.js';
import { MessagesResource } from './resources/messages.js';
import { RunsResource } from './resources/runs.js';
import { ToolsResource } from './resources/tools.js';
import { ClientsResource } from './resources/clients.js';
import type {
  HsafaClientOptions,
  CreateSpaceSetupParams,
  CreateSpaceSetupResult,
  Entity,
  Membership,
} from './types.js';

// =============================================================================
// Setup Resource (convenience methods)
// =============================================================================

class SetupResource {
  constructor(
    private spaces: SpacesResource,
    private entities: EntitiesResource,
  ) {}

  /**
   * Create a full setup: SmartSpace + entities + memberships in one call.
   *
   * Creates the space, creates any requested agent/human/system entities,
   * and adds them all as members.
   */
  async createSpace(params: CreateSpaceSetupParams): Promise<CreateSpaceSetupResult> {
    // 1. Create the SmartSpace
    const { smartSpace } = await this.spaces.create({
      name: params.name,
    });

    const createdEntities: Entity[] = [];
    const createdMemberships: Membership[] = [];

    // 2. Create agent entities and add as members
    if (params.agents) {
      for (const agentDef of params.agents) {
        const { entity } = await this.entities.createAgent({
          agentId: agentDef.agentId,
          displayName: agentDef.displayName,
        });
        createdEntities.push(entity);

        const { membership } = await this.spaces.addMember(smartSpace.id, {
          entityId: entity.id,
          role: 'member',
        });
        createdMemberships.push(membership);
      }
    }

    // 3. Create human entities and add as members
    if (params.humans) {
      for (const humanDef of params.humans) {
        const { entity } = await this.entities.create({
          type: 'human',
          externalId: humanDef.externalId,
          displayName: humanDef.displayName,
          metadata: humanDef.metadata,
        });
        createdEntities.push(entity);

        const { membership } = await this.spaces.addMember(smartSpace.id, {
          entityId: entity.id,
          role: 'member',
        });
        createdMemberships.push(membership);
      }
    }

    // 4. Set admin agent if specified
    if (params.adminAgentEntityId) {
      await this.spaces.update(smartSpace.id, {
        adminAgentEntityId: params.adminAgentEntityId,
      });
    }

    return {
      smartSpace,
      entities: createdEntities,
      memberships: createdMemberships,
    };
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
  readonly setup: SetupResource;

  constructor(options: HsafaClientOptions) {
    this.http = new HttpClient(options);
    this.agents = new AgentsResource(this.http);
    this.entities = new EntitiesResource(this.http);
    this.spaces = new SpacesResource(this.http);
    this.messages = new MessagesResource(this.http);
    this.runs = new RunsResource(this.http);
    this.tools = new ToolsResource(this.http);
    this.clients = new ClientsResource(this.http);
    this.setup = new SetupResource(this.spaces, this.entities);
  }

  updateOptions(options: Partial<HsafaClientOptions>): void {
    this.http.updateOptions(options);
  }

  getOptions(): HsafaClientOptions {
    return this.http.getOptions();
  }
}
