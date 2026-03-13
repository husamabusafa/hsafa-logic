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

export interface UseSpaceChatReturn {
  messages: MockMessage[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (text: string, replyToId?: string) => Promise<void>;
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
    base.imageUrl = payload.url as string;
    base.imageCaption = payload.caption as string;
    base.imageWidth = payload.width as number;
    base.imageHeight = payload.height as number;
  }

  // Voice
  if (msgType === "voice" && payload) {
    base.audioUrl = payload.url as string;
    base.audioDuration = payload.duration as number;
    base.transcription = payload.transcription as string;
  }

  // Video
  if (msgType === "video" && payload) {
    base.videoUrl = payload.url as string;
    base.videoThumbnailUrl = payload.thumbnailUrl as string;
    base.videoDuration = payload.duration as number;
  }

  // File
  if (msgType === "file" && payload) {
    base.fileName = payload.name as string;
    base.fileSize = payload.size as number;
    base.fileMimeType = payload.mimeType as string;
    base.fileUrl = payload.url as string;
  }

  // Chart
  if (msgType === "chart" && payload) {
    base.chartType = payload.chartType as MockMessage["chartType"];
    base.chartTitle = payload.title as string;
    base.chartData = payload.data as MockMessage["chartData"];
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

  // Refs to avoid stale closures in SSE handler
  const membersRef = useRef(members);
  membersRef.current = members;
  const currentEntityIdRef = useRef(currentEntityId);
  currentEntityIdRef.current = currentEntityId;

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
            // Deduplicate — avoid adding if already exists
            if (prev.some((m) => m.id === msg.id)) return prev;
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

  // ── Send message ──
  const sendMessage = useCallback(
    async (text: string, replyToId?: string) => {
      if (!spaceId || !currentEntityId) return;

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
        type: "text",
      };
      setMessages((prev) => [...prev, optimistic]);

      try {
        const body: Record<string, unknown> = {
          entityId: currentEntityId,
          content: text,
        };
        if (replyToId) {
          body.replyTo = { messageId: replyToId };
        }

        const { messageId: realId } = await spacesApi.sendMessage(spaceId, body as any);

        // Replace optimistic message with real one when SSE delivers it.
        // The SSE event will add the real message; remove the temp.
        // But the SSE might arrive before or after this response.
        // Handle both: if real message already in list, just remove temp.
        // If not yet, keep temp but update its ID so SSE dedup works.
        setMessages((prev) => {
          const hasReal = prev.some((m) => m.id === realId);
          if (hasReal) {
            // SSE already delivered it — remove optimistic
            return prev.filter((m) => m.id !== tempId);
          }
          // SSE hasn't delivered yet — update temp's ID so SSE dedup catches it
          return prev.map((m) =>
            m.id === tempId ? { ...m, id: realId } : m,
          );
        });
      } catch (err: any) {
        // Remove optimistic on error
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
    sendTyping,
    markSeen,
    typingUsers,
    activeAgents,
    onlineUserIds,
    seenWatermarks,
  };
}
