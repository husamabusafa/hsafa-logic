import { useState, useEffect, useRef, useCallback } from "react";
import { spacesApi, type SpaceMessage } from "./api";
import { useAuth } from "./auth-context";
import type { MockMessage, MessageType, MockMember } from "./mock-data";

// =============================================================================
// useSpaceChat — real-time chat hook for a space
//
// Fetches initial messages, subscribes to SSE for live updates,
// provides send/typing/seen helpers, and tracks agent activity.
// =============================================================================

export interface AgentActivity {
  agentEntityId: string;
  agentName?: string;
  runId?: string;
}

export interface TypingUser {
  entityId: string;
  entityName: string;
}

export interface MediaMessageData {
  type: "image" | "voice" | "file";
  url?: string;
  text?: string;
  fileName?: string;
  fileSize?: number;
  fileMimeType?: string;
  audioDuration?: number;
  transcription?: string;
  thumbnailUrl?: string;
  replyToId?: string;
  /** Multiple file attachments — each uploaded separately */
  files?: Array<{
    url: string;
    fileName: string;
    fileSize: number;
    fileMimeType: string;
    thumbnailUrl?: string;
    type: "image" | "file" | "video";
  }>;
}

export interface UseSpaceChatReturn {
  messages: MockMessage[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (text: string, replyToId?: string, opts?: { type?: string; metadata?: Record<string, unknown> }) => Promise<void>;
  sendMediaMessage: (data: MediaMessageData) => Promise<void>;
  sendTyping: (typing?: boolean) => void;
  markSeen: (messageId: string) => void;
  typingUsers: TypingUser[];
  activeAgents: AgentActivity[];
  onlineUserIds: string[];
  seenWatermarks: Record<string, string>;
}

// =============================================================================
// SpaceMessage → MockMessage adapter
// =============================================================================

export function adaptMessage(
  msg: SpaceMessage,
  members: MockMember[],
): MockMessage {
  const meta = msg.metadata ?? {};
  const msgType = ((meta.type as string) || "text") as MessageType;
  const senderName =
    msg.entity?.displayName ?? members.find((m) => m.entityId === msg.entityId)?.name ?? "Unknown";
  const senderType = (msg.entity?.type ?? "human") as "human" | "agent";

  const base: MockMessage = {
    id: msg.id,
    spaceId: msg.smartSpaceId,
    entityId: msg.entityId,
    senderName,
    senderType,
    content: msg.content ?? "",
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
      messageType: (rt.messageType as MessageType) || "text",
    };
  }

  // Interactive message fields
  if (meta.audience) base.audience = meta.audience as "targeted" | "broadcast";
  if (meta.targetEntityIds) base.targetEntityIds = meta.targetEntityIds as string[];
  if (meta.status) base.status = meta.status as "open" | "resolved" | "closed";
  if (meta.responseSummary) base.responseSummary = meta.responseSummary as MockMessage["responseSummary"];
  if (meta.resolution) base.resolution = meta.resolution as MockMessage["resolution"];

  // Confirmation
  const payload = meta.payload as Record<string, unknown> | undefined;
  if (msgType === "confirmation" && payload) {
    base.title = payload.title as string;
    base.message = payload.message as string;
    base.confirmLabel = (payload.confirmLabel as string) || "Confirm";
    base.rejectLabel = (payload.rejectLabel as string) || "Cancel";
  }

  // Vote
  if (msgType === "vote" && payload) {
    base.title = payload.title as string;
    base.options = payload.options as string[];
    base.allowMultiple = payload.allowMultiple as boolean;
  }

  // Choice
  if (msgType === "choice" && payload) {
    base.title = payload.text as string;
    base.choiceOptions = payload.options as MockMessage["choiceOptions"];
  }

  // Form
  if (msgType === "form" && payload) {
    base.formTitle = payload.title as string;
    base.formDescription = payload.description as string;
    base.formFields = payload.fields as MockMessage["formFields"];
  }

  // Card
  if (msgType === "card" && payload) {
    base.cardTitle = payload.title as string;
    base.cardBody = payload.body as string;
    base.cardImageUrl = payload.imageUrl as string;
    base.cardActions = payload.actions as MockMessage["cardActions"];
  }

  // Image
  if (msgType === "image" && payload) {
    base.imageUrl = (payload.imageUrl ?? payload.url) as string;
    base.imageCaption = payload.caption as string;
    base.imageWidth = payload.width as number;
    base.imageHeight = payload.height as number;
  }

  // Voice
  if (msgType === "voice" && payload) {
    base.audioUrl = (payload.audioUrl ?? payload.url) as string;
    base.audioDuration = (payload.audioDuration ?? payload.duration) as number;
    base.transcription = payload.transcription as string;
  }

  // Video
  if (msgType === "video" && payload) {
    base.videoUrl = (payload.videoUrl ?? payload.url) as string;
    base.videoThumbnailUrl = (payload.videoThumbnailUrl ?? payload.thumbnailUrl) as string;
    base.videoDuration = (payload.videoDuration ?? payload.duration) as number;
  }

