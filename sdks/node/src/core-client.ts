// =============================================================================
// Core API Client
//
// Low-level HTTP client for hsafa-core. Handles auth headers, error wrapping,
// and JSON parsing. Used internally by Hsafa class.
// =============================================================================

import type { HsafaOptions } from './types.js';
import { HsafaApiError } from './types.js';

export class CoreClient {
  private baseUrl: string;
  private extensionKey?: string;
  private secretKey?: string;

  constructor(options: HsafaOptions) {
    this.baseUrl = options.coreUrl.replace(/\/$/, '');
    this.extensionKey = options.extensionKey;
    this.secretKey = options.secretKey;
  }

  // ---------------------------------------------------------------------------
  // Auth headers
  // ---------------------------------------------------------------------------

  private headers(mode: 'extension' | 'secret' | 'auto' = 'auto'): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };

    if (mode === 'extension' || (mode === 'auto' && this.extensionKey)) {
      if (this.extensionKey) h['x-extension-key'] = this.extensionKey;
    }
    if (mode === 'secret' || (mode === 'auto' && !this.extensionKey && this.secretKey)) {
      if (this.secretKey) h['x-secret-key'] = this.secretKey;
    }

    return h;
  }

  private adminHeaders(): Record<string, string> {
    if (!this.secretKey) throw new Error('@hsafa/node: secretKey is required for admin operations');
    return { 'Content-Type': 'application/json', 'x-secret-key': this.secretKey };
  }

  private extensionHeaders(): Record<string, string> {
    if (!this.extensionKey) throw new Error('@hsafa/node: extensionKey is required for extension operations');
    return { 'Content-Type': 'application/json', 'x-extension-key': this.extensionKey };
  }

  // ---------------------------------------------------------------------------
  // HTTP primitives
  // ---------------------------------------------------------------------------

  async get<T>(path: string, headers: Record<string, string>): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new HsafaApiError(res.status, await res.text(), url);
    }
    return res.json() as Promise<T>;
  }

  async post<T>(path: string, body: unknown, headers: Record<string, string>): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new HsafaApiError(res.status, await res.text(), url);
    }
    return res.json() as Promise<T>;
  }

  async patch<T>(path: string, body: unknown, headers: Record<string, string>): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new HsafaApiError(res.status, await res.text(), url);
    }
    return res.json() as Promise<T>;
  }

  async delete<T>(path: string, headers: Record<string, string>): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, { method: 'DELETE', headers });
    if (!res.ok) {
      throw new HsafaApiError(res.status, await res.text(), url);
    }
    return res.json() as Promise<T>;
  }

  // ---------------------------------------------------------------------------
  // SSE stream (returns raw Response for consumer to read)
  // ---------------------------------------------------------------------------

  async stream(path: string, headers: Record<string, string>): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new HsafaApiError(res.status, await res.text(), url);
    }
    return res;
  }

  // ---------------------------------------------------------------------------
  // Extension-key operations
  // ---------------------------------------------------------------------------

  /** GET /api/extensions/me — self-discovery */
  async getMe() {
    return this.get<{ extension: import('./types.js').ExtensionInfo }>(
      '/api/extensions/me',
      this.extensionHeaders(),
    );
  }

  /** POST /api/haseefs/:id/senses — push sense events */
  async pushSense(haseefId: string, event: import('./types.js').SenseEvent) {
    return this.post<{ success: boolean; pushed: number }>(
      `/api/haseefs/${haseefId}/senses`,
      { event },
      this.extensionHeaders(),
    );
  }

  /** POST /api/haseefs/:id/senses — push multiple sense events */
  async pushSenses(haseefId: string, events: import('./types.js').SenseEvent[]) {
    return this.post<{ success: boolean; pushed: number }>(
      `/api/haseefs/${haseefId}/senses`,
      { events },
      this.extensionHeaders(),
    );
  }

  // ---------------------------------------------------------------------------
  // Any-auth helpers (routes that accept either key)
  // ---------------------------------------------------------------------------

  private anyAuthHeaders(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.extensionKey) h['x-extension-key'] = this.extensionKey;
    else if (this.secretKey) h['x-secret-key'] = this.secretKey;
    return h;
  }

  // ---------------------------------------------------------------------------
  // No-auth operations
  // ---------------------------------------------------------------------------

  /** GET /health — health check (no auth required) */
  async health() {
    return this.get<{ status: string; service: string; version: string; processes: number }>(
      '/health',
      { 'Content-Type': 'application/json' },
    );
  }

  // ---------------------------------------------------------------------------
  // Secret-key (admin) operations
  // ---------------------------------------------------------------------------

  // --- Haseefs (v4 API) ---

  async listHaseefs() {
    return this.get<{ haseefs: import('./types.js').Haseef[] }>(
      '/api/haseefs',
      this.adminHeaders(),
    );
  }

  async getHaseef(haseefId: string) {
    return this.get<{ haseef: import('./types.js').Haseef }>(
      `/api/haseefs/${haseefId}`,
      this.adminHeaders(),
    );
  }

  // --- Agents (legacy API — same data as haseefs) ---

  async createHaseef(data: { name: string; description?: string; configJson: Record<string, unknown> }) {
    return this.post<{ haseef: import('./types.js').Haseef; haseefId: string }>(
      '/api/agents',
      data,
      this.adminHeaders(),
    );
  }

  async updateHaseef(haseefId: string, data: { name?: string; description?: string; configJson?: Record<string, unknown> }) {
    return this.patch<{ haseef: import('./types.js').Haseef }>(
      `/api/agents/${haseefId}`,
      data,
      this.adminHeaders(),
    );
  }

  async deleteHaseef(haseefId: string) {
    return this.delete<{ success: boolean }>(
      `/api/agents/${haseefId}`,
      this.adminHeaders(),
    );
  }

  /** POST /api/agents/:id/trigger — Service trigger (external systems) */
  async triggerHaseef(haseefId: string, serviceName: string, payload?: unknown) {
    return this.post<{ success: boolean; haseefId: string }>(
      `/api/agents/${haseefId}/trigger`,
      { serviceName, payload },
      this.adminHeaders(),
    );
  }

  // --- Runs ---

  async listRuns(options?: { limit?: number; status?: string; haseefId?: string }) {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.status) params.set('status', options.status);
    if (options?.haseefId) params.set('haseefId', options.haseefId);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.get<{ runs: import('./types.js').Run[] }>(
      `/api/runs${qs}`,
      this.adminHeaders(),
    );
  }

  async getRun(runId: string) {
    return this.get<{ run: import('./types.js').Run }>(
      `/api/runs/${runId}`,
      this.anyAuthHeaders(),
    );
  }

  async getRunEvents(runId: string) {
    return this.get<{ events: unknown[] }>(
      `/api/runs/${runId}/events`,
      this.anyAuthHeaders(),
    );
  }

  async streamRun(runId: string) {
    return this.stream(
      `/api/runs/${runId}/stream`,
      this.anyAuthHeaders(),
    );
  }

  async submitToolResult(runId: string, callId: string, result: unknown) {
    return this.post<{ success: boolean; haseefId: string }>(
      `/api/runs/${runId}/tool-results`,
      { callId, result },
      this.anyAuthHeaders(),
    );
  }

  // --- Tool Worker Stream ---

  async streamToolWorker() {
    return this.stream(
      '/api/tools/stream',
      this.adminHeaders(),
    );
  }

  // --- Extensions ---

  async installExtension(url: string) {
    return this.post<{
      extension: import('./types.js').Extension;
      extensionKey: string;
      manifest: import('./types.js').ExtensionManifest;
    }>('/api/extensions/install', { url }, this.adminHeaders());
  }

  async registerExtension(data: { name: string; url?: string; description?: string; instructions?: string }) {
    return this.post<{
      extension: import('./types.js').Extension;
      extensionKey: string;
    }>('/api/extensions', data, this.adminHeaders());
  }

  async listExtensions() {
    return this.get<{ extensions: import('./types.js').Extension[] }>(
      '/api/extensions',
      this.adminHeaders(),
    );
  }

  async getExtension(extId: string) {
    return this.get<{ extension: import('./types.js').Extension }>(
      `/api/extensions/${extId}`,
      this.adminHeaders(),
    );
  }

  async updateExtension(extId: string, data: { description?: string; instructions?: string; url?: string }) {
    return this.patch<{ extension: import('./types.js').Extension }>(
      `/api/extensions/${extId}`,
      data,
      this.adminHeaders(),
    );
  }

  async deleteExtension(extId: string) {
    return this.delete<{ success: boolean }>(
      `/api/extensions/${extId}`,
      this.adminHeaders(),
    );
  }

  async refreshManifest(extId: string) {
    return this.post<{ manifest: import('./types.js').ExtensionManifest }>(
      `/api/extensions/${extId}/refresh-manifest`,
      {},
      this.adminHeaders(),
    );
  }

  // --- Connections ---

  async connectExtension(haseefId: string, extId: string, config?: Record<string, unknown>) {
    return this.post<{ success: boolean; connectionId: string }>(
      `/api/haseefs/${haseefId}/extensions/${extId}/connect`,
      { config },
      this.adminHeaders(),
    );
  }

  async disconnectExtension(haseefId: string, extId: string) {
    return this.delete<{ success: boolean }>(
      `/api/haseefs/${haseefId}/extensions/${extId}/disconnect`,
      this.adminHeaders(),
    );
  }

  async listHaseefExtensions(haseefId: string) {
    return this.get<{ extensions: unknown[] }>(
      `/api/haseefs/${haseefId}/extensions`,
      this.adminHeaders(),
    );
  }

  async updateHaseefExtensionConfig(haseefId: string, extId: string, config: Record<string, unknown>) {
    return this.patch<{ success: boolean }>(
      `/api/haseefs/${haseefId}/extensions/${extId}`,
      { config },
      this.adminHeaders(),
    );
  }

  // --- Snapshots ---

  async createSnapshot(haseefId: string) {
    return this.post<{ snapshot: import('./types.js').ConsciousnessSnapshot }>(
      `/api/haseefs/${haseefId}/snapshot`,
      {},
      this.adminHeaders(),
    );
  }

  async listSnapshots(haseefId: string, limit?: number) {
    const qs = limit ? `?limit=${limit}` : '';
    return this.get<{ snapshots: import('./types.js').ConsciousnessSnapshot[] }>(
      `/api/haseefs/${haseefId}/snapshots${qs}`,
      this.adminHeaders(),
    );
  }

  async restoreSnapshot(haseefId: string, snapshotId: string) {
    return this.post<{ success: boolean; restored: { cycleCount: number; tokenEstimate: number } }>(
      `/api/haseefs/${haseefId}/restore`,
      { snapshotId },
      this.adminHeaders(),
    );
  }

  // --- Status ---

  async getStatus() {
    return this.get<import('./types.js').SystemStatus>(
      '/api/status',
      this.adminHeaders(),
    );
  }

  // --- Streams ---

  async streamHaseef(haseefId: string) {
    return this.stream(
      `/api/haseefs/${haseefId}/stream`,
      this.adminHeaders(),
    );
  }
}
