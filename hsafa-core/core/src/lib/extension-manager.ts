import { prisma } from './db.js';
import { tool, jsonSchema, type ToolExecutionOptions } from 'ai';
import { redis } from './redis.js';
import { emitToolWorkerEvent } from './tool-worker-events.js';
import type { HaseefProcessContext } from '../agent-builder/types.js';

// =============================================================================
// Extension Manager (v4)
//
// Handles extension registration, connection to Haseefs, and tool routing.
// Extensions provide senses (events), actions (tools), and instructions
// (prompt guidance) to connected Haseefs.
// =============================================================================

// =============================================================================
// Registration — Create and manage extensions
// =============================================================================

/**
 * Register a new extension with a generated extension key.
 */
export async function registerExtension(params: {
  name: string;
  description?: string;
  instructions?: string;
}): Promise<{ id: string; extensionKey: string }> {
  const extensionKey = `ek_${crypto.randomUUID().replace(/-/g, '')}`;

  const extension = await prisma.extension.create({
    data: {
      name: params.name,
      description: params.description ?? null,
      instructions: params.instructions ?? null,
      extensionKey,
    },
    select: { id: true, extensionKey: true },
  });

  return extension;
}

/**
 * Update an extension's metadata and/or instructions.
 */
export async function updateExtension(
  extensionId: string,
  params: { description?: string; instructions?: string },
): Promise<void> {
  await prisma.extension.update({
    where: { id: extensionId },
    data: {
      ...(params.description !== undefined && { description: params.description }),
      ...(params.instructions !== undefined && { instructions: params.instructions }),
    },
  });
}

// =============================================================================
// Tool Registration — Extensions register their tools
// =============================================================================

export interface ExtensionToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * Sync an extension's tool list. Upserts all provided tools and removes
 * any tools not in the list (full replacement).
 */
export async function syncExtensionTools(
  extensionId: string,
  tools: ExtensionToolDef[],
): Promise<void> {
  // Get existing tool names
  const existing = await prisma.extensionTool.findMany({
    where: { extensionId },
    select: { name: true },
  });
  const existingNames = new Set(existing.map((t) => t.name));
  const newNames = new Set(tools.map((t) => t.name));

  // Delete tools that are no longer in the list
  const toDelete = [...existingNames].filter((n) => !newNames.has(n));
  if (toDelete.length > 0) {
    await prisma.extensionTool.deleteMany({
      where: { extensionId, name: { in: toDelete } },
    });
  }

  // Upsert all tools
  for (const t of tools) {
    await prisma.extensionTool.upsert({
      where: { extensionId_name: { extensionId, name: t.name } },
      create: {
        extensionId,
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema as any,
      },
      update: {
        description: t.description,
        inputSchema: t.inputSchema as any,
      },
    });
  }
}

// =============================================================================
// Connection — Link extensions to Haseefs (agents)
// =============================================================================

/**
 * Connect an extension to a Haseef. Optionally pass per-connection config.
 */
export async function connectExtension(
  haseefId: string,
  extensionId: string,
  config?: Record<string, unknown>,
): Promise<{ id: string }> {
  const connection = await prisma.haseefExtension.upsert({
    where: { haseefId_extensionId: { haseefId, extensionId } },
    create: {
      haseefId,
      extensionId,
      config: (config ?? null) as any,
      enabled: true,
    },
    update: {
      config: config as any,
      enabled: true,
    },
    select: { id: true },
  });

  return connection;
}

/**
 * Disconnect an extension from a Haseef.
 */
export async function disconnectExtension(
  haseefId: string,
  extensionId: string,
): Promise<void> {
  await prisma.haseefExtension.deleteMany({
    where: { haseefId, extensionId },
  });
}

/**
 * Get all connected extensions for a Haseef, with their tools and instructions.
 */
export async function getConnectedExtensions(haseefId: string) {
  return prisma.haseefExtension.findMany({
    where: { haseefId, enabled: true },
    include: {
      extension: {
        include: { tools: true },
      },
    },
  });
}

// =============================================================================
// Tool Building — Build AI SDK tools from connected extensions
// =============================================================================

export interface ExtensionToolsResult {
  tools: Record<string, unknown>;
  instructions: string[];
}

/**
 * Build AI SDK tool objects from all connected extensions' tools.
 * Extension tools are "remote" — when called, they create a PendingToolCall
 * and notify the extension via Redis pub/sub. The extension polls or
 * receives the call, executes it, and returns the result.
 */
