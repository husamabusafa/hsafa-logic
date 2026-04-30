// =============================================================================
// @hsafa/sdk — HsafaSDK class
// =============================================================================

import type {
  SdkOptions,
  ToolDefinition,
  ToolHandler,
  PushEventPayload,
  SdkEventType,
  SdkEventMap,
  ToolCallContext,
  Haseef,
  CreateHaseefInput,
  UpdateHaseefInput,
  SemanticMemory,
  SemanticMemoryInput,
  EpisodicMemory,
  SocialMemory,
  ProceduralMemory,
  MemoryStats,
  Run,
  ListRunsOptions,
} from './types.js';
import { inputToJsonSchema, parsePartialJson } from './schema.js';

const DEFAULT_RECONNECT_DELAY = 2_000;
const MAX_RECONNECT_DELAY = 30_000;

export class HsafaSDK {
  private readonly coreUrl: string;
  private readonly apiKey: string;
  readonly skill: string;

  private toolHandlers = new Map<string, ToolHandler>();
  private eventListeners = new Map<string, Set<(data: unknown) => void>>();
  private isConnected = false;
  private abortController: AbortController | null = null;

  constructor(opts: SdkOptions) {
    this.coreUrl = opts.coreUrl.replace(/\/$/, '');
    this.apiKey = opts.apiKey;
    this.skill = opts.skill;
  }

  // ── 1. REGISTER ─────────────────────────────────────────────────────────────

