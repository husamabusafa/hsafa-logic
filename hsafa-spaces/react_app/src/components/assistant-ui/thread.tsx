
import {
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useMessage,
} from "@assistant-ui/react";
import { useMembers, useTypingUsers, useSeenWatermarks, useCurrentSpace, ReasoningPart, ToolCallPart, ImageToolUI } from "@/lib/hsafa-ui";
import { useHsafaClient } from "@/lib/hsafa-react";
import { ProductCard } from "./product-card";
import { ConfirmationUI } from "./confirmation-ui";
import { ChartDisplay } from "./chart-display";
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, CheckCheckIcon } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

export function Thread() {
  const { spaceId } = useCurrentSpace();
  const rootRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const [composerHeight, setComposerHeight] = useState(88);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const isPinnedToBottomRef = useRef(true);

  const getViewport = useCallback(() => {
    return rootRef.current?.querySelector('[data-chat-viewport="true"]') as HTMLDivElement | null;
  }, []);

  const updateScrollState = useCallback(() => {
    const viewport = getViewport();
    if (!viewport) return;
    const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    const isNearBottom = distanceFromBottom <= 96;
    isPinnedToBottomRef.current = isNearBottom;
    setShowJumpToBottom(!isNearBottom);
  }, [getViewport]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const viewport = getViewport();
    if (!viewport) return;
    requestAnimationFrame(() => {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior });
    });
  }, [getViewport]);

  useEffect(() => {
    const viewport = getViewport();
    if (!viewport) return;

    const handleScroll = () => updateScrollState();
    viewport.addEventListener("scroll", handleScroll, { passive: true });
    updateScrollState();

    return () => viewport.removeEventListener("scroll", handleScroll);
  }, [getViewport, updateScrollState]);

  useEffect(() => {
    const viewport = getViewport();
    if (!viewport) return;

    const observer = new MutationObserver(() => {
      const shouldStayPinned = isPinnedToBottomRef.current;
      requestAnimationFrame(() => {
        if (shouldStayPinned) {
          viewport.scrollTo({ top: viewport.scrollHeight, behavior: "auto" });
        }
        updateScrollState();
      });
    });

    observer.observe(viewport, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, [getViewport, updateScrollState]);

  useEffect(() => {
    const composer = composerRef.current;
    if (!composer) return;

    const syncComposerHeight = () => {
      const nextHeight = Math.ceil(composer.getBoundingClientRect().height);
      setComposerHeight((prev) => (prev === nextHeight ? prev : nextHeight));
      if (isPinnedToBottomRef.current) {
        scrollToBottom("auto");
      }
    };

    syncComposerHeight();

    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => syncComposerHeight());
    observer.observe(composer);

    return () => observer.disconnect();
  }, [scrollToBottom]);

  useEffect(() => {
    isPinnedToBottomRef.current = true;
    setShowJumpToBottom(false);
    scrollToBottom("auto");
  }, [scrollToBottom, spaceId]);

  return (
    <div ref={rootRef} className="relative flex h-full flex-col bg-background">
      <ThreadPrimitive.Root className="flex h-full flex-col bg-background">
      <ThreadPrimitive.Viewport
        data-chat-viewport="true"
        className="scrollbar-none flex flex-1 flex-col overflow-y-auto overscroll-contain scroll-smooth"
      >
        <div
          className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 pt-6"
          style={{ paddingBottom: composerHeight + 20 }}
        >
          <ThreadPrimitive.Empty>
            <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
              <p className="text-muted-foreground text-sm">
                How can I help you today?
              </p>
            </div>
          </ThreadPrimitive.Empty>

          <ThreadPrimitive.Messages
            components={{
              UserMessage,
              AssistantMessage,
            }}
          />

          <TypingIndicator />
          <AutoMarkSeen />
        </div>
      </ThreadPrimitive.Viewport>

      {showJumpToBottom && (
        <div
          className="pointer-events-none absolute inset-x-0 z-10 flex justify-end px-4"
          style={{ bottom: composerHeight + 16 }}
        >
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="pointer-events-auto size-10 rounded-full border border-border/70 bg-background/95 shadow-lg backdrop-blur"
            onClick={() => {
              isPinnedToBottomRef.current = true;
              setShowJumpToBottom(false);
              scrollToBottom("smooth");
            }}
            aria-label="Scroll to latest message"
          >
            <ArrowDownIcon className="size-4" />
          </Button>
        </div>
      )}

      <div
        ref={composerRef}
        className="sticky bottom-0 z-20 border-t border-border/60 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80"
      >
        <div className="mx-auto w-full max-w-3xl px-4">
          <Composer />
        </div>
      </div>
      </ThreadPrimitive.Root>
    </div>
  );
}