export async function buildExtensionTools(
  haseefId: string,
  context: HaseefProcessContext,
  timeout: number = 30_000,
): Promise<ExtensionToolsResult> {
  const connections = await getConnectedExtensions(haseefId);
  const tools: Record<string, unknown> = {};
  const instructions: string[] = [];

  for (const conn of connections) {
    const ext = conn.extension;

    // Collect instructions
    if (ext.instructions) {
      instructions.push(ext.instructions);
    }

    // Build tools
    for (const extTool of ext.tools) {
      const schema = (Object.keys(extTool.inputSchema as object).length > 0)
        ? extTool.inputSchema
        : { type: 'object' as const, properties: {} };

      tools[extTool.name] = tool({
        description: extTool.description,
        inputSchema: jsonSchema<Record<string, unknown>>(schema as any),
        execute: async (args: Record<string, unknown>, options: ToolExecutionOptions) => {
          const toolCallId = options.toolCallId;

          // Create PendingToolCall so the extension can poll for it
          await prisma.pendingToolCall.create({
            data: {
              haseefId: context.haseefId,
              runId: context.currentRunId!,
              toolCallId,
              toolName: extTool.name,
              args: args as any,
              status: 'waiting',
            },
          });

          // Notify via Redis pub/sub (generic tool-workers channel + extension-specific)
          const event = {
            type: 'tool.call' as const,
            toolCallId,
            toolName: extTool.name,
            args,
            runId: context.currentRunId!,
            haseefId: context.haseefId,
            extensionId: ext.id,
            ts: new Date().toISOString(),
          };
          emitToolWorkerEvent(event).catch((err) =>
            console.warn('[extension-manager] Failed to emit tool worker event:', err),
          );
          // Also publish to extension-specific channel
          redis.publish(`ext:${ext.id}:tools`, JSON.stringify(event)).catch((err) =>
            console.warn('[extension-manager] Failed to publish to extension channel:', err),
          );

          // Wait for result with timeout
          const result = await waitForExtensionToolResult(toolCallId, timeout);
          if (result !== null) return result;

          return {
            error: `Extension tool "${extTool.name}" timed out after ${timeout}ms. No result was received.`,
            toolCallId,
          };
        },
      });
    }
  }

  return { tools, instructions };
}

// =============================================================================
// Polling — Extensions poll for pending tool calls
// =============================================================================

/**
 * Get pending tool calls for a specific extension connected to a Haseef.
 * Extensions poll this to discover calls they need to execute.
 */
export async function getPendingToolCalls(
  haseefId: string,
  extensionId: string,
) {
  // Get tool names for this extension
  const extTools = await prisma.extensionTool.findMany({
    where: { extensionId },
    select: { name: true },
  });
  const toolNames = extTools.map((t) => t.name);
  if (toolNames.length === 0) return [];

  // Find pending/waiting calls for this Haseef's tools
  return prisma.pendingToolCall.findMany({
    where: {
      haseefId,
      toolName: { in: toolNames },
      status: { in: ['pending', 'waiting'] },
    },
    orderBy: { createdAt: 'asc' },
  });
}

// =============================================================================
// Verify — Check that an extension is connected to a Haseef
// =============================================================================

/**
 * Verify that an extension is connected to a specific Haseef.
 * Used by routes to enforce access control.
 */
export async function verifyExtensionConnection(
  extensionId: string,
  haseefId: string,
): Promise<boolean> {
  const connection = await prisma.haseefExtension.findUnique({
    where: { haseefId_extensionId: { haseefId, extensionId } },
    select: { enabled: true },
  });
  return connection?.enabled === true;
}

// =============================================================================
// Internal — Wait for extension tool result via Redis pub/sub
// =============================================================================

const TOOL_RESULT_CHANNEL = 'tool-result:';

async function waitForExtensionToolResult(
  toolCallId: string,
  timeoutMs: number,
): Promise<unknown | null> {
  // Check if already resolved
  const existing = await prisma.pendingToolCall.findUnique({ where: { toolCallId } });
  if (existing?.status === 'resolved') return existing.result;

  const Redis = (await import('ioredis')).default;

  return new Promise((resolve) => {
    const channel = `${TOOL_RESULT_CHANNEL}${toolCallId}`;
    const subscriber = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });

    const timer = setTimeout(async () => {
      subscriber.unsubscribe(channel).catch(() => {});
      subscriber.disconnect();

      // Timeout — flip to 'pending' so late results reach agent via inbox
      await prisma.pendingToolCall.updateMany({
        where: { toolCallId, status: 'waiting' },
        data: { status: 'pending' },
      });

      // Final check
      const final = await prisma.pendingToolCall.findUnique({ where: { toolCallId } });
      if (final?.status === 'resolved') {
        resolve(final.result);
      } else {
        resolve(null);
      }
    }, timeoutMs);

    subscriber.subscribe(channel).catch(() => {
      clearTimeout(timer);
      subscriber.disconnect();
      resolve(null);
    });

    subscriber.on('message', (_ch: string, msg: string) => {
      clearTimeout(timer);
      subscriber.unsubscribe(channel).catch(() => {});
      subscriber.disconnect();
      try {
        resolve(JSON.parse(msg));
      } catch {
        resolve(msg);
      }
    });
  });
}
