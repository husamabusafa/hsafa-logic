import { streamText, stepCountIs, type LanguageModel } from 'ai';
import type Redis from 'ioredis';
import { prisma } from './db.js';
import { createBlockingRedis } from './redis.js';
import { drainInbox, waitForInbox, formatInboxEvents, peekInbox, formatInboxPreview } from './inbox.js';
import {
  loadConsciousness,
  saveConsciousness,
  compactConsciousness,
  refreshSystemPrompt,
  type ModelMessage,
} from './consciousness.js';
import { processStream } from './stream-processor.js';
import { emitSmartSpaceEvent } from './smartspace-events.js';
import { buildAgent } from '../agent-builder/builder.js';
import { buildSystemPrompt } from '../agent-builder/prompt-builder.js';
import type { AgentProcessContext, InboxEvent } from '../agent-builder/types.js';

// =============================================================================
// Agent Process (v3)
//
// The persistent while(true) loop: sleep → wake → think → act → sleep.
// One process per agent. Replaces the stateless run-runner from v2.
// =============================================================================

const DEFAULT_MAX_STEPS = 20;

export interface AgentProcessOptions {
  agentId: string;
  agentEntityId: string;
  agentName: string;
  signal: AbortSignal;
}

/**
 * The core agent process loop.
 * Runs indefinitely until the abort signal fires.
 *
 * Lifecycle:
 * 1. Load consciousness from DB
 * 2. Block on inbox (BRPOP — zero CPU sleep)
 * 3. Drain all pending events
 * 4. Refresh system prompt
 * 5. Inject inbox events as user message
 * 6. streamText (think cycle)
 * 7. Process stream (streaming to spaces)
 * 8. Append new messages to consciousness
 * 9. Compact if over budget
 * 10. Save consciousness
 * 11. Loop back to step 2
 */
