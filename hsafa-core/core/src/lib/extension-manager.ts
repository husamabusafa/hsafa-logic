import { prisma } from './db.js';
import { tool, jsonSchema, type ToolExecutionOptions } from 'ai';
import type { HaseefProcessContext } from '../agent-builder/types.js';

// =============================================================================
// Extension Manager (v4 — Manifest + Webhook)
//
// Extensions are generic, stateless HTTP servers. Core manages their lifecycle:
//   - Install: POST url → Core fetches GET {url}/manifest, caches it
//   - Tool calls: Core POSTs to {url}/webhook with { type: 'tool_call', ... }
//                 Extension returns result synchronously in the HTTP response
//   - Lifecycle: Core notifies extension of haseef.connected / disconnected /
//                config_updated via POST {url}/webhook
//   - Sense events: Extension pushes to Core via POST /api/haseefs/:id/senses
//
// No Redis pub/sub for tool calls, no PendingToolCall for extension tools,
// no polling endpoints. Simple request/response.
// =============================================================================

const EXTENSION_TOOL_TIMEOUT = 60_000; // 60s HTTP timeout for webhook calls

// =============================================================================
// Manifest Types
// =============================================================================

export interface ExtensionManifest {
  name: string;
  description?: string;
  version?: string;
  tools: Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }>;
  instructions?: string;
  configSchema?: Record<string, unknown>;
  events?: string[];
}

// =============================================================================
// Manifest Fetching
// =============================================================================

/**
 * Fetch the manifest from an extension's URL.
 * Extensions serve their manifest at GET {url}/manifest.
 */
