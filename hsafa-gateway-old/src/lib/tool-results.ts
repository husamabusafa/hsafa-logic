import { Prisma } from '@prisma/client';
import { prisma } from './db.js';
import { createEmitEvent } from './run-events.js';
import { emitSmartSpaceEvent } from './smartspace-events.js';
import { executeRun } from './run-runner.js';

/**
 * Submit a tool result for a run in waiting_tool status.
 *
 * In the general-purpose run model, this is used exclusively for client tools.
 * Server tools execute inside the AI SDK tool loop and don't need external results.
 * Results are stored in run metadata (no ToolCall/ToolResult DB records).
 * Events go to the run stream only — spaces are not affected directly.
 */
export async function submitToolResult(input: {
  runId: string;
  callId: string;
  result: unknown;
}): Promise<void> {
  const run = await prisma.run.findUnique({
    where: { id: input.runId },
    select: { id: true, agentEntityId: true, status: true, metadata: true },
  });

  if (!run) {
    throw new Error('Run not found');
  }

  if (run.status !== 'waiting_tool') {
    throw new Error(`Run is not waiting for tool results (status: ${run.status})`);
  }

  const meta = (run.metadata && typeof run.metadata === 'object') ? run.metadata as Record<string, unknown> : {};
  const pendingTools = (meta.pendingClientTools ?? []) as Array<{ toolCallId: string; toolName: string }>;
  const results = (meta.clientToolResults ?? {}) as Record<string, unknown>;

  // Store this result
  results[input.callId] = input.result;

  const toolName = pendingTools.find((t) => t.toolCallId === input.callId)?.toolName ?? null;

  await prisma.run.update({
    where: { id: input.runId },
    data: {
      metadata: { ...meta, clientToolResults: results } as unknown as Prisma.InputJsonValue,
    },
  });

  // Emit to run stream only
  const { emitEvent } = await createEmitEvent(input.runId);
  await emitEvent('tool.result', {
    toolCallId: input.callId,
    toolName,
    result: input.result,
  });

  // Update persisted display-tool message: requires_action → complete, then emit to space.
  await resolveDisplayToolMessage(input.runId, input.callId, input.result, run.agentEntityId);

  // Check if ALL pending tool calls now have results → resume the run
  const allDone = pendingTools.every((tc) => tc.toolCallId in results);
  if (allDone) {
    executeRun(input.runId).catch(() => {
      // errors are handled inside executeRun
    });
  }
}

/**
 * Find the persisted SmartSpaceMessage with a requires_action tool_call part
 * matching callId, update it to complete with the result, and emit smartSpace.message
 * so the frontend replaces the live tool call with the resolved version.
 */
async function resolveDisplayToolMessage(
  runId: string, callId: string, result: unknown, agentEntityId: string,
): Promise<void> {
  try {
    const msgs = await prisma.smartSpaceMessage.findMany({ where: { runId } });
    const agentEntity = await prisma.entity.findUnique({
      where: { id: agentEntityId },
      select: { displayName: true },
    });
    const agentName = agentEntity?.displayName || 'AI Assistant';

    for (const msg of msgs) {
      const meta = (msg.metadata && typeof msg.metadata === 'object') ? msg.metadata as Record<string, unknown> : null;
      const uiParts = (meta?.uiMessage as any)?.parts as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(uiParts)) continue;

      let matched = false;
      const updatedParts = uiParts.map((p) => {
        if (p.type === 'tool_call' && p.toolCallId === callId && p.status === 'requires_action') {
          matched = true;
          return { ...p, status: 'complete', result };
        }
        return p;
      });
      if (!matched) continue;

      await prisma.smartSpaceMessage.update({
        where: { id: msg.id },
        data: {
          metadata: {
            ...meta, uiMessage: { ...(meta?.uiMessage as any), parts: updatedParts },
          } as unknown as Prisma.InputJsonValue,
        },
      });

      await emitSmartSpaceEvent(msg.smartSpaceId, 'smartSpace.message', {
        message: {
          id: msg.id, role: 'assistant', parts: updatedParts,
          entityId: agentEntityId, entityType: 'agent', entityName: agentName,
        },
        streamId: callId,
      }, { entityId: agentEntityId, entityType: 'agent', runId });
    }
  } catch (err) {
    console.error('[submitToolResult] Failed to resolve display tool message:', err);
  }
}
