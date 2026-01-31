import { Router, Request, Response, type Router as ExpressRouter } from 'express';
import { convertToModelMessages } from 'ai';
import { Prisma } from '@prisma/client';
import { redis } from '../lib/redis.js';
import { prisma } from '../lib/db.js';
import { buildAgent, AgentBuildError } from '../agent-builder/builder.js';
import { closeMCPClients, type MCPClientWrapper } from '../agent-builder/mcp-resolver.js';
import type { AgentConfig } from '../agent-builder/types.js';

export const runsRouter: ExpressRouter = Router();

async function createEmitEvent(runId: string) {
  const streamKey = `run:${runId}:stream`;
  const notifyChannel = `run:${runId}:notify`;

  const last = await prisma.runEvent.findFirst({
    where: { runId },
    orderBy: { seq: 'desc' },
    select: { seq: true },
  });

  let seq = last?.seq ? Number(last.seq) : 0;

  const emitEvent = async (type: string, payload: Record<string, unknown>) => {
    seq += 1;
    const ts = new Date().toISOString();

    // Write to Redis Stream
    await redis.xadd(streamKey, '*', 'type', type, 'ts', ts, 'payload', JSON.stringify(payload));

    // Notify subscribers
    await redis.publish(notifyChannel, JSON.stringify({ type, seq }));

    // Persist to Postgres
    await prisma.runEvent.create({
      data: {
        runId,
        seq: BigInt(seq),
        type,
        payload: payload as Prisma.InputJsonValue,
      },
    });
  };

  return { emitEvent };
}

async function loadRunMessages(runId: string): Promise<unknown[]> {
  const events = await prisma.runEvent.findMany({
    where: {
      runId,
      type: { in: ['message.user', 'message.assistant', 'message.tool'] },
    },
    orderBy: { seq: 'asc' },
  });

  const messages: unknown[] = [];
  for (const evt of events) {
    const payload = evt.payload as any;
    const message = payload?.message;
    if (message && typeof message === 'object') {
      messages.push(message);
    }
  }
  return messages;
}