  async registerTools(tools: ToolDefinition[]): Promise<void> {
    const body = tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema ?? inputToJsonSchema(t.input ?? {}),
    }));

    const res = await fetch(`${this.coreUrl}/api/skills/${this.skill}/tools`, {
      method: 'PUT',
      headers: { 'x-api-key': this.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tools: body }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`registerTools failed (${res.status}): ${text}`);
    }
  }

  // ── 2. HANDLE ────────────────────────────────────────────────────────────────

  onToolCall(name: string, handler: ToolHandler): void {
    this.toolHandlers.set(name, handler);
  }

  // ── 3. PUSH ──────────────────────────────────────────────────────────────────

  async pushEvent(event: PushEventPayload): Promise<void> {
    const res = await fetch(`${this.coreUrl}/api/events`, {
      method: 'POST',
      headers: { 'x-api-key': this.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ skill: this.skill, ...event }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`pushEvent failed (${res.status}): ${text}`);
    }
  }

  // ── Haseef API ───────────────────────────────────────────────────────────────

  readonly haseef = {
    list: async (): Promise<Haseef[]> => {
      const data = await this.request<{ haseefs: Haseef[] }>('GET', '/api/haseefs');
      return data.haseefs;
    },

    get: async (id: string): Promise<Haseef> => {
      const data = await this.request<{ haseef: Haseef }>('GET', `/api/haseefs/${id}`);
      return data.haseef;
    },

    create: async (input: CreateHaseefInput): Promise<Haseef> => {
      const data = await this.request<{ haseef: Haseef }>('POST', '/api/haseefs', input);
      return data.haseef;
    },

    update: async (id: string, patch: UpdateHaseefInput): Promise<Haseef> => {
      const data = await this.request<{ haseef: Haseef }>('PATCH', `/api/haseefs/${id}`, patch);
      return data.haseef;
    },

    delete: async (id: string): Promise<void> => {
      await this.request<unknown>('DELETE', `/api/haseefs/${id}`);
    },

    getProfile: async (id: string): Promise<Record<string, unknown>> => {
      const data = await this.request<{ profile: Record<string, unknown> }>('GET', `/api/haseefs/${id}/profile`);
      return data.profile ?? {};
    },

    updateProfile: async (id: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> => {
      const data = await this.request<{ profile: Record<string, unknown> }>('PATCH', `/api/haseefs/${id}/profile`, patch);
      return data.profile ?? {};
    },

    addSkill: async (id: string, skillName: string): Promise<Haseef> => {
      const haseef = await this.haseef.get(id);
      const current = haseef.skills ?? [];
      if (current.includes(skillName)) return haseef;
      return this.haseef.update(id, { skills: [...current, skillName] });
    },

    removeSkill: async (id: string, skillName: string): Promise<Haseef> => {
      const haseef = await this.haseef.get(id);
      const current = haseef.skills ?? [];
      if (!current.includes(skillName)) return haseef;
      return this.haseef.update(id, { skills: current.filter((s) => s !== skillName) });
    },

    status: async (id: string): Promise<{ running: boolean; activeRunId: string | null }> => {
      return this.request('GET', `/api/haseefs/${id}/status`);
    },
  };

  // ── Memory API ───────────────────────────────────────────────────────────────

  readonly memory = {
    list: async (haseefId: string): Promise<SemanticMemory[]> => {
      const data = await this.request<{ memories: SemanticMemory[] }>('GET', `/api/memory/${haseefId}/semantic`);
      return data.memories;
    },

    search: async (haseefId: string, query: string, limit = 20): Promise<SemanticMemory[]> => {
      const qs = `?q=${encodeURIComponent(query)}&limit=${limit}`;
      const data = await this.request<{ results: SemanticMemory[] }>('GET', `/api/memory/${haseefId}/semantic/search${qs}`);
      return data.results;
    },

    set: async (haseefId: string, memories: SemanticMemoryInput[]): Promise<{ stored: number }> => {
      return this.request('POST', `/api/memory/${haseefId}/semantic`, { memories });
    },

    delete: async (haseefId: string, keys: string[]): Promise<{ deleted: number }> => {
      return this.request('DELETE', `/api/memory/${haseefId}/semantic`, { keys });
    },

    episodes: async (haseefId: string, limit = 20): Promise<EpisodicMemory[]> => {
      const data = await this.request<{ episodes: EpisodicMemory[] }>('GET', `/api/memory/${haseefId}/episodic?limit=${limit}`);
      return data.episodes;
    },

    searchEpisodes: async (haseefId: string, query: string, limit = 10): Promise<EpisodicMemory[]> => {
      const qs = `?q=${encodeURIComponent(query)}&limit=${limit}`;
      const data = await this.request<{ results: EpisodicMemory[] }>('GET', `/api/memory/${haseefId}/episodic/search${qs}`);
      return data.results;
    },

    social: async (haseefId: string): Promise<SocialMemory[]> => {
      const data = await this.request<{ people: SocialMemory[] }>('GET', `/api/memory/${haseefId}/social`);
      return data.people;
    },

    procedural: async (haseefId: string): Promise<ProceduralMemory[]> => {
      const data = await this.request<{ patterns: ProceduralMemory[] }>('GET', `/api/memory/${haseefId}/procedural`);
      return data.patterns;
    },

    stats: async (haseefId: string): Promise<MemoryStats> => {
      return this.request('GET', `/api/memory/${haseefId}/stats`);
    },
  };

  // ── Runs API ─────────────────────────────────────────────────────────────────

  readonly runs = {
    list: async (opts: ListRunsOptions = {}): Promise<Run[]> => {
      const params = new URLSearchParams();
      if (opts.haseefId) params.set('haseefId', opts.haseefId);
      if (opts.status) params.set('status', opts.status);
      if (opts.limit) params.set('limit', String(opts.limit));
      const qs = params.toString();
      const data = await this.request<{ runs: Run[] }>('GET', `/api/runs${qs ? `?${qs}` : ''}`);
      return data.runs;
    },

    get: async (runId: string): Promise<Run> => {
      const data = await this.request<{ run: Run }>('GET', `/api/runs/${runId}`);
      return data.run;
    },
  };

  // ── 4. LISTEN ────────────────────────────────────────────────────────────────

  on<K extends SdkEventType>(event: K, listener: (data: SdkEventMap[K]) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener as (data: unknown) => void);
  }

  off<K extends SdkEventType>(event: K, listener: (data: SdkEventMap[K]) => void): void {
    this.eventListeners.get(event)?.delete(listener as (data: unknown) => void);
  }

  // ── CONNECT ──────────────────────────────────────────────────────────────────

  connect(): void {
    if (this.isConnected) return;
    this.isConnected = true;
    void this.sseLoop();
  }

  disconnect(): void {
    this.isConnected = false;
    this.abortController?.abort();
    this.abortController = null;
  }

  // ── Internals ────────────────────────────────────────────────────────────────

  private emit(event: string, data: unknown): void {
    const listeners = this.eventListeners.get(event);
    if (!listeners) return;
    for (const l of listeners) {
      try { l(data); } catch { /* swallow listener errors */ }
    }
  }

  private async sseLoop(): Promise<void> {
    let delay = DEFAULT_RECONNECT_DELAY;

    while (this.isConnected) {
      try {
        this.abortController = new AbortController();
        await this.openSSE(this.abortController.signal);
        delay = DEFAULT_RECONNECT_DELAY;
      } catch {
        if (!this.isConnected) break;
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(delay * 2, MAX_RECONNECT_DELAY);
      }
    }
  }

  private async openSSE(signal: AbortSignal): Promise<void> {
    const url = `${this.coreUrl}/api/skills/${this.skill}/actions/stream`;
    const res = await fetch(url, {
      headers: { 'x-api-key': this.apiKey, Accept: 'text/event-stream' },
      signal,
    });

    if (!res.ok || !res.body) {
      throw new Error(`SSE connection failed: ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      let dataLine = '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          dataLine = line.slice(6).trim();
        } else if (line === '' && dataLine) {
          try {
            await this.handleMessage(JSON.parse(dataLine));
          } catch { /* ignore parse errors */ }
          dataLine = '';
        }
      }
    }
  }

  private async handleMessage(msg: Record<string, unknown>): Promise<void> {
    const type = msg.type as string;

    // Lifecycle events → forward to on() listeners
    const lifecycleEvents: SdkEventType[] = [
      'tool.input.start', 'tool.input.delta', 'tool.call',
      'tool.result', 'tool.error', 'run.started', 'run.completed',
    ];
    if (lifecycleEvents.includes(type as SdkEventType)) {
      this.emit(type, msg.data);
      return;
    }

    // Action request → route to onToolCall handler
    if (type === 'action') {
      const { actionId, toolName, args, haseef } = msg as {
        actionId: string;
        toolName: string;
        args: Record<string, unknown>;
        haseef: ToolCallContext['haseef'];
      };

      const handler = this.toolHandlers.get(toolName);
      if (!handler) {
        await this.postResult(actionId, { error: `No handler registered for tool "${toolName}"` });
        return;
      }

      try {
        const result = await handler(args ?? {}, { actionId, haseef });
        await this.postResult(actionId, result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await this.postResult(actionId, { error: message });
      }
    }

    // tool.input.delta with accumulated args for partial parsing
    if (type === 'tool.input.delta.raw') {
      const data = msg.data as { actionId: string; toolName: string; accumulatedText: string; haseef: unknown };
      const partialArgs = parsePartialJson(data.accumulatedText);
      this.emit('tool.input.delta', {
        actionId: data.actionId,
        toolName: data.toolName,
        delta: data.accumulatedText,
        partialArgs,
        haseef: data.haseef,
      });
    }
  }

  private async postResult(actionId: string, result: unknown): Promise<void> {
    try {
      await fetch(`${this.coreUrl}/api/actions/${actionId}/result`, {
        method: 'POST',
        headers: { 'x-api-key': this.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ result }),
      });
    } catch (err) {
      console.error(`[HsafaSDK:${this.skill}] Failed to submit result for action ${actionId}:`, err);
    }
  }

  // Generic typed request helper for Core JSON endpoints.
  private async request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const init: RequestInit = {
      method,
      headers: { 'x-api-key': this.apiKey, 'Content-Type': 'application/json' },
    };
    if (body !== undefined) init.body = JSON.stringify(body);

    const res = await fetch(`${this.coreUrl}${path}`, init);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`${method} ${path} failed (${res.status}): ${text}`);
    }
    if (res.status === 204) return undefined as T;
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) return undefined as T;
    return (await res.json()) as T;
  }
}