function Composer() {
  const client = useHsafaClient();
  const { spaceId } = useCurrentSpace();
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  const handleInput = useCallback(() => {
    if (!spaceId) return;

    // Send typing=true if not already typing
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      client.spaces.sendTyping(spaceId, true).catch(() => {});
    }

    // Reset the stop-typing timer
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      client.spaces.sendTyping(spaceId, false).catch(() => {});
    }, 2000);
  }, [client, spaceId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  return (
    <ComposerPrimitive.Root className="bg-transparent py-3">
      <div className="rounded-[28px] border border-border/80 bg-background shadow-sm transition-all focus-within:border-ring/60 focus-within:ring-2 focus-within:ring-ring/15">
        <ComposerPrimitive.Input asChild>
          <textarea
            placeholder="Ask a question..."
            className="max-h-40 min-h-[52px] w-full resize-none bg-transparent px-4 pt-3 pb-2 text-sm leading-6 placeholder:text-muted-foreground focus:outline-none"
            rows={1}
            onInput={handleInput}
          />
        </ComposerPrimitive.Input>
        <div className="flex items-center justify-end px-2 pb-2">
          <ComposerAction />
        </div>
      </div>
    </ComposerPrimitive.Root>
  );
}

function ComposerAction(): ReactNode {
  return (
    <ComposerPrimitive.Send asChild>
      <Button type="submit" size="icon" className="size-9 rounded-full shadow-sm">
        <ArrowUpIcon className="size-4" />
      </Button>
    </ComposerPrimitive.Send>
  );
}

function StreamingCaret() {
  return (
    <span className="inline-block size-2 ml-1 rounded-full bg-foreground/50 animate-pulse" />
  );
}

function TextWithCaret({
  text,
  status,
}: {
  text: string;
  status: { type: string };
}) {
  const isStreaming = status.type === "running";

  return (
    <div className="border border-border rounded-lg px-3 py-2">
      <span className="whitespace-pre-wrap">{text}</span>
      {isStreaming && <StreamingCaret />}
    </div>
  );
}

