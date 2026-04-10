// =============================================================================
// API Client — thin wrapper over the Spaces server HTTP API
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

    const json = await res.json().catch(() => ({})) as Record<string, unknown>;

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

  // ── Templates ───────────────────────────────────────────────────────────────

  async listTemplates() {
    return this.request<{ templates: ScopeTemplate[] }>("GET", "/api/scopes/templates");
  }

  // ── Instances ───────────────────────────────────────────────────────────────

  async listInstances() {
    return this.request<{ instances: ScopeInstance[] }>("GET", "/api/scopes/instances");
  }

  async getInstance(id: string) {
    return this.request<{ instance: ScopeInstance }>("GET", `/api/scopes/instances/${id}`);
  }

  async createInstance(data: {
    templateId: string;
    name: string;
    scopeName?: string;
    description?: string;
    deploymentType?: string;
    imageUrl?: string;
    configs?: Array<{ key: string; value: string; isSecret?: boolean }>;
    autoDeploy?: boolean;
  }) {
    return this.request<{ instance: ScopeInstance }>("POST", "/api/scopes/instances", data);
  }

  async deleteInstance(id: string) {
    return this.request("DELETE", `/api/scopes/instances/${id}`);
  }


  // ── Haseef Attachment ───────────────────────────────────────────────────────

  async listHaseefScopes(haseefId: string) {
    return this.request<{
      attachedScopes: string[];
      instances: Array<Record<string, unknown>>;
    }>("GET", `/api/scopes/haseef/${haseefId}`);
  }

  async attachScope(haseefId: string, instanceId: string) {
    return this.request("POST", `/api/scopes/haseef/${haseefId}/attach`, {
      instanceId,
    });
  }

  async detachScope(haseefId: string, scopeName: string) {
    return this.request("POST", `/api/scopes/haseef/${haseefId}/detach`, {
      scopeName,
    });
  }

  // ── External Scopes ─────────────────────────────────────────────────────────

  async verifyExternalScope(scopeKey: string) {
    return this.request<{
      valid: boolean;
      scopeName: string;
      connected: boolean;
      toolCount: number;
    }>("POST", "/api/scopes/external/verify", { scopeKey });
  }

  async registerExternalScope(data: {
    scopeName: string;
    displayName: string;
    scopeKey: string;
    description?: string;
  }) {
    return this.request<{
      instance: ScopeInstance;
    }>("POST", "/api/scopes/external", data);
  }

  // ── Publish ────────────────────────────────────────────────────────────────

  async publishInstance(id: string, data?: {
    name?: string;
    slug?: string;
    description?: string;
    icon?: string;
    isPublic?: boolean;
  }) {
    return this.request<{ template: ScopeTemplate; action: "created" | "updated" }>(
      "POST", `/api/scopes/instances/${id}/publish`, data ?? {},
    );
  }

  // ── Key Rotation ────────────────────────────────────────────────────────────

  async rotateKey(instanceId: string) {
    return this.request<{ success: boolean; keyHint: string }>(
      "POST",
      `/api/scopes/instances/${instanceId}/rotate-key`,
    );
  }

  // ── Haseefs ─────────────────────────────────────────────────────────────────

  async listHaseefs() {
    return this.request<{ haseefs: Array<{ id: string; haseefId: string; haseefName?: string; name?: string }> }>(
      "GET",
      "/api/haseefs",
    );
  }

  async resolveHaseef(nameOrId: string) {
    // UUID format → use directly
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(nameOrId)) {
      return { haseef: { id: nameOrId, name: nameOrId } };
    }
    return this.request<{ haseef: { id: string; name: string } }>(
      "GET",
      `/api/scopes/resolve-haseef?name=${encodeURIComponent(nameOrId)}`,
    );
  }

  // ── Quick Create ───────────────────────────────────────────────────────────

  async quickCreateScope(data: { scopeName: string; displayName?: string; description?: string }) {
    return this.request<{
      instance: { id: string; scopeName: string; name: string; deploymentType: string };
      scopeKey: string;
      coreUrl: string;
      alreadyExisted: boolean;
    }>("POST", "/api/scopes/quick-create", data);
  }

}

// ── Types ───────────────────────────────────────────────────────────────────

export interface ScopeTemplate {
  id: string;
  slug: string;
  name: string;
  description?: string;
  icon?: string;
  category?: string;
}

export interface ScopeInstance {
  id: string;
  templateId: string | null;
  name: string;
  scopeName: string;
  description?: string;
  ownerId?: string | null;
  active: boolean;
  builtIn?: boolean;
  deploymentType: string;
  coreScopeKey?: string | null;
  createdAt: string;
  template?: ScopeTemplate;
  configs?: Array<{ id: string; key: string; isSecret: boolean; value?: string; hasValue?: boolean }>;
  connected?: boolean;
}