export async function fetchManifest(url: string): Promise<ExtensionManifest> {
  const manifestUrl = `${url.replace(/\/$/, '')}/manifest`;
  const res = await fetch(manifestUrl, {
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch manifest from ${manifestUrl}: ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as ExtensionManifest;
}

// =============================================================================
// Webhook Notifications
// =============================================================================

/**
 * Send a webhook event to an extension.
 * Used for lifecycle events (haseef.connected, haseef.disconnected, haseef.config_updated)
 * and tool_call events.
 */
export async function notifyExtension(
  extensionUrl: string,
  payload: Record<string, unknown>,
  timeoutMs: number = 10_000,
): Promise<unknown> {
  const webhookUrl = `${extensionUrl.replace(/\/$/, '')}/webhook`;

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Webhook to ${webhookUrl} failed: ${res.status} ${text}`);
  }

  return res.json().catch(() => ({ ok: true }));
}

// =============================================================================
// Extension Registration & Management
// =============================================================================

/**
 * Install an extension from its URL in one step (§1.1).
 * Fetches the manifest, derives name/description/instructions from it,
 * registers the extension, and sends an extension.installed webhook.
 */
export async function installExtension(
  url: string,
): Promise<{ extension: any; extensionKey: string; manifest: ExtensionManifest }> {
  const manifest = await fetchManifest(url);

  if (!manifest.name) {
    throw new Error('Manifest must include a "name" field');
  }

  // Check for duplicate name
  const existing = await prisma.extension.findUnique({ where: { name: manifest.name } });
  if (existing) {
    throw new Error(`Extension "${manifest.name}" already exists`);
  }

  const extensionKey = `ek_${crypto.randomUUID().replace(/-/g, '')}`;

  const extension = await prisma.extension.create({
    data: {
      name: manifest.name,
      description: manifest.description ?? null,
      url,
      instructions: manifest.instructions ?? null,
      extensionKey,
      manifest: manifest as any,
    },
  });

  // §1.3: Send extension.installed lifecycle webhook
  notifyExtension(url, {
    type: 'extension.installed',
    extensionId: extension.id,
    extensionKey,
  }).catch((err) => console.warn(`[ext-manager] extension.installed webhook failed:`, err));

  return { extension, extensionKey, manifest };
}

/**
 * Register a new extension. Generates a unique extensionKey for auth.
 * If a URL is provided, fetches the manifest and caches it.
 */
export async function registerExtension(data: {
  name: string;
  description?: string;
  instructions?: string;
  url?: string;
}): Promise<{ extension: any; extensionKey: string }> {
  const extensionKey = `ek_${crypto.randomUUID().replace(/-/g, '')}`;

  let manifest: ExtensionManifest | null = null;
  let instructions = data.instructions ?? null;

  // If URL provided, fetch manifest
  if (data.url) {
    manifest = await fetchManifest(data.url);
    // Use manifest instructions if none provided explicitly
    if (!instructions && manifest.instructions) {
      instructions = manifest.instructions;
    }
  }

  const extension = await prisma.extension.create({
    data: {
      name: data.name,
      description: data.description ?? manifest?.description ?? null,
      url: data.url ?? null,
      instructions,
      extensionKey,
      manifest: manifest ? (manifest as any) : undefined,
    },
  });

  return { extension, extensionKey };
}

/**
 * Update extension metadata (name, description, instructions, url).
 */
export async function updateExtension(
  extensionId: string,
  data: { name?: string; description?: string; instructions?: string; url?: string },
): Promise<any> {
  return prisma.extension.update({
    where: { id: extensionId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.instructions !== undefined && { instructions: data.instructions }),
      ...(data.url !== undefined && { url: data.url }),
    },
  });
}

/**
 * Refresh an extension's manifest from its URL.
 */
export async function refreshManifest(extensionId: string): Promise<ExtensionManifest> {
  const ext = await prisma.extension.findUniqueOrThrow({
    where: { id: extensionId },
  });

  if (!ext.url) {
    throw new Error('Extension has no URL configured');
  }

  const manifest = await fetchManifest(ext.url);

  await prisma.extension.update({
    where: { id: extensionId },
    data: {
      manifest: manifest as any,
      // Update instructions from manifest if extension has no custom instructions
      ...(!ext.instructions && manifest.instructions ? { instructions: manifest.instructions } : {}),
    },
  });

  return manifest;
}

// =============================================================================
// Haseef ↔ Extension Connection
// =============================================================================

/**
 * Connect an extension to a Haseef. Sends haseef.connected lifecycle webhook.
 */
export async function connectExtension(
  haseefId: string,
  extensionId: string,
  config?: Record<string, unknown>,
): Promise<any> {
  const connection = await prisma.haseefExtension.upsert({
    where: {
      haseefId_extensionId: { haseefId, extensionId },
    },
    create: {
      haseefId,
      extensionId,
      config: config ? (config as any) : undefined,
    },
    update: {
      config: config ? (config as any) : undefined,
      enabled: true,
    },
    include: {
      extension: { select: { url: true } },
      haseef: { select: { name: true } },
    },
  });

  // Notify extension via lifecycle webhook
  if (connection.extension.url) {
    notifyExtension(connection.extension.url, {
      type: 'haseef.connected',
      haseefId,
      haseefName: connection.haseef.name,
      config: config ?? null,
    }).catch((err) => console.warn(`[ext-manager] haseef.connected webhook failed:`, err));
  }

  return connection;
}

/**
 * Disconnect an extension from a Haseef. Sends haseef.disconnected lifecycle webhook.
 */
export async function disconnectExtension(
  haseefId: string,
  extensionId: string,
): Promise<void> {
  // Look up extension URL before deleting
  const ext = await prisma.extension.findUnique({
    where: { id: extensionId },
    select: { url: true },
  });

  const haseef = await prisma.haseef.findUnique({
    where: { id: haseefId },
    select: { name: true },
  });

  await prisma.haseefExtension.deleteMany({
    where: { haseefId, extensionId },
  });

  // Notify extension via lifecycle webhook
  if (ext?.url) {
    notifyExtension(ext.url, {
      type: 'haseef.disconnected',
      haseefId,
      haseefName: haseef?.name ?? haseefId,
    }).catch((err) => console.warn(`[ext-manager] haseef.disconnected webhook failed:`, err));
  }
}

/**
 * Update a Haseef ↔ Extension connection config. Sends haseef.config_updated webhook.
 */
export async function updateExtensionConfig(
  haseefId: string,
  extensionId: string,
  config: Record<string, unknown>,
): Promise<any> {
  const connection = await prisma.haseefExtension.update({
    where: {
      haseefId_extensionId: { haseefId, extensionId },
    },
    data: {
      config: config as any,
    },
    include: {
      extension: { select: { url: true } },
      haseef: { select: { name: true } },
    },
  });

  // Notify extension via lifecycle webhook
  if (connection.extension.url) {
    notifyExtension(connection.extension.url, {
      type: 'haseef.config_updated',
      haseefId,
      haseefName: connection.haseef.name,
      config,
    }).catch((err) => console.warn(`[ext-manager] haseef.config_updated webhook failed:`, err));
  }

  return connection;
}

/**
 * Get all extensions connected to a Haseef.
 */
export async function getConnectedExtensions(haseefId: string): Promise<any[]> {
  const connections = await prisma.haseefExtension.findMany({
    where: { haseefId, enabled: true },
    include: {
      extension: {
        select: {
          id: true,
          name: true,
          url: true,
          instructions: true,
          manifest: true,
        },
      },
    },
  });

  return connections;
}

// =============================================================================
// Build AI SDK Tools from Extensions
// =============================================================================

interface ExtensionToolsResult {
  tools: Record<string, unknown>;
  instructions: string[];
}

/**
 * Build AI SDK–compatible tools from all extensions connected to a Haseef.
 * Each extension tool executes via synchronous HTTP POST to the extension's
 * webhook endpoint. No PendingToolCall, no Redis pub/sub.
 */
export async function buildExtensionTools(
  haseefId: string,
  context: HaseefProcessContext,
): Promise<ExtensionToolsResult> {
  const connections = await prisma.haseefExtension.findMany({
    where: { haseefId, enabled: true },
    include: {
      extension: true,
    },
  });

  const tools: Record<string, unknown> = {};
  const instructions: string[] = [];

  for (const conn of connections) {
    const ext = conn.extension;
    const manifest = ext.manifest as ExtensionManifest | null;

    // Collect extension instructions
    if (ext.instructions) {
      instructions.push(ext.instructions);
    }

    // Get tools from manifest
    const manifestTools = manifest?.tools ?? [];

    if (!ext.url) {
      console.warn(`[ext-manager] Extension "${ext.name}" has no URL — skipping tool registration`);
      continue;
    }

    const extensionUrl = ext.url;
    const extensionConfig = conn.config as Record<string, unknown> | null;

    // Build a tool for each manifest tool
    for (const mt of manifestTools) {
      const schema = mt.inputSchema as Record<string, unknown>;
      const inputSchema = jsonSchema<Record<string, unknown>>(
        Object.keys(schema).length > 0
          ? schema
          : { type: 'object' as const, properties: {} }
      );

      tools[mt.name] = tool({
        description: mt.description,
        inputSchema,
        execute: async (args: Record<string, unknown>, options: ToolExecutionOptions) => {
          const toolCallId = options.toolCallId;

          try {
            // Synchronous HTTP POST to extension webhook
            const result = await notifyExtension(
              extensionUrl,
              {
                type: 'tool_call',
                toolCallId,
                toolName: mt.name,
                args,
                haseefId: context.haseefId,
                haseefName: context.haseefName,
                runId: context.currentRunId,
                config: extensionConfig,
              },
              EXTENSION_TOOL_TIMEOUT,
            );

            return result;
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            console.error(`[ext-manager] Tool "${mt.name}" webhook failed:`, errMsg);
            return {
              error: `Extension tool "${mt.name}" failed: ${errMsg}`,
              toolCallId,
            };
          }
        },
      });
    }
  }

  return { tools, instructions };
}

// =============================================================================
// Verification Helpers
// =============================================================================

/**
 * Verify that an extension is connected to a specific Haseef.
 */
export async function verifyExtensionConnection(
  extensionId: string,
  haseefId: string,
): Promise<boolean> {
  const connection = await prisma.haseefExtension.findUnique({
    where: {
      haseefId_extensionId: { haseefId, extensionId },
    },
  });
  return !!connection;
}
