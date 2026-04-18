// =============================================================================
// Skill Instance Manager
//
// Manages the lifecycle of skill instances:
//   - On boot: loads all active instances, creates SDK connections
//   - On create: validates config, creates SDK, registers tools
//   - On delete: disconnects SDK, destroys handler
//   - On update: reconnects with new config
//
// Each instance gets its own HsafaSDK connection and handler.
// Tools are prefixed with the instance name (e.g. "production_db_query").
// =============================================================================

import { HsafaSDK } from "@hsafa/sdk";
import { prisma } from "../db.js";
import { getTemplate, getAllTemplates } from "./templates/index.js";
import type {
  SkillHandler,
  ToolCallContext,
  SenseLoopContext,
  SenseEventPayload,
  SenseEventPusher,
} from "./types.js";

interface ManagedInstance {
  instanceId: string;
  instanceName: string;
  templateName: string;
  sdk: HsafaSDK;
  handler: SkillHandler;
}

/** Active SDK connections keyed by instance ID */
const instances = new Map<string, ManagedInstance>();

/** Core config — set during boot */
let coreUrl: string;
let secretKey: string;

// =============================================================================
// Boot — seed templates + connect active instances
// =============================================================================

export async function bootSkillManager(config: { coreUrl: string; secretKey: string }): Promise<void> {
  coreUrl = config.coreUrl;
  secretKey = config.secretKey;

  // 1. Seed/sync templates into DB
  await seedTemplates();

  // 2. Load all active instances and connect them
  const activeInstances = await prisma.skillInstance.findMany({
    where: { status: "active" },
    include: { template: true },
  });

  for (const inst of activeInstances) {
    try {
      await connectInstance(inst.id, inst.name, inst.template.name, inst.config as Record<string, unknown>);
      console.log(`[skill-manager] Connected instance "${inst.name}" (template: ${inst.template.name})`);
    } catch (err) {
      console.error(`[skill-manager] Failed to connect instance "${inst.name}":`, err);
      await prisma.skillInstance.update({
        where: { id: inst.id },
        data: { status: "error", statusMessage: err instanceof Error ? err.message : String(err) },
      });
    }
  }

  console.log(`[skill-manager] Boot complete — ${instances.size} skill instances connected`);
}

// =============================================================================
// Seed Templates — upsert all prebuilt templates into DB
// =============================================================================

async function seedTemplates(): Promise<void> {
  const templates = getAllTemplates();

  for (const tmpl of templates) {
    await prisma.skillTemplate.upsert({
      where: { name: tmpl.name },
      create: {
        name: tmpl.name,
        displayName: tmpl.displayName,
        description: tmpl.description,
        category: tmpl.category,
        configSchema: tmpl.configSchema as any,
        toolDefinitions: tmpl.tools as any,
        instructions: tmpl.instructions,
        iconUrl: tmpl.iconUrl,
      },
      update: {
        displayName: tmpl.displayName,
        description: tmpl.description,
        category: tmpl.category,
        configSchema: tmpl.configSchema as any,
        toolDefinitions: tmpl.tools as any,
        instructions: tmpl.instructions,
        iconUrl: tmpl.iconUrl,
      },
    });
  }

  console.log(`[skill-manager] Seeded ${templates.length} skill templates`);
}

// =============================================================================
// Connect Instance — create SDK + handler, register prefixed tools
// =============================================================================

async function connectInstance(
  instanceId: string,
  instanceName: string,
  templateName: string,
  config: Record<string, unknown>,
): Promise<void> {
  const template = getTemplate(templateName);
  if (!template) throw new Error(`Unknown template: ${templateName}`);

  // Create handler with instance config
  const handler = template.createHandler(config);

  // Create SDK connection
  const sdk = new HsafaSDK({
    coreUrl,
    apiKey: secretKey,
    skill: instanceName,
  });

  // Register tools with instance name prefix
  const toolDefs = template.tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));

  await sdk.registerTools(toolDefs);

  // Wire tool call handlers
  for (const tool of template.tools) {
    sdk.onToolCall(tool.name, async (args, ctx) => {
      const toolCtx: ToolCallContext = {
        haseefId: ctx.haseef.id,
        haseefName: ctx.haseef.name,
        actionId: ctx.actionId,
        instanceName,
        haseefProfile: (ctx.haseef.profile ?? {}) as Record<string, unknown>,
      };
      return handler.execute(tool.name, args as Record<string, unknown>, toolCtx);
    });
  }

  // Connect SSE
  sdk.connect();

  instances.set(instanceId, {
    instanceId,
    instanceName,
    templateName,
    sdk,
    handler,
  });

  // Start the handler's background sense loop, if any.
  if (handler.startSenseLoop) {
    const senseCtx = buildSenseLoopContext(instanceId, instanceName, sdk);
    try {
      await handler.startSenseLoop(senseCtx);
    } catch (err) {
      console.warn(`[skill-manager] startSenseLoop failed for "${instanceName}":`, err);
    }
  }
}

// =============================================================================
// Sense Loop Context builder
// =============================================================================

