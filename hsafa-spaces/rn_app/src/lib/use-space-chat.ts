import { useState, useEffect, useRef, useCallback } from 'react';
import { spacesApi, type SpaceMessage } from './api';
import { useAuth } from './auth-context';
import { connectSSE, type SSEConnection } from './sse';
import type { Message, MessageType, Member, AgentActivity, TypingUser } from './types';

// =============================================================================
// SpaceMessage → Message adapter (mirrors web app's adaptMessage)
// =============================================================================

export function adaptMessage(msg: SpaceMessage, members: Member[]): Message {
  const meta = msg.metadata ?? {};
  const msgType = ((meta.type as string) || 'text') as MessageType;
  const senderName =
    msg.entity?.displayName ?? members.find((m) => m.entityId === msg.entityId)?.name ?? 'Unknown';
  const senderType = (msg.entity?.type ?? 'human') as 'human' | 'agent';

  const base: Message = {
    id: msg.id,
    spaceId: msg.smartSpaceId,
    entityId: msg.entityId,
    senderName,
    senderType,
    content: msg.content ?? '',
    createdAt: msg.createdAt,
    seenBy: [],
    type: msgType,
  };

  // Reply-to
  if (meta.replyTo) {
    const rt = meta.replyTo as Record<string, unknown>;
    base.replyTo = {
      messageId: rt.messageId as string,
      snippet: rt.snippet as string,
      senderName: rt.senderName as string,
      messageType: (rt.messageType as MessageType) || 'text',
    };
  }

  // Interactive message fields
  if (meta.audience) base.audience = meta.audience as 'targeted' | 'broadcast';
  if (meta.targetEntityIds) base.targetEntityIds = meta.targetEntityIds as string[];
  if (meta.status) base.status = meta.status as 'open' | 'resolved' | 'closed';
  if (meta.responseSummary) base.responseSummary = meta.responseSummary as Message['responseSummary'];
  if (meta.resolution) base.resolution = meta.resolution as Message['resolution'];
  if (meta.allowUpdate !== undefined) base.allowUpdate = meta.allowUpdate as boolean;

  const payload = meta.payload as Record<string, unknown> | undefined;

  // Confirmation
  if (msgType === 'confirmation' && payload) {
    base.title = payload.title as string;
    base.message = payload.message as string;
    base.confirmLabel = (payload.confirmLabel as string) || 'Confirm';
    base.rejectLabel = (payload.rejectLabel as string) || 'Cancel';
    if (payload.allowUpdate !== undefined) base.allowUpdate = payload.allowUpdate as boolean;
  }

  // Vote
  if (msgType === 'vote' && payload) {
    base.title = payload.title as string;
    base.options = payload.options as string[];
    base.allowMultiple = payload.allowMultiple as boolean;
  }

  // Choice
  if (msgType === 'choice' && payload) {
    base.title = payload.text as string;
    base.choiceOptions = payload.options as Message['choiceOptions'];
    if (payload.allowUpdate !== undefined) base.allowUpdate = payload.allowUpdate as boolean;
  }

  // Form
  if (msgType === 'form' && payload) {
    base.formTitle = payload.title as string;
    base.formDescription = payload.description as string;
    base.formFields = payload.fields as Message['formFields'];
    if (payload.allowUpdate !== undefined) base.allowUpdate = payload.allowUpdate as boolean;
  }

  // Card
  if (msgType === 'card' && payload) {
    base.cardTitle = payload.title as string;
    base.cardBody = payload.body as string;
    base.cardImageUrl = payload.imageUrl as string;
    base.cardActions = payload.actions as Message['cardActions'];
  }

  // Image
  if (msgType === 'image' && payload) {
    base.imageUrl = (payload.imageUrl ?? payload.url) as string;
    base.imageCaption = payload.caption as string;
    base.imageWidth = payload.width as number;
    base.imageHeight = payload.height as number;
  }

  // Voice
  if (msgType === 'voice' && payload) {
    base.audioUrl = (payload.audioUrl ?? payload.url) as string;
    base.audioDuration = (payload.audioDuration ?? payload.duration) as number;
    base.transcription = payload.transcription as string;
  }

  // Video
  if (msgType === 'video' && payload) {
    base.videoUrl = (payload.videoUrl ?? payload.url) as string;
    base.videoThumbnailUrl = (payload.videoThumbnailUrl ?? payload.thumbnailUrl) as string;
    base.videoDuration = (payload.videoDuration ?? payload.duration) as number;
  }

  // File
  if (msgType === 'file' && payload) {
    base.fileName = (payload.fileName ?? payload.name) as string;
    base.fileSize = (payload.fileSize ?? payload.size) as number;
    base.fileMimeType = (payload.fileMimeType ?? payload.mimeType) as string;
    base.fileUrl = (payload.fileUrl ?? payload.url) as string;
  }

  // Multi-file attachments
  const filesArr = meta.files as Array<Record<string, unknown>> | undefined;
  if (filesArr && Array.isArray(filesArr) && filesArr.length > 0) {
    base.attachments = filesArr.map((f) => ({
      url: (f.url as string) || '',
      fileName: (f.fileName as string) || 'file',
      fileSize: (f.fileSize as number) || 0,
      fileMimeType: (f.fileMimeType as string) || 'application/octet-stream',
      thumbnailUrl: f.thumbnailUrl as string | undefined,
      type: (f.type as 'image' | 'file' | 'video') || 'file',
    }));
  }

  // Chart
  if (msgType === 'chart' && payload) {
    base.chartType = payload.chartType as Message['chartType'];
    base.chartTitle = payload.title as string;
    const rawData = payload.data;
    if (Array.isArray(rawData)) {
      base.chartData = rawData as Message['chartData'];
    } else if (rawData && typeof rawData === 'object') {
      const obj = rawData as { labels?: string[]; datasets?: Array<{ data?: number[] }> };
      const labels = obj.labels || [];
      const values = obj.datasets?.[0]?.data || [];
      base.chartData = labels.map((label, i) => ({ label, value: values[i] ?? 0 }));
    } else {
      base.chartData = [];
    }
  }

  return base;
}