  // File
  if (msgType === "file" && payload) {
    base.fileName = (payload.fileName ?? payload.name) as string;
    base.fileSize = (payload.fileSize ?? payload.size) as number;
    base.fileMimeType = (payload.fileMimeType ?? payload.mimeType) as string;
    base.fileUrl = (payload.fileUrl ?? payload.url) as string;
  }

  // Chart — normalize AI format ({labels, datasets}) → flat array [{label, value}]
  if (msgType === "chart" && payload) {
    base.chartType = payload.chartType as MockMessage["chartType"];
    base.chartTitle = payload.title as string;

    const rawData = payload.data;
    if (Array.isArray(rawData)) {
      // Already flat array format: [{label, value, color?}]
      base.chartData = rawData as MockMessage["chartData"];
    } else if (rawData && typeof rawData === "object") {
      // Chart.js-style format: {labels: [...], datasets: [{data: [...]}]}
      const obj = rawData as { labels?: string[]; datasets?: Array<{ data?: number[]; label?: string }> };
      const labels = obj.labels || [];
      const values = obj.datasets?.[0]?.data || [];
      base.chartData = labels.map((label, i) => ({
        label,
        value: values[i] ?? 0,
      }));
    } else {
      base.chartData = [];
    }
  }

  return base;
}

// =============================================================================
// Hook
// =============================================================================

