import { streamText, hasToolCall, stepCountIs, type ToolSet } from 'ai';
import { prisma } from './db.js';
import { resolveModel } from './model-registry.js';
import { buildV7Tools, type V7ToolRow, type V7HaseefContext } from './tool-builder.js';
import { buildSystemPrompt } from './prompt-builder.js';
import { assembleMemory } from '../memory/selection.js';
import { reflect } from '../memory/reflection.js';
import { publishTextDelta, publishRunEvent, publishToolEvent } from './stream-publisher.js';
import { emitLifecycleToSkill } from './tool-dispatcher.js';

import { doneTool } from '../prebuilt-tools/done.js';
import { buildSetMemoriesTool } from '../prebuilt-tools/set-memories.js';
import { buildDeleteMemoriesTool } from '../prebuilt-tools/delete-memories.js';
import { buildRecallMemoriesTool } from '../prebuilt-tools/recall-memories.js';

import { z } from 'zod';

// =============================================================================
// Invoker (v7)
//
// The think loop: perceive → think → act → remember.
// Each invocation is stateless — loads config fresh from DB, assembles memory,
// builds prompt + tools, runs streamText(), handles tool calls, and reflects.
// =============================================================================

const MAX_STEPS = 50;

// ---------------------------------------------------------------------------
// Model config can be either an object { provider, model } or a string
// "provider:model" (e.g. "openrouter:openai/gpt-5.4-mini").
// ---------------------------------------------------------------------------
const ModelConfigSchema = z.union([
  z.string().transform((s: string) => {
    const idx = s.indexOf(':');
    if (idx === -1) {
      // No colon — assume openrouter (common for shorthand IDs like openai/gpt-5)
      return { provider: 'openrouter', model: s };
    }
    return { provider: s.slice(0, idx), model: s.slice(idx + 1) };
  }),
  z.object({
    provider: z.string(),
    model: z.string(),
    apiKey: z.string().optional(),
    reasoning: z.object({
      enabled: z.boolean().optional(),
      effort: z.enum(['low', 'medium', 'high']).optional(),
      summary: z.enum(['auto', 'always', 'never']).optional(),
    }).optional(),
  }),
]);

const HaseefConfigSchema = z.object({
  model: ModelConfigSchema,
  instructions: z.string().optional(),
  persona: z.object({
    name: z.string(),
    description: z.string(),
    style: z.string().optional(),
    traits: z.array(z.string()).optional(),
  }).optional(),
  actionTimeout: z.number().optional(),
});

export interface InvokeOptions {
  haseefId: string;
  haseefName: string;
  runId: string;
  triggerSkill: string;
  triggerType: string;
  triggerData: Record<string, unknown>;
  attachments?: Array<{ type: string; mimeType: string; url?: string; base64?: string; name?: string }>;
  signal: AbortSignal;
}

/**
 * Run a single invocation for a haseef.
 * This is the core think loop.
 */
