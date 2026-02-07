"use client";

import { useState, useEffect, useRef } from 'react';
import { useHsafaClient } from '../context.js';
import type { Run, RunEvent, StreamEvent, HsafaStream, RunStatus } from '../types.js';

export interface ToolCall {
  toolCallId: string;
  toolName: string;
  input?: unknown;
  inputText?: string;
  output?: unknown;
  status: 'running' | 'complete';
}

export interface UseRunReturn {
  run: Run | null;
  events: StreamEvent[];
  text: string;
  toolCalls: ToolCall[];
  status: RunStatus | null;
  isStreaming: boolean;
}

export function useRun(runId: string | null | undefined): UseRunReturn {
  const client = useHsafaClient();
  const [run, setRun] = useState<Run | null>(null);
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [text, setText] = useState('');
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [status, setStatus] = useState<RunStatus | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const streamRef = useRef<HsafaStream | null>(null);

  // Load run details
  useEffect(() => {
    if (!runId) {
      setRun(null);
      setStatus(null);
      return;
    }

    client.runs.get(runId).then(({ run: r }) => {
      setRun(r);
      setStatus(r.status);
    }).catch(() => {});
  }, [client, runId]);

  // Subscribe to run stream
  useEffect(() => {
    if (!runId) {
      setEvents([]);
      setText('');
      setToolCalls([]);
      setIsStreaming(false);
      return;
    }

    const stream = client.runs.subscribe(runId);
    streamRef.current = stream;
    setIsStreaming(true);

    stream.on('text.delta', (event: StreamEvent) => {
      const delta = (event.data.delta as string) || (event.data.text as string) || '';
      if (delta) {
        setText((prev) => prev + delta);
      }
      setEvents((prev) => [...prev, event]);
    });

    stream.on('tool-input-available', (event: StreamEvent) => {
      const tc: ToolCall = {
        toolCallId: (event.data.toolCallId as string) || '',
        toolName: (event.data.toolName as string) || '',
        input: event.data.input,
        inputText: typeof event.data.input === 'string' ? event.data.input : JSON.stringify(event.data.input),
        status: 'running',
      };
      setToolCalls((prev) => [...prev, tc]);
      setStatus('waiting_tool');
      setEvents((prev) => [...prev, event]);
    });

    stream.on('tool-output-available', (event: StreamEvent) => {
      const toolCallId = (event.data.toolCallId as string) || '';
      setToolCalls((prev) =>
        prev.map((tc) =>
          tc.toolCallId === toolCallId
            ? { ...tc, output: event.data.output, status: 'complete' as const }
            : tc
        )
      );
      setEvents((prev) => [...prev, event]);
    });

    stream.on('run.started', (event: StreamEvent) => {
      setStatus('running');
      setEvents((prev) => [...prev, event]);
    });

    stream.on('run.completed', (event: StreamEvent) => {
      setStatus('completed');
      setIsStreaming(false);
      setEvents((prev) => [...prev, event]);
    });

    stream.on('run.failed', (event: StreamEvent) => {
      setStatus('failed');
      setIsStreaming(false);
      setEvents((prev) => [...prev, event]);
    });

    stream.on('run.canceled', (event: StreamEvent) => {
      setStatus('canceled');
      setIsStreaming(false);
      setEvents((prev) => [...prev, event]);
    });

    // Catch-all for other event types
    stream.on('*', (event: StreamEvent) => {
      const handled = [
        'text.delta', 'tool-input-available', 'tool-output-available',
        'run.started', 'run.completed', 'run.failed', 'run.canceled',
      ];
      if (!handled.includes(event.type)) {
        setEvents((prev) => [...prev, event]);
      }
    });

    return () => {
      stream.close();
      streamRef.current = null;
      setIsStreaming(false);
    };
  }, [client, runId]);

  return { run, events, text, toolCalls, status, isStreaming };
}
