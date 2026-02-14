import { Prisma } from '@prisma/client';
import { prisma } from './db.js';
import { createEmitEvent, handleRunError } from './run-events.js';
import { buildAgent, AgentBuildError } from '../agent-builder/builder.js';
import { closeMCPClients } from '../agent-builder/mcp-resolver.js';
import type { AgentConfig } from '../agent-builder/types.js';
import { delegateToAgent, type TriggerContext } from './agent-trigger.js';
import { loadRunContext } from './run-context.js';
import { buildModelMessages } from './prompt-builder.js';
import { processStream } from './stream-processor.js';

/**
 * Run Runner — General-Purpose Runs
 *
 * Runs are standalone — they do NOT affect any space directly.
 * The agent's LLM text output is internal reasoning/planning.
 * All visible communication happens through sendSpaceMessage (prebuilt tool),
 * which streams text to target spaces via tool-input-delta interception.
 *
 * The trigger space is like any other space — no special relay.
 */

export async function executeRun(runId: string): Promise<void> {
  const run = await prisma.run.findUnique({
    where: { id: runId },
    select: {
      id: true,
      agentEntityId: true,
      agentId: true,
      triggeredById: true,
      status: true,
      startedAt: true,
      metadata: true,
      triggerType: true,
      triggerSpaceId: true,
      triggerMessageContent: true,
      triggerSenderEntityId: true,
      triggerSenderName: true,
      triggerSenderType: true,
      triggerMentionReason: true,
      triggerServiceName: true,
      triggerPayload: true,
      triggerPlanId: true,
      triggerPlanName: true,
    },
  });

  if (!run) {
    return;
  }

  // Run events go ONLY to the run stream — never relayed to any space.
  // Spaces are affected exclusively through sendSpaceMessage tool.
  const { emitEvent } = await createEmitEvent(runId);

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

    // ── 2. Load context ──────────────────────────────────────────────────

    const ctx = await loadRunContext(run);

    // ── 3. Build agent (model + tools) ────────────────────────────────────

    const built = await buildAgent({
      config,
      runContext: {
        runId,
        agentEntityId: run.agentEntityId,
        agentId: run.agentId,
        triggerSpaceId: run.triggerSpaceId ?? undefined,
        isAdminAgent: ctx.isAdminAgent,
        isMultiAgentSpace: ctx.isMultiAgentSpace,
      },
    });

    // ── 4. Build messages ─────────────────────────────────────────────────

    let modelMessages = await buildModelMessages(ctx);

    // If resuming from waiting_tool, inject the tool-call + tool-result
    const isResuming = run.status === 'waiting_tool';
    const runMeta = (run.metadata && typeof run.metadata === 'object') ? run.metadata as Record<string, unknown> : {};

    if (isResuming) {
      const pendingTools = (runMeta.pendingClientTools ?? []) as Array<{ toolCallId: string; toolName: string; args: unknown }>;
      const toolResults = (runMeta.clientToolResults ?? {}) as Record<string, unknown>;

      if (pendingTools.length > 0) {
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

    // ── 5. Stream AI response ─────────────────────────────────────────────

    const streamResult = await built.agent.stream({ messages: modelMessages });
    const messageId = `msg-${runId}-${Date.now()}`;

    const { finalText, skipped, pendingClientToolCalls, delegateSignal } = await processStream(
      streamResult.fullStream,
      messageId,
      runId,
      emitEvent,
      { agentEntityId: run.agentEntityId },
    );

    // Clean up MCP clients after streaming completes
    if (built.mcpClients.length > 0) {
      await closeMCPClients(built.mcpClients);
    }

    // ── 6. Handle skip / delegate ─────────────────────────────────────────

    if (skipped) {
      await prisma.run.update({
        where: { id: runId },
        data: { status: 'canceled', completedAt: new Date() },
      });

      // Delegate: cancel this run, re-trigger target agent with ORIGINAL trigger context
      if (delegateSignal && run.triggerSpaceId) {
        await emitEvent('run.canceled', { reason: 'delegate', targetAgentEntityId: delegateSignal.targetAgentEntityId });

        const targetMembership = await prisma.smartSpaceMembership.findUnique({
          where: { smartSpaceId_entityId: { smartSpaceId: run.triggerSpaceId, entityId: delegateSignal.targetAgentEntityId } },
          include: { entity: { select: { agentId: true } } },
        });

        if (targetMembership?.entity.agentId) {
          const originalTrigger: TriggerContext = {
            triggerType: (run.triggerType as TriggerContext['triggerType']) ?? 'space_message',
            triggerSpaceId: run.triggerSpaceId ?? undefined,
            triggerMessageContent: run.triggerMessageContent ?? undefined,
            triggerSenderEntityId: run.triggerSenderEntityId ?? undefined,
            triggerSenderName: run.triggerSenderName ?? undefined,
            triggerSenderType: (run.triggerSenderType as 'human' | 'agent') ?? undefined,
          };

          await delegateToAgent({
            originalTrigger,
            targetAgentEntityId: delegateSignal.targetAgentEntityId,
            targetAgentId: targetMembership.entity.agentId,
            originalTriggeredById: run.triggeredById ?? undefined,
          });
        }
        return;
      }

      // Plain skip
      await emitEvent('run.canceled', { reason: 'skip' });
      return;
    }

    // ── 7. Handle pending client tool calls ───────────────────────────────

    if (pendingClientToolCalls.length > 0) {
      await prisma.run.update({
        where: { id: runId },
        data: {
          status: 'waiting_tool',
          metadata: {
            ...runMeta,
            pendingClientTools: pendingClientToolCalls,
            clientToolResults: {},
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

    // ── 8. Complete the run ───────────────────────────────────────────────

    const completionMeta: Record<string, unknown> = { ...runMeta };
    if (finalText) {
      completionMeta.summary = finalText;
    }

    await prisma.run.update({
      where: { id: runId },
      data: {
        status: 'completed',
        completedAt: new Date(),
        metadata: completionMeta as unknown as Prisma.InputJsonValue,
      },
    });

    await emitEvent('finish', { messageId });
    await emitEvent('run.completed', { status: 'completed' });
  } catch (error) {
    if (error instanceof AgentBuildError) {
      await emitEvent('agent.build.error', { error: error.message });
    }

    await handleRunError(runId, error, emitEvent);
  }
}