function buildSenseLoopContext(
  instanceId: string,
  instanceName: string,
  sdk: HsafaSDK,
): SenseLoopContext {
  const pushEvent: SenseEventPusher = async (haseefId, event) => {
    try {
      await sdk.pushEvent({
        type: event.type,
        data: event.data,
        attachments: event.attachments,
        haseefId,
      });
    } catch (err) {
      console.warn(
        `[skill-manager] pushEvent(${event.type}) failed for haseef=${haseefId.slice(0, 8)} instance="${instanceName}":`,
        err,
      );
    }
  };

  const getAttachedHaseefs = async (): Promise<string[]> => {
    const links = await prisma.haseefSkill.findMany({
      where: { instanceId, isActive: true },
      select: { haseefId: true },
    });
    return links.map((l: { haseefId: string }) => l.haseefId);
  };

  const broadcast = async (event: SenseEventPayload) => {
    const haseefs = await getAttachedHaseefs();
    await Promise.all(haseefs.map((id) => pushEvent(id, event)));
  };

  const getHaseefProfile = async (haseefId: string): Promise<Record<string, unknown>> => {
    try {
      const res = await fetch(`${coreUrl}/api/haseefs/${haseefId}/profile`, {
        headers: { "x-api-key": secretKey },
      });
      if (!res.ok) return {};
      const body = (await res.json()) as { profile?: Record<string, unknown> | null };
      return body.profile ?? {};
    } catch (err) {
      console.warn(
        `[skill-manager] getHaseefProfile(${haseefId.slice(0, 8)}) failed for instance="${instanceName}":`,
        err,
      );
      return {};
    }
  };

  return { instanceName, pushEvent, broadcast, getAttachedHaseefs, getHaseefProfile };
}

// =============================================================================
// Disconnect Instance
// =============================================================================

async function disconnectInstance(instanceId: string): Promise<void> {
  const inst = instances.get(instanceId);
  if (!inst) return;

  // Stop sense loop first so it doesn't try to push via a closing SDK.
  try {
    await inst.handler.stopSenseLoop?.();
  } catch (err) {
    console.warn(`[skill-manager] stopSenseLoop error for "${inst.instanceName}":`, err);
  }

  try {
    inst.sdk.disconnect();
  } catch { /* best effort */ }

  try {
    await inst.handler.destroy?.();
  } catch { /* best effort */ }

  instances.delete(instanceId);
}

// =============================================================================
// Public API — used by routes
// =============================================================================

/**
 * Create a new skill instance, connect it, and return the DB record.
 */
export async function createInstance(params: {
  name: string;
  displayName: string;
  templateName: string;
  config: Record<string, unknown>;
  userId: string;
}): Promise<{ instance: any }> {
  const { name, displayName, templateName, config, userId } = params;

  const template = getTemplate(templateName);
  if (!template) throw new Error(`Unknown template: ${templateName}`);

  // Look up template DB record
  const templateRecord = await prisma.skillTemplate.findUnique({
    where: { name: templateName },
  });
  if (!templateRecord) throw new Error(`Template "${templateName}" not found in DB`);

  // Create DB record
  const instance = await prisma.skillInstance.create({
    data: {
      name,
      displayName,
      templateId: templateRecord.id,
      config: config as any,
      userId,
      status: "active",
    },
    include: { template: true },
  });

  // Connect
  try {
    await connectInstance(instance.id, instance.name, templateName, config);
  } catch (err) {
    await prisma.skillInstance.update({
      where: { id: instance.id },
      data: { status: "error", statusMessage: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }

  return { instance };
}

/**
 * Delete a skill instance and disconnect its SDK.
 */
export async function deleteInstance(instanceId: string): Promise<void> {
  await disconnectInstance(instanceId);

  // Remove all haseef-skill links
  await prisma.haseefSkill.deleteMany({ where: { instanceId } });

  // Delete instance
  await prisma.skillInstance.delete({ where: { id: instanceId } });
}

/**
 * Update instance config and reconnect.
 */
export async function updateInstanceConfig(
  instanceId: string,
  config: Record<string, unknown>,
): Promise<{ instance: any }> {
  const dbInstance = await prisma.skillInstance.findUnique({
    where: { id: instanceId },
    include: { template: true },
  });
  if (!dbInstance) throw new Error("Instance not found");

  // Disconnect old
  await disconnectInstance(instanceId);

  // Update config in DB
  const updated = await prisma.skillInstance.update({
    where: { id: instanceId },
    data: { config: config as any, status: "active", statusMessage: null },
    include: { template: true },
  });

  // Reconnect with new config
  try {
    await connectInstance(updated.id, updated.name, updated.template.name, config);
  } catch (err) {
    await prisma.skillInstance.update({
      where: { id: instanceId },
      data: { status: "error", statusMessage: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }

  return { instance: updated };
}

/**
 * Check if an instance is connected.
 */
export function isInstanceConnected(instanceId: string): boolean {
  return instances.has(instanceId);
}

/**
 * Get count of connected instances.
 */
export function getConnectedInstanceCount(): number {
  return instances.size;
}
