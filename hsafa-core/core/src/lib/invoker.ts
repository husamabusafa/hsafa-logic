import { streamText, hasToolCall, stepCountIs, type ToolSet } from 'ai';
import { prisma } from './db.js';
import { resolveModel } from './model-registry.js';
import { buildV7Tools, type V7ToolRow, type V7HaseefContext } from './tool-builder.js';
import { buildSystemPrompt } from './prompt-builder.js';
import { assembleMemory } from '../memory/selection.js';
import { reflect } from '../memory/reflection.js';
import { publishTextDelta, publishRunEvent, publishToolEvent } from './stream-publisher.js';
import { emitLifecycleToScope } from './tool-dispatcher.js';

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

const HaseefConfigSchema = z.object({
  model: z.object({
    provider: z.string(),
    model: z.string(),
    apiKey: z.string().optional(),
    reasoning: z.object({
      enabled: z.boolean().optional(),
      effort: z.enum(['low', 'medium', 'high']).optional(),
      summary: z.enum(['auto', 'always', 'never']).optional(),
    }).optional(),
  }),
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
  triggerScope: string;
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
  const { haseefId, runId, triggerScope, triggerType, triggerData, signal } = opts;
  const startedAt = Date.now();

  // ── 1. Load haseef from DB ────────────────────────────────────────────────
  const haseef = await prisma.haseef.findUnique({
    where: { id: haseefId },
    select: {
      id: true,
      name: true,
      description: true,
      profileJson: true,
      configJson: true,
      scopes: true,
    },
  });

  if (!haseef) {
    console.error(`[invoker] Haseef ${haseefId} not found`);
    return;
  }

  const config = HaseefConfigSchema.parse(haseef.configJson);

  // ── 2. Create run record ──────────────────────────────────────────────────
  await prisma.run.create({
    data: {
      id: runId,
      haseefId,
      triggerScope,
      triggerType,
      status: 'running' as any,
    },
  });

  publishRunEvent(haseefId, runId, 'run.started', { triggerScope, triggerType });

  // Emit run.started to all active scopes
  for (const scope of haseef.scopes) {
    emitLifecycleToScope(scope, 'run.started', {
      runId,
      haseef: { id: haseefId, name: haseef.name },
      triggerScope,
      triggerType,
    });
  }

  try {
    // ── 3. Assemble memory ────────────────────────────────────────────────────
    const memory = await assembleMemory({
      haseefId,
      triggerType,
      triggerData,
    });

    // ── 4. Build system prompt ────────────────────────────────────────────────
    const systemPrompt = buildSystemPrompt({
      haseefId: haseef.id,
      haseefName: haseef.name,
      description: haseef.description ?? undefined,
      profileJson: haseef.profileJson as Record<string, unknown> | null,
      scopes: haseef.scopes,
      instructions: config.instructions,
      memory,
      persona: config.persona,
    });

    // ── 5. Build tools ────────────────────────────────────────────────────────
    const haseefCtx: V7HaseefContext = {
      id: haseef.id,
      name: haseef.name,
      profile: (haseef.profileJson as Record<string, unknown>) ?? {},
      scopes: haseef.scopes,
    };

    // Load global scope tools for this haseef's active scopes
    const scopeTools = await loadScopeTools(haseef.scopes);
    const v7Tools = buildV7Tools(haseefCtx, scopeTools, config.actionTimeout);

    // Build prebuilt tools
    const prebuiltTools = {
      done: doneTool,
      set_memories: buildSetMemoriesTool(haseefId),
      delete_memories: buildDeleteMemoriesTool(haseefId),
      recall_memories: buildRecallMemoriesTool(haseefId),
    };

    const allTools = { ...prebuiltTools, ...v7Tools } as ToolSet;

    // ── 6. Resolve model ──────────────────────────────────────────────────────
    const model = resolveModel(config.model);

    // ── 7. Build user message from event ──────────────────────────────────────
    const userMessage = formatEventAsMessage(triggerScope, triggerType, triggerData, opts.attachments);

    // ── 8. streamText with AI SDK v6 ────────────────────────────────────────
    const toolsUsed: string[] = [];

    const result = streamText({
      model: model as any,
      system: systemPrompt,
      messages: [{ role: 'user' as const, content: userMessage }] as any,
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

    // ── 9. Extract usage ──────────────────────────────────────────────────────
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

    // ── 10. Finalize run ──────────────────────────────────────────────────────
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

    // Emit run.completed to all active scopes
    for (const scope of haseef.scopes) {
      emitLifecycleToScope(scope, 'run.completed', {
        runId,
        haseef: { id: haseefId, name: haseef.name },
        summary: runSummary,
        durationMs,
      });
    }

    // ── 11. Post-run reflection ─────────────────────────────────────────────
    if (runSummary && !signal.aborted) {
      await reflect({
        haseefId,
        runId,
        triggerScope,
        triggerType,
        toolsUsed: [...new Set(toolsUsed)],
        summary: runSummary,
      });
    }
  } catch (err) {
    if (signal.aborted) {
      // Expected — run was interrupted by coordinator
      await prisma.run.update({
        where: { id: runId },
        data: {
          status: 'interrupted' as any,
          durationMs: Date.now() - startedAt,
          completedAt: new Date(),
          errorMessage: 'Interrupted by new event',
        },
      });
      return;
    }

    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[invoker] Run ${runId} failed:`, errMsg);

    await prisma.run.update({
      where: { id: runId },
      data: {
        status: 'failed' as any,
        errorMessage: errMsg,
        durationMs: Date.now() - startedAt,
        completedAt: new Date(),
      },
    });

    publishRunEvent(haseefId, runId, 'run.failed', { error: errMsg });
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Load ScopeTool rows for the given scope names.
 */
async function loadScopeTools(scopeNames: string[]): Promise<V7ToolRow[]> {
  if (scopeNames.length === 0) return [];

  const tools = await prisma.scopeTool.findMany({
    where: {
      scope: { name: { in: scopeNames } },
    },
    select: {
      name: true,
      description: true,
      inputSchema: true,
      scope: { select: { name: true } },
    },
  });

  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
    scopeName: t.scope.name,
  }));
}

/**
 * Format a trigger event as a user message for the LLM.
 */
function formatEventAsMessage(
  scope: string,
  type: string,
  data: Record<string, unknown>,
  attachments?: Array<{ type: string; mimeType: string; url?: string; base64?: string; name?: string }>,
): string {
  const parts: string[] = [];

  parts.push(`[EVENT from ${scope}] type: ${type}`);

  // Format data as readable key-value pairs
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      parts.push(`${key}: ${value}`);
    } else {
      parts.push(`${key}: ${JSON.stringify(value)}`);
    }
  }

  if (attachments && attachments.length > 0) {
    parts.push(`attachments: ${attachments.map((a) => `[${a.type}: ${a.name ?? a.mimeType}]`).join(', ')}`);
  }

  return parts.join('\n');
}