export function useSpaceChat(
  spaceId: string | undefined,
  members: MockMember[],
): UseSpaceChatReturn {
  const { user } = useAuth();
  const [messages, setMessages] = useState<MockMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [activeAgents, setActiveAgents] = useState<AgentActivity[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const [seenWatermarks, setSeenWatermarks] = useState<Record<string, string>>({});

  const eventSourceRef = useRef<EventSource | null>(null);
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const typingThrottleRef = useRef<number>(0);
  const currentEntityId = user?.entityId ?? null;

  // Refs to avoid stale closures in SSE handler and sendMessage
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
        setError(err.message || "Failed to load messages");
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [spaceId]);

  // ── SSE subscription ──
  useEffect(() => {
    if (!spaceId) return;

    const token = localStorage.getItem("hsafa_token");
    const url = `/api/smart-spaces/${spaceId}/stream${token ? `?token=${token}` : ""}`;

    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleSSEEvent(data);
      } catch (e) {
        // Ignore parse errors (keepalive comments, etc.)
      }
    };

    es.onerror = () => {
      // EventSource will auto-reconnect
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
      // Clear all typing timers
      typingTimersRef.current.forEach((t) => clearTimeout(t));
      typingTimersRef.current.clear();
    };
  }, [spaceId]);

  // ── SSE event handler ──
  const handleSSEEvent = useCallback(
    (data: Record<string, unknown>) => {
      const type = data.type as string;
      const mems = membersRef.current;
      const myEntityId = currentEntityIdRef.current;

      switch (type) {
        case "connected": {
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

        case "space.message": {
          const msg = data.message as SpaceMessage;
          if (!msg) break;
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === msg.id);
            if (idx !== -1) {
              // Optimistic stub exists — replace with full server data
              const adapted = adaptMessage(msg, mems);
              const updated = [...prev];
              updated[idx] = adapted;
              return updated;
            }
            return [...prev, adaptMessage(msg, mems)];
          });

          // Remove sender from typing list
          setTypingUsers((prev) => prev.filter((t) => t.entityId !== msg.entityId));
          break;
        }

        case "user.typing": {
          const entityId = data.entityId as string;
          const entityName = data.entityName as string;
          const typing = data.typing as boolean;

          if (entityId === myEntityId) break;

          if (typing) {
            setTypingUsers((prev) => {
              if (prev.some((t) => t.entityId === entityId)) return prev;
              return [...prev, { entityId, entityName }];
            });
            // Auto-remove after 5s if no new typing event
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

        case "user.online": {
          const entityId = data.entityId as string;
          setOnlineUserIds((prev) =>
            prev.includes(entityId) ? prev : [...prev, entityId],
          );
          break;
        }

        case "user.offline": {
          const entityId = data.entityId as string;
          setOnlineUserIds((prev) => prev.filter((id) => id !== entityId));
          break;
        }

        case "agent.active": {
          const agentEntityId = data.agentEntityId as string;
          const agentName = (data.data as Record<string, unknown>)?.agentName as string | undefined;
          const runId = data.runId as string | undefined;
          setActiveAgents((prev) => {
            if (prev.some((a) => a.agentEntityId === agentEntityId && a.runId === runId)) return prev;
            return [...prev, { agentEntityId, agentName, runId }];
          });
          break;
        }

        case "agent.inactive": {
          const agentEntityId = data.agentEntityId as string;
          const runId = data.runId as string | undefined;
          setActiveAgents((prev) =>
            prev.filter((a) => !(a.agentEntityId === agentEntityId && a.runId === runId)),
          );
          break;
        }

        case "message.seen": {
          const entityId = data.entityId as string;
          const lastSeenMessageId = data.lastSeenMessageId as string;
          setSeenWatermarks((prev) => ({ ...prev, [entityId]: lastSeenMessageId }));
          break;
        }

        case "message.updated": {
          // Interactive message was updated (response received, status changed)
          const msg = data.message as SpaceMessage;
          if (!msg) break;
          setMessages((prev) =>
            prev.map((m) => (m.id === msg.id ? adaptMessage(msg, mems) : m)),
          );
          break;
        }
      }
    },
    [],
  );

  // ── Send message (supports optional type + metadata for structured components) ──
  const sendMessage = useCallback(
    async (text: string, replyToId?: string, opts?: { type?: string; metadata?: Record<string, unknown> }) => {
      if (!spaceId || !currentEntityId) return;

      const msgType = (opts?.type || "text") as MessageType;

      // Optimistic add
      const tempId = `temp-${Date.now()}`;
      const optimistic: MockMessage = {
        id: tempId,
        spaceId,
        entityId: currentEntityId,
        senderName: user?.name ?? "You",
        senderType: "human",
        content: text,
        createdAt: new Date().toISOString(),
        seenBy: [],
        type: msgType,
      };

      // Include replyTo data in the optimistic message so the banner shows immediately
      if (replyToId) {
        const replyMsg = messagesRef.current.find((m) => m.id === replyToId);
        if (replyMsg) {
          optimistic.replyTo = {
            messageId: replyToId,
            snippet: (replyMsg.content || replyMsg.title || replyMsg.formTitle || replyMsg.cardTitle || "").slice(0, 100),
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
        if (opts?.type) body.type = opts.type;
        if (opts?.metadata) body.metadata = opts.metadata;
        if (replyToId) {
          body.replyTo = { messageId: replyToId };
        }

        const { messageId: realId } = await spacesApi.sendMessage(spaceId, body as any);

        setMessages((prev) => {
          const hasReal = prev.some((m) => m.id === realId);
          if (hasReal) {
            return prev.filter((m) => m.id !== tempId);
          }
          return prev.map((m) =>
            m.id === tempId ? { ...m, id: realId } : m,
          );
        });
      } catch (err: any) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        throw err;
      }
    },
    [spaceId, currentEntityId, user?.name],
  );

  // ── Send media message (supports multi-file attachments) ──
  const sendMediaMessage = useCallback(
    async (data: MediaMessageData) => {
      if (!spaceId || !currentEntityId) return;

      // Build metadata payload based on type
      const payload: Record<string, unknown> = {};
      const filesArray: Array<Record<string, unknown>> = [];
      let contentText = data.text || "";
      let msgType = data.type;

      // Multi-file attachments
      if (data.files && data.files.length > 0) {
        for (const f of data.files) {
          filesArray.push({
            url: f.url,
            fileName: f.fileName,
            fileSize: f.fileSize,
            fileMimeType: f.fileMimeType,
            thumbnailUrl: f.thumbnailUrl,
            type: f.type,
          });
        }
        // If all files are images, primary type is "image"; otherwise "file"
        const allImages = data.files.every(f => f.type === "image");
        msgType = allImages ? "image" : "file";
      } else {
        // Single file fallback
        switch (data.type) {
          case "image":
            payload.imageUrl = data.url;
            if (data.thumbnailUrl) payload.thumbnailUrl = data.thumbnailUrl;
            break;
          case "voice":
            payload.audioUrl = data.url;
            payload.audioDuration = data.audioDuration;
            payload.transcription = data.transcription;
            if (!contentText) contentText = "";
            break;
          case "file":
            payload.fileUrl = data.url;
            payload.fileName = data.fileName;
            payload.fileSize = data.fileSize;
            payload.fileMimeType = data.fileMimeType;
            break;
        }
      }

      // Optimistic add
      const tempId = `temp-${Date.now()}`;
      const optimistic: MockMessage = {
        id: tempId,
        spaceId,
        entityId: currentEntityId,
        senderName: user?.name ?? "You",
        senderType: "human",
        content: contentText,
        createdAt: new Date().toISOString(),
        seenBy: [],
        type: msgType,
        ...(msgType === "image" && data.url ? { imageUrl: data.url, imageCaption: data.text } : {}),
        ...(msgType === "voice" ? { audioUrl: data.url, audioDuration: data.audioDuration, transcription: data.transcription } : {}),
        ...(msgType === "file" && data.url ? { fileUrl: data.url, fileName: data.fileName, fileSize: data.fileSize, fileMimeType: data.fileMimeType } : {}),
      };

      if (data.replyToId) {
        const replyMsg = messagesRef.current.find((m) => m.id === data.replyToId);
        if (replyMsg) {
          optimistic.replyTo = {
            messageId: data.replyToId,
            snippet: (replyMsg.content || replyMsg.title || replyMsg.formTitle || replyMsg.cardTitle || "").slice(0, 100),
            senderName: replyMsg.senderName,
            messageType: replyMsg.type,
          };
        }
      }

      setMessages((prev) => [...prev, optimistic]);

      try {
        const metadata: Record<string, unknown> = { type: msgType, payload };
        if (filesArray.length > 0) metadata.files = filesArray;

        const body: Record<string, unknown> = {
          entityId: currentEntityId,
          content: contentText,
          type: msgType,
          metadata,
        };
        if (data.replyToId) {
          body.replyTo = { messageId: data.replyToId };
        }

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
