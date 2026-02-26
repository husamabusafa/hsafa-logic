import { useState, useEffect, useRef } from 'react';
import { useHsafaClient } from '../context';
import type { Run, StreamEvent, HsafaStream, RunStatus } from '../types';

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

    stream.on('space.message.streaming', (event: StreamEvent) => {
      const phase = event.data?.phase as string;
      const delta = (event.data?.delta as string) || '';
      if (phase === 'delta' && delta) {
        setText((prev) => prev + delta);
      }
      setEvents((prev) => [...prev, event]);
    });

    stream.on('tool.started', (event: StreamEvent) => {
      const tc: ToolCall = {
        toolCallId: (event.data?.streamId as string) || (event.data?.toolCallId as string) || '',
        toolName: (event.data?.toolName as string) || '',
        input: event.data?.args,
        inputText: typeof event.data?.args === 'string' ? event.data.args as string : JSON.stringify(event.data?.args ?? {}),
        status: 'running',
      };
      setToolCalls((prev) => [...prev, tc]);
      setEvents((prev) => [...prev, event]);
    });

    stream.on('tool.done', (event: StreamEvent) => {
      const toolCallId = (event.data?.streamId as string) || (event.data?.toolCallId as string) || '';
      setToolCalls((prev: ToolCall[]) =>
        prev.map((tc: ToolCall) =>
          tc.toolCallId === toolCallId
            ? { ...tc, output: event.data?.result, status: 'complete' as const }
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

    stream.on('run.cancelled', (event: StreamEvent) => {
      setStatus('failed');
      setIsStreaming(false);
      setEvents((prev) => [...prev, event]);
    });

    // Catch-all for other event types
    stream.on('*', (event: StreamEvent) => {
      const handled = [
        'space.message.streaming', 'tool.started', 'tool.done',
        'run.started', 'run.completed', 'run.failed', 'run.cancelled',
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
