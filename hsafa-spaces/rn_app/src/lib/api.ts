import * as SecureStore from 'expo-secure-store';
import { API_BASE, SERVER_URL } from '../../config';

// =============================================================================
// API Client — typed fetch wrapper with SecureStore token management
// Port of react_app/src/lib/api.ts for React Native
// =============================================================================

const TOKEN_KEY = 'hsafa_token';

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function removeToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new ApiError(data.error || 'Request failed', res.status);
  }

  return data as T;
}

// =============================================================================
// Auth types
// =============================================================================

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  entityId: string | null;
  smartSpaceId: string | null;
  defaultBaseId: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
  spaces: Array<{ id: string; name: string }>;
  bases: Array<{
    id: string;
    name: string;
    avatarUrl: string | null;
    inviteCode: string;
    role: string;
  }>;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
  verificationRequired?: boolean;
}

// =============================================================================
// Auth API
// =============================================================================

export const authApi = {
  register(name: string, email: string, password: string) {
    return request<AuthResponse>('/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
  },

  login(email: string, password: string) {
    return request<AuthResponse>('/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  me() {
    return request<{ user: AuthUser }>('/me');
  },

  verifyEmail(code: string) {
    return request<{ success: boolean; message: string }>('/verify-email', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  },

  resendCode() {
    return request<{ success: boolean; message: string }>('/resend-code', {
      method: 'POST',
    });
  },
};

// =============================================================================
// Haseef types
// =============================================================================

export interface Haseef {
  id: string;
  name: string;
  description?: string;
  entityId: string;
  avatarUrl?: string | null;
  configJson?: Record<string, unknown>;
  profileJson?: Record<string, unknown>;
  createdAt?: string;
}

export interface HaseefListItem {
  haseefId: string;
  entityId: string;
  name: string;
  avatarUrl?: string | null;
  createdAt: string;
}

export interface HaseefSpace {
  id: string;
  name: string | null;
  description: string | null;
  role: string;
  memberCount: number;
  createdAt: string;
  isDirect: boolean;
  directType: 'haseef-haseef' | 'haseef-human' | null;
  canView: boolean;
  members: Array<{
    entityId: string;
    name: string;
    type: string;
    role: string;
  }>;
}

// =============================================================================
// Haseefs API
// =============================================================================

export const haseefsApi = {
  list() {
    return request<{ haseefs: HaseefListItem[] }>('/haseefs');
  },

  get(id: string) {
    return request<{ haseef: Haseef }>(`/haseefs/${id}`);
  },

  create(data: {
    name: string;
    description?: string;
    model?: string;
    provider?: string;
    instructions?: string;
    avatarUrl?: string;
    persona?: {
      id: string;
      name: string;
      description: string;
      style?: string;
      traits?: string[];
    };
    profile?: Record<string, string>;
    voiceGender?: 'male' | 'female';
    voiceId?: string;
  }) {
    return request<{ haseef: Haseef }>('/haseefs', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update(
    id: string,
    data: {
      name?: string;
      description?: string;
      configJson?: Record<string, unknown>;
      profile?: Record<string, unknown>;
      avatarUrl?: string;
    },
  ) {
    return request<{ haseef: Haseef }>(`/haseefs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  delete(id: string) {
    return request<{ success: boolean }>(`/haseefs/${id}`, {
      method: 'DELETE',
    });
  },

  addToSpace(haseefId: string, spaceId: string) {
    return request<{ success: boolean }>(
      `/haseefs/${haseefId}/spaces/${spaceId}`,
      { method: 'POST' },
    );
  },

  removeFromSpace(haseefId: string, spaceId: string) {
    return request<{ success: boolean }>(
      `/haseefs/${haseefId}/spaces/${spaceId}`,
      { method: 'DELETE' },
    );
  },

  listSpaces(haseefId: string) {
    return request<{ spaces: HaseefSpace[] }>(`/haseefs/${haseefId}/spaces`);
  },

  createSpace(
    haseefId: string,
    data: { name: string; description?: string },
  ) {
    return request<{
      space: { id: string; name: string; description: string | null };
    }>(`/haseefs/${haseefId}/spaces`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  createDirectSpace(
    haseefId: string,
    data: { targetHaseefId?: string; targetEntityId?: string },
  ) {
    return request<{
      space: {
        id: string;
        name: string;
        description: string | null;
        directType: string;
        members: Array<{ entityId: string; name: string; role: string }>;
      };
    }>(`/haseefs/${haseefId}/spaces/direct`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

// =============================================================================
// Space types
// =============================================================================

export interface SmartSpaceMemberSummary {
  entityId: string;
  displayName: string | null;
  type: 'human' | 'agent';
  role: 'owner' | 'admin' | 'member';
}

export interface SmartSpace {
  id: string;
  name: string | null;
  description: string | null;
  createdAt: string;
  metadata?: Record<string, unknown>;
  members?: SmartSpaceMemberSummary[];
  inviteCode?: string | null;
  inviteLinkActive?: boolean;
}

export interface SpaceMember {
  smartSpaceId: string;
  entityId: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  joinedAt: string;
  lastSeenMessageId: string | null;
  entity: {
    id: string;
    displayName: string | null;
    type: 'human' | 'agent';
    avatarUrl?: string | null;
  };
}

export interface Contact {
  entityId: string;
  displayName: string | null;
  type: 'human' | 'agent';
  avatarUrl?: string | null;
}

// =============================================================================
// Spaces API
// =============================================================================

export const spacesApi = {
  list() {
    return request<{ smartSpaces: SmartSpace[] }>('/smart-spaces');
  },

  listContacts() {
    return request<{ contacts: Contact[] }>('/smart-spaces/contacts');
  },

  get(id: string) {
    return request<{ smartSpace: SmartSpace }>(`/smart-spaces/${id}`);
  },

  create(data: {
    name: string;
    description?: string;
    memberEntityIds?: string[];
    isGroup?: boolean;
    inviteEmails?: string[];
  }) {
    return request<{ smartSpace: { id: string; name: string } }>(
      '/smart-spaces/create-for-user',
      { method: 'POST', body: JSON.stringify(data) },
    );
  },

  update(
    id: string,
    data: {
      name?: string;
      description?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    return request<{ smartSpace: SmartSpace }>(`/smart-spaces/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  delete(id: string) {
    return request<{ success: boolean }>(`/smart-spaces/${id}`, {
      method: 'DELETE',
    });
  },

  // Members
  listMembers(spaceId: string) {
    return request<{ members: SpaceMember[] }>(
      `/smart-spaces/${spaceId}/members`,
    );
  },

  addMember(spaceId: string, entityId: string, role: string = 'member') {
    return request<{ membership: SpaceMember }>(
      `/smart-spaces/${spaceId}/members`,
      { method: 'POST', body: JSON.stringify({ entityId, role }) },
    );
  },

  removeMember(spaceId: string, entityId: string) {
    return request<{ success: boolean }>(
      `/smart-spaces/${spaceId}/members/${entityId}`,
      { method: 'DELETE' },
    );
  },

  updateMemberRole(spaceId: string, entityId: string, role: string) {
    return request<{ membership: SpaceMember }>(
      `/smart-spaces/${spaceId}/members/${entityId}`,
      { method: 'PATCH', body: JSON.stringify({ role }) },
    );
  },

  leave(spaceId: string) {
    return request<{ success: boolean }>(`/smart-spaces/${spaceId}/leave`, {
      method: 'POST',
    });
  },

  transferOwnership(spaceId: string, newOwnerId: string) {
    return request<{ success: boolean }>(
      `/smart-spaces/${spaceId}/transfer-ownership`,
      { method: 'POST', body: JSON.stringify({ newOwnerId }) },
    );
  },

  // Messages
  listMessages(
    spaceId: string,
    opts?: { limit?: number; afterSeq?: string; beforeSeq?: string },
  ) {
    const params = new URLSearchParams();
    if (opts?.limit) params.set('limit', String(opts.limit));
    if (opts?.afterSeq) params.set('afterSeq', opts.afterSeq);
    if (opts?.beforeSeq) params.set('beforeSeq', opts.beforeSeq);
    const qs = params.toString();
    return request<{ messages: SpaceMessage[] }>(
      `/smart-spaces/${spaceId}/messages${qs ? `?${qs}` : ''}`,
    );
  },

  sendMessage(
    spaceId: string,
    data: {
      entityId: string;
      content: string;
      type?: string;
      metadata?: Record<string, unknown>;
      replyTo?: { messageId: string };
    },
  ) {
    return request<{ messageId: string; seq: string; createdAt: string }>(
      `/smart-spaces/${spaceId}/messages`,
      { method: 'POST', body: JSON.stringify(data) },
    );
  },

  // Responses (interactive messages)
  respondToMessage(spaceId: string, messageId: string, value: unknown) {
    return request<{
      success: boolean;
      isUpdate: boolean;
      resolved: boolean;
      responseSummary: Record<string, unknown>;
    }>(`/smart-spaces/${spaceId}/messages/${messageId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ value }),
    });
  },

  listResponses(spaceId: string, messageId: string) {
    return request<{
      responses: Array<{
        entityId: string;
        entityName: string;
        entityType: string;
        value: unknown;
        createdAt: string;
        updatedAt: string;
      }>;
    }>(`/smart-spaces/${spaceId}/messages/${messageId}/responses`);
  },

  // Typing & Seen
  sendTyping(
    spaceId: string,
    typing: boolean = true,
    activity: 'typing' | 'recording' = 'typing',
  ) {
    return request<{ success: boolean }>(`/smart-spaces/${spaceId}/typing`, {
      method: 'POST',
      body: JSON.stringify({ typing, activity }),
    });
  },

  markSeen(spaceId: string, messageId: string) {
    return request<{ success: boolean }>(`/smart-spaces/${spaceId}/seen`, {
      method: 'POST',
      body: JSON.stringify({ messageId }),
    });
  },

  // Invite link
  regenerateCode(spaceId: string) {
    return request<{ inviteCode: string; inviteLinkActive: boolean }>(
      `/smart-spaces/${spaceId}/regenerate-code`,
      { method: 'POST' },
    );
  },

  toggleInviteLink(spaceId: string, active: boolean) {
    return request<{ inviteLinkActive: boolean }>(
      `/smart-spaces/${spaceId}/invite-link`,
      { method: 'PATCH', body: JSON.stringify({ active }) },
    );
  },

  resolveSpaceCode(code: string) {
    return request<{
      space: { id: string; name: string | null; memberCount: number };
    }>(`/smart-spaces/resolve/${code}`);
  },

  joinByCode(code: string) {
    return request<{ space: { id: string; name: string | null } }>(
      '/smart-spaces/join',
      { method: 'POST', body: JSON.stringify({ code }) },
    );
  },
};

// =============================================================================
// Message type
// =============================================================================

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
    type: 'human' | 'agent';
  };
}

// =============================================================================
// Invitation types
// =============================================================================

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

// =============================================================================
// Invitations API
// =============================================================================

export const invitationsApi = {
  listMine(status: string = 'pending') {
    return request<{ invitations: Invitation[] }>(
      `/invitations?status=${status}`,
    );
  },

  accept(id: string) {
    return request<{ success: boolean; smartSpaceId: string }>(
      `/invitations/${id}/accept`,
      { method: 'POST' },
    );
  },

  decline(id: string) {
    return request<{ success: boolean }>(`/invitations/${id}/decline`, {
      method: 'POST',
    });
  },

  createForSpace(
    spaceId: string,
    data: { email: string; role?: string; message?: string },
  ) {
    return request<{ invitation: Invitation }>(
      `/smart-spaces/${spaceId}/invitations`,
      { method: 'POST', body: JSON.stringify(data) },
    );
  },

  listForSpace(spaceId: string) {
    return request<{ invitations: Invitation[] }>(
      `/smart-spaces/${spaceId}/invitations`,
    );
  },
};

// =============================================================================
// Media API
// =============================================================================

export interface MediaUploadResult {
  mediaId: string;
  url: string;
  thumbnailUrl: string | null;
  mimeType: string;
  size: number;
  metadata: Record<string, unknown>;
}

export interface VoiceUploadResult extends MediaUploadResult {
  transcription: string;
}

export const mediaApi = {
  async upload(uri: string, fileName: string, mimeType: string): Promise<MediaUploadResult> {
    const token = await getToken();
    const formData = new FormData();
    formData.append('file', {
      uri,
      name: fileName,
      type: mimeType,
    } as any);

    const res = await fetch(`${API_BASE}/media/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) throw new ApiError(data.error || 'Upload failed', res.status);
    return data;
  },

  async uploadVoice(uri: string, fileName: string = 'voice.m4a'): Promise<VoiceUploadResult> {
    const token = await getToken();
    const formData = new FormData();
    formData.append('file', {
      uri,
      name: fileName,
      type: 'audio/m4a',
    } as any);

    const res = await fetch(`${API_BASE}/media/upload-voice`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });

    const data = await res.json();
    if (!res.ok)
      throw new ApiError(data.error || 'Voice upload failed', res.status);
    return data;
  },
};

// =============================================================================
// API Keys
// =============================================================================

export interface ApiKeyInfo {
  id: string;
  provider: string;
  keyHint: string;
  createdAt: string;
  updatedAt: string;
}

export const apiKeysApi = {
  list() {
    return request<{ apiKeys: ApiKeyInfo[] }>('/api-keys');
  },

  set(provider: string, key: string) {
    return request<{ apiKey: ApiKeyInfo }>(`/api-keys/${provider}`, {
      method: 'PUT',
      body: JSON.stringify({ key }),
    });
  },

  remove(provider: string) {
    return request<{ success: boolean }>(`/api-keys/${provider}`, {
      method: 'DELETE',
    });
  },
};

// =============================================================================
// Base types
// =============================================================================

export interface BaseMember {
  entityId: string;
  type: 'human' | 'agent';
  displayName: string;
  avatarUrl: string | null;
  role: string;
  joinedAt?: string;
}

export interface Base {
  id: string;
  name: string;
  avatarUrl: string | null;
  inviteCode: string;
  inviteLinkActive: boolean;
  myRole: string;
  memberCount: number;
  members: BaseMember[];
  createdAt: string;
}

export interface BasePreview {
  id: string;
  name: string;
  avatarUrl: string | null;
  memberCount: number;
}

// =============================================================================
// Bases API
// =============================================================================

export const basesApi = {
  list() {
    return request<{ bases: Base[] }>('/bases');
  },

  create(data: { name: string }) {
    return request<{ base: Base }>('/bases', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update(
    baseId: string,
    data: { name?: string; avatarUrl?: string | null },
  ) {
    return request<{
      base: { id: string; name: string; avatarUrl: string | null };
    }>(`/bases/${baseId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  delete(baseId: string) {
    return request<{ success: boolean }>(`/bases/${baseId}`, {
      method: 'DELETE',
    });
  },

  regenerateCode(baseId: string) {
    return request<{ inviteCode: string; inviteLinkActive: boolean }>(
      `/bases/${baseId}/regenerate-code`,
      { method: 'POST' },
    );
  },

  toggleInviteLink(baseId: string, active: boolean) {
    return request<{ inviteLinkActive: boolean }>(
      `/bases/${baseId}/invite-link`,
      { method: 'PATCH', body: JSON.stringify({ active }) },
    );
  },

  join(code: string) {
    return request<{ base: Base }>('/bases/join', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  },

  resolveCode(code: string) {
    return request<{ base: BasePreview }>(
      `/bases/resolve/${encodeURIComponent(code)}`,
    );
  },

  addMember(baseId: string, entityId: string) {
    return request<{ member: BaseMember }>(`/bases/${baseId}/members`, {
      method: 'POST',
      body: JSON.stringify({ entityId }),
    });
  },

  updateMemberRole(baseId: string, entityId: string, role: string) {
    return request<{ role: string }>(`/bases/${baseId}/members/${entityId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
  },

  removeMember(baseId: string, entityId: string) {
    return request<{ success: boolean }>(
      `/bases/${baseId}/members/${entityId}`,
      { method: 'DELETE' },
    );
  },

  listHaseefs(baseId: string) {
    return request<{
      haseefs: Array<{
        entityId: string;
        haseefId: string | null;
        displayName: string;
        avatarUrl: string | null;
        joinedAt: string;
      }>;
    }>(`/bases/${baseId}/haseefs`);
  },
};

// =============================================================================
// SSE helper — resolves server-relative media URLs
// =============================================================================

export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  // Server returns relative URLs like /media/uploads/...
  return `${SERVER_URL}${url}`;
}

export { ApiError };
