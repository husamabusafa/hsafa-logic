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

// =============================================================================
// Types for assistant-ui integration
// =============================================================================

export interface TextContentPart {
  type: 'text';
  text: string;
}

export interface ToolCallContentPart {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  argsText?: string;
  args?: Record<string, unknown>;
  result?: unknown;
}

export interface ReasoningContentPart {
  type: 'reasoning';
  text: string;
}

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

// =============================================================================
// Streaming message state
// =============================================================================

interface StreamingMessage {
  id: string;          // runId
  entityId: string;
  text: string;        // accumulated text from sendSpaceMessage
  isStreaming: boolean;
}

// =============================================================================
// Hook Options & Return
// =============================================================================

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
  onNew: (message: AppendMessage) => Promise<void>;
  threadListAdapter?: ThreadListAdapter;
  membersById: Record<string, Entity>;
}

// =============================================================================
// Helper: Convert SmartSpaceMessage → ThreadMessageLike
// =============================================================================

function convertMessage(msg: SmartSpaceMessage, currentEntityId?: string): ThreadMessageLike | null {
  if (msg.role === 'tool') return null;

  let role: 'user' | 'assistant' = msg.role === 'user' ? 'user' : 'assistant';
  let isOtherHuman = false;

  if (msg.role === 'user' && currentEntityId && msg.entityId && msg.entityId !== currentEntityId) {
    role = 'assistant';
    isOtherHuman = true;
  }

  const content: ContentPart[] = [];

  // Extract structured parts from metadata.uiMessage if present
  const uiMessage = (msg.metadata as any)?.uiMessage;
  if (uiMessage?.parts && Array.isArray(uiMessage.parts)) {
    for (const part of uiMessage.parts) {
      if (part.type === 'text' && part.text) {
        content.push({ type: 'text', text: part.text });
      }
    }
  }

  // Fallback to plain content
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

// =============================================================================
// Hook
// =============================================================================

export function useHsafaRuntime(options: UseHsafaRuntimeOptions): UseHsafaRuntimeReturn {
  const client = useHsafaClient();
  const {
    smartSpaceId,
    entityId,
    smartSpaces = [],
    onSwitchThread,
    onNewThread,
  } = options;

  const [rawMessages, setRawMessages] = useState<SmartSpaceMessage[]>([]);
  const [streamingMessages, setStreamingMessages] = useState<StreamingMessage[]>([]);
  const [membersById, setMembersById] = useState<Record<string, Entity>>({});
  const streamRef = useRef<HsafaStream | null>(null);
  const [messagesLoaded, setMessagesLoaded] = useState(false);

  // Load initial messages
  useEffect(() => {
    if (!smartSpaceId) {
      setRawMessages([]);
      setStreamingMessages([]);
      setMessagesLoaded(false);
      return;
    }

    setMessagesLoaded(false);
    client.messages.list(smartSpaceId, { limit: 100 }).then(({ messages }) => {
      setRawMessages(messages);
      setMessagesLoaded(true);
    }).catch(() => {
      setMessagesLoaded(true);
    });
  }, [client, smartSpaceId]);

  // Load members
  useEffect(() => {
    if (!smartSpaceId) {
      setMembersById({});
      return;
    }

    client.spaces.listMembers(smartSpaceId).then(({ members }) => {
      const map: Record<string, Entity> = {};
      for (const m of members) {
        if (m.entity) {
          map[m.entityId] = m.entity;
        }
      }
      setMembersById(map);
    }).catch(() => {});
  }, [client, smartSpaceId]);

  // Subscribe to space SSE.
  //
  // In the general-purpose run model, runs do NOT relay events to spaces.
  // The ONLY events on the space SSE are:
  //   - smartSpace.message  — persisted messages (from human posts & sendSpaceMessage)
  //   - text-delta          — real LLM streaming from sendSpaceMessage tool-input interception
  //   - finish              — sendSpaceMessage call completed
  //   - smartSpace.member.* — membership changes
  //
  // No reconstruction from run events needed — page refresh loads persisted messages.
  useEffect(() => {
    if (!smartSpaceId || !messagesLoaded) return;

    const stream = client.spaces.subscribe(smartSpaceId);
    streamRef.current = stream;

    // Catch-up: re-fetch to cover the window between initial load and SSE connection
    client.messages.list(smartSpaceId, { limit: 100 }).then(({ messages: fresh }: { messages: SmartSpaceMessage[] }) => {
      setRawMessages((prev) => {
        const freshIds = new Set(fresh.map((m) => m.id));
        const sseOnly = prev.filter((m) => !freshIds.has(m.id));
        return [...fresh, ...sseOnly];
      });
    }).catch(() => {});

    // ── smartSpace.message: persisted message arrived ──
    stream.on('smartSpace.message', (event: StreamEvent) => {
      const raw = event.data?.message as Record<string, unknown> | undefined;
      if (!raw || !raw.id) return;

      let content = raw.content as string | undefined;
      if (!content && Array.isArray(raw.parts)) {
        content = (raw.parts as Array<{ type: string; text?: string }>)
          .filter((p) => p.type === 'text' && p.text)
          .map((p) => p.text)
          .join('\n');
      }

      let metadata = (raw.metadata as Record<string, unknown>) || null;
      if (!metadata && Array.isArray(raw.parts)) {
        metadata = { uiMessage: { parts: raw.parts } };
      }

      const msg: SmartSpaceMessage = {
        id: raw.id as string,
        smartSpaceId: event.smartSpaceId || (raw.smartSpaceId as string) || '',
        entityId: (raw.entityId as string) || event.entityId || null,
        seq: (raw.seq as string) || String(event.seq || '0'),
        role: (raw.role as string) || 'user',
        content: content || null,
        metadata,
        createdAt: (raw.createdAt as string) || new Date().toISOString(),
      };

      if (!msg.content?.trim()) return;

      setRawMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });

      // Remove streaming entry — persisted message takes over
      if (event.runId) {
        setStreamingMessages((prev) => prev.filter((sm) => sm.id !== event.runId));
      }
    });

    // ── text-delta: real LLM streaming from sendSpaceMessage ──
    stream.on('text-delta', (event: StreamEvent) => {
      const runId = event.runId || (event.data.runId as string);
      const delta = (event.data.delta as string) || (event.data.text as string) || '';
      if (!runId || !delta) return;

      setStreamingMessages((prev) => {
        const existing = prev.find((sm) => sm.id === runId);
        if (existing) {
          return prev.map((sm) =>
            sm.id === runId ? { ...sm, text: sm.text + delta } : sm
          );
        }
        return [...prev, { id: runId, entityId: event.entityId || '', text: delta, isStreaming: true }];
      });
    });

    // ── finish: sendSpaceMessage call completed ──
    stream.on('finish', (event: StreamEvent) => {
      const runId = event.runId || (event.data.runId as string);
      if (!runId) return;
      setStreamingMessages((prev) =>
        prev.map((sm) =>
          sm.id === runId ? { ...sm, isStreaming: false } : sm
        )
      );
    });

    return () => {
      stream.close();
      streamRef.current = null;
      setStreamingMessages([]);
    };
  }, [client, smartSpaceId, messagesLoaded]);

  // Build final message list
  const isRunning = streamingMessages.some((sm) => sm.isStreaming);

  const messages = useMemo<ThreadMessageLike[]>(() => {
    const persisted = rawMessages
      .map((m) => convertMessage(m, entityId))
      .filter((m): m is ThreadMessageLike => m !== null);

    const streaming = streamingMessages
      .filter((sm) => sm.text)
      .map((sm): ThreadMessageLike => ({
        id: sm.id,
        role: 'assistant',
        content: [{ type: 'text', text: sm.text }],
        createdAt: new Date(),
        metadata: { custom: { entityId: sm.entityId } },
      }));

    return [...persisted, ...streaming];
  }, [rawMessages, streamingMessages]);

  // Send message
  const onNew = useCallback(
    async (message: AppendMessage) => {
      if (!smartSpaceId) throw new Error('No SmartSpace selected');
      const firstPart = message.content[0];
      if (!firstPart || firstPart.type !== 'text' || !firstPart.text) {
        throw new Error('Only text messages are supported');
      }
      await client.messages.send(smartSpaceId, { content: firstPart.text, entityId });
    },
    [client, smartSpaceId, entityId]
  );

  // Thread list adapter
  const threadListAdapter: ThreadListAdapter | undefined =
    onSwitchThread
      ? {
          threadId: smartSpaceId ?? undefined,
          threads: smartSpaces.map((ss) => ({
            threadId: ss.id,
            status: 'regular' as const,
            title: ss.name ?? 'Untitled',
          })),
          archivedThreads: [],
          onSwitchToThread: (threadId: string) => {
            onSwitchThread(threadId);
          },
          onSwitchToNewThread: () => {
            onNewThread?.();
          },
        }
      : undefined;

  return {
    messages,
    isRunning,
    onNew,
    threadListAdapter,
    membersById,
  };
}
