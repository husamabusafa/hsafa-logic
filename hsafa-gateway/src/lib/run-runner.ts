import { Prisma } from '@prisma/client';
import { convertToModelMessages } from 'ai';
import { prisma } from './db.js';
import { createEmitEvent, handleRunError, type EmitEventFn } from './run-events.js';
import { buildAgent, AgentBuildError } from '../agent-builder/builder.js';
import type { AgentConfig } from '../agent-builder/types.js';
import { emitSmartSpaceEvent } from './smartspace-events.js';
import { createSmartSpaceMessage } from './smartspace-db.js';
import { toUiMessageFromSmartSpaceMessage, toAiSdkUiMessages } from './message-converters.js';

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
    },
  });

  if (!run) {
    return;
  }

  const { emitEvent: emitRunEvent } = await createEmitEvent(runId);

  const emitEvent: EmitEventFn = async (type, payload) => {
    await emitRunEvent(type, payload);
    try {
      await emitSmartSpaceEvent(run.smartSpaceId, type, payload, {
        runId,
        agentEntityId: run.agentEntityId,
      });
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

    const agent = await prisma.agent.findUnique({
      where: { id: run.agentId },
      select: { configJson: true },
    });

    if (!agent) {
      throw new Error('Agent not found');
    }

    const config = agent.configJson as unknown as AgentConfig;

    const built = await buildAgent({ config });

    const messages = await prisma.smartSpaceMessage.findMany({
      where: { smartSpaceId: run.smartSpaceId },
      orderBy: { seq: 'asc' },
      take: 50,
      select: {
        id: true,
        role: true,
        content: true,
        metadata: true,
      },
    });

    const uiMessages = messages.map(toUiMessageFromSmartSpaceMessage);
    const aiSdkUiMessages = toAiSdkUiMessages(uiMessages as any);
    const modelMessages = await convertToModelMessages(aiSdkUiMessages as any);

    const streamResult = await built.agent.stream({ messages: modelMessages });

    let stepIndex = 0;

    for await (const part of streamResult.fullStream) {
      switch (part.type) {
        case 'start-step':
          stepIndex++;
          await emitEvent('step.start', { step: stepIndex });
          break;

        case 'text-delta':
          await emitEvent('text.delta', { delta: part.text });
          break;

        case 'finish-step':
          await emitEvent('step.finish', {
            step: stepIndex,
            finishReason: part.finishReason,
            usage: part.usage,
          });
          break;

        case 'finish':
          await emitEvent('stream.finish', {
            finishReason: part.finishReason,
            usage: part.totalUsage,
          });
          break;

        case 'error':
          await emitEvent('stream.error', {
            error: part.error instanceof Error ? part.error.message : String(part.error),
          });
          break;
      }
    }

    const finalText = await streamResult.text;

    await prisma.run.update({
      where: { id: runId },
      data: { status: 'completed', completedAt: new Date() },
    });

    const assistantMessage = {
      id: `msg-${Date.now()}-assistant`,
      role: 'assistant',
      parts: [{ type: 'text', text: finalText }],
    };

    await createSmartSpaceMessage({
      smartSpaceId: run.smartSpaceId,
      entityId: run.agentEntityId,
      role: 'assistant',
      content: finalText,
      metadata: { uiMessage: assistantMessage } as unknown as Prisma.InputJsonValue,
      runId,
    });

    await emitSmartSpaceEvent(
      run.smartSpaceId,
      'smartSpace.message',
      { message: assistantMessage },
      { runId, agentEntityId: run.agentEntityId }
    );

    await emitEvent('message.assistant', { message: assistantMessage });
    await emitEvent('run.completed', { status: 'completed', text: finalText });
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
