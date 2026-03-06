// =============================================================================
// Hsafa — Main SDK Class
//
// Two modes:
//   - Extension mode: new Hsafa({ coreUrl, extensionKey })
//     → me(), pushSense(), onStream()
//   - Admin mode: new Hsafa({ coreUrl, secretKey })
//     → haseefs.*, extensions.*, status()
//   - Both: new Hsafa({ coreUrl, extensionKey, secretKey })
//
// Usage:
//   const hsafa = new Hsafa({ coreUrl: 'http://localhost:3001', extensionKey: 'ek_...' });
//   const info = await hsafa.me();
//   await hsafa.pushSense(haseefId, event);
// =============================================================================

import { CoreClient } from './core-client.js';
import type {
  HsafaOptions,
  ExtensionInfo,
  SenseEvent,
  Haseef,
  Extension,
  ExtensionManifest,
  ConsciousnessSnapshot,
  SystemStatus,
  StreamEvent,
  Run,
} from './types.js';

// =============================================================================
// Haseefs Resource (admin)
// =============================================================================

class HaseefsResource {
  constructor(private client: CoreClient) {}

  async list(): Promise<Haseef[]> {
    const res = await this.client.listHaseefs();
    return res.haseefs;
  }

  async get(haseefId: string): Promise<Haseef> {
    const res = await this.client.getHaseef(haseefId);
    return res.haseef;
  }

  async create(data: { name: string; description?: string; configJson: Record<string, unknown> }) {
    return this.client.createHaseef(data);
  }

  async update(haseefId: string, data: { name?: string; description?: string; configJson?: Record<string, unknown> }) {
    return this.client.updateHaseef(haseefId, data);
  }

  async delete(haseefId: string) {
    return this.client.deleteHaseef(haseefId);
  }

  /** Trigger a haseef via external service event */
  async trigger(haseefId: string, serviceName: string, payload?: unknown) {
    return this.client.triggerHaseef(haseefId, serviceName, payload);
  }

  async connectExtension(haseefId: string, extId: string, config?: Record<string, unknown>) {
    return this.client.connectExtension(haseefId, extId, config);
  }

  async disconnectExtension(haseefId: string, extId: string) {
    return this.client.disconnectExtension(haseefId, extId);
  }

  async listExtensions(haseefId: string) {
    return this.client.listHaseefExtensions(haseefId);
  }

  async updateExtensionConfig(haseefId: string, extId: string, config: Record<string, unknown>) {
    return this.client.updateHaseefExtensionConfig(haseefId, extId, config);
  }

  async createSnapshot(haseefId: string): Promise<ConsciousnessSnapshot> {
    const res = await this.client.createSnapshot(haseefId);
    return res.snapshot;
  }

  async listSnapshots(haseefId: string, limit?: number): Promise<ConsciousnessSnapshot[]> {
    const res = await this.client.listSnapshots(haseefId, limit);
    return res.snapshots;
  }

  async restoreSnapshot(haseefId: string, snapshotId: string) {
    return this.client.restoreSnapshot(haseefId, snapshotId);
  }
}

// =============================================================================
// Runs Resource (admin / any-auth)
// =============================================================================

class RunsResource {
  constructor(private client: CoreClient) {}

  async list(options?: { limit?: number; status?: string; haseefId?: string }): Promise<Run[]> {
    const res = await this.client.listRuns(options);
    return res.runs;
  }

  async get(runId: string): Promise<Run> {
    const res = await this.client.getRun(runId);
    return res.run;
  }

  async events(runId: string) {
    return this.client.getRunEvents(runId);
  }

  async submitToolResult(runId: string, callId: string, result: unknown) {
    return this.client.submitToolResult(runId, callId, result);
  }
}

// =============================================================================
// Extensions Resource (admin)
// =============================================================================

class ExtensionsResource {
  constructor(private client: CoreClient) {}

  async install(url: string) {
    return this.client.installExtension(url);
  }

  async register(data: { name: string; url?: string; description?: string; instructions?: string }) {
    return this.client.registerExtension(data);
  }

  async list(): Promise<Extension[]> {
    const res = await this.client.listExtensions();
    return res.extensions;
  }

  async get(extId: string): Promise<Extension> {
    const res = await this.client.getExtension(extId);
    return res.extension;
  }

  async update(extId: string, data: { description?: string; instructions?: string; url?: string }) {
    return this.client.updateExtension(extId, data);
  }

  async delete(extId: string) {
    return this.client.deleteExtension(extId);
  }

  async refreshManifest(extId: string): Promise<ExtensionManifest> {
    const res = await this.client.refreshManifest(extId);
    return res.manifest;
  }
}

// =============================================================================
// Hsafa Main Class
// =============================================================================

export class Hsafa {
  private client: CoreClient;

  /** Admin: manage haseefs (create, list, get, update, delete, trigger, extensions, snapshots) */
  readonly haseefs: HaseefsResource;
  /** Admin: manage extensions (install, register, list, update, delete) */
  readonly extensions: ExtensionsResource;
  /** Runs: list, get, events, tool results */
  readonly runs: RunsResource;

  constructor(private options: HsafaOptions) {
    this.client = new CoreClient(options);
    this.haseefs = new HaseefsResource(this.client);
    this.extensions = new ExtensionsResource(this.client);
    this.runs = new RunsResource(this.client);
  }

  // ---------------------------------------------------------------------------
  // Extension-mode methods
  // ---------------------------------------------------------------------------

  /** Self-discovery: get this extension's info and connected haseefs */
  async me(): Promise<ExtensionInfo> {
    const res = await this.client.getMe();
    return res.extension;
  }

  /** Push a sense event to a haseef's inbox */
  async pushSense(haseefId: string, event: SenseEvent): Promise<void> {
    await this.client.pushSense(haseefId, event);
  }

  /** Push multiple sense events to a haseef's inbox */
  async pushSenses(haseefId: string, events: SenseEvent[]): Promise<void> {
    await this.client.pushSenses(haseefId, events);
  }

  // ---------------------------------------------------------------------------
  // Admin-mode methods
  // ---------------------------------------------------------------------------

  /** Get system observability status (admin) */
  async status(): Promise<SystemStatus> {
    return this.client.getStatus();
  }

  /** Health check (no auth required) */
  async health() {
    return this.client.health();
  }

  // ---------------------------------------------------------------------------
  // Streaming
  // ---------------------------------------------------------------------------

  /**
   * Subscribe to a haseef's real-time event stream (SSE).
   * Returns an async iterable of StreamEvents.
   * Call controller.abort() to disconnect.
   */
  async onStream(
    haseefId: string,
    handler: (event: StreamEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const response = await this.client.streamHaseef(haseefId);
    await Hsafa.consumeSSE(response, handler, signal);
  }

  /**
   * Subscribe to a run's real-time event stream (SSE).
   * Call controller.abort() to disconnect.
   */
  async onRunStream(
    runId: string,
    handler: (event: StreamEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const response = await this.client.streamRun(runId);
    await Hsafa.consumeSSE(response, handler, signal);
  }

  // ---------------------------------------------------------------------------
  // SSE consumer helper
  // ---------------------------------------------------------------------------

  private static async consumeSSE(
    response: Response,
    handler: (event: StreamEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const body = response.body;
    if (!body) throw new Error('No response body for stream');

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const processLines = () => {
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const event = JSON.parse(line.slice(6)) as StreamEvent;
            handler(event);
          } catch {
            // Skip malformed JSON
          }
        }
      }
    };

    try {
      while (true) {
        if (signal?.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        processLines();
      }
    } finally {
      reader.releaseLock();
    }
  }
}
