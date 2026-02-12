import { Prisma } from '@prisma/client';
import { prisma } from './db.js';
import { createEmitEvent } from './run-events.js';
import { emitSmartSpaceEvent } from './smartspace-events.js';
import { executeRun } from './run-runner.js';
import { createSmartSpaceMessage } from './smartspace-db.js';

export async function submitToolResult(input: {
  runId: string;
  callId: string;
  result: unknown;
  source?: 'server' | 'client';
  clientId?: string | null;
}): Promise<void> {
  const run = await prisma.run.findUnique({
    where: { id: input.runId },
    select: { id: true, smartSpaceId: true, agentEntityId: true, triggeredById: true, status: true, metadata: true },
  });

  if (!run) {
    throw new Error('Run not found');
  }

  const { emitEvent: emitRunEvent } = await createEmitEvent(input.runId);

  // ── Client tool results (waiting_tool): metadata-based, no DB records ──
  if (run.status === 'waiting_tool') {
    const meta = (run.metadata && typeof run.metadata === 'object') ? run.metadata as Record<string, unknown> : {};
    const pendingTools = (meta.pendingClientTools ?? []) as Array<{ toolCallId: string; toolName: string }>;
    const results = (meta.clientToolResults ?? {}) as Record<string, unknown>;

    // Store this result
    results[input.callId] = input.result;

    // Find tool name for events
    const toolName = pendingTools.find((t) => t.toolCallId === input.callId)?.toolName ?? null;

    // Update run metadata with the new result
    await prisma.run.update({
      where: { id: input.runId },
      data: {
        metadata: { ...meta, clientToolResults: results } as unknown as Prisma.InputJsonValue,
      },
    });

    // Emit events so the UI updates the tool call status
    await emitSmartSpaceEvent(
      run.smartSpaceId,
      'tool-output-available',
      { toolCallId: input.callId, toolName, output: input.result },
      { runId: input.runId, entityId: run.agentEntityId, entityType: 'agent' }
    );

    await emitRunEvent('tool.result', {
      toolCallId: input.callId,
      toolName,
      result: input.result,
    });

    // Check if ALL pending tool calls now have results → resume the run
    const allDone = pendingTools.every((tc) => tc.toolCallId in results);
    if (allDone) {
      executeRun(input.runId).catch(() => {
        // errors are handled inside executeRun
      });
    }

    return;
  }

  // ── Server tool results: existing DB-based flow ────────────────────────
  const source = input.source ?? (input.clientId ? 'client' : 'server');

  await prisma.toolResult.upsert({
    where: { runId_callId: { runId: input.runId, callId: input.callId } },
    create: {
      runId: input.runId,
      callId: input.callId,
      result: (input.result ?? {}) as Prisma.InputJsonValue,
      source,
      clientId: input.clientId ?? null,
    },
    update: {
      result: (input.result ?? {}) as Prisma.InputJsonValue,
      source,
      clientId: input.clientId ?? null,
    },
  });

  await prisma.toolCall.update({
    where: { runId_callId: { runId: input.runId, callId: input.callId } },
    data: { status: 'completed', completedAt: new Date() },
  });

  const toolCall = await prisma.toolCall.findUnique({
    where: { runId_callId: { runId: input.runId, callId: input.callId } },
    select: { toolName: true, executionTarget: true },
  });

  if (toolCall?.executionTarget && toolCall.executionTarget !== 'server') {
    let toolMessageEntityId: string = run.agentEntityId;
    if (source === 'client') {
      if (input.clientId) {
        const client = await prisma.client.findUnique({
          where: { id: input.clientId },
          select: { entityId: true },
        });
        toolMessageEntityId = client?.entityId ?? run.triggeredById ?? run.agentEntityId;
      } else {
        toolMessageEntityId = run.triggeredById ?? run.agentEntityId;
      }
    }

    const toolMessage = {
      id: `msg-${Date.now()}-tool-${input.callId}`,
      role: 'tool',
      parts: [
        {
          type: 'tool-result',
          toolCallId: input.callId,
          toolName: toolCall.toolName,
          output: input.result,
          state: 'output-available',
        },
      ],
    };

    await createSmartSpaceMessage({
      smartSpaceId: run.smartSpaceId,
      entityId: toolMessageEntityId,
      role: 'tool',
      content: null,
      metadata: { uiMessage: toolMessage } as unknown as Prisma.InputJsonValue,
      runId: input.runId,
    });

    await emitSmartSpaceEvent(
      run.smartSpaceId,
      'smartSpace.message',
      { message: toolMessage },
      { runId: input.runId, agentEntityId: run.agentEntityId }
    );
  }

  await emitRunEvent('tool.result', {
    toolCallId: input.callId,
    toolName: toolCall?.toolName ?? null,
    result: input.result,
  });

  await emitSmartSpaceEvent(
    run.smartSpaceId,
    'tool.result',
    {
      runId: input.runId,
      toolCallId: input.callId,
      toolName: toolCall?.toolName ?? null,
      result: input.result,
    },
    { runId: input.runId, agentEntityId: run.agentEntityId }
  );
}
