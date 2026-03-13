const API_BASE = "/api";

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function getToken(): string | null {
  return localStorage.getItem("hsafa_token");
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new ApiError(data.error || "Request failed", res.status);
  }

  return data as T;
}

// ── Auth types ───────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  entityId: string | null;
  smartSpaceId: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
  spaces: Array<{ id: string; name: string }>;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
  verificationRequired?: boolean;
}

// ── Auth API ─────────────────────────────────────────────────────────────────

export const authApi = {
  register(name: string, email: string, password: string) {
    return request<AuthResponse>("/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    });
  },

  login(email: string, password: string) {
    return request<AuthResponse>("/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  me() {
    return request<{ user: AuthUser }>("/me");
  },

  verifyEmail(code: string) {
    return request<{ success: boolean; message: string }>("/verify-email", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
  },

  resendCode() {
    return request<{ success: boolean; message: string }>("/resend-code", {
      method: "POST",
    });
  },
};

// ── Haseef types ────────────────────────────────────────────────────────────

export interface Haseef {
  id: string;
  name: string;
  description?: string;
  entityId: string;
  configJson?: Record<string, unknown>;
  createdAt?: string;
}

export interface HaseefListItem {
  haseefId: string;
  entityId: string;
  name: string;
  createdAt: string;
}

// ── Haseef API ──────────────────────────────────────────────────────────────

export const haseefsApi = {
  list() {
    return request<{ haseefs: HaseefListItem[] }>("/haseefs");
  },

  get(id: string) {
    return request<{ haseef: Haseef }>(`/haseefs/${id}`);
  },

  create(data: { name: string; description?: string; model?: string; instructions?: string }) {
    return request<{ haseef: Haseef }>("/haseefs", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  update(id: string, data: { name?: string; description?: string; configJson?: Record<string, unknown> }) {
    return request<{ haseef: Haseef }>(`/haseefs/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  delete(id: string) {
    return request<{ success: boolean }>(`/haseefs/${id}`, { method: "DELETE" });
  },

  addToSpace(haseefId: string, spaceId: string) {
    return request<{ success: boolean }>(`/haseefs/${haseefId}/spaces/${spaceId}`, {
      method: "POST",
    });
  },

  removeFromSpace(haseefId: string, spaceId: string) {
    return request<{ success: boolean }>(`/haseefs/${haseefId}/spaces/${spaceId}`, {
      method: "DELETE",
    });
  },
};

// ── Space types ─────────────────────────────────────────────────────────────

export interface SmartSpace {
  id: string;
  name: string | null;
  description: string | null;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface SpaceMember {
  smartSpaceId: string;
  entityId: string;
  role: "owner" | "admin" | "member";
  joinedAt: string;
  lastSeenMessageId: string | null;
  entity: {
    id: string;
    displayName: string | null;
    type: "human" | "agent";
  };
}

// ── Spaces API ──────────────────────────────────────────────────────────────

export const spacesApi = {
  list() {
    return request<{ smartSpaces: SmartSpace[] }>("/smart-spaces");
  },

  get(id: string) {
    return request<{ smartSpace: SmartSpace }>(`/smart-spaces/${id}`);
  },

  create(data: { name: string; description?: string; memberEntityIds?: string[] }) {
    return request<{ smartSpace: { id: string; name: string } }>("/smart-spaces/create-for-user", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  update(id: string, data: { name?: string; description?: string }) {
    return request<{ smartSpace: SmartSpace }>(`/smart-spaces/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },

  delete(id: string) {
    return request<{ success: boolean }>(`/smart-spaces/${id}`, { method: "DELETE" });
  },

  // Members
  listMembers(spaceId: string) {
    return request<{ members: SpaceMember[] }>(`/smart-spaces/${spaceId}/members`);
  },

  addMember(spaceId: string, entityId: string, role: string = "member") {
    return request<{ membership: SpaceMember }>(`/smart-spaces/${spaceId}/members`, {
      method: "POST",
      body: JSON.stringify({ entityId, role }),
    });
  },

  removeMember(spaceId: string, entityId: string) {
    return request<{ success: boolean }>(`/smart-spaces/${spaceId}/members/${entityId}`, {
      method: "DELETE",
    });
  },

  updateMemberRole(spaceId: string, entityId: string, role: string) {
    return request<{ membership: SpaceMember }>(`/smart-spaces/${spaceId}/members/${entityId}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
  },

  leave(spaceId: string) {
    return request<{ success: boolean }>(`/smart-spaces/${spaceId}/leave`, { method: "POST" });
  },

  transferOwnership(spaceId: string, newOwnerId: string) {
    return request<{ success: boolean }>(`/smart-spaces/${spaceId}/transfer-ownership`, {
      method: "POST",
      body: JSON.stringify({ newOwnerId }),
    });
  },

  // Messages
  listMessages(spaceId: string, opts?: { limit?: number; afterSeq?: string; beforeSeq?: string }) {
    const params = new URLSearchParams();
    if (opts?.limit) params.set("limit", String(opts.limit));
    if (opts?.afterSeq) params.set("afterSeq", opts.afterSeq);
    if (opts?.beforeSeq) params.set("beforeSeq", opts.beforeSeq);
    const qs = params.toString();
    return request<{ messages: SpaceMessage[] }>(`/smart-spaces/${spaceId}/messages${qs ? `?${qs}` : ""}`);
  },

  sendMessage(spaceId: string, data: { entityId: string; content: string; type?: string; metadata?: Record<string, unknown>; replyTo?: { messageId: string } }) {
    return request<{ message: SpaceMessage }>(`/smart-spaces/${spaceId}/messages`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  // Typing & Seen
  sendTyping(spaceId: string, typing: boolean = true) {
    return request<{ success: boolean }>(`/smart-spaces/${spaceId}/typing`, {
      method: "POST",
      body: JSON.stringify({ typing }),
    });
  },

  markSeen(spaceId: string, messageId: string) {
    return request<{ success: boolean }>(`/smart-spaces/${spaceId}/seen`, {
      method: "POST",
      body: JSON.stringify({ messageId }),
    });
  },
};

// ── Message type ────────────────────────────────────────────────────────────

export interface SpaceMessage {
  id: string;
  smartSpaceId: string;
  entityId: string;
  role: string;
  content: string | null;
  metadata: Record<string, unknown> | null;
  seq: string;
  createdAt: string;
  entity?: {
    id: string;
    displayName: string | null;
    type: "human" | "agent";
  };
}

// ── Invitation types ────────────────────────────────────────────────────────

export interface Invitation {
  id: string;
  smartSpaceId: string;
  inviterId: string;
  inviteeEmail: string;
  inviteeId: string | null;
  role: string;
  status: string;
  message: string | null;
  createdAt: string;
  smartSpace?: { id: string; name: string };
  inviter?: { id: string; displayName: string };
}

// ── Invitations API ─────────────────────────────────────────────────────────

export const invitationsApi = {
  listMine(status: string = "pending") {
    return request<{ invitations: Invitation[] }>(`/invitations?status=${status}`);
  },

  accept(id: string) {
    return request<{ success: boolean; smartSpaceId: string }>(`/invitations/${id}/accept`, {
      method: "POST",
    });
  },

  decline(id: string) {
    return request<{ success: boolean }>(`/invitations/${id}/decline`, { method: "POST" });
  },

  createForSpace(spaceId: string, data: { email: string; role?: string; message?: string }) {
    return request<{ invitation: Invitation }>(`/smart-spaces/${spaceId}/invitations`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  listForSpace(spaceId: string) {
    return request<{ invitations: Invitation[] }>(`/smart-spaces/${spaceId}/invitations`);
  },
};

export { ApiError };
