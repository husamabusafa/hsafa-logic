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

/** Live streaming message from send_message — shown while the agent is typing */
interface StreamingMessage {
  streamId: string;
  entityId: string;
  text: string;
  done: boolean;
}

interface ToolCallEntry {
  toolCallId: string;
  toolName: string;
  entityId: string;
  runId?: string;
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

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Derive unique active agents from the runs ref map. */
function deriveActiveAgents(runsRef: Map<string, { entityId: string; entityName?: string }>): ActiveAgent[] {
  const seen = new Map<string, ActiveAgent>();
  for (const v of runsRef.values()) {
    if (!seen.has(v.entityId)) seen.set(v.entityId, { entityId: v.entityId, entityName: v.entityName });
  }
  return Array.from(seen.values());
}

// ─── Convert persisted message → ThreadMessageLike ───────────────────

function convertMessage(msg: SmartSpaceMessage, currentEntityId?: string): ThreadMessageLike | null {
  if (msg.role === 'tool') return null;

  let role: 'user' | 'assistant' = msg.role === 'user' ? 'user' : 'assistant';
  let isOtherHuman = false;

  // Other humans' messages display on assistant side
  if (msg.role === 'user' && currentEntityId && msg.entityId && msg.entityId !== currentEntityId) {
    role = 'assistant';
    isOtherHuman = true;
  }

  // Extract text and tool_call parts from structured parts or plain content
  const content: ContentPart[] = [];
  const meta = msg.metadata as any;
  const parts = meta?.uiMessage?.parts;
  if (Array.isArray(parts)) {
    for (const p of parts) {
      if (p.type === 'text' && p.text) content.push({ type: 'text', text: p.text });
      if (p.type === 'tool_call' && p.toolCallId) {
        content.push({
          type: 'tool-call',
          toolCallId: p.toolCallId,
          toolName: p.toolName || 'unknown',
          argsText: JSON.stringify(p.args ?? {}),
          args: p.args ?? {},
          result: p.result,
          status: p.status === 'complete'
            ? { type: 'complete' }
            : (p.status === 'waiting' || p.status === 'requires_action' || p.status === 'running' || p.status === 'streaming')
              ? { type: 'running' }
              : { type: 'incomplete', reason: 'error' },
        } as ToolCallContentPart);
      }
    }
  }

  // Handle flat tool_call metadata format from gateway
  // (gateway stores { type: 'tool_call', toolCallId, toolName, args, result, status, runId })
  if (content.length === 0 && meta?.type === 'tool_call' && meta?.toolCallId) {
    content.push({
      type: 'tool-call',
      toolCallId: meta.toolCallId,
      toolName: meta.toolName || 'unknown',
      argsText: JSON.stringify(meta.args ?? {}),
      args: meta.args ?? {},
      result: meta.result ?? undefined,
      status: meta.status === 'complete'
        ? { type: 'complete' }
        : (meta.status === 'waiting' || meta.status === 'requires_action' || meta.status === 'running' || meta.status === 'streaming')
          ? { type: 'running' }
          : { type: 'incomplete', reason: 'error' },
    } as ToolCallContentPart);
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
    metadata: { custom: { entityId: msg.entityId || undefined, isOtherHuman, runId: (msg.metadata as any)?.runId } },
  };
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useHsafaRuntime(options: UseHsafaRuntimeOptions): UseHsafaRuntimeReturn {
  const client = useHsafaClient();
  const { smartSpaceId, entityId, smartSpaces = [], onSwitchThread, onNewThread } = options;

  const [rawMessages, setRawMessages] = useState<SmartSpaceMessage[]>([]);
  const [streaming, setStreaming] = useState<StreamingMessage[]>([]);
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
    if (!smartSpaceId) { setRawMessages([]); setLoaded(false); return; }
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
  // v2 events on the space stream:
  //   smartSpace.message  → persisted message (text arrives here, not as streaming deltas)
  //   tool-call.*         → visible tool call lifecycle
  //   agent.active/inactive → loading indicator
  useEffect(() => {
    if (!smartSpaceId || !loaded) return;
    const stream = client.spaces.subscribe(smartSpaceId);
    streamRef.current = stream;

    // Restore active agents + pending tool calls from SSE connected event (survives page refresh)
    stream.on('connected', (e: StreamEvent) => {
      const agents = e.data?.activeAgents as Array<{ runId: string; agentEntityId: string; agentName?: string }> | undefined;
      if (Array.isArray(agents) && agents.length > 0) {
        for (const a of agents) {
          activeRunsRef.current.set(a.runId, { entityId: a.agentEntityId, entityName: a.agentName });
        }
        setActiveAgents(deriveActiveAgents(activeRunsRef.current));
      }

      // Restore pending tool calls for waiting_tool runs (e.g. confirmAction buttons)
      const pending = e.data?.pendingToolCalls as Array<{ runId: string; callId: string; toolName: string; args: unknown; agentEntityId: string }> | undefined;
      if (Array.isArray(pending) && pending.length > 0) {
        setToolCalls(prev => {
          const existing = new Set(prev.map(tc => tc.toolCallId));
          const newEntries = pending
            .filter(tc => !existing.has(tc.callId))
            .map(tc => ({
              toolCallId: tc.callId,
              toolName: tc.toolName,
              entityId: tc.agentEntityId,
              runId: tc.runId,
              args: tc.args as Record<string, unknown>,
              status: 'running' as const,
            }));
          return newEntries.length > 0 ? [...prev, ...newEntries] : prev;
        });
      }
    });

    // Catch-up fetch
    client.messages.list(smartSpaceId, { limit: 100 }).then(({ messages: fresh }: { messages: SmartSpaceMessage[] }) => {
      setRawMessages((prev) => {
        const ids = new Set(fresh.map((m) => m.id));
        return [...fresh, ...prev.filter((m) => !ids.has(m.id))];
      });
    }).catch(() => {});

    // space.message.streaming → live text delta from send_message
    stream.on('space.message.streaming', (e: StreamEvent) => {
      const streamId = e.data?.streamId as string;
      const phase = e.data?.phase as string;
      const delta = (e.data?.delta as string) || '';
      if (!streamId) return;

      if (phase === 'start') {
        setStreaming(prev =>
          prev.some(s => s.streamId === streamId)
            ? prev
            : [...prev, { streamId, entityId: e.agentEntityId || '', text: '', done: false }]
        );
      } else if (phase === 'delta' && delta) {
        // Use full accumulated text if available (survives page refresh),
        // otherwise fall back to appending the delta.
        const fullText = (e.data?.text as string) || '';
        setStreaming(prev => {
          const exists = prev.some(s => s.streamId === streamId);
          if (exists) {
            return prev.map(s =>
              s.streamId === streamId
                ? { ...s, text: fullText || (s.text + delta) }
                : s
            );
          }
          // Auto-create entry if we missed the 'start' (e.g. page refresh mid-stream)
          return [...prev, { streamId, entityId: (e.data?.agentEntityId as string) || e.agentEntityId || '', text: fullText || delta, done: false }];
        });
      } else if (phase === 'done') {
        setStreaming(prev => prev.map(s =>
          s.streamId === streamId ? { ...s, done: true } : s
        ));
      }
    });

    // space.message.failed → remove streaming entry
    stream.on('space.message.failed', (e: StreamEvent) => {
      const streamId = e.data?.streamId as string;
      if (streamId) setStreaming(prev => prev.filter(s => s.streamId !== streamId));
    });

    // tool.started → create tool call entry (running)
    stream.on('tool.started', (e: StreamEvent) => {
      const toolCallId = e.data?.streamId as string;
      const toolName = e.data?.toolName as string;
      if (!toolCallId || !toolName) return;
      const runId = e.runId as string | undefined;
      setToolCalls(prev =>
        prev.some(tc => tc.toolCallId === toolCallId)
          ? prev
          : [...prev, { toolCallId, toolName, entityId: e.agentEntityId || '', runId, status: 'running' as const }]
      );
    });

    // tool.streaming → progressively update partial args
    // Auto-creates entry if tool.started was missed (e.g. page refresh mid-stream)
    stream.on('tool.streaming', (e: StreamEvent) => {
      const toolCallId = e.data?.streamId as string;
      const partialArgs = e.data?.partialArgs as Record<string, unknown> | undefined;
      const toolName = e.data?.toolName as string;
      if (!toolCallId || !partialArgs) return;
      setToolCalls(prev => {
        const exists = prev.some(tc => tc.toolCallId === toolCallId);
        if (exists) {
          return prev.map(tc =>
            tc.toolCallId === toolCallId ? { ...tc, args: partialArgs } : tc
          );
        }
        // Auto-create entry if we missed tool.started (e.g. page refresh)
        return [...prev, {
          toolCallId,
          toolName: toolName || 'unknown',
          entityId: e.agentEntityId || '',
          runId: e.runId as string | undefined,
          args: partialArgs,
          status: 'running' as const,
        }];
      });
    });

    // tool.done → mark complete with result
    stream.on('tool.done', (e: StreamEvent) => {
      const toolCallId = e.data?.streamId as string;
      const result = e.data?.result;
      if (!toolCallId) return;
      setToolCalls(prev => prev.map(tc =>
        tc.toolCallId === toolCallId ? { ...tc, result, status: 'complete' as const } : tc
      ));
    });

    // tool.error → mark error
    stream.on('tool.error', (e: StreamEvent) => {
      const toolCallId = e.data?.streamId as string;
      const error = e.data?.error as string | undefined;
      if (!toolCallId) return;
      setToolCalls(prev => prev.map(tc =>
        tc.toolCallId === toolCallId ? { ...tc, status: 'error' as const, error } : tc
      ));
    });

    // run.waiting_tool → deprecated in v3 (async tools don't block), kept for v2 compat
    // Finalize tool call args from the event and ensure they're in 'running' state
    stream.on('run.waiting_tool', (e: StreamEvent) => {
      const tcs = e.data?.toolCalls as Array<{ callId: string; toolName: string; args: unknown }> | undefined;
      if (!Array.isArray(tcs)) return;
      const rid = e.runId || (e.data?.runId as string);
      setToolCalls(prev => {
        let updated = prev;
        for (const tc of tcs) {
          const exists = updated.some(t => t.toolCallId === tc.callId);
          if (exists) {
            // Update args to final values
            updated = updated.map(t =>
              t.toolCallId === tc.callId
                ? { ...t, args: tc.args as Record<string, unknown>, runId: rid || t.runId }
                : t
            );
          } else {
            // Create entry if we missed tool.started (e.g. page refresh)
            updated = [...updated, {
              toolCallId: tc.callId,
              toolName: tc.toolName,
              entityId: e.agentEntityId || '',
              runId: rid,
              args: tc.args as Record<string, unknown>,
              status: 'running' as const,
            }];
          }
        }
        return updated;
      });
    });

    // agent.active / agent.inactive → track which agents have running runs
    stream.on('agent.active', (e: StreamEvent) => {
      const eid = e.agentEntityId || (e.data?.agentEntityId as string);
      const rid = e.runId || (e.data?.runId as string);
      if (!eid || !rid) return;
      activeRunsRef.current.set(rid, { entityId: eid, entityName: (e.data?.agentName as string) || undefined });
      setActiveAgents(deriveActiveAgents(activeRunsRef.current));
    });

    stream.on('agent.inactive', (e: StreamEvent) => {
      const rid = e.runId || (e.data?.runId as string);
      if (!rid) return;
      activeRunsRef.current.delete(rid);
      setActiveAgents(deriveActiveAgents(activeRunsRef.current));
    });

    // space.message → persisted message arrived (from human send or agent send_message)
    stream.on('space.message', (e: StreamEvent) => {
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
      // Skip if no text content AND no tool_call in metadata
      if (!msg.content?.trim()) {
        const uiParts = (metadata?.uiMessage as any)?.parts;
        const hasToolCallParts = Array.isArray(uiParts) && uiParts.some((p: any) => p.type === 'tool_call');
        const isFlatToolCall = (metadata as any)?.type === 'tool_call' && (metadata as any)?.toolCallId;
        if (!hasToolCallParts && !isFlatToolCall) return;
      }

      // Dedup: mark streamId persisted BEFORE setState
      const streamId = e.data?.streamId as string | undefined;
      if (streamId) persistedRef.current.add(streamId);

      setRawMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === msg.id);
        if (idx >= 0) {
          // Update existing message (e.g. tool result arrived for a persisted tool call)
          const updated = [...prev];
          updated[idx] = msg;
          return updated;
        }
        return [...prev, msg];
      });
      if (streamId) {
        // Remove the live streaming/tool-call entry — persisted message replaces it
        setStreaming((prev) => prev.filter((s) => s.streamId !== streamId));
        setToolCalls((prev) => prev.filter((tc) => tc.toolCallId !== streamId));
      }
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
  // isRunning: only when there is actual streaming content or tool calls in-flight.
  // activeAgents is NOT included — it fires before streaming starts and would show
  // an empty assistant bubble. It's still exposed for typing indicators.
  const isRunning = streaming.some((s) => !s.done && s.text.length > 0)
    || toolCalls.some((tc) => tc.status === 'running');

  const messages = useMemo<ThreadMessageLike[]>(() => {
    // Build set of active tool call IDs to skip their persisted duplicates
    const activeToolCallIds = new Set(toolCalls.map((tc) => tc.toolCallId));

    const persisted = rawMessages
      .filter((m) => {
        // Skip persisted messages whose tool_call parts are all covered by live toolCalls
        const parts = (m.metadata as any)?.uiMessage?.parts as Array<Record<string, unknown>> | undefined;
        if (Array.isArray(parts) && parts.length > 0 && parts.every((p) => p.type === 'tool_call' && activeToolCallIds.has(p.toolCallId as string))) {
          return false;
        }
        // Also check flat tool_call metadata format
        const flatMeta = m.metadata as any;
        if (flatMeta?.type === 'tool_call' && flatMeta?.toolCallId && activeToolCallIds.has(flatMeta.toolCallId)) {
          return false;
        }
        return true;
      })
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
        argsText: JSON.stringify(tc.args ?? {}),
        args: tc.args ?? {},
        result: tc.result,
        status: tc.status === 'running'
          ? { type: 'running' }
          : tc.status === 'complete'
            ? { type: 'complete' }
            : { type: 'incomplete', reason: 'error' },
      } as ToolCallContentPart],
      createdAt: new Date(),
      metadata: { custom: { entityId: tc.entityId, runId: tc.runId } },
    }));

    // Live streaming messages from send_message (shown while agent is typing)
    const streamingMessages = streaming
      .filter((s) => s.text && !persistedRef.current.has(s.streamId))
      .map((s): ThreadMessageLike => ({
        id: s.streamId,
        role: 'assistant',
        content: [{ type: 'text', text: s.text }],
        createdAt: new Date(),
        metadata: { custom: { entityId: s.entityId } },
      }));

    return [...persisted, ...tcMessages, ...streamingMessages];
  }, [rawMessages, streaming, toolCalls, entityId]);

  // ── Send message ──
  const onNew = useCallback(
    async (message: AppendMessage) => {
      if (!smartSpaceId) throw new Error('No SmartSpace selected');
      const part = message.content[0];
      if (!part || part.type !== 'text' || !part.text) throw new Error('Only text messages supported');
      const { message: sent } = await client.messages.send(smartSpaceId, { content: part.text, entityId });

      // Optimistic: add the persisted message to state immediately.
      // If the SSE space.message event arrives later, the handler deduplicates by ID.
      if (sent?.id) {
        setRawMessages((prev) => {
          if (prev.some((m) => m.id === sent.id)) return prev;
          return [...prev, sent];
        });
      }
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
