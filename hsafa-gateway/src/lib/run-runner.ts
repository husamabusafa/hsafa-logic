import { Prisma } from '@prisma/client';
import { prisma } from './db.js';
import { createEmitEvent, handleRunError, type EmitEventFn } from './run-events.js';
import { buildAgent, AgentBuildError } from '../agent-builder/builder.js';
import { closeMCPClients } from '../agent-builder/mcp-resolver.js';
import type { AgentConfig } from '../agent-builder/types.js';
import { emitSmartSpaceEvent } from './smartspace-events.js';
import { createSmartSpaceMessage } from './smartspace-db.js';
import { triggerAgentsInSmartSpace } from './agent-trigger.js';
import { loadRunContext } from './run-context.js';
import { buildModelMessages } from './prompt-builder.js';
import { processStream } from './stream-processor.js';

/**
 * Run Runner - Orchestrator
 * 
 * Coordinates the run lifecycle:
 * 1. Load run + agent config
 * 2. Build agent (model + tools)
 * 3. Load context (members, goals, memories, etc.)
 * 4. Build model messages (normal or goToSpace)
 * 5. Stream AI response, emitting events to Redis/SmartSpace
 * 6. Persist assistant message + trigger other agents
 */

export async function executeRun(runId: string): Promise<void> {
  const run = await prisma.run.findUnique({
    where: { id: runId },
    select: {
      id: true,
      smartSpaceId: true,
      agentEntityId: true,
      agentId: true,
      triggeredById: true,
      status: true,
      startedAt: true,
      metadata: true,
    },
  });

  if (!run) {
    return;
  }

  const { emitEvent: emitRunEvent } = await createEmitEvent(runId);

  // Event context includes entity info for multi-entity support
  // All subscribers can see which entity (agent) produced each event
  const eventContext = {
    runId,
    entityId: run.agentEntityId,
    entityType: 'agent' as const,
    agentEntityId: run.agentEntityId, // backwards compat
  };

  const emitEvent: EmitEventFn = async (type, payload) => {
    await emitRunEvent(type, payload);
    try {
      await emitSmartSpaceEvent(run.smartSpaceId, type, payload, eventContext);
    } catch (err) {
      console.error(`[run-runner] emitSmartSpaceEvent FAILED for ${type}:`, err);
    }
  };

  try {
    if (run.status === 'completed' || run.status === 'failed' || run.status === 'canceled') {
      return;
    }

    await prisma.run.update({
      where: { id: runId },
      data: {
        status: 'running',
        startedAt: run.startedAt ?? new Date(),
      },
    });

    await emitEvent('run.started', { status: 'running' });

    // ── 1. Load agent config ──────────────────────────────────────────────

    const agent = await prisma.agent.findUnique({
      where: { id: run.agentId },
      select: { configJson: true },
    });

    if (!agent) {
      throw new Error('Agent not found');
    }

    const config = agent.configJson as unknown as AgentConfig;
    const isGoToSpaceRun = !!(run.metadata as any)?.originSmartSpaceId;
    const isPlanRun = !!(run.metadata as any)?.isPlanRun;

    // ── 2. Build agent (model + tools) ────────────────────────────────────

    const built = await buildAgent({
      config,
      runContext: {
        runId,
        agentEntityId: run.agentEntityId,
        smartSpaceId: run.smartSpaceId,
        agentId: run.agentId,
        isGoToSpaceRun,
      },
    });

    // ── 3. Load context + build messages ──────────────────────────────────

    const ctx = await loadRunContext(run);
    let modelMessages = await buildModelMessages(ctx);

    // If resuming from waiting_tool, inject the tool-call + tool-result
    // into the conversation so the agent sees what happened.
    const isResuming = run.status === 'waiting_tool';
    const runMeta = (run.metadata && typeof run.metadata === 'object') ? run.metadata as Record<string, unknown> : {};

    if (isResuming) {
      const pendingTools = (runMeta.pendingClientTools ?? []) as Array<{ toolCallId: string; toolName: string; args: unknown }>;
      const toolResults = (runMeta.clientToolResults ?? {}) as Record<string, unknown>;

      if (pendingTools.length > 0) {
        // Construct model messages directly in AI SDK v6 format:
        // - tool-call uses `input` (not `args`)
        // - tool-result uses `output` wrapped as { type: 'json', value: ... }
        modelMessages.push({
          role: 'assistant' as const,
          content: pendingTools.map((tc) => ({
            type: 'tool-call' as const,
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            input: tc.args,
          })),
        } as any);

        modelMessages.push({
          role: 'tool' as const,
          content: pendingTools.map((tc) => {
            const raw = toolResults[tc.toolCallId] ?? { error: 'No result received' };
            return {
              type: 'tool-result' as const,
              toolCallId: tc.toolCallId,
              toolName: tc.toolName,
              output: typeof raw === 'string'
                ? { type: 'text' as const, value: raw }
                : { type: 'json' as const, value: raw },
            };
          }),
        } as any);
      }
    }

    // ── 4. Stream AI response ─────────────────────────────────────────────

    const streamResult = await built.agent.stream({ messages: modelMessages });
    const messageId = `msg-${runId}-${Date.now()}`;

    const { orderedParts, finalText, skipped, pendingClientToolCalls } = await processStream(
      streamResult.fullStream,
      messageId,
      runId,
      emitEvent,
    );

    // Clean up MCP clients after streaming completes
    if (built.mcpClients.length > 0) {
      await closeMCPClients(built.mcpClients);
    }

    // ── 5. Handle skip (agent chose not to respond) ───────────────────────

    if (skipped) {
      await prisma.run.update({
        where: { id: runId },
        data: { status: 'canceled', completedAt: new Date() },
      });
      await emitEvent('run.canceled', { reason: 'skip' });
      return;
    }

    // ── 5b. Handle pending client tool calls ──────────────────────────────
    // Stream ended with tool calls that have no server-side execute.
    // Store in run metadata and pause — client will submit results, then we resume.

    if (pendingClientToolCalls.length > 0 && !isPlanRun) {
      await prisma.run.update({
        where: { id: runId },
        data: {
          status: 'waiting_tool',
          metadata: {
            ...runMeta,
            pendingClientTools: pendingClientToolCalls,
            clientToolResults: {},
            waitingParts: orderedParts,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      await emitEvent('run.waiting_tool', {
        status: 'waiting_tool',
        pendingToolCalls: pendingClientToolCalls.map((tc) => ({
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
        })),
      });

      return;
    }

    // ── 6. Persist message + emit completion events ───────────────────────

    await prisma.run.update({
      where: { id: runId },
      data: { status: 'completed', completedAt: new Date() },
    });

    // Build the final assistant message.
    // When resuming from waiting_tool, prepend the tool-call + tool-result parts.
    let combinedParts = orderedParts;
    if (isResuming) {
      const waitingParts = (runMeta.waitingParts ?? []) as Array<{ type: string; [key: string]: unknown }>;
      const toolResults = (runMeta.clientToolResults ?? {}) as Record<string, unknown>;

      // Enrich old tool-call parts with their results
      const enriched = waitingParts.map((p) => {
        if (p.type === 'tool-call' && typeof p.toolCallId === 'string' && toolResults[p.toolCallId] !== undefined) {
          return { ...p, result: toolResults[p.toolCallId] };
        }
        return p;
      });

      // Add tool-result parts
      const resultParts = Object.entries(toolResults).map(([callId, result]) => ({
        type: 'tool-result',
        toolCallId: callId,
        toolName: (enriched.find((p) => p.toolCallId === callId)?.toolName as string) ?? '',
        result,
      }));

      combinedParts = [...enriched, ...resultParts, ...orderedParts];
    }

    const assistantMessage = {
      id: messageId,
      role: 'assistant',
      parts: combinedParts.length > 0 ? combinedParts : [{ type: 'text', text: finalText ?? '' }],
    };

    // Plan runs: agent is not in a space, so don't persist a message or trigger agents.
    // The agent uses goToSpace to interact — those child runs handle their own messages.
    if (!isPlanRun) {
      // For goToSpace child runs, attach provenance so future runs know why this message exists
      const messageMetadata: Record<string, unknown> = { uiMessage: assistantMessage };
      if (isGoToSpaceRun) {
        const meta = run.metadata as any;
        messageMetadata.provenance = {
          originSpaceId: meta?.originSmartSpaceId,
          originSpaceName: meta?.originSmartSpaceName,
          instruction: meta?.instruction,
          parentRunId: meta?.parentRunId,
        };
      }

      const dbMessage = await createSmartSpaceMessage({
        smartSpaceId: run.smartSpaceId,
        entityId: run.agentEntityId,
        role: 'assistant',
        content: finalText,
        metadata: messageMetadata as unknown as Prisma.InputJsonValue,
        runId,
      });

      // Use DB record ID so SSE event message IDs match messages.list() results
      const emittedMessage = { ...assistantMessage, id: dbMessage.id };

      await emitSmartSpaceEvent(
        run.smartSpaceId,
        'smartSpace.message',
        { message: emittedMessage },
        { runId, agentEntityId: run.agentEntityId }
      );

      await emitEvent('message.assistant', { message: emittedMessage });
    }
    
    // Emit finish with full message
    await emitEvent('finish', { messageId, message: assistantMessage });
    
    await emitEvent('run.completed', { status: 'completed', text: finalText });

    // ── 7. Trigger other agents ───────────────────────────────────────────
    // Skip triggering for goToSpace child runs and plan runs
    if (!isGoToSpaceRun && !isPlanRun) {
      const triggerDepth = (run.metadata as any)?.triggerDepth ?? 0;
      await triggerAgentsInSmartSpace({
        smartSpaceId: run.smartSpaceId,
        senderEntityId: run.agentEntityId,
        triggerDepth,
      });
    }
  } catch (error) {
    if (error instanceof AgentBuildError) {
      await emitRunEvent('agent.build.error', { error: error.message });
    }

    await handleRunError(runId, error, emitRunEvent);

    try {
      await emitSmartSpaceEvent(run.smartSpaceId, 'run.failed', {
        runId,
        error: error instanceof Error ? error.message : String(error),
      });
    } catch {
      // ignore
    }
  }
}
