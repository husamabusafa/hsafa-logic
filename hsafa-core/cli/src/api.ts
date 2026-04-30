// =============================================================================
// API Client — thin wrapper over the Spaces server HTTP API (v7)
//
// All endpoints below correspond to actual routes in
//   hsafa-spaces/server/src/routes/skills.ts
//   hsafa-spaces/server/src/routes/auth.ts
//   hsafa-spaces/server/src/routes/haseefs.ts
//
// The CLI uses the user's JWT (from `hsafa auth login`) for authentication.
// =============================================================================

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: Record<string, unknown>,
  ) {
    super((body.error as string) || `HTTP ${status}`);
    this.name = "ApiError";
  }
}

export class ApiClient {
  constructor(
    private serverUrl: string,
    private token: string | null = null,
  ) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.token) h["Authorization"] = `Bearer ${this.token}`;
    return h;
  }

  private async request<T = Record<string, unknown>>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.serverUrl}${path}`;
    const res = await fetch(url, {
      method,
      headers: this.headers(),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    const text = await res.text();
    let json: Record<string, unknown> = {};
    try { json = text ? JSON.parse(text) : {}; } catch { /* not JSON */ }

    if (!res.ok) {
      throw new ApiError(res.status, json);
    }
    return json as T;
  }

  // ── Auth ────────────────────────────────────────────────────────────────────

  async login(email: string, password: string) {
    return this.request<{
      token: string;
      user: { id: string; email: string; name: string; entityId: string };
    }>("POST", "/api/login", { email, password });
  }

  async me() {
    return this.request<{
      user: { id: string; email: string; name: string; entityId: string };
    }>("GET", "/api/me");
  }

  // ── Skill Templates (read-only, populated by the platform) ──────────────────

  async listTemplates() {
    return this.request<{ templates: SkillTemplate[] }>(
      "GET",
      "/api/skills/templates",
    );
  }

  async getTemplate(name: string) {
    return this.request<{ template: SkillTemplate }>(
      "GET",
      `/api/skills/templates/${encodeURIComponent(name)}`,
    );
  }

  // ── Skill Instances ─────────────────────────────────────────────────────────

  async listInstances() {
    return this.request<{ instances: SkillInstance[] }>(
      "GET",
      "/api/skills/instances",
    );
  }

  async createInstance(data: {
    name: string;            // Unique skill name (lowercase, used as Core skill identifier)
    displayName?: string;    // Human-friendly label
    templateName: string;    // Template slug from listTemplates()
    config?: Record<string, unknown>;
  }) {
    return this.request<{ instance: SkillInstance }>(
      "POST",
      "/api/skills/instances",
      data,
    );
  }

  async updateInstanceConfig(
    instanceId: string,
    config: Record<string, unknown>,
  ) {
    return this.request<{ instance: SkillInstance }>(
      "PATCH",
      `/api/skills/instances/${instanceId}`,
      { config },
    );
  }

  async deleteInstance(instanceId: string) {
    return this.request<{ success: boolean }>(
      "DELETE",
      `/api/skills/instances/${instanceId}`,
    );
  }

  // ── Attach / Detach ─────────────────────────────────────────────────────────

  async attachInstance(instanceId: string, haseefId: string) {
    return this.request<{ haseefSkill: { id: string } }>(
      "POST",
      `/api/skills/instances/${instanceId}/attach`,
      { haseefId },
    );
  }

  async detachInstance(instanceId: string, haseefId: string) {
    return this.request<{ success: boolean }>(
      "DELETE",
      `/api/skills/instances/${instanceId}/detach`,
      { haseefId },
    );
  }

  async listHaseefSkills(haseefId: string) {
    return this.request<{
      skills: Array<{
        id: string;
        haseefId: string;
        instanceId: string;
        connected: boolean;
        instance: SkillInstance & { template: SkillTemplate };
      }>;
    }>("GET", `/api/skills/haseefs/${haseefId}`);
  }

  // ── Haseefs ─────────────────────────────────────────────────────────────────

  async listHaseefs() {
    return this.request<{
      haseefs: Array<{ id: string; name: string; description?: string | null }>;
    }>("GET", "/api/haseefs");
  }

  async resolveHaseef(nameOrId: string): Promise<{ id: string; name: string }> {
    // UUID format → use directly (we still verify it exists)
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(nameOrId)) {
      return { id: nameOrId, name: nameOrId };
    }
    // Otherwise look up by name (case-insensitive) via the user's haseef list
    const { haseefs } = await this.listHaseefs();
    const lower = nameOrId.toLowerCase();
    const match = haseefs.find((h) => h.name?.toLowerCase() === lower);
    if (!match) {
      throw new ApiError(404, { error: `Haseef "${nameOrId}" not found` });
    }
    return { id: match.id, name: match.name };
  }
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface SkillTemplate {
  id: string;
  name: string;                            // unique slug, e.g. "database"
  displayName: string;                     // "Database"
  description?: string | null;
  category?: string | null;
  configSchema: unknown;                   // JSON Schema
  toolDefinitions: unknown;                // array of tool definitions
  iconUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SkillInstance {
  id: string;
  name: string;                            // Unique skill name used by Core
  displayName: string;
  templateId: string;
  config: Record<string, unknown>;
  userId: string;
  status: string;                          // "active" | "inactive" | "error"
  statusMessage?: string | null;
  createdAt: string;
  updatedAt: string;
  // Populated by the server when relevant:
  template?: SkillTemplate;
  connected?: boolean;
}
