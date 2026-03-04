import type { Config } from './config.js';

// =============================================================================
// Spaces App API Client
//
// HTTP client for interacting with hsafa-spaces/spaces-app.
// Used by tool handlers to execute send_space_message and read_space_messages.
// =============================================================================

export interface SpaceMessage {
  id: string;
  smartSpaceId: string;
  entityId: string;
  role: string;
  content: string | null;
  metadata: Record<string, unknown> | null;
  seq: number;
  createdAt: string;
}

export class SpacesClient {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  // ---------------------------------------------------------------------------
  // Send a message to a space
  // ---------------------------------------------------------------------------

  async sendMessage(
    spaceId: string,
    entityId: string,
    content: string,
  ): Promise<{ message: SpaceMessage }> {
    const res = await fetch(
      `${this.config.spacesAppUrl}/api/smart-spaces/${spaceId}/messages`,
      {
        method: 'POST',
        headers: {
          'x-secret-key': this.config.spacesAppSecretKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ entityId, content }),
      },
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`sendMessage failed: ${res.status} ${text}`);
    }

    return await res.json() as { message: SpaceMessage };
  }

  // ---------------------------------------------------------------------------
  // Read messages from a space
  // ---------------------------------------------------------------------------

  async readMessages(
    spaceId: string,
    limit: number = 20,
  ): Promise<{ messages: SpaceMessage[] }> {
    const res = await fetch(
      `${this.config.spacesAppUrl}/api/smart-spaces/${spaceId}/messages?limit=${limit}`,
      {
        headers: { 'x-secret-key': this.config.spacesAppSecretKey },
      },
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`readMessages failed: ${res.status} ${text}`);
    }

    return await res.json() as { messages: SpaceMessage[] };
  }

  // ---------------------------------------------------------------------------
  // Get space details (for resolving space names in SSE events)
  // ---------------------------------------------------------------------------

  async getSpace(spaceId: string): Promise<{ id: string; name: string | null }> {
    const res = await fetch(
      `${this.config.spacesAppUrl}/api/smart-spaces/${spaceId}`,
      {
        headers: { 'x-secret-key': this.config.spacesAppSecretKey },
      },
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`getSpace failed: ${res.status} ${text}`);
    }

    const body = await res.json() as { smartSpace: { id: string; name: string | null } };
    return body.smartSpace;
  }

  // ---------------------------------------------------------------------------
  // Get members of a space
  // ---------------------------------------------------------------------------

  async getMembers(spaceId: string): Promise<Array<{ entityId: string; type: string; displayName: string | null; role: string | null }>> {
    const res = await fetch(
      `${this.config.spacesAppUrl}/api/smart-spaces/${spaceId}/members`,
      {
        headers: { 'x-secret-key': this.config.spacesAppSecretKey },
      },
    );

    if (!res.ok) {
      return [];
    }

    const body = await res.json() as {
      members: Array<{
        entityId: string;
        role: string | null;
        entity: { id: string; type: string; displayName: string | null };
      }>;
    };
    return (body.members ?? []).map((m) => ({
      entityId: m.entityId,
      type: m.entity.type,
      displayName: m.entity.displayName,
      role: m.role,
    }));
  }

  // ---------------------------------------------------------------------------
  // Find agent entity by displayName (for resolving agentEntityId)
  // ---------------------------------------------------------------------------

  async findAgentEntityByName(name: string): Promise<{ id: string; displayName: string | null } | null> {
    const res = await fetch(
      `${this.config.spacesAppUrl}/api/entities?type=agent`,
      {
        headers: { 'x-secret-key': this.config.spacesAppSecretKey },
      },
    );

    if (!res.ok) return null;

    const body = await res.json() as {
      entities: Array<{ id: string; type: string; displayName: string | null; externalId: string | null }>;
    };

    // Match by displayName (case-insensitive)
    const match = body.entities.find(
      (e) => e.displayName?.toLowerCase() === name.toLowerCase(),
    );
    return match ?? null;
  }

  // ---------------------------------------------------------------------------
  // Get spaces an entity is a member of
  // ---------------------------------------------------------------------------

  async getEntitySpaces(entityId: string): Promise<Array<{ id: string; name: string | null }>> {
    const res = await fetch(
      `${this.config.spacesAppUrl}/api/smart-spaces?entityId=${entityId}`,
      {
        headers: { 'x-secret-key': this.config.spacesAppSecretKey },
      },
    );

    if (!res.ok) return [];

    const body = await res.json() as {
      smartSpaces: Array<{ id: string; name: string | null }>;
    };
    return body.smartSpaces ?? [];
  }
}
