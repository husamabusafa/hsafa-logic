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

    stream.on('smartSpace.message', (event: StreamEvent) => {
      const msg = event.data?.message as SmartSpaceMessage | undefined;
      if (msg) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }
    });

    stream.on('run.created', (event: StreamEvent) => {
      const data = event.data;
      const runId = (data.runId as string) || '';
      const agentEntityId = (data.agentEntityId as string) || '';
      const agentId = data.agentId as string | undefined;

      setRuns((prev) => {
        if (prev.some((r) => r.id === runId)) return prev;
        return [
          ...prev,
          { id: runId, agentEntityId, agentId, status: 'running', text: '', toolCalls: [] },
        ];
      });
    });

    stream.on('text.delta', (event: StreamEvent) => {
      const runId = event.runId || (event.data.runId as string);
      const delta = (event.data.delta as string) || (event.data.text as string) || '';
      if (!runId || !delta) return;

      setRuns((prev) =>
        prev.map((r) =>
          r.id === runId ? { ...r, text: r.text + delta } : r
        )
      );
    });

    stream.on('tool-input-available', (event: StreamEvent) => {
      const runId = event.runId || (event.data.runId as string);
      if (!runId) return;

      const toolCall = {
        toolCallId: (event.data.toolCallId as string) || '',
        toolName: (event.data.toolName as string) || '',
        input: event.data.input,
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

    stream.on('tool-output-available', (event: StreamEvent) => {
      const runId = event.runId || (event.data.runId as string);
      const toolCallId = (event.data.toolCallId as string) || '';
      if (!runId || !toolCallId) return;

      setRuns((prev) =>
        prev.map((r) =>
          r.id === runId
            ? {
                ...r,
                toolCalls: r.toolCalls.map((tc) =>
                  tc.toolCallId === toolCallId
                    ? { ...tc, output: event.data.output, status: 'complete' as const }
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

    stream.on('run.canceled', (event: StreamEvent) => {
      const runId = event.runId || (event.data.runId as string);
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