function formatMessageTime(date: Date | undefined): string {
  if (!date) return '';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function UserMessage() {
  const { membersById, currentEntityId } = useMembers();
  const entityId = useMessage((m) => (m.metadata as any)?.custom?.entityId as string | undefined);
  const messageId = useMessage((m) => m.id);
  const createdAt = useMessage((m) => m.createdAt);
  const member = entityId ? membersById[entityId] : undefined;
  const displayName = member?.displayName || "You";

  return (
    <MessagePrimitive.Root className="flex flex-col items-end py-2" data-role="user">
      <div className="flex items-center gap-2 mb-1 mr-1">
        <span className="text-xs font-medium text-muted-foreground">
          {displayName}
        </span>
        {createdAt && (
          <span className="text-[10px] text-muted-foreground/60">
            {formatMessageTime(createdAt as Date)}
          </span>
        )}
      </div>
      <div className="max-w-[85%] rounded-2xl bg-primary text-primary-foreground px-3 py-2 text-sm">
        <MessagePrimitive.Content />
      </div>
      {entityId === currentEntityId && (
        <SeenTicks messageId={messageId} />
      )}
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  const { membersById } = useMembers();
  const entityId = useMessage((m) => (m.metadata as any)?.custom?.entityId as string | undefined);
  const isOtherHuman = useMessage((m) => (m.metadata as any)?.custom?.isOtherHuman === true);
  const createdAt = useMessage((m) => m.createdAt);
  const member = entityId ? membersById[entityId] : undefined;
  const displayName = member?.displayName || (isOtherHuman ? "User" : "AI Assistant");

  return (
    <MessagePrimitive.Root className="py-2" data-role="assistant">
      <div className="flex items-center gap-2 mb-1">
        <div
          className={`flex size-6 items-center justify-center rounded-full text-[10px] font-semibold text-white ${
            isOtherHuman ? "bg-blue-500" : "bg-emerald-600"
          }`}
        >
          {displayName.charAt(0).toUpperCase()}
        </div>
        <span className="text-xs font-medium text-muted-foreground">
          {displayName}
        </span>
        {createdAt && (
          <span className="text-[10px] text-muted-foreground/60">
            {formatMessageTime(createdAt as Date)}
          </span>
        )}
      </div>
      <div className="text-sm pl-8">
        <MessagePrimitive.Parts
          components={{
            Text: TextWithCaret,
            Reasoning: ReasoningPart,
            tools: {
              by_name: {
                showProductCard: ProductCard,
                generateImage: ImageToolUI,
                confirmAction: ConfirmationUI,
                displayChart: ChartDisplay,
              },
              Fallback: ToolCallPart,
            },
          }}
        />
      </div>
    </MessagePrimitive.Root>
  );
}

// =============================================================================
// Typing Indicator — shows "X is typing…" below messages
// =============================================================================

function TypingIndicator() {
  const typingUsers = useTypingUsers();

  if (typingUsers.length === 0) return null;

  const names = typingUsers.map((u) => u.entityName || "Someone");
  let label: string;
  if (names.length === 1) {
    label = `${names[0]} is typing`;
  } else if (names.length === 2) {
    label = `${names[0]} and ${names[1]} are typing`;
  } else {
    label = `${names[0]} and ${names.length - 1} others are typing`;
  }

  return (
    <div className="flex items-center gap-2 py-2 pl-8">
      <div className="flex gap-0.5">
        <span className="size-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0ms]" />
        <span className="size-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:150ms]" />
        <span className="size-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:300ms]" />
      </div>
      <span className="text-xs text-muted-foreground/70 italic">
        {label}
      </span>
    </div>
  );
}

// =============================================================================
// AutoMarkSeen — marks the latest message as seen when rendered
// =============================================================================

function AutoMarkSeen() {
  const client = useHsafaClient();
  const { spaceId } = useCurrentSpace();
  const lastMarkedRef = useRef<string | null>(null);

  // We need to get the last message ID from the thread. We use a ThreadPrimitive
  // subscription isn't available here, so we'll observe the DOM for the last message.
  // Instead, let's use the seenWatermarks + messages approach via the runtime.
  // Actually, the simplest approach: use an effect that watches for the last
  // user-visible message via an IntersectionObserver on the viewport.

  // Simpler: mark seen whenever the component re-renders (which happens on new messages)
  // by reading the last data-role message's ID from the DOM.
  useEffect(() => {
    if (!spaceId) return;

    // Small delay to ensure messages are rendered
    const timer = setTimeout(() => {
      const viewport = document.querySelector('[data-chat-viewport="true"]');
      if (!viewport) return;

      // Find the last message element
      const msgs = viewport.querySelectorAll("[data-role]");
      const lastMsg = msgs[msgs.length - 1];
      if (!lastMsg) return;

      // The message ID is on the wrapper; assistant-ui uses data-message-id
      // Let's find the closest element with a message id attribute
      const msgWrapper = lastMsg.closest("[data-message-id]");
      const messageId = msgWrapper?.getAttribute("data-message-id");

      if (messageId && messageId !== lastMarkedRef.current) {
        lastMarkedRef.current = messageId;
        client.spaces.markSeen(spaceId, messageId).catch(() => {});
      }
    }, 500);

    return () => clearTimeout(timer);
  });

  return null;
}

// =============================================================================
// SeenTicks — WhatsApp-style read receipt indicators on user messages
//
//   ✓  = sent (grey single check)
//   ✓✓ = seen by at least one other member (blue double check)
// =============================================================================

function SeenTicks({ messageId }: { messageId: string }) {
  const { membersById, currentEntityId } = useMembers();
  const seenWatermarks = useSeenWatermarks();

  // Count how many *other* members have seen this message (their watermark === this ID)
  // With the watermark approach, entity X has seen message M if M's position <= watermark position.
  // Since we only have IDs (not positions), we check if the watermark IS this message
  // or a message that comes after it. For simplicity, we'll check all watermarks.
  const seenByOthers = useMemo(() => {
    const seenBy: string[] = [];
    for (const [entityId, watermarkMsgId] of Object.entries(seenWatermarks)) {
      if (entityId === currentEntityId) continue;
      // The watermark is the LAST message seen. So if watermarkMsgId === messageId,
      // they've seen up to this message. If watermarkMsgId is a later message,
      // they've also seen this one. We can't easily compare order without seq,
      // but the watermark only advances forward, so if it was ever set to this
      // message or beyond, they've seen it.
      // For now: mark as seen if watermarkMsgId === messageId
      // TODO: For full accuracy, compare seq values
      if (watermarkMsgId === messageId) {
        seenBy.push(entityId);
      }
    }
    return seenBy;
  }, [seenWatermarks, messageId, currentEntityId]);

  // Count total other members
  const otherMemberCount = Object.keys(membersById).filter(
    (id) => id !== currentEntityId
  ).length;

  const hasBeenSeen = seenByOthers.length > 0;

  // Build tooltip text
  const seenNames = seenByOthers
    .map((id) => membersById[id]?.displayName || "Unknown")
    .join(", ");

  return (
    <div className="flex items-center gap-0.5 mr-1 mt-0.5" title={hasBeenSeen ? `Seen by ${seenNames}` : "Sent"}>
      {hasBeenSeen ? (
        <CheckCheckIcon className="size-3.5 text-blue-500" />
      ) : (
        <CheckIcon className="size-3.5 text-muted-foreground/50" />
      )}
    </div>
  );
}