// POST /api/runs - Create a new run and start agent execution
runsRouter.post('/', async (req: Request, res: Response) => {
  const { agentId, agentVersionId: providedVersionId, initialMessages, metadata } = req.body;

  if (!agentId) {
    return res.status(400).json({ error: 'Missing required field: agentId' });
  }

  try {
    let agentVersion;

    if (providedVersionId) {
      // Use specific version if provided
      agentVersion = await prisma.agentVersion.findUnique({
        where: { id: providedVersionId },
        include: { agent: true },
      });

      if (!agentVersion || agentVersion.agentId !== agentId) {
        return res.status(404).json({ error: 'Agent version not found or does not match agentId' });
      }
    } else {
      // Auto-select latest version
      agentVersion = await prisma.agentVersion.findFirst({
        where: { agentId },
        orderBy: { createdAt: 'desc' },
        include: { agent: true },
      });

      if (!agentVersion) {
        return res.status(404).json({ error: 'No versions found for this agent' });
      }
    }

    const agentVersionId = agentVersion.id;

    // Create run record
    const run = await prisma.run.create({
      data: {
        agentId,
        agentVersionId,
        status: 'queued',
      },
    });

    const runId = run.id;
    const { emitEvent } = await createEmitEvent(runId);

    await emitEvent('run.created', { runId, agentId, agentVersionId, status: 'queued', metadata: metadata ?? null });

    // If we have initial messages, start execution immediately.
    if (Array.isArray(initialMessages) && initialMessages.length > 0) {
      // Persist the initial messages as message events (best-effort)
      for (const m of initialMessages) {
        if (!m || typeof m !== 'object') continue;
        const role = (m as any).role;
        if (role !== 'user' && role !== 'assistant') continue;
        await emitEvent(role === 'user' ? 'message.user' : 'message.assistant', {
          message: m,
        });
      }

      executeAgentRun(runId, agentVersion.configJson as AgentConfig, initialMessages, emitEvent).catch(
        async (error) => {
          console.error(`[Run ${runId}] Background execution error:`, error);
          await prisma.run.update({
            where: { id: runId },
            data: {
              status: 'failed',
              errorMessage: error instanceof Error ? error.message : String(error),
              completedAt: new Date(),
            },
          });
          await emitEvent('run.failed', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      );
    }

    // Return immediately with run info
    res.status(201).json({
      runId,
      streamUrl: `/api/runs/${runId}/stream`,
      status: 'queued',
    });
  } catch (error) {
    console.error('[POST /api/runs] Error:', error);
    res.status(500).json({
      error: 'Failed to create run',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

runsRouter.post('/:runId/messages', async (req: Request, res: Response) => {
  const { runId } = req.params;
  const { message, senderId, senderName } = req.body;

  if (!message || typeof message !== 'object') {
    return res.status(400).json({ error: 'Missing or invalid message' });
  }

  try {
    const run = await prisma.run.findUnique({ where: { id: runId } });
    if (!run) return res.status(404).json({ error: 'Run not found' });

    const agentVersion = await prisma.agentVersion.findUnique({
      where: { id: run.agentVersionId },
    });
    if (!agentVersion) return res.status(404).json({ error: 'Agent version not found' });

    const { emitEvent } = await createEmitEvent(runId);

    await emitEvent('message.user', {
      senderId: senderId ?? null,
      senderName: senderName ?? null,
      message,
    });

    const history = await loadRunMessages(runId);

    executeAgentRun(runId, agentVersion.configJson as AgentConfig, history, emitEvent).catch(async (error) => {
      console.error(`[Run ${runId}] Background execution error:`, error);
      await prisma.run.update({
        where: { id: runId },
        data: {
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : String(error),
          completedAt: new Date(),
        },
      });
      await emitEvent('run.failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return res.status(202).json({ success: true });
  } catch (error) {
    console.error('Post run message error:', error);
    return res.status(500).json({
      error: 'Failed to append message',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Background agent execution using fullStream
async function executeAgentRun(
  runId: string,
  config: AgentConfig,
  initialMessages: unknown[],
  emitEvent: (type: string, payload: Record<string, unknown>) => Promise<void>
): Promise<void> {
  let mcpClients: MCPClientWrapper[] | undefined;

  console.log(`[Run ${runId}] Starting agent execution...`);

  try {
    // Update run to running
    await prisma.run.update({
      where: { id: runId },
      data: { status: 'running', startedAt: new Date() },
    });
    await emitEvent('run.started', { status: 'running' });

    console.log(`[Run ${runId}] Building agent...`);
    // Build agent
    const built = await buildAgent({ config });
    mcpClients = built.mcpClients;
    console.log(`[Run ${runId}] Agent built successfully`);

    // Convert messages to model format
    const uiMessages = initialMessages.map((m: any, index: number) => {
      if (m && typeof m === 'object' && Array.isArray(m.parts)) return m;
      const role = typeof m?.role === 'string' ? m.role : 'user';
      const content = typeof m?.content === 'string' ? m.content : '';
      return {
        id: typeof m?.id === 'string' ? m.id : `msg-${index}`,
        role,
        parts: [{ type: 'text', text: content }],
      };
    });

    const modelMessages = await convertToModelMessages(uiMessages);
    console.log(`[Run ${runId}] Messages converted, starting stream...`);

    // Stream agent with fullStream
    const streamResult = await built.agent.stream({ messages: modelMessages });
    console.log(`[Run ${runId}] Stream started, iterating...`);

    let stepIndex = 0;
    let currentText = '';

    for await (const part of streamResult.fullStream) {
      console.log(`[Run ${runId}] Stream part:`, part.type);
      switch (part.type) {
        case 'start-step':
          stepIndex++;
          await emitEvent('step.start', { step: stepIndex });
          break;

        case 'text-delta':
          currentText += part.text;
          await emitEvent('text.delta', { delta: part.text });
          break;

        case 'reasoning-start':
          await emitEvent('reasoning.start', {});
          break;

        case 'reasoning-delta':
          await emitEvent('reasoning.delta', { delta: part.text });
          break;

        case 'tool-input-start':
          await emitEvent('tool.input.start', {
            toolCallId: part.id,
            toolName: part.toolName,
          });
          break;

        case 'tool-input-delta':
          await emitEvent('tool.input.delta', {
            toolCallId: part.id,
            delta: part.delta,
          });
          break;

        case 'tool-call': {
          const input = 'input' in part ? part.input : {};
          // Persist tool call to DB
          const toolConfig = config.tools?.find((t) => t.name === part.toolName);
          const executionTarget = 'executionTarget' in (toolConfig || {}) 
            ? (toolConfig as { executionTarget?: string }).executionTarget 
            : 'server';

          await emitEvent('tool.call', {
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            args: input,
            executionTarget,
          });

          await emitEvent('message.assistant', {
            message: {
              id: `msg-${Date.now()}-assistant-toolcall`,
              role: 'assistant',
              parts: [
                {
                  type: 'tool-call',
                  toolCallId: part.toolCallId,
                  toolName: part.toolName,
                  input,
                  state: 'input-available',
                },
              ],
            },
          });

          await prisma.toolCall.create({
            data: {
              runId,
              seq: BigInt(stepIndex),
              callId: part.toolCallId,
              toolName: part.toolName,
              args: input as Prisma.InputJsonValue,
              executionTarget: executionTarget as 'server' | 'device' | 'browser' | 'external',
              status: 'requested',
            },
          });

          if (executionTarget !== 'server') {
            await prisma.run.update({
              where: { id: runId },
              data: { status: 'waiting_tool' },
            });
            await emitEvent('run.waiting_tool', {
              status: 'waiting_tool',
              toolCallId: part.toolCallId,
              toolName: part.toolName,
            });
            return;
          }
          break;
        }

        case 'tool-result': {
          const output = 'output' in part ? part.output : null;
          await emitEvent('tool.result', {
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            result: output,
          });

          await emitEvent('message.tool', {
            message: {
              id: `msg-${Date.now()}-tool-${part.toolCallId}`,
              role: 'tool',
              parts: [
                {
                  type: 'tool-result',
                  toolCallId: part.toolCallId,
                  toolName: part.toolName,
                  output,
                  state: 'output-available',
                },
              ],
            },
          });

          // Update tool call status and persist result
          await prisma.toolCall.update({
            where: { runId_callId: { runId, callId: part.toolCallId } },
            data: { status: 'completed', completedAt: new Date() },
          });

          await prisma.toolResult.upsert({
            where: { runId_callId: { runId, callId: part.toolCallId } },
            create: {
              runId,
              callId: part.toolCallId,
              result: (output ?? {}) as Prisma.InputJsonValue,
              source: 'server',
            },
            update: {
              result: (output ?? {}) as Prisma.InputJsonValue,
            },
          });
          break;
        }

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

    // Get final text
    const finalText = await streamResult.text;

    // Update run to completed
    await prisma.run.update({
      where: { id: runId },
      data: { status: 'completed', completedAt: new Date() },
    });

    await emitEvent('message.assistant', {
      message: {
        id: `msg-${Date.now()}-assistant`,
        role: 'assistant',
        parts: [{ type: 'text', text: finalText }],
      },
    });

    await emitEvent('run.completed', { status: 'completed', text: finalText });
  } catch (error) {
    if (error instanceof AgentBuildError) {
      await emitEvent('agent.build.error', { error: error.message });
    }
    throw error;
  } finally {
    if (mcpClients && mcpClients.length > 0) {
      await closeMCPClients(mcpClients);
    }
  }
}

runsRouter.get('/:runId/stream', async (req: Request, res: Response) => {
  const { runId } = req.params;
  const since = req.query.since as string | undefined;
  const lastEventId = req.headers['last-event-id'] as string | undefined;

  const startId = since || lastEventId || '0-0';

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const streamKey = `run:${runId}:stream`;
  let isActive = true;

  req.on('close', () => {
    isActive = false;
  });

  try {
    const run = await prisma.run.findUnique({
      where: { id: runId },
    });

    if (!run) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'Run not found' })}\n\n`);
      res.end();
      return;
    }

    res.write(`: Connected to run ${runId}\n\n`);

    let lastSeenId = startId;
    const existingEvents = await redis.xread('STREAMS', streamKey, startId);
    
    if (existingEvents && existingEvents.length > 0) {
      for (const [, messages] of existingEvents) {
        for (const [id, fields] of messages) {
          if (!isActive) break;

          // Convert fields array to map: [k1, v1, k2, v2] -> { k1: v1, k2: v2 }
          const fieldMap: Record<string, string> = {};
          for (let i = 0; i < fields.length; i += 2) {
            fieldMap[fields[i]] = fields[i + 1];
          }

          const event = {
            id,
            type: fieldMap.type,
            ts: fieldMap.ts,
            data: fieldMap.payload ? JSON.parse(fieldMap.payload) : {},
          };

          res.write(`id: ${id}\n`);
          res.write(`event: hsafa\n`);
          res.write(`data: ${JSON.stringify(event)}\n\n`);

          lastSeenId = id;
        }
      }
    }

    const subscriber = redis.duplicate();
    const notifyChannel = `run:${runId}:notify`;

    // Handle incoming pub/sub messages
    subscriber.on('message', async (channel: string) => {
      if (channel !== notifyChannel || !isActive) return;

      // Read events after last seen ID
      const newEvents = await redis.xread('STREAMS', streamKey, lastSeenId);
      
      if (newEvents && newEvents.length > 0) {
        for (const [, messages] of newEvents) {
          for (const [id, fields] of messages) {
            if (!isActive) break;

            // Convert fields array to map
            const fieldMap: Record<string, string> = {};
            for (let i = 0; i < fields.length; i += 2) {
              fieldMap[fields[i]] = fields[i + 1];
            }

            const event = {
              id,
              type: fieldMap.type,
              ts: fieldMap.ts,
              data: fieldMap.payload ? JSON.parse(fieldMap.payload) : {},
            };

            res.write(`id: ${id}\n`);
            res.write(`event: hsafa\n`);
            res.write(`data: ${JSON.stringify(event)}\n\n`);

            lastSeenId = id;
          }
        }
      }
    });

    // Subscribe to the notification channel
    await subscriber.subscribe(notifyChannel);

    const keepAliveInterval = setInterval(() => {
      if (isActive) {
        res.write(': keepalive\n\n');
      } else {
        clearInterval(keepAliveInterval);
      }
    }, 30000);

    req.on('close', async () => {
      isActive = false;
      clearInterval(keepAliveInterval);
      await subscriber.unsubscribe(notifyChannel);
      await subscriber.quit();
    });

  } catch (error) {
    console.error('SSE stream error:', error);
    res.write(`event: error\ndata: ${JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    })}\n\n`);
    res.end();
  }
});

runsRouter.get('/:runId/events', async (req: Request, res: Response) => {
  try {
    const { runId } = req.params;

    const events = await prisma.runEvent.findMany({
      where: { runId },
      orderBy: { seq: 'asc' },
    });

    res.json({ events });
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({
      error: 'Failed to fetch events',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

runsRouter.get('/:runId', async (req: Request, res: Response) => {
  try {
    const { runId } = req.params;

    const run = await prisma.run.findUnique({
      where: { id: runId },
      include: {
        agent: true,
        agentVersion: true,
      },
    });

    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }

    res.json({ run });
  } catch (error) {
    console.error('Get run error:', error);
    res.status(500).json({
      error: 'Failed to fetch run',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

runsRouter.post('/:runId/tool-results', async (req: Request, res: Response) => {
  try {
    const { runId } = req.params;
    const { callId, result, source } = req.body;

    const { emitEvent } = await createEmitEvent(runId);

    const run = await prisma.run.findUnique({ where: { id: runId } });
    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }

    await prisma.toolResult.create({
      data: {
        runId,
        callId,
        result,
        source: source || 'server',
      },
    });

    await prisma.toolCall.update({
      where: { runId_callId: { runId, callId } },
      data: {
        status: 'completed',
        completedAt: new Date(),
      },
    });

    const toolCall = await prisma.toolCall.findUnique({
      where: { runId_callId: { runId, callId } },
      select: { toolName: true, executionTarget: true },
    });

    await emitEvent('tool.result', {
      toolCallId: callId,
      toolName: toolCall?.toolName ?? null,
      result,
    });

    await emitEvent('message.tool', {
      message: {
        id: `msg-${Date.now()}-tool-${callId}`,
        role: 'tool',
        parts: [
          {
            type: 'tool-result',
            toolCallId: callId,
            toolName: toolCall?.toolName ?? null,
            output: result,
            state: 'output-available',
          },
        ],
      },
    });

    if (toolCall?.executionTarget && toolCall.executionTarget !== 'server') {
      const agentVersion = await prisma.agentVersion.findUnique({
        where: { id: run.agentVersionId },
      });

      if (agentVersion) {
        const history = await loadRunMessages(runId);
        executeAgentRun(runId, agentVersion.configJson as AgentConfig, history, emitEvent).catch(async (error) => {
          console.error(`[Run ${runId}] Background resume error:`, error);
          await prisma.run.update({
            where: { id: runId },
            data: {
              status: 'failed',
              errorMessage: error instanceof Error ? error.message : String(error),
              completedAt: new Date(),
            },
          });
          await emitEvent('run.failed', {
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Post tool result error:', error);
    res.status(500).json({
      error: 'Failed to post tool result',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