// =============================================================================
// useSpaceChat hook
// =============================================================================

export interface MediaMessageData {
  type: 'image' | 'voice' | 'file';
  url: string;
  caption?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  duration?: number;
  transcription?: string;
  width?: number;
  height?: number;
}

export interface UseSpaceChatReturn {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (text: string, replyToId?: string) => Promise<void>;
  sendMediaMessage: (media: MediaMessageData) => Promise<void>;
  sendTyping: (typing?: boolean) => void;
  markSeen: (messageId: string) => void;
  typingUsers: TypingUser[];
  activeAgents: AgentActivity[];
  onlineUserIds: string[];
  seenWatermarks: Record<string, string>;
}

export function useSpaceChat(
  spaceId: string | undefined,
  members: Member[],
): UseSpaceChatReturn {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [activeAgents, setActiveAgents] = useState<AgentActivity[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const [seenWatermarks, setSeenWatermarks] = useState<Record<string, string>>({});

  const sseRef = useRef<SSEConnection | null>(null);
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const typingThrottleRef = useRef<number>(0);
  const currentEntityId = user?.entityId ?? null;

  const membersRef = useRef(members);
  membersRef.current = members;
  const currentEntityIdRef = useRef(currentEntityId);
  currentEntityIdRef.current = currentEntityId;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // ── Fetch initial messages ──
  useEffect(() => {
    if (!spaceId) return;
    let cancelled = false;

    setIsLoading(true);
    setError(null);
    setMessages([]);
    setTypingUsers([]);
    setActiveAgents([]);

    spacesApi
      .listMessages(spaceId, { limit: 50 })
      .then(({ messages: msgs }) => {
        if (cancelled) return;
        setMessages(msgs.map((m) => adaptMessage(m, membersRef.current)));
        setIsLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || 'Failed to load messages');
        setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [spaceId]);

  // ── SSE handler ──
  const handleSSEEvent = useCallback((data: Record<string, unknown>) => {
    const type = data.type as string;
    const mems = membersRef.current;
    const myEntityId = currentEntityIdRef.current;

    switch (type) {
      case 'connected': {
        const d = data.data as Record<string, unknown>;
        if (d?.onlineUsers) setOnlineUserIds(d.onlineUsers as string[]);
        if (d?.seenWatermarks) setSeenWatermarks(d.seenWatermarks as Record<string, string>);
        if (d?.activeAgents) {
          setActiveAgents(
            (d.activeAgents as Array<Record<string, unknown>>).map((a) => ({
              agentEntityId: a.agentEntityId as string,
              agentName: a.agentName as string,
              runId: a.runId as string,
            })),
          );
        }
        break;
      }

      case 'space.message': {
        const msg = data.message as SpaceMessage;
        if (!msg) break;
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === msg.id);
          if (idx !== -1) {
            const adapted = adaptMessage(msg, mems);
            const updated = [...prev];
            updated[idx] = adapted;
            return updated;
          }
          return [...prev, adaptMessage(msg, mems)];
        });
        setTypingUsers((prev) => prev.filter((t) => t.entityId !== msg.entityId));
        break;
      }

      case 'user.typing': {
        const entityId = data.entityId as string;
        const entityName = data.entityName as string;
        const typing = data.typing as boolean;
        const activity = (data.activity as 'typing' | 'recording') || 'typing';

        if (entityId === myEntityId) break;

        if (typing) {
          setTypingUsers((prev) => {
            const existing = prev.find((t) => t.entityId === entityId);
            if (existing) {
              if (existing.activity === activity) return prev;
              return prev.map((t) => t.entityId === entityId ? { ...t, activity } : t);
            }
            return [...prev, { entityId, entityName, activity }];
          });
          const existing = typingTimersRef.current.get(entityId);
          if (existing) clearTimeout(existing);
          typingTimersRef.current.set(
            entityId,
            setTimeout(() => {
              setTypingUsers((prev) => prev.filter((t) => t.entityId !== entityId));
              typingTimersRef.current.delete(entityId);
            }, 5000),
          );
        } else {
          setTypingUsers((prev) => prev.filter((t) => t.entityId !== entityId));
          const existing = typingTimersRef.current.get(entityId);
          if (existing) {
            clearTimeout(existing);
            typingTimersRef.current.delete(entityId);
          }
        }
        break;
      }

      case 'user.online': {
        const entityId = data.entityId as string;
        setOnlineUserIds((prev) => prev.includes(entityId) ? prev : [...prev, entityId]);
        break;
      }

      case 'user.offline': {
        const entityId = data.entityId as string;
        setOnlineUserIds((prev) => prev.filter((id) => id !== entityId));
        break;
      }

      case 'agent.active': {
        const agentEntityId = data.agentEntityId as string;
        const agentName = (data.data as Record<string, unknown>)?.agentName as string | undefined;
        const runId = data.runId as string | undefined;
        setActiveAgents((prev) => {
          if (prev.some((a) => a.agentEntityId === agentEntityId && a.runId === runId)) return prev;
          return [...prev, { agentEntityId, agentName, runId }];
        });
        break;
      }

      case 'agent.inactive': {
        const agentEntityId = data.agentEntityId as string;
        const runId = data.runId as string | undefined;
        setActiveAgents((prev) =>
          prev.filter((a) => !(a.agentEntityId === agentEntityId && a.runId === runId)),
        );
        break;
      }

      case 'message.seen': {
        const entityId = data.entityId as string;
        const lastSeenMessageId = data.lastSeenMessageId as string;
        setSeenWatermarks((prev) => ({ ...prev, [entityId]: lastSeenMessageId }));
        break;
      }

      case 'message.updated': {
        const msg = data.message as SpaceMessage;
        if (!msg) break;
        setMessages((prev) =>
          prev.map((m) => (m.id === msg.id ? adaptMessage(msg, mems) : m)),
        );
        break;
      }

      case 'message.response':
      case 'message.response_updated': {
        const msgId = data.messageId as string;
        const responseSummary = data.responseSummary as Message['responseSummary'];
        if (!msgId || !responseSummary) break;
        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, responseSummary } : m)),
        );
        break;
      }

      case 'message.resolved': {
        const msgId = data.messageId as string;
        const resolution = data.resolution as Message['resolution'];
        const responseSummary = data.responseSummary as Message['responseSummary'];
        if (!msgId) break;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? { ...m, status: 'resolved' as const, resolution, ...(responseSummary ? { responseSummary } : {}) }
              : m,
          ),
        );
        break;
      }

      case 'message.closed': {
        const msgId = data.messageId as string;
        const resolution = data.resolution as Message['resolution'];
        const responseSummary = data.responseSummary as Message['responseSummary'];
        if (!msgId) break;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? { ...m, status: 'closed' as const, resolution, ...(responseSummary ? { responseSummary } : {}) }
              : m,
          ),
        );
        break;
      }
    }
  }, []);

  // ── SSE subscription ──
  useEffect(() => {
    if (!spaceId) return;

    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let active = true;

    const connect = async () => {
      try {
        const conn = await connectSSE(
          `/api/smart-spaces/${spaceId}/stream`,
          (evt) => {
            try {
              const data = JSON.parse(evt.data);
              handleSSEEvent(data);
            } catch {}
          },
          () => {
            // Auto-reconnect after 3s
            if (active) reconnectTimer = setTimeout(connect, 3000);
          },
        );
        if (active) {
          sseRef.current = conn;
        } else {
          conn.close();
        }
      } catch {
        if (active) reconnectTimer = setTimeout(connect, 3000);
      }
    };

    connect();

    return () => {
      active = false;
      sseRef.current?.close();
      sseRef.current = null;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      typingTimersRef.current.forEach((t) => clearTimeout(t));
      typingTimersRef.current.clear();
    };
  }, [spaceId, handleSSEEvent]);

  // ── Send message ──
  const sendMessage = useCallback(
    async (text: string, replyToId?: string) => {
      if (!spaceId || !currentEntityId) return;

      const tempId = `temp-${Date.now()}`;
      const optimistic: Message = {
        id: tempId,
        spaceId,
        entityId: currentEntityId,
        senderName: user?.name ?? 'You',
        senderType: 'human',
        content: text,
        createdAt: new Date().toISOString(),
        seenBy: [],
        type: 'text',
      };

      if (replyToId) {
        const replyMsg = messagesRef.current.find((m) => m.id === replyToId);
        if (replyMsg) {
          optimistic.replyTo = {
            messageId: replyToId,
            snippet: (replyMsg.content || replyMsg.title || replyMsg.formTitle || replyMsg.cardTitle || '').slice(0, 100),
            senderName: replyMsg.senderName,
            messageType: replyMsg.type,
          };
        }
      }

      setMessages((prev) => [...prev, optimistic]);

      try {
        const body: Record<string, unknown> = {
          entityId: currentEntityId,
          content: text,
        };
        if (replyToId) body.replyTo = { messageId: replyToId };

        const { messageId: realId } = await spacesApi.sendMessage(spaceId, body as any);

        setMessages((prev) => {
          const hasReal = prev.some((m) => m.id === realId);
          if (hasReal) return prev.filter((m) => m.id !== tempId);
          return prev.map((m) => (m.id === tempId ? { ...m, id: realId } : m));
        });
      } catch (err: any) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        throw err;
      }
    },
    [spaceId, currentEntityId, user?.name],
  );

  // ── Send media message ──
  const sendMediaMessage = useCallback(
    async (media: MediaMessageData) => {
      if (!spaceId || !currentEntityId) return;

      const tempId = `temp-${Date.now()}`;
      const optimistic: Message = {
        id: tempId,
        spaceId,
        entityId: currentEntityId,
        senderName: user?.name ?? 'You',
        senderType: 'human',
        content: media.caption || '',
        createdAt: new Date().toISOString(),
        seenBy: [],
        type: media.type,
        ...(media.type === 'image' && { imageUrl: media.url, imageCaption: media.caption, imageWidth: media.width, imageHeight: media.height }),
        ...(media.type === 'voice' && { audioUrl: media.url, audioDuration: media.duration, transcription: media.transcription }),
        ...(media.type === 'file' && { fileUrl: media.url, fileName: media.fileName, fileSize: media.fileSize, fileMimeType: media.mimeType }),
      };

      setMessages((prev) => [...prev, optimistic]);

      try {
        const payload: Record<string, unknown> = {
          entityId: currentEntityId,
          content: media.caption || '',
          type: media.type,
          metadata: {
            type: media.type,
            payload: {
              ...(media.type === 'image' && { url: media.url, imageUrl: media.url, caption: media.caption, width: media.width, height: media.height }),
              ...(media.type === 'voice' && { url: media.url, audioUrl: media.url, duration: media.duration, audioDuration: media.duration, transcription: media.transcription }),
              ...(media.type === 'file' && { url: media.url, fileUrl: media.url, fileName: media.fileName, fileSize: media.fileSize, mimeType: media.mimeType, fileMimeType: media.mimeType }),
            },
          },
        };

        const { messageId: realId } = await spacesApi.sendMessage(spaceId, payload as any);

        setMessages((prev) => {
          const hasReal = prev.some((m) => m.id === realId);
          if (hasReal) return prev.filter((m) => m.id !== tempId);
          return prev.map((m) => (m.id === tempId ? { ...m, id: realId } : m));
        });
      } catch (err: any) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        throw err;
      }
    },
    [spaceId, currentEntityId, user?.name],
  );

  // ── Typing indicator (throttled) ──
  const sendTyping = useCallback(
    (typing: boolean = true) => {
      if (!spaceId) return;
      const now = Date.now();
      if (typing && now - typingThrottleRef.current < 3000) return;
      typingThrottleRef.current = now;
      spacesApi.sendTyping(spaceId, typing).catch(() => {});
    },
    [spaceId],
  );

  // ── Mark seen ──
  const markSeen = useCallback(
    (messageId: string) => {
      if (!spaceId) return;
      spacesApi.markSeen(spaceId, messageId).catch(() => {});
    },
    [spaceId],
  );

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    sendMediaMessage,
    sendTyping,
    markSeen,
    typingUsers,
    activeAgents,
    onlineUserIds,
    seenWatermarks,
  };
}
