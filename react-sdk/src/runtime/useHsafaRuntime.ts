"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useHsafaClient } from '../context.js';
import type {
  SmartSpaceMessage,
  SmartSpace,
  StreamEvent,
  HsafaStream,
  Entity,
} from '../types.js';

// ─── Types (assistant-ui compatible) ─────────────────────────────────────────

export interface TextContentPart { type: 'text'; text: string }
export interface ToolCallContentPart {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  argsText?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  status?: { type: string; reason?: string };
}
export interface ReasoningContentPart { type: 'reasoning'; text: string }

export type ContentPart = TextContentPart | ToolCallContentPart | ReasoningContentPart;

export interface ThreadMessageLike {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: ContentPart[] | string;
  createdAt?: Date;
  metadata?: { custom?: Record<string, unknown> };
}

export interface AppendMessage {
  content: ReadonlyArray<{ type: string; text?: string }>;
  parentId?: string | null;
}

export interface ThreadListAdapter {
  threadId?: string;
  threads: Array<{ threadId: string; status: 'regular'; title: string }>;
  archivedThreads: Array<{ threadId: string; status: 'archived'; title: string }>;
  onSwitchToThread: (threadId: string) => void;
  onSwitchToNewThread?: () => void;
}

// ─── Streaming state ─────────────────────────────────────────────────────────

interface StreamingEntry {
  id: string;       // toolCallId used as streamId
  entityId: string;
  text: string;
  active: boolean;  // true while text-delta events are flowing
}

interface ToolCallEntry {
  toolCallId: string;
  toolName: string;
  entityId: string;
  args?: Record<string, unknown>;
  result?: unknown;
  status: 'running' | 'complete' | 'error';
  error?: string;
}

export interface ActiveAgent {
  entityId: string;
  entityName?: string;
}

// ─── Options & Return ────────────────────────────────────────────────────────

export interface UseHsafaRuntimeOptions {
  smartSpaceId: string | null;
  entityId?: string;
  smartSpaces?: SmartSpace[];
  onSwitchThread?: (smartSpaceId: string) => void;
  onNewThread?: () => void;
}

export interface UseHsafaRuntimeReturn {
  messages: ThreadMessageLike[];
  isRunning: boolean;
  activeAgents: ActiveAgent[];
  onNew: (message: AppendMessage) => Promise<void>;
  threadListAdapter?: ThreadListAdapter;
  membersById: Record<string, Entity>;
}

// ─── Convert persisted message → ThreadMessageLike ───────────────────────────

