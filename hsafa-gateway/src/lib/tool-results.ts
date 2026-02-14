import { Prisma } from '@prisma/client';
import { prisma } from './db.js';
import { createEmitEvent } from './run-events.js';
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

  // Check if ALL pending tool calls now have results → resume the run
  const allDone = pendingTools.every((tc) => tc.toolCallId in results);
  if (allDone) {
    executeRun(input.runId).catch(() => {
      // errors are handled inside executeRun
    });
  }
}
