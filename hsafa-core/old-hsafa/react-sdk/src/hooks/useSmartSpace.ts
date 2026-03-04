"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { useHsafaClient } from '../context.js';
import type {
  SmartSpaceMessage,
  StreamEvent,
  HsafaStream,
} from '../types.js';

export interface ActiveRun {
  id: string;
  agentEntityId: string;
  agentId?: string;
  status: string;
  text: string;
  toolCalls: Array<{
    toolCallId: string;
    toolName: string;
    input?: unknown;
    output?: unknown;
    status: 'running' | 'complete';
  }>;
}

export interface UseSmartSpaceReturn {
  messages: SmartSpaceMessage[];
  isConnected: boolean;
  isLoading: boolean;
  error: Error | null;
  send: (content: string) => Promise<void>;
  runs: ActiveRun[];
}

export function useSmartSpace(smartSpaceId: string | null | undefined): UseSmartSpaceReturn {
  const client = useHsafaClient();
  const [messages, setMessages] = useState<SmartSpaceMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [runs, setRuns] = useState<ActiveRun[]>([]);
  const streamRef = useRef<HsafaStream | null>(null);
  const maxSeqRef = useRef<string>('0');

  // Load initial messages
  useEffect(() => {
    if (!smartSpaceId) {
      setMessages([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    client.messages
      .list(smartSpaceId, { limit: 100 })
      .then(({ messages: msgs }) => {
        if (cancelled) return;
        setMessages(msgs);
        if (msgs.length > 0) {
          const lastSeq = msgs[msgs.length - 1].seq;
          maxSeqRef.current = lastSeq;
        }
        setIsLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [client, smartSpaceId]);

  // Subscribe to SSE stream
  useEffect(() => {
    if (!smartSpaceId) {
      setIsConnected(false);
      return;
    }

    const afterSeq = maxSeqRef.current !== '0' ? parseInt(maxSeqRef.current) : undefined;
    const stream = client.spaces.subscribe(smartSpaceId, { afterSeq });
    streamRef.current = stream;

    stream.on('space.message', (event: StreamEvent) => {
      const raw = event.data?.message as Record<string, unknown> | undefined;
      if (!raw?.id) return;
      const msg: SmartSpaceMessage = {
        id: raw.id as string,
        smartSpaceId: (raw.smartSpaceId as string) || smartSpaceId || '',
        entityId: (raw.entityId as string) || event.entityId || null,
        seq: (raw.seq as string) || String(event.seq || '0'),
        role: (raw.role as string) || 'user',
        content: (raw.content as string) || null,
        metadata: (raw.metadata as Record<string, unknown>) || null,
        createdAt: (raw.createdAt as string) || new Date().toISOString(),
      };
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === msg.id);
        if (idx >= 0) {
          // Update existing message (e.g. tool call result arrived)
          const updated = [...prev];
          updated[idx] = msg;
          return updated;
        }
        return [...prev, msg];
      });

      // Update tool call status in runs if this is a tool call message
      const meta = raw.metadata as Record<string, unknown> | undefined;
      const toolCallId = meta?.toolCallId as string | undefined;
      if (toolCallId) {
        const parts = (meta?.uiMessage as any)?.parts as Array<Record<string, unknown>> | undefined;
        if (Array.isArray(parts)) {
          for (const p of parts) {
            if (p.type !== 'tool_call' || p.toolCallId !== toolCallId) continue;
            setRuns((prev) =>
              prev.map((r) => ({
                ...r,
                toolCalls: r.toolCalls.map((tc) =>
                  tc.toolCallId === toolCallId
                    ? { ...tc, input: p.args as unknown, output: p.result as unknown, status: p.status === 'complete' ? 'complete' as const : 'running' as const }
                    : tc
                ),
              }))
            );
          }
        }
      }
    });

    // agent.active → track running agents as active runs
    stream.on('agent.active', (event: StreamEvent) => {
      const agentEntityId = event.agentEntityId || (event.data?.agentEntityId as string) || '';
      const runId = event.runId || (event.data?.runId as string) || '';
      if (!runId || !agentEntityId) return;

      setRuns((prev) => {
        if (prev.some((r) => r.id === runId)) return prev;
        return [
          ...prev,
          { id: runId, agentEntityId, status: 'running', text: '', toolCalls: [] },
        ];
      });
    });

    // space.message.streaming → live text delta from send_message
    stream.on('space.message.streaming', (event: StreamEvent) => {
      const phase = event.data?.phase as string;
      const delta = (event.data?.delta as string) || '';
      const runId = event.runId || (event.data?.runId as string);
      if (!runId) return;

      if (phase === 'delta' && delta) {
        setRuns((prev) =>
          prev.map((r) =>
            r.id === runId ? { ...r, text: r.text + delta } : r
          )
        );
      }
    });

    // tool.started → new tool call in-flight
    stream.on('tool.started', (event: StreamEvent) => {
      const runId = event.runId || (event.data?.runId as string);
      if (!runId) return;

      const toolCall = {
        toolCallId: (event.data?.streamId as string) || '',
        toolName: (event.data?.toolName as string) || '',
        input: undefined,
        output: undefined,
        status: 'running' as const,
      };

      setRuns((prev) =>
        prev.map((r) =>
          r.id === runId
            ? { ...r, toolCalls: [...r.toolCalls, toolCall] }
            : r
        )
      );
    });

    // tool.done → tool call completed with result (update both runs and messages)
    stream.on('tool.done', (event: StreamEvent) => {
      const runId = event.runId || (event.data?.runId as string);
      const toolCallId = (event.data?.streamId as string) || '';
      if (!runId || !toolCallId) return;

      setRuns((prev) =>
        prev.map((r) =>
          r.id === runId
            ? {
                ...r,
                toolCalls: r.toolCalls.map((tc) =>
                  tc.toolCallId === toolCallId
                    ? { ...tc, output: event.data?.result, status: 'complete' as const }
                    : tc
                ),
              }
            : r
        )
      );
    });

    stream.on('run.completed', (event: StreamEvent) => {
      const runId = event.runId || (event.data.runId as string);
      if (!runId) return;
      setRuns((prev) => prev.filter((r) => r.id !== runId));
    });

    stream.on('run.failed', (event: StreamEvent) => {
      const runId = event.runId || (event.data.runId as string);
      if (!runId) return;
      setRuns((prev) => prev.filter((r) => r.id !== runId));
    });

    stream.on('run.cancelled', (event: StreamEvent) => {
      const runId = event.runId || (event.data?.runId as string);
      if (!runId) return;
      setRuns((prev) => prev.filter((r) => r.id !== runId));
    });

    stream.on('agent.inactive', (event: StreamEvent) => {
      const runId = event.runId || (event.data?.runId as string);
      if (!runId) return;
      setRuns((prev) => prev.filter((r) => r.id !== runId));
    });

    setIsConnected(true);

    return () => {
      stream.close();
      streamRef.current = null;
      setIsConnected(false);
    };
  }, [client, smartSpaceId]);

  const send = useCallback(
    async (content: string) => {
      if (!smartSpaceId) {
        throw new Error('No SmartSpace selected');
      }
      await client.messages.send(smartSpaceId, { content });
    },
    [client, smartSpaceId]
  );

  return { messages, isConnected, isLoading, error, send, runs };
}