function convertMessage(msg: SmartSpaceMessage, currentEntityId?: string): ThreadMessageLike | null {
  if (msg.role === 'tool') return null;

  let role: 'user' | 'assistant' = msg.role === 'user' ? 'user' : 'assistant';
  let isOtherHuman = false;

  // Other humans' messages display on assistant side
  if (msg.role === 'user' && currentEntityId && msg.entityId && msg.entityId !== currentEntityId) {
    role = 'assistant';
    isOtherHuman = true;
  }

  // Extract text from structured parts or plain content
  const content: ContentPart[] = [];
  const parts = (msg.metadata as any)?.uiMessage?.parts;
  if (Array.isArray(parts)) {
    for (const p of parts) {
      if (p.type === 'text' && p.text) content.push({ type: 'text', text: p.text });
    }
  }
  if (content.length === 0) {
    const text = msg.content || '';
    if (!text.trim()) return null;
    content.push({ type: 'text', text });
  }

  return {
    id: msg.id,
    role,
    content,
    createdAt: new Date(msg.createdAt),
    metadata: { custom: { entityId: msg.entityId || undefined, isOtherHuman } },
  };
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useHsafaRuntime(options: UseHsafaRuntimeOptions): UseHsafaRuntimeReturn {
  const client = useHsafaClient();
  const { smartSpaceId, entityId, smartSpaces = [], onSwitchThread, onNewThread } = options;

  const [rawMessages, setRawMessages] = useState<SmartSpaceMessage[]>([]);
  const [streaming, setStreaming] = useState<StreamingEntry[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCallEntry[]>([]);
  const [membersById, setMembersById] = useState<Record<string, Entity>>({});
  const [loaded, setLoaded] = useState(false);
  const streamRef = useRef<HsafaStream | null>(null);
  // Dedup: track which streamIds already have a persisted message.
  // Ref updates synchronously — always correct regardless of React batching.
  const persistedRef = useRef(new Set<string>());
  // Active agents: Map<runId, { entityId, entityName }> for reference counting
  const activeRunsRef = useRef(new Map<string, { entityId: string; entityName?: string }>());
  const [activeAgents, setActiveAgents] = useState<ActiveAgent[]>([]);

  // ── Load messages ──
  useEffect(() => {
    if (!smartSpaceId) { setRawMessages([]); setStreaming([]); setLoaded(false); return; }
    setLoaded(false);
    client.messages.list(smartSpaceId, { limit: 100 })
      .then(({ messages }) => { setRawMessages(messages); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, [client, smartSpaceId]);

  // ── Load members ──
  useEffect(() => {
    if (!smartSpaceId) { setMembersById({}); return; }
    client.spaces.listMembers(smartSpaceId)
      .then(({ members }) => {
        const map: Record<string, Entity> = {};
        for (const m of members) if (m.entity) map[m.entityId] = m.entity;
        setMembersById(map);
      })
      .catch(() => {});
  }, [client, smartSpaceId]);

  // ── SSE subscription ──
  // Only 4 events matter on the space stream:
  //   text-start / text-delta / text-end / finish  → streaming
  //   smartSpace.message                           → persisted message
  useEffect(() => {
    if (!smartSpaceId || !loaded) return;
    const stream = client.spaces.subscribe(smartSpaceId);
    streamRef.current = stream;

    // Catch-up fetch
    client.messages.list(smartSpaceId, { limit: 100 }).then(({ messages: fresh }: { messages: SmartSpaceMessage[] }) => {
      setRawMessages((prev) => {
        const ids = new Set(fresh.map((m) => m.id));
        return [...fresh, ...prev.filter((m) => !ids.has(m.id))];
      });
    }).catch(() => {});

    // text-start → create streaming entry
    stream.on('text-start', (e: StreamEvent) => {
      const id = e.data?.id as string;
      if (!id) return;
      setStreaming((prev) =>
        prev.some((s) => s.id === id) ? prev : [...prev, { id, entityId: e.entityId || '', text: '', active: true }]
      );
    });

    // text-delta → append text
    stream.on('text-delta', (e: StreamEvent) => {
      const id = e.data?.id as string;
      const delta = (e.data?.delta as string) || '';
      if (!id || !delta) return;
      setStreaming((prev) => {
        const exists = prev.find((s) => s.id === id);
        if (exists) return prev.map((s) => s.id === id ? { ...s, text: s.text + delta } : s);
        return [...prev, { id, entityId: e.entityId || '', text: delta, active: true }];
      });
    });

    // text-end / finish → mark inactive
    const markDone = (e: StreamEvent) => {
      const id = (e.data?.id as string) || (e.data?.streamId as string) || '';
      if (!id) return;
      setStreaming((prev) => prev.map((s) => s.id === id ? { ...s, active: false } : s));
    };
    stream.on('text-end', markDone);
    stream.on('finish', markDone);

    // tool-call.start → create tool call entry (running)
    stream.on('tool-call.start', (e: StreamEvent) => {
      const toolCallId = e.data?.toolCallId as string;
      const toolName = e.data?.toolName as string;
      if (!toolCallId || !toolName) return;
      setToolCalls(prev =>
        prev.some(tc => tc.toolCallId === toolCallId)
          ? prev
          : [...prev, { toolCallId, toolName, entityId: e.entityId || '', status: 'running' as const }]
      );
    });

    // tool-call → update with full args
    stream.on('tool-call', (e: StreamEvent) => {
      const toolCallId = e.data?.toolCallId as string;
      const args = e.data?.args as Record<string, unknown> | undefined;
      if (!toolCallId) return;
      setToolCalls(prev => prev.map(tc =>
        tc.toolCallId === toolCallId ? { ...tc, args } : tc
      ));
    });

    // tool-call.result → update with result, mark complete
    stream.on('tool-call.result', (e: StreamEvent) => {
      const toolCallId = e.data?.toolCallId as string;
      const output = e.data?.output;
      if (!toolCallId) return;
      setToolCalls(prev => prev.map(tc =>
        tc.toolCallId === toolCallId ? { ...tc, result: output, status: 'complete' as const } : tc
      ));
    });

    // tool-call.error → mark error
    stream.on('tool-call.error', (e: StreamEvent) => {
      const toolCallId = e.data?.toolCallId as string;
      const error = e.data?.error as string | undefined;
      if (!toolCallId) return;
      setToolCalls(prev => prev.map(tc =>
        tc.toolCallId === toolCallId ? { ...tc, status: 'error' as const, error } : tc
      ));
    });

    // agent.active / agent.inactive → track which agents have running runs
    stream.on('agent.active', (e: StreamEvent) => {
      const eid = e.data?.entityId as string;
      const rid = e.data?.runId as string;
      if (!eid || !rid) return;
      activeRunsRef.current.set(rid, { entityId: eid, entityName: (e.data?.entityName as string) || undefined });
      // Derive unique active agents
      const seen = new Map<string, ActiveAgent>();
      for (const v of activeRunsRef.current.values()) {
        if (!seen.has(v.entityId)) seen.set(v.entityId, { entityId: v.entityId, entityName: v.entityName });
      }
      setActiveAgents(Array.from(seen.values()));
    });

    stream.on('agent.inactive', (e: StreamEvent) => {
      const rid = e.data?.runId as string;
      if (!rid) return;
      activeRunsRef.current.delete(rid);
      const seen = new Map<string, ActiveAgent>();
      for (const v of activeRunsRef.current.values()) {
        if (!seen.has(v.entityId)) seen.set(v.entityId, { entityId: v.entityId, entityName: v.entityName });
      }
      setActiveAgents(Array.from(seen.values()));
    });

    // smartSpace.message → persisted message arrived
    stream.on('smartSpace.message', (e: StreamEvent) => {
      const raw = e.data?.message as Record<string, unknown> | undefined;
      if (!raw?.id) return;

      let content = raw.content as string | undefined;
      if (!content && Array.isArray(raw.parts)) {
        content = (raw.parts as Array<{ type: string; text?: string }>)
          .filter((p) => p.type === 'text' && p.text).map((p) => p.text).join('\n');
      }

      let metadata = (raw.metadata as Record<string, unknown>) || null;
      if (!metadata && Array.isArray(raw.parts)) metadata = { uiMessage: { parts: raw.parts } };

      const msg: SmartSpaceMessage = {
        id: raw.id as string,
        smartSpaceId: e.smartSpaceId || (raw.smartSpaceId as string) || '',
        entityId: (raw.entityId as string) || e.entityId || null,
        seq: (raw.seq as string) || String(e.seq || '0'),
        role: (raw.role as string) || 'user',
        content: content || null,
        metadata,
        createdAt: (raw.createdAt as string) || new Date().toISOString(),
      };
      if (!msg.content?.trim()) return;

      // Dedup: mark streamId persisted BEFORE setState
      const streamId = e.data?.streamId as string | undefined;
      if (streamId) persistedRef.current.add(streamId);

      setRawMessages((prev) => prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]);
      if (streamId) setStreaming((prev) => prev.filter((s) => s.id !== streamId));
    });

    return () => {
      stream.close();
      streamRef.current = null;
      setStreaming([]);
      setToolCalls([]);
      persistedRef.current.clear();
      activeRunsRef.current.clear();
      setActiveAgents([]);
    };
  }, [client, smartSpaceId, loaded]);

  // ── Build message list ──
  const isRunning = streaming.some((s) => s.active);

  const messages = useMemo<ThreadMessageLike[]>(() => {
    const persisted = rawMessages
      .map((m) => convertMessage(m, entityId))
      .filter((m): m is ThreadMessageLike => m !== null);

    // Visible tool calls as assistant messages with tool-call content parts
    const tcMessages = toolCalls.map((tc): ThreadMessageLike => ({
      id: `tc-${tc.toolCallId}`,
      role: 'assistant',
      content: [{
        type: 'tool-call',
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        args: tc.args,
        result: tc.result,
        status: tc.status === 'running'
          ? { type: 'running' }
          : tc.status === 'complete'
            ? { type: 'complete' }
            : { type: 'incomplete', reason: 'error' },
      } as ToolCallContentPart],
      createdAt: new Date(),
      metadata: { custom: { entityId: tc.entityId } },
    }));

    const live = streaming
      .filter((s) => s.text && !persistedRef.current.has(s.id))
      .map((s): ThreadMessageLike => ({
        id: s.id,
        role: 'assistant',
        content: [{ type: 'text', text: s.text }],
        createdAt: new Date(),
        metadata: { custom: { entityId: s.entityId } },
      }));

    return [...persisted, ...tcMessages, ...live];
  }, [rawMessages, streaming, toolCalls, entityId]);

  // ── Send message ──
  const onNew = useCallback(
    async (message: AppendMessage) => {
      if (!smartSpaceId) throw new Error('No SmartSpace selected');
      const part = message.content[0];
      if (!part || part.type !== 'text' || !part.text) throw new Error('Only text messages supported');
      await client.messages.send(smartSpaceId, { content: part.text, entityId });
    },
    [client, smartSpaceId, entityId],
  );

  // ── Thread list adapter ──
  const threadListAdapter: ThreadListAdapter | undefined = onSwitchThread
    ? {
        threadId: smartSpaceId ?? undefined,
        threads: smartSpaces.map((ss) => ({ threadId: ss.id, status: 'regular' as const, title: ss.name ?? 'Untitled' })),
        archivedThreads: [],
        onSwitchToThread: (id: string) => onSwitchThread(id),
        onSwitchToNewThread: () => onNewThread?.(),
      }
    : undefined;

  return { messages, isRunning, activeAgents, onNew, threadListAdapter, membersById };
}