export async function startAgentProcess(options: AgentProcessOptions): Promise<void> {
  const { agentId, agentEntityId, agentName, signal } = options;

  // Dedicated Redis connection for blocking BRPOP
  const blockingRedis: Redis = createBlockingRedis();

  // Load consciousness
  let { messages: consciousness, cycleCount } = await loadConsciousness(agentEntityId);

  // Load agent config for tool building and model resolution
  const agent = await prisma.agent.findUniqueOrThrow({
    where: { id: agentId },
    include: {
      entity: {
        include: {
          smartSpaceMemberships: {
            include: {
              smartSpace: {
                include: {
                  memberships: {
                    include: { entity: { select: { id: true, displayName: true, type: true } } },
                  },
                },
              },
            },
          },
          memories: true,
          goals: true,
          plans: { where: { status: 'pending' } },
        },
      },
    },
  });

  // Mutable active space — in-memory only (not persisted in v3)
  let activeSpaceId: string | null = null;

  // Build process context
  const context: AgentProcessContext = {
    agentEntityId,
    agentName,
    agentId,
    cycleCount,
    currentRunId: null,
    getActiveSpaceId: () => activeSpaceId,
    setActiveSpaceId: (spaceId: string) => { activeSpaceId = spaceId; },
  };

  // Build tools and model (once — rebuilt if config changes)
  const built = await buildAgent(agent.configJson as any, context);

  console.log(`[agent-process] ${agentName} (${agentEntityId}) started — cycle ${cycleCount}`);

  // ── Main loop ─────────────────────────────────────────────────────────────

  while (!signal.aborted) {
    try {
      // 1. SLEEP — block until inbox has events
      const firstEvent = await waitForInbox(agentEntityId, blockingRedis, signal);
      if (signal.aborted || !firstEvent) break;

      // 2. DRAIN — pull all pending events
      const remainingEvents = await drainInbox(agentEntityId);
      const allEvents: InboxEvent[] = [firstEvent, ...remainingEvents];

      if (allEvents.length === 0) continue;

      // Reset active space each cycle (agent must enter_space explicitly)
      activeSpaceId = null;
      cycleCount++;
      context.cycleCount = cycleCount;

      // 3. CREATE AUDIT RECORD — Run record for this think cycle
      const run = await prisma.run.create({
        data: {
          agentEntityId,
          agentId,
          status: 'running',
          cycleNumber: cycleCount,
          inboxEventCount: allEvents.length,
          triggerType: allEvents[0].type,
          triggerSpaceId: allEvents[0].type === 'space_message'
            ? (allEvents[0].data as any).spaceId
            : undefined,
          triggerEntityId: allEvents[0].type === 'space_message'
            ? (allEvents[0].data as any).senderEntityId
            : undefined,
          triggerMessageId: allEvents[0].type === 'space_message'
            ? (allEvents[0].data as any).messageId
            : undefined,
          triggerPayload: allEvents[0].type === 'service'
            ? (allEvents[0].data as any).payload
            : undefined,
        },
      });
      context.currentRunId = run.id;

      const cycleStart = Date.now();

      // 4. EMIT agent.active to all spaces
      await emitAgentStatus(agentEntityId, 'active', { runId: run.id, agentName });

      // 5. REFRESH system prompt
      const systemPrompt = await buildSystemPrompt(agentId, agentEntityId, agentName);
      consciousness = refreshSystemPrompt(consciousness, systemPrompt);

      // 6. INJECT inbox events as user message
      const inboxMessage: ModelMessage = {
        role: 'user',
        content: formatInboxEvents(allEvents),
      };
      consciousness.push(inboxMessage);

      // 7. THINK — one streamText call
      const maxSteps = (agent.configJson as any)?.loop?.maxSteps ?? DEFAULT_MAX_STEPS;

      const agentConfig = agent.configJson as any;
      const result = streamText({
        model: built.model as LanguageModel,
        messages: consciousness as any,
        tools: built.tools as any,
        temperature: agentConfig?.model?.temperature,
        maxOutputTokens: agentConfig?.model?.maxTokens,
        stopWhen: stepCountIs(maxSteps),
        prepareStep: async ({ stepNumber }) => {
          // Mid-cycle inbox awareness (lightweight preview)
          if (stepNumber === 0) return {};

          const pending = await peekInbox(agentEntityId, 5);
          if (pending.length === 0) return {};

          return {
            messages: [{
              role: 'user' as const,
              content: formatInboxPreview(pending),
            }],
          };
        },
      });

      // 8. PROCESS STREAM — handle tool events, streaming to spaces
      const streamResult = await processStream(result.fullStream, {
        runId: run.id,
        agentEntityId,
        getActiveSpaceId: () => activeSpaceId,
        visibleTools: built.visibleToolNames,
        clientTools: built.clientToolNames,
      });

      // 9. APPEND new messages to consciousness
      const response = await result.response;
      const newMessages = response.messages as unknown as ModelMessage[];
      consciousness.push(...newMessages);

      // 10. COMPACT if over budget
      const maxTokens = (agent.configJson as any)?.consciousness?.maxTokens ?? 100_000;
      const minCycles = (agent.configJson as any)?.consciousness?.minRecentCycles ?? 10;
      consciousness = compactConsciousness(consciousness, maxTokens, minCycles);

      // 11. SAVE consciousness
      await saveConsciousness(agentEntityId, consciousness, cycleCount);

      // 12. UPDATE audit record
      const usage = await result.totalUsage;
      const durationMs = Date.now() - cycleStart;

      await prisma.run.update({
        where: { id: run.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
          stepCount: streamResult.toolCalls.length,
          promptTokens: usage.inputTokens ?? 0,
          completionTokens: usage.outputTokens ?? 0,
          durationMs,
        },
      });

      // 13. EMIT agent.inactive
      await emitAgentStatus(agentEntityId, 'inactive', { runId: run.id, agentName });

      console.log(
        `[agent-process] ${agentName} cycle ${cycleCount} complete ` +
        `(${allEvents.length} events, ${streamResult.toolCalls.length} tools, ${durationMs}ms)`
      );

    } catch (error) {
      if (signal.aborted) break;

      console.error(`[agent-process] ${agentName} cycle error:`, error);

      // Update run as failed if we have one
      if (context.currentRunId) {
        try {
          await prisma.run.update({
            where: { id: context.currentRunId },
            data: {
              status: 'failed',
              completedAt: new Date(),
              errorMessage: error instanceof Error ? error.message : String(error),
            },
          });
        } catch {
          // Best effort
        }
      }

      await emitAgentStatus(agentEntityId, 'inactive', {
        runId: context.currentRunId,
        agentName,
      });

      // Wait before retrying to avoid tight error loops
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  // Graceful shutdown
  console.log(`[agent-process] ${agentName} shutting down`);
  await saveConsciousness(agentEntityId, consciousness, cycleCount);
  blockingRedis.disconnect();
}

// =============================================================================
// Agent status helper
// =============================================================================

/**
 * Emit agent.active / agent.inactive to ALL spaces the agent is a member of.
 */
async function emitAgentStatus(
  agentEntityId: string,
  status: 'active' | 'inactive',
  meta: { runId: string | null; agentName: string },
): Promise<void> {
  try {
    const memberships = await prisma.smartSpaceMembership.findMany({
      where: { entityId: agentEntityId },
      select: { smartSpaceId: true },
    });

    const event = {
      type: `agent.${status}`,
      agentEntityId,
      agentName: meta.agentName,
      runId: meta.runId,
    };

    await Promise.all(
      memberships.map((m) => emitSmartSpaceEvent(m.smartSpaceId, event)),
    );
  } catch (err) {
    console.warn(`[agent-process] Failed to emit agent.${status}:`, err);
  }
}