export async function invoke(opts: InvokeOptions): Promise<void> {
  const { haseefId, runId, triggerSkill, triggerType, triggerData, signal } = opts;
  const startedAt = Date.now();
  let runCreated = false;

  console.log(`[invoker] Starting run ${runId} for haseef ${haseefId}`);

  // ── 1. Load haseef from DB ────────────────────────────────────────────────
  const haseef = await prisma.haseef.findUnique({
    where: { id: haseefId },
    select: {
      id: true,
      name: true,
      description: true,
      profileJson: true,
      configJson: true,
      skills: true,
    },
  });

  if (!haseef) {
    console.error(`[invoker] Haseef ${haseefId} not found — aborting run ${runId}`);
    return;
  }
  console.log(`[invoker] Loaded haseef "${haseef.name}" (${haseefId})`);

  // ── 2. Parse config (defensive — logs exact failure reason) ───────────────
  const configResult = HaseefConfigSchema.safeParse(haseef.configJson);
  if (!configResult.success) {
    console.error(
      `[invoker] Invalid configJson for haseef "${haseef.name}". ` +
      `configJson type=${typeof haseef.configJson} value=`,
      haseef.configJson,
    );
    console.error('[invoker] Zod issues:', configResult.error.issues.map((i: { path: (string | number)[]; message: string }) => `${i.path.join('.')}: ${i.message}`).join('; '));
    return;
  }
  const config = configResult.data;
  console.log(`[invoker] Parsed config: model=${config.model.provider}:${config.model.model}`);

  // ── 3. Create run record ──────────────────────────────────────────────────
  try {
    await prisma.run.create({
      data: {
        id: runId,
        haseefId,
        triggerSkill,
        triggerType,
        status: 'running' as any,
      },
    });
    runCreated = true;
    console.log(`[invoker] Run ${runId} persisted in DB`);
  } catch (dbErr: any) {
    console.error(`[invoker] Failed to persist run ${runId}:`, dbErr.message ?? dbErr);
    return;
  }

  publishRunEvent(haseefId, runId, 'run.started', { triggerSkill, triggerType });

  // Emit run.started to all active skills
  for (const skill of haseef.skills) {
    emitLifecycleToSkill(skill, 'run.started', {
      runId,
      haseef: { id: haseefId, name: haseef.name },
      triggerSkill,
      triggerType,
    });
  }
  console.log(`[invoker] Emitted run.started to ${haseef.skills.length} skill(s): ${haseef.skills.join(', ')}`);

  try {
    // ── 4. Assemble memory ────────────────────────────────────────────────────
    console.log(`[invoker] Assembling memory…`);
    const memory = await assembleMemory({
      haseefId,
      triggerType,
      triggerData,
    });

    // ── 5. Build system prompt ────────────────────────────────────────────────
    const systemPrompt = buildSystemPrompt({
      haseefId: haseef.id,
      haseefName: haseef.name,
      description: haseef.description ?? undefined,
      profileJson: haseef.profileJson as Record<string, unknown> | null,
      skills: haseef.skills,
      instructions: config.instructions,
      memory,
      persona: config.persona,
    });

    // ── 6. Build tools ────────────────────────────────────────────────────────
    const haseefCtx: V7HaseefContext = {
      id: haseef.id,
      name: haseef.name,
      profile: (haseef.profileJson as Record<string, unknown>) ?? {},
      skills: haseef.skills,
    };

    // Load global skill tools for this haseef's active skills
    const skillTools = await loadSkillTools(haseef.skills);
    const v7Tools = buildV7Tools(haseefCtx, skillTools, config.actionTimeout);

    // Build prebuilt tools
    const prebuiltTools = {
      done: doneTool,
      set_memories: buildSetMemoriesTool(haseefId),
      delete_memories: buildDeleteMemoriesTool(haseefId),
      recall_memories: buildRecallMemoriesTool(haseefId),
    };

    const allTools = { ...prebuiltTools, ...v7Tools } as ToolSet;
    const toolNames = Object.keys(allTools);
    console.log(`[invoker] Tools available: ${toolNames.join(', ')}`);

    // ── 7. Resolve model ──────────────────────────────────────────────────────
    console.log(`[invoker] Resolving model ${config.model.provider}:${config.model.model}…`);
    const model = resolveModel(config.model);

    // ── 8. Build user message from event ──────────────────────────────────────
    const userContent = formatEventAsMessage(triggerSkill, triggerType, triggerData, opts.attachments);

    // ── 9. streamText with AI SDK v6 ────────────────────────────────────────
    console.log(`[invoker] Calling LLM…`);
    const toolsUsed: string[] = [];

    const result = streamText({
      model: model as any,
      system: systemPrompt,
      messages: [{ role: 'user' as const, content: userContent }] as any,
      tools: allTools as any,
      toolChoice: 'required' as any,
      stopWhen: [hasToolCall('done'), stepCountIs(MAX_STEPS)] as any,
      toolCallStreaming: true,
      abortSignal: signal,
      providerOptions: {
        openai: { parallelToolCalls: false },
        anthropic: { parallelToolCalls: false },
      },
    } as any);

    // Stream text deltas + tool events to Redis Pub/Sub
    let runSummary: string | undefined;

    for await (const part of result.fullStream) {
      if (signal.aborted) break;

      const p = part as any;
      if (p.type === 'text-delta') {
        publishTextDelta(haseefId, runId, p.text ?? p.textDelta ?? '');
      } else if (p.type === 'tool-call') {
        toolsUsed.push(p.toolName);
        console.log(`[invoker] Tool call: ${p.toolName}`);
        publishToolEvent(haseefId, runId, 'tool.call', {
          toolName: p.toolName,
          args: p.args ?? p.input,
        });
        // Detect done tool
        if (p.toolName === 'done') {
          const args = p.args ?? p.input;
          runSummary = args?.summary;
        }
      } else if (p.type === 'tool-result') {
        publishToolEvent(haseefId, runId, 'tool.result', {
          toolName: p.toolName,
          result: p.result ?? p.output,
        });
      }
    }

    console.log(`[invoker] Stream ended. Tools used: ${[...new Set(toolsUsed)].join(', ') || '(none)'}`);

    // ── 10. Extract usage ──────────────────────────────────────────────────────
    let promptTokens = 0;
    let completionTokens = 0;
    let stepCount = 0;

    try {
      const response = await result.response;
      const usage = (response as any)?.usage;
      if (usage) {
        promptTokens = typeof usage.inputTokens === 'object'
          ? usage.inputTokens?.total ?? 0
          : usage.inputTokens ?? usage.promptTokens ?? 0;
        completionTokens = typeof usage.outputTokens === 'object'
          ? usage.outputTokens?.total ?? 0
          : usage.outputTokens ?? usage.completionTokens ?? 0;
      }
      stepCount = (response as any)?.messages?.length ?? toolsUsed.length;
    } catch {
      stepCount = toolsUsed.length;
    }

    // ── 11. Finalize run ──────────────────────────────────────────────────────
    const durationMs = Date.now() - startedAt;
    const status = signal.aborted ? 'interrupted' : 'completed';

    await prisma.run.update({
      where: { id: runId },
      data: {
        status: status as any,
        summary: runSummary,
        stepCount,
        promptTokens,
        completionTokens,
        durationMs,
        completedAt: new Date(),
      },
    });

    publishRunEvent(haseefId, runId, status === 'interrupted' ? 'run.interrupted' : 'run.completed', {
      summary: runSummary,
      stepCount,
      durationMs,
      promptTokens,
      completionTokens,
    });

    // Emit run.completed to all active skills
    for (const skill of haseef.skills) {
      emitLifecycleToSkill(skill, 'run.completed', {
        runId,
        haseef: { id: haseefId, name: haseef.name },
        summary: runSummary,
        durationMs,
      });
    }

    console.log(`[invoker] Run ${runId} finalized — status: ${status}`);

    // ── 12. Post-run reflection ─────────────────────────────────────────────
    if (runSummary && !signal.aborted) {
      await reflect({
        haseefId,
        runId,
        triggerSkill,
        triggerType,
        toolsUsed: [...new Set(toolsUsed)],
        summary: runSummary,
      });
    }
  } catch (err) {
    if (signal.aborted) {
      // Expected — run was interrupted by coordinator
      if (runCreated) {
        await prisma.run.update({
          where: { id: runId },
          data: {
            status: 'interrupted' as any,
            durationMs: Date.now() - startedAt,
            completedAt: new Date(),
            errorMessage: 'Interrupted by new event',
          },
        }).catch(() => {});
      }
      return;
    }

    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[invoker] Run ${runId} failed:`, errMsg);

    if (runCreated) {
      await prisma.run.update({
        where: { id: runId },
        data: {
          status: 'failed' as any,
          errorMessage: errMsg,
          durationMs: Date.now() - startedAt,
          completedAt: new Date(),
        },
      }).catch(() => {});
    }

    publishRunEvent(haseefId, runId, 'run.failed', { error: errMsg });
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Load SkillTool rows for the given skill names.
 */
async function loadSkillTools(skillNames: string[]): Promise<V7ToolRow[]> {
  if (skillNames.length === 0) return [];

  const tools = await prisma.skillTool.findMany({
    where: {
      skill: { name: { in: skillNames } },
    },
    select: {
      name: true,
      description: true,
      inputSchema: true,
      skill: { select: { name: true } },
    },
  });

  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
    skillName: t.skill.name,
  }));
}

/**
 * Format a trigger event as a user message for the LLM.
 * Returns an array of content parts for multimodal support (text + images/files).
 */
function formatEventAsMessage(
  skill: string,
  type: string,
  data: Record<string, unknown>,
  attachments?: Array<{ type: string; mimeType: string; url?: string; base64?: string; name?: string }>,
): Array<{ type: 'text'; text: string } | { type: 'image'; image: string } | { type: 'file'; data: string; mediaType: string; filename?: string }> {
  const textParts: string[] = [];

  textParts.push(`[EVENT from ${skill}] type: ${type}`);

  // Format data as readable key-value pairs
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      textParts.push(`${key}: ${value}`);
    } else {
      textParts.push(`${key}: ${JSON.stringify(value)}`);
    }
  }

  if (attachments && attachments.length > 0) {
    textParts.push(`attachments: ${attachments.map((a) => `[${a.type}: ${a.name ?? a.mimeType}]`).join(', ')}`);
  }

  const content: ReturnType<typeof formatEventAsMessage> = [
    { type: 'text', text: textParts.join('\n') },
  ];

  // Add images as content parts
  for (const a of attachments ?? []) {
    if (a.type === 'image' && a.url) {
      content.push({ type: 'image', image: a.url });
    } else if (a.type === 'image' && a.base64) {
      content.push({ type: 'image', image: `data:${a.mimeType};base64,${a.base64}` });
    } else if (a.base64) {
      // File (audio, pdf, etc.)
      content.push({
        type: 'file',
        data: `data:${a.mimeType};base64,${a.base64}`,
        mediaType: a.mimeType,
        filename: a.name,
      });
    }
  }

  return content;
}
