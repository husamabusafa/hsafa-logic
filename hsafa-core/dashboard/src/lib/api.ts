// =============================================================================
// Core API Client
//
// All requests go through the Vite proxy (/api → localhost:3001).
// API key is read from localStorage.
// =============================================================================

const API_KEY_STORAGE = 'hsafa_dashboard_api_key';

export function getApiKey(): string {
  return localStorage.getItem(API_KEY_STORAGE) ?? import.meta.env.VITE_API_KEY ?? '';
}

export function setApiKey(key: string): void {
  localStorage.setItem(API_KEY_STORAGE, key);
}

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getApiKey(),
      ...opts?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }

  return res.json();
}

// ── Haseefs ──────────────────────────────────────────────────────────────────

export async function listHaseefs() {
  return request<{ haseefs: Haseef[] }>('/api/haseefs');
}

export async function getHaseef(id: string) {
  return request<{ haseef: Haseef }>(`/api/haseefs/${id}`);
}

export async function createHaseef(data: {
  name: string;
  description?: string;
  configJson: Record<string, unknown>;
  profileJson?: Record<string, unknown>;
}) {
  return request<{ haseef: Haseef }>('/api/haseefs', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateHaseef(id: string, data: Partial<{
  name: string;
  description: string;
  configJson: Record<string, unknown>;
  profileJson: Record<string, unknown>;
  scopes: string[];
}>) {
  return request<{ haseef: Haseef }>(`/api/haseefs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteHaseef(id: string) {
  return request<{ success: boolean }>(`/api/haseefs/${id}`, { method: 'DELETE' });
}

export async function getHaseefStatus(id: string) {
  return request<{ running: boolean }>(`/api/haseefs/${id}/status`);
}

export async function startHaseef(id: string) {
  return request<{ status: string }>(`/api/haseefs/${id}/start`, { method: 'POST' });
}

export async function stopHaseef(id: string) {
  return request<{ status: string }>(`/api/haseefs/${id}/stop`, { method: 'POST' });
}

// ── Scopes (v7 global) ──────────────────────────────────────────────────────

export async function listScopes() {
  return request<{ scopes: ScopeInfo[] }>('/api/scopes');
}

export async function getScopeTools(scope: string) {
  return request<{ scope: string; connected: boolean; tools: ScopeTool[] }>(
    `/api/scopes/${scope}/tools`,
  );
}

// ── Runs ─────────────────────────────────────────────────────────────────────

export async function listRuns(params?: { haseefId?: string; status?: string; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.haseefId) qs.set('haseefId', params.haseefId);
  if (params?.status) qs.set('status', params.status);
  if (params?.limit) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return request<{ runs: Run[] }>(`/api/runs${query ? `?${query}` : ''}`);
}

export async function getRun(runId: string) {
  return request<{ run: Run }>(`/api/runs/${runId}`);
}

// ── Live Stream (SSE) ────────────────────────────────────────────────────────

export function connectHaseefStream(
  haseefId: string,
  onMessage: (data: unknown) => void,
  onError?: (err: Event) => void,
): () => void {
  const key = getApiKey();
  const url = `/api/haseefs/${haseefId}/stream${key ? `?api_key=${encodeURIComponent(key)}` : ''}`;
  const es = new EventSource(url);

  es.onmessage = (event) => {
    try {
      onMessage(JSON.parse(event.data));
    } catch {
      onMessage(event.data);
    }
  };

  es.onerror = (err) => {
    onError?.(err);
  };

  return () => es.close();
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface Haseef {
  id: string;
  name: string;
  description: string | null;
  profileJson: Record<string, unknown> | null;
  configJson: Record<string, unknown>;
  configHash: string | null;
  scopes: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ScopeInfo {
  id: string;
  name: string;
  connected: boolean;
  toolCount: number;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface ScopeTool {
  id: string;
  scopeId: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Run {
  id: string;
  haseefId: string;
  status: 'running' | 'completed' | 'failed';
  cycleNumber: number;
  inboxEventCount: number;
  stepCount: number;
  promptTokens: number;
  completionTokens: number;
  durationMs: number;
  triggerScope: string | null;
  triggerType: string | null;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}
