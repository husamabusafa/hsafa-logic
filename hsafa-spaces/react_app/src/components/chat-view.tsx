import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  ArrowUpIcon,
  ChevronLeftIcon,
  MessageSquareIcon,
  XIcon,
  CornerUpRightIcon,
  ImageIcon,
  MicIcon,
  PlusIcon,
  SparklesIcon,
  CheckCircleIcon,
  BarChart3Icon,
  ListIcon,
  ClipboardListIcon,
  LayoutDashboardIcon,
  FileIcon,
  VideoIcon,
  PieChartIcon,
  LoaderIcon,
  SearchIcon,
  PaperclipIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import {
  type MockSpace,
  type MockMember,
  type MockMessage,
} from "@/lib/mock-data";
import { MessageRenderer } from "@/components/messages/message-renderer";
import { cn } from "@/lib/utils";
import type { AgentActivity, TypingUser, MediaMessageData } from "@/lib/use-space-chat";
import { mediaApi, aiApi } from "@/lib/api";
import { ForwardDialog } from "@/components/chat-forward-dialog";
import { SeenInfoPopup } from "@/components/chat-seen-info";
import { AiGeneratedPreview } from "@/components/chat-ai-previews";
import { SearchResults } from "@/components/chat-search-results";
import { InteractiveProvider } from "@/lib/interactive-context";

interface ChatViewProps {
  space: MockSpace;
  messages: MockMessage[];
  currentEntityId: string;
  typingUsers: TypingUser[];
  activeAgents: AgentActivity[];
  onlineUserIds: string[];
  seenWatermarks: Record<string, string>;
  isLoading?: boolean;
  onSendMessage: (text: string, replyToId?: string, opts?: { type?: string; metadata?: Record<string, unknown> }) => Promise<void>;
  onSendMediaMessage?: (data: MediaMessageData) => Promise<void>;
  onTyping?: (typing?: boolean) => void;
  onMarkSeen?: (messageId: string) => void;
  onToggleDetails: () => void;
  onBack?: () => void;
  showSearch?: boolean;
  onSearchClose?: () => void;
}

type ComponentType = "confirmation" | "vote" | "choice" | "form" | "card" | "chart";

const COMPONENT_TYPES: { type: ComponentType; icon: typeof CheckCircleIcon; label: string; description: string }[] = [
  { type: "confirmation", icon: CheckCircleIcon, label: "Confirmation", description: "Ask for yes/no approval" },
  { type: "vote", icon: BarChart3Icon, label: "Poll / Vote", description: "Create a poll with options" },
  { type: "choice", icon: ListIcon, label: "Choice", description: "Present multiple choices" },
  { type: "form", icon: ClipboardListIcon, label: "Form", description: "Collect structured data" },
  { type: "card", icon: LayoutDashboardIcon, label: "Rich Card", description: "Card with image and actions" },
  { type: "chart", icon: PieChartIcon, label: "Chart", description: "Visualize data as a chart" },
];

export function ChatView({ space, messages, currentEntityId, typingUsers, activeAgents, onlineUserIds, seenWatermarks, isLoading, onSendMessage, onSendMediaMessage, onTyping, onMarkSeen, onToggleDetails, onBack, showSearch: externalShowSearch, onSearchClose }: ChatViewProps) {
  const [inputValue, setInputValue] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [aiGenType, setAiGenType] = useState<ComponentType | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiGenerated, setAiGenerated] = useState(false);
  const [aiGeneratedData, setAiGeneratedData] = useState<Record<string, unknown> | null>(null);
  const [aiHistory, setAiHistory] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [aiFollowUp, setAiFollowUp] = useState("");
  const [aiAllowUpdate, setAiAllowUpdate] = useState(true);
  const [aiAllowMultiple, setAiAllowMultiple] = useState(false);
  const [aiPreviewKey, setAiPreviewKey] = useState(0);
  const [forwardMessageId, setForwardMessageId] = useState<string | null>(null);
  const [internalShowSearch, setInternalShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingScrollToId, setPendingScrollToId] = useState<string | null>(null);
  const [seenInfoMessageId, setSeenInfoMessageId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<Array<{ file: File; previewUrl?: string; type: "image" | "file" | "video" }>>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [uploading, setUploading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dragCounterRef = useRef(0);

  // Use external search state if provided, otherwise internal
  const isSearchActive = externalShowSearch !== undefined ? externalShowSearch : internalShowSearch;
  const closeSearch = () => {
    if (onSearchClose) onSearchClose();
    setInternalShowSearch(false);
    setSearchQuery("");
  };

  // Compute per-message seenBy from seenWatermarks
  // A message is "seen by entity X" if X's watermark is at or after this message in the list
  const messageSeenMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    if (!messages.length) return map;

    // Build messageId → index for ordering
    const idxMap = new Map<string, number>();
    messages.forEach((m, i) => idxMap.set(m.id, i));

    for (const msg of messages) {
      const msgIdx = idxMap.get(msg.id) ?? 0;
      const seenBy: string[] = [];
      for (const [entityId, watermarkId] of Object.entries(seenWatermarks)) {
        if (entityId === msg.entityId) continue; // sender doesn't count
        const watermarkIdx = idxMap.get(watermarkId);
        if (watermarkIdx !== undefined && watermarkIdx >= msgIdx) {
          seenBy.push(entityId);
        }
      }
      map[msg.id] = seenBy;
    }
    return map;
  }, [messages, seenWatermarks]);

  // Auto-mark last message as seen when messages change
  useEffect(() => {
    if (messages.length > 0 && onMarkSeen) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.entityId !== currentEntityId) {
        onMarkSeen(lastMsg.id);
      }
    }
  }, [messages.length, currentEntityId, onMarkSeen]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const typingMembers = typingUsers
    .filter((t) => t.entityId !== currentEntityId)
    .map((t) => {
      const member = space.members.find((m) => m.entityId === t.entityId);
      return member || {
        entityId: t.entityId,
        name: t.entityName,
        type: "agent" as const,
        role: "member" as const,
        avatarColor: "bg-emerald-500",
        isOnline: true,
      };
    });

  const onlineCount = space.members.filter(
    (m) => onlineUserIds.includes(m.entityId) && m.entityId !== currentEntityId,
  ).length;


  const replyMessage = replyingTo ? messages.find((m: MockMessage) => m.id === replyingTo) : null;

  // ── Send handler (supports text-only, attachment-only, or text+attachment) ──
  const handleSend = useCallback(async () => {
    const text = inputValue.trim();
    const hasAttachments = pendingFiles.length > 0;
    if (!text && !hasAttachments) return;
    if (sending || uploading) return;

    const replyId = replyingTo ?? undefined;
    setInputValue("");
    setReplyingTo(null);

    // If there are attachments, upload all and send as media message (with optional text)
    if (hasAttachments && onSendMediaMessage) {
      setUploading(true);
      try {
        // Upload all files in parallel
        const uploadResults = await Promise.all(
          pendingFiles.map(async (pf) => {
            const result = await mediaApi.upload(pf.file);
            return {
              url: result.url,
              fileName: pf.file.name,
              fileSize: pf.file.size,
              fileMimeType: pf.file.type,
              thumbnailUrl: result.thumbnailUrl ?? undefined,
              type: pf.type,
            };
          }),
        );

        await onSendMediaMessage({
          type: uploadResults.length === 1 ? uploadResults[0].type as "image" | "file" : "file",
          text: text || undefined,
          files: uploadResults,
          replyToId: replyId,
        });

        // Cleanup preview URLs
        for (const pf of pendingFiles) {
          if (pf.previewUrl) URL.revokeObjectURL(pf.previewUrl);
        }
        setPendingFiles([]);
        if (textareaRef.current) textareaRef.current.style.height = "auto";
      } catch (err) {
        console.error("Failed to send attachments:", err);
      } finally {
        setUploading(false);
      }
      return;
    }

    // Text-only message
    if (text) {
      setSending(true);
      try {
        await onSendMessage(text, replyId);
        if (textareaRef.current) textareaRef.current.style.height = "auto";
      } catch (err) {
        console.error("Failed to send message:", err);
      } finally {
        setSending(false);
      }
    }
  }, [inputValue, replyingTo, sending, uploading, pendingFiles, onSendMessage, onSendMediaMessage]);

  const handleReply = useCallback((messageId: string) => {
    setReplyingTo(messageId);
  }, []);

  const handleForward = useCallback((messageId: string) => {
    setForwardMessageId(messageId);
  }, []);

  const handleScrollToMessage = useCallback((messageId: string) => {
    const el = messageRefs.current[messageId];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary/50", "rounded-xl");
      setTimeout(() => el.classList.remove("ring-2", "ring-primary/50", "rounded-xl"), 1500);
    }
  }, []);

  // Deferred scroll after search closes — wait for messages to re-render
  useEffect(() => {
    if (pendingScrollToId && !isSearchActive) {
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        handleScrollToMessage(pendingScrollToId);
        setPendingScrollToId(null);
      });
    }
  }, [pendingScrollToId, isSearchActive, handleScrollToMessage]);

  // ── File selection → add to pending files array ──
  const handleFileSelect = useCallback((file: File) => {
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    const previewUrl = isImage ? URL.createObjectURL(file) : undefined;
    const type: "image" | "file" | "video" = isImage ? "image" : isVideo ? "video" : "file";
    setPendingFiles((prev) => [...prev, { file, previewUrl, type }]);
  }, []);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) for (const f of Array.from(files)) handleFileSelect(f);
    e.target.value = "";
  }, [handleFileSelect]);

  const handleVideoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) for (const f of Array.from(files)) handleFileSelect(f);
    e.target.value = "";
  }, [handleFileSelect]);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) for (const f of Array.from(files)) handleFileSelect(f);
    e.target.value = "";
  }, [handleFileSelect]);

  const handleCancelPendingFile = useCallback((index?: number) => {
    if (index !== undefined) {
      setPendingFiles((prev) => {
        const removed = prev[index];
        if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
        return prev.filter((_, i) => i !== index);
      });
    } else {
      for (const pf of pendingFiles) {
        if (pf.previewUrl) URL.revokeObjectURL(pf.previewUrl);
      }
      setPendingFiles([]);
    }
  }, [pendingFiles]);

  // ── Drag & Drop ──
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current++;
    if (dragCounterRef.current === 1) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files) for (const f of Array.from(files)) handleFileSelect(f);
  }, [handleFileSelect]);

  // ── Voice Recording ──
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }

        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        if (blob.size === 0) return;

        if (!onSendMediaMessage) return;
        setUploading(true);
        try {
          const result = await mediaApi.uploadVoice(blob);
          await onSendMediaMessage({
            type: "voice",
            url: result.url,
            audioDuration: recordingDuration,
            transcription: result.transcription,
            replyToId: replyingTo ?? undefined,
          });
          setReplyingTo(null);
        } catch (err) {
          console.error("Failed to send voice:", err);
        } finally {
          setUploading(false);
          setRecordingDuration(0);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((d) => d + 1);
      }, 1000);
    } catch (err) {
      console.error("Microphone access denied:", err);
    }
  }, [onSendMediaMessage, replyingTo, recordingDuration]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    audioChunksRef.current = [];
    setIsRecording(false);
    setRecordingDuration(0);
  }, []);

  // ── Auto-resize textarea ──
  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  // Format typing text for multiple entities
  const typingText = formatTypingText(typingMembers);

  return (
    <div
      className="flex flex-col h-full relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-primary/10 border-2 border-dashed border-primary rounded-xl flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <ArrowUpIcon className="size-8 text-primary mx-auto mb-2" />
            <p className="text-sm font-medium text-primary">Drop file to upload</p>
          </div>
        </div>
      )}

      {/* Chat Header */}
      <header className="flex items-center gap-3 h-14 shrink-0 border-b border-border px-4">
        {onBack && (
          <Button variant="ghost" size="icon" onClick={onBack} className="md:hidden size-8">
            <ChevronLeftIcon className="size-5" />
          </Button>
        )}

        <button
          onClick={onToggleDetails}
          className="flex items-center gap-3 flex-1 min-w-0 rounded-lg -ml-1 px-1 py-1 hover:bg-muted/50 transition-colors text-left"
        >
          {space.isGroup ? (
            <div className="flex size-9 items-center justify-center rounded-full bg-primary/15 text-primary font-semibold text-xs shrink-0">
              {space.name.charAt(0).toUpperCase()}
            </div>
          ) : (
            <Avatar
              name={space.name}
              color={space.members.find((m) => m.entityId !== currentEntityId)?.avatarColor}
              size="sm"
              isOnline={space.members.find((m) => m.entityId !== currentEntityId)?.isOnline}
            />
          )}

          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground truncate">{space.name}</h3>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              {typingText ? (
                <span className="text-primary">{typingText}</span>
              ) : (
                <>
                  <span>{space.members.length} members</span>
                  {onlineCount > 0 && (
                    <>
                      <span className="text-muted-foreground/40">·</span>
                      <span className="text-emerald-500">{onlineCount} online</span>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </button>

        {/* Search button removed - only in Space Details panel now */}
      </header>

      {/* Search bar - full width with margins */}
      {isSearchActive && (
        <div className="mx-4 my-3 border border-border bg-muted/20 shrink-0 rounded-lg">
          <div className="relative flex items-center">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search messages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 h-9 rounded-lg bg-transparent pl-10 pr-16 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/30"
              autoFocus
            />
            <div className="absolute right-2 flex items-center gap-1">
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="p-0.5 rounded hover:bg-muted/50 transition-colors"
                  title="Clear search"
                >
                  <XIcon className="size-3.5 text-muted-foreground" />
                </button>
              )}
              <button
                onClick={closeSearch}
                className="p-0.5 rounded hover:bg-muted/50 transition-colors"
                title="Close search"
              >
                <XIcon className="size-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <InteractiveProvider spaceId={space.id} currentEntityId={currentEntityId}>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <LoaderIcon className="size-6 animate-spin text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Loading messages...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <p className="text-sm text-muted-foreground">No messages yet</p>
            <p className="text-xs text-muted-foreground/60">Start the conversation!</p>
          </div>
        ) : searchQuery.trim() ? (
          /* Search results */
          <SearchResults
            messages={messages}
            query={searchQuery}
            space={space}
            onSelect={(id: string) => {
              setPendingScrollToId(id);
              closeSearch();
            }}
          />
        ) : (messages.map((msg, idx) => {
          // Only show avatar on LAST message in a consecutive group
          const isFirstInGroup = idx === 0 || messages[idx - 1].entityId !== msg.entityId || messages[idx - 1].type === "system";
          const isLastInGroup = idx === messages.length - 1 || messages[idx + 1].entityId !== msg.entityId || messages[idx + 1].type === "system";
          const showAvatar = isLastInGroup;           // Avatar only on last message
          const showSenderName = isFirstInGroup;      // Name only on first message
          const msgWithSeen = { ...msg, seenBy: messageSeenMap[msg.id] || [] };
          return (
            <div key={msg.id} ref={(el) => { messageRefs.current[msg.id] = el; }} className="transition-all">
              <MessageRenderer
                message={msgWithSeen}
                member={space.members.find((m) => m.entityId === msg.entityId)}
                isOwn={msg.entityId === currentEntityId}
                showSender={showAvatar}
                showSenderName={showSenderName}
                otherMemberCount={space.members.length - 1}
                currentEntityId={currentEntityId}
                onReply={handleReply}
                onForward={handleForward}
                onScrollToMessage={handleScrollToMessage}
                onSeenInfo={space.members.length > 2 ? (id) => setSeenInfoMessageId(id) : undefined}
              />
            </div>
          );
        }))}

        {/* Seen info popup */}
        {seenInfoMessageId && (
          <SeenInfoPopup
            messageId={seenInfoMessageId}
            seenBy={messageSeenMap[seenInfoMessageId] || []}
            members={space.members}
            currentEntityId={currentEntityId}
            senderId={messages.find((m) => m.id === seenInfoMessageId)?.entityId || ""}
            onClose={() => setSeenInfoMessageId(null)}
          />
        )}

        {/* Typing indicator — always show avatars */}
        {typingMembers.length > 0 && (
          <div className="flex items-center gap-2 mt-2 ml-2">
            <div className="flex -space-x-1.5">
              {typingMembers.slice(0, 4).map((m) => (
                <div
                  key={m.entityId}
                  className={cn(
                    "size-6 rounded-full ring-2 ring-background flex items-center justify-center",
                    m.type === "agent" ? "bg-emerald-500" : (m.avatarColor || "bg-primary"),
                  )}
                >
                  <span className="text-[9px] text-white font-bold">{m.name.charAt(0)}</span>
                </div>
              ))}
            </div>
            <div className="rounded-full bg-muted px-3 py-1.5 flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]" />
              <span className="size-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
              <span className="size-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
            </div>
            <span className="text-[11px] text-muted-foreground">{typingText}</span>
          </div>
        )}


        <div ref={bottomRef} />
      </div>
      </InteractiveProvider>

      {/* AI Generation Popup - positioned above composer */}
      {aiGenType && (
        <div className="shrink-0 relative z-50">
          <div className="absolute bottom-full left-0 right-0 mb-2 px-4">
            <div className="max-w-3xl mx-auto bg-popover border border-border rounded-xl shadow-lg overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
                <div className="flex items-center gap-2">
                  <SparklesIcon className="size-4 text-primary" />
                  <span className="text-sm font-semibold">
                    Generate {COMPONENT_TYPES.find((c) => c.type === aiGenType)?.label}
                  </span>
                </div>
                <button
                  onClick={() => { setAiGenType(null); setAiPrompt(""); setAiGenerated(false); setAiGenerating(false); setAiGeneratedData(null); setAiHistory([]); setAiFollowUp(""); setAiAllowUpdate(true); setAiAllowMultiple(false); setAiPreviewKey(0); }}
                  className="p-1 rounded hover:bg-muted transition-colors"
                >
                  <XIcon className="size-4 text-muted-foreground" />
                </button>
              </div>

              {/* Content */}
              <div className="p-4 space-y-3">
                {!aiGenerated ? (
                  <>
                    <input
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      placeholder={`Describe the ${COMPONENT_TYPES.find((c) => c.type === aiGenType)?.label.toLowerCase()} you want to create...`}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && aiPrompt.trim() && aiGenType && !aiGenerating) {
                          setAiGenerating(true);
                          aiApi.generateComponent(aiGenType, aiPrompt.trim())
                            .then(({ component }) => {
                              setAiGeneratedData(component);
                              setAiGenerated(true);
                              setAiHistory([
                                { role: "user", content: aiPrompt.trim() },
                                { role: "assistant", content: JSON.stringify(component) },
                              ]);
                            })
                            .catch((err) => console.error("AI generate failed:", err))
                            .finally(() => setAiGenerating(false));
                        }
                      }}
                      autoFocus
                    />
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        disabled={!aiPrompt.trim() || aiGenerating || !aiGenType}
                        onClick={() => {
                          if (!aiGenType) return;
                          setAiGenerating(true);
                          aiApi.generateComponent(aiGenType, aiPrompt.trim())
                            .then(({ component }) => {
                              setAiGeneratedData(component);
                              setAiGenerated(true);
                              setAiHistory([
                                { role: "user", content: aiPrompt.trim() },
                                { role: "assistant", content: JSON.stringify(component) },
                              ]);
                            })
                            .catch((err) => console.error("AI generate failed:", err))
                            .finally(() => setAiGenerating(false));
                        }}
                      >
                        {aiGenerating ? (
                          <><LoaderIcon className="size-3.5 mr-1.5 animate-spin" /> Generating...</>
                        ) : (
                          <><SparklesIcon className="size-3.5 mr-1.5" /> Generate</>
                        )}
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Generated Component Preview */}
                    <div key={aiPreviewKey} className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                      <p className="text-xs font-medium text-primary mb-2">Preview</p>
                      <AiGeneratedPreview type={aiGenType} data={aiGeneratedData} prompt={aiPrompt} />
                    </div>

                    {/* Options toggles for interactive messages */}
                    {["confirmation", "vote", "choice", "form"].includes(aiGenType || "") && (
                      <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5">
                        {/* Allow Multiple — vote and choice only */}
                        {["vote", "choice"].includes(aiGenType || "") && (
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={aiAllowMultiple}
                              onClick={() => setAiAllowMultiple((v) => !v)}
                              className={cn(
                                "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
                                aiAllowMultiple ? "bg-primary" : "bg-muted-foreground/25",
                              )}
                            >
                              <span className={cn(
                                "pointer-events-none block size-3.5 rounded-full bg-white shadow-sm transition-transform",
                                aiAllowMultiple ? "translate-x-4" : "translate-x-0.5",
                              )} />
                            </button>
                            <span className="text-xs text-muted-foreground">Multiple selections</span>
                          </label>
                        )}

                        {/* Allow Update — confirmation, choice, form only (NOT vote) */}
                        {["confirmation", "choice", "form"].includes(aiGenType || "") && (
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={aiAllowUpdate}
                              onClick={() => setAiAllowUpdate((v) => !v)}
                              className={cn(
                                "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
                                aiAllowUpdate ? "bg-primary" : "bg-muted-foreground/25",
                              )}
                            >
                              <span className={cn(
                                "pointer-events-none block size-3.5 rounded-full bg-white shadow-sm transition-transform",
                                aiAllowUpdate ? "translate-x-4" : "translate-x-0.5",
                              )} />
                            </button>
                            <span className="text-xs text-muted-foreground">Allow changing response</span>
                          </label>
                        )}
                      </div>
                    )}

                    {/* Follow-up prompt to refine */}
                    <div className="flex items-center gap-2">
                      <input
                        value={aiFollowUp}
                        onChange={(e) => setAiFollowUp(e.target.value)}
                        placeholder="Refine: e.g. 'add more options' or 'change the title'..."
                        className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && aiFollowUp.trim() && aiGenType && !aiGenerating) {
                            setAiGenerating(true);
                            const newHistory = [...aiHistory, { role: "user" as const, content: aiFollowUp.trim() }];
                            aiApi.generateComponent(aiGenType, aiFollowUp.trim(), { history: aiHistory })
                              .then(({ component }) => {
                                setAiGeneratedData(component);
                                setAiPreviewKey((k) => k + 1);
                                setAiHistory([...newHistory, { role: "assistant" as const, content: JSON.stringify(component) }]);
                                setAiFollowUp("");
                              })
                              .catch((err) => console.error("AI follow-up failed:", err))
                              .finally(() => setAiGenerating(false));
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        disabled={!aiFollowUp.trim() || aiGenerating}
                        onClick={() => {
                          if (!aiGenType || !aiFollowUp.trim()) return;
                          setAiGenerating(true);
                          const newHistory = [...aiHistory, { role: "user" as const, content: aiFollowUp.trim() }];
                          aiApi.generateComponent(aiGenType, aiFollowUp.trim(), { history: aiHistory })
                            .then(({ component }) => {
                              setAiGeneratedData(component);
                              setAiPreviewKey((k) => k + 1);
                              setAiHistory([...newHistory, { role: "assistant" as const, content: JSON.stringify(component) }]);
                              setAiFollowUp("");
                            })
                            .catch((err) => console.error("AI follow-up failed:", err))
                            .finally(() => setAiGenerating(false));
                        }}
                      >
                        {aiGenerating ? <LoaderIcon className="size-3.5 animate-spin" /> : "Update"}
                      </Button>
                    </div>

                    <div className="flex gap-2 justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setAiGenerated(false);
                          setAiGeneratedData(null);
                          setAiHistory([]);
                          setAiFollowUp("");
                          setAiPrompt("");
                          setAiAllowUpdate(true);
                          setAiAllowMultiple(false);
                          setAiPreviewKey(0);
                        }}
                      >
                        Start Over
                      </Button>
                      <Button
                        size="sm"
                        disabled={!aiGeneratedData || sending}
                        onClick={async () => {
                          if (!aiGenType || !aiGeneratedData) return;
                          setSending(true);
                          try {
                            const finalPayload = { ...aiGeneratedData };
                            const metadata: Record<string, unknown> = {
                              type: aiGenType,
                              payload: finalPayload,
                            };
                            // Interactive messages need audience + responseSchema
                            if (["confirmation", "vote", "choice", "form"].includes(aiGenType)) {
                              metadata.audience = "broadcast";
                              metadata.status = "open";
                              metadata.responseSummary = { totalResponses: 0, responses: [] };

                              // Vote: always updatable, only wire allowMultiple
                              if (aiGenType === "vote") {
                                finalPayload.allowMultiple = aiAllowMultiple;
                                if (Array.isArray(finalPayload.options)) {
                                  metadata.responseSchema = { type: "enum", values: finalPayload.options, multiple: aiAllowMultiple };
                                }
                              }
                              // Confirmation: wire allowUpdate
                              else if (aiGenType === "confirmation") {
                                finalPayload.allowUpdate = aiAllowUpdate;
                                metadata.allowUpdate = aiAllowUpdate;
                                metadata.responseSchema = { type: "enum", values: ["confirmed", "rejected"] };
                              }
                              // Choice: wire allowUpdate + allowMultiple
                              else if (aiGenType === "choice") {
                                finalPayload.allowUpdate = aiAllowUpdate;
                                finalPayload.allowMultiple = aiAllowMultiple;
                                metadata.allowUpdate = aiAllowUpdate;
                                if (Array.isArray(finalPayload.options)) {
                                  const vals = (finalPayload.options as Array<{ value?: string }>).map((o) => o.value || "");
                                  metadata.responseSchema = { type: "enum", values: vals, multiple: aiAllowMultiple };
                                }
                              }
                              // Form: wire allowUpdate
                              else if (aiGenType === "form") {
                                finalPayload.allowUpdate = aiAllowUpdate;
                                metadata.allowUpdate = aiAllowUpdate;
                                metadata.responseSchema = { type: "object" };
                              }
                            }
                            const contentText = (finalPayload.title as string) || (finalPayload.text as string) || aiPrompt;
                            await onSendMessage(contentText, replyingTo ?? undefined, { type: aiGenType, metadata });
                          } catch (err) {
                            console.error("Failed to send component:", err);
                          } finally {
                            setSending(false);
                            setAiGenType(null); setAiPrompt(""); setAiGenerated(false); setAiGeneratedData(null);
                            setAiHistory([]); setAiFollowUp(""); setAiAllowUpdate(true); setAiAllowMultiple(false); setAiPreviewKey(0);
                            setReplyingTo(null);
                          }
                        }}
                      >
                        Send Component
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Composer */}
      <div className="shrink-0 border-t border-border">
        {/* Reply banner */}
        {replyMessage && (
          <div className="flex items-center gap-2 px-4 py-2 bg-muted/30 border-b border-border/50">
            <CornerUpRightIcon className="size-3.5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-[11px] font-medium text-primary">{replyMessage.senderName}</span>
              <p className="text-[11px] text-muted-foreground truncate">
                {replyMessage.content || replyMessage.title || replyMessage.formTitle || replyMessage.cardTitle || replyMessage.imageCaption || replyMessage.fileName || "Message"}
              </p>
            </div>
            <button onClick={() => setReplyingTo(null)} className="shrink-0 p-0.5 rounded hover:bg-muted transition-colors">
              <XIcon className="size-3.5 text-muted-foreground" />
            </button>
          </div>
        )}

        {/* Pending attachments preview */}
        {pendingFiles.length > 0 && (
          <div className="px-4 py-2 bg-muted/20 border-b border-border/50">
            <div className="max-w-3xl mx-auto">
              <div className="flex items-center gap-2 flex-wrap">
                {pendingFiles.map((pf, i) => (
                  <div key={i} className="flex items-center gap-1.5 bg-muted/50 rounded-lg px-2 py-1.5 max-w-[200px]">
                    {pf.type === "image" && pf.previewUrl ? (
                      <img src={pf.previewUrl} alt="Preview" className="size-8 rounded object-cover shrink-0" />
                    ) : (
                      <div className="size-8 rounded bg-muted flex items-center justify-center shrink-0">
                        <FileIcon className="size-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-medium truncate">{pf.file.name}</p>
                      <p className="text-[9px] text-muted-foreground">
                        {pf.file.size < 1024 * 1024
                          ? `${(pf.file.size / 1024).toFixed(0)} KB`
                          : `${(pf.file.size / (1024 * 1024)).toFixed(1)} MB`}
                      </p>
                    </div>
                    <button
                      onClick={() => handleCancelPendingFile(i)}
                      className="size-5 rounded-full hover:bg-muted flex items-center justify-center transition-colors shrink-0"
                    >
                      <XIcon className="size-3 text-muted-foreground" />
                    </button>
                  </div>
                ))}
                {pendingFiles.length > 1 && (
                  <button
                    onClick={() => handleCancelPendingFile()}
                    className="text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-1"
                  >
                    Clear all
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="p-3">
          <div className="flex items-end gap-2 max-w-3xl mx-auto">
            {/* Voice recording UI */}
            {isRecording ? (
              <>
                <button
                  onClick={cancelRecording}
                  className="size-10 rounded-full bg-muted flex items-center justify-center shrink-0 hover:bg-muted/80 transition-colors"
                  title="Cancel recording"
                >
                  <XIcon className="size-4 text-muted-foreground" />
                </button>
                <div className="flex-1 flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-red-500/10 border border-red-500/20">
                  <span className="size-2.5 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-sm font-medium text-red-600 tabular-nums">
                    {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, "0")}
                  </span>
                  <span className="text-xs text-muted-foreground">Recording...</span>
                </div>
                <Button
                  size="icon"
                  className="size-10 rounded-full shrink-0 bg-red-500 hover:bg-red-600"
                  onClick={stopRecording}
                  title="Stop & send"
                >
                  <ArrowUpIcon className="size-4" />
                </Button>
              </>
            ) : (
              <>
                {/* + button to open component menu */}
                <div className="relative shrink-0 pb-1">
                  <button
                    onClick={() => setShowPlusMenu(!showPlusMenu)}
                    className={`size-8 rounded-lg flex items-center justify-center transition-all ${
                      showPlusMenu ? "bg-primary text-primary-foreground rotate-45" : "hover:bg-muted text-muted-foreground"
                    }`}
                    title="Send component"
                  >
                    <PlusIcon className="size-5" />
                  </button>

                  {/* Component type menu */}
                  {showPlusMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowPlusMenu(false)} />
                      <div className="absolute bottom-full left-0 mb-2 z-50 w-56 bg-popover border border-border rounded-xl shadow-lg py-1.5 max-h-80 overflow-y-auto">
                        <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                          Send Component
                        </div>
                        {COMPONENT_TYPES.map((ct) => (
                          <button
                            key={ct.type}
                            onClick={() => {
                              setShowPlusMenu(false);
                              setAiGenType(ct.type);
                              setAiPrompt("");
                              setAiGenerated(false);
                              setAiGeneratedData(null);
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted transition-colors text-left"
                          >
                            <ct.icon className="size-4 text-primary shrink-0" />
                            <div className="min-w-0">
                              <div className="text-sm font-medium">{ct.label}</div>
                              <div className="text-[10px] text-muted-foreground">{ct.description}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Attachment button with popup */}
                <div className="relative shrink-0 pb-1">
                  <button
                    onClick={() => setShowAttachMenu(!showAttachMenu)}
                    className={`size-8 rounded-lg flex items-center justify-center transition-all ${
                      showAttachMenu ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"
                    }`}
                    title="Attach file"
                  >
                    <PaperclipIcon className="size-4" />
                  </button>

                  {showAttachMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowAttachMenu(false)} />
                      <div className="absolute bottom-full left-0 mb-2 z-50 w-44 bg-popover border border-border rounded-xl shadow-lg py-1.5">
                        <button
                          onClick={() => { setShowAttachMenu(false); imageInputRef.current?.click(); }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted transition-colors text-left"
                        >
                          <ImageIcon className="size-4 text-emerald-500" />
                          <span className="text-sm">Image</span>
                        </button>
                        <button
                          onClick={() => { setShowAttachMenu(false); videoInputRef.current?.click(); }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted transition-colors text-left"
                        >
                          <VideoIcon className="size-4 text-blue-500" />
                          <span className="text-sm">Video</span>
                        </button>
                        <button
                          onClick={() => { setShowAttachMenu(false); fileInputRef.current?.click(); }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted transition-colors text-left"
                        >
                          <FileIcon className="size-4 text-orange-500" />
                          <span className="text-sm">File</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Mic button */}
                <div className="shrink-0 pb-1">
                  <button
                    onClick={startRecording}
                    className="size-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors"
                    title="Voice message"
                  >
                    <MicIcon className="size-4 text-muted-foreground" />
                  </button>
                </div>

                {/* Hidden file inputs */}
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.doc,.docx,.txt,.xls,.xlsx,.ppt,.pptx,.zip,.rar"
                  multiple
                  onChange={handleFileUpload}
                />
                <input
                  ref={videoInputRef}
                  type="file"
                  className="hidden"
                  accept="video/*"
                  multiple
                  onChange={handleVideoUpload}
                />
                <input
                  ref={imageInputRef}
                  type="file"
                  className="hidden"
                  multiple
                  accept="image/*"
                  onChange={handleImageUpload}
                />

                {/* Text input — auto-resizing */}
                <div className="flex-1 rounded-2xl border border-border bg-muted/50 focus-within:border-ring/50 focus-within:ring-1 focus-within:ring-ring/20">
                  <textarea
                    ref={textareaRef}
                    value={inputValue}
                    onChange={(e) => {
                      setInputValue(e.target.value);
                      onTyping?.(true);
                      autoResize();
                    }}
                    placeholder={pendingFiles.length > 0 ? "Add a message (optional)..." : "Type a message..."}
                    className="w-full bg-transparent px-4 py-2.5 text-sm resize-none focus:outline-none min-h-[40px] max-h-[160px]"
                    rows={1}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                  />
                </div>

                {/* Send button */}
                <Button
                  size="icon"
                  className="size-10 rounded-full shrink-0"
                  disabled={(!inputValue.trim() && pendingFiles.length === 0) || sending || uploading}
                  onClick={handleSend}
                >
                  {uploading ? (
                    <LoaderIcon className="size-4 animate-spin" />
                  ) : (
                    <ArrowUpIcon className="size-4" />
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Forward Dialog */}
      {forwardMessageId && (
        <ForwardDialog
          messageId={forwardMessageId}
          currentSpaceId={space.id}
          messages={messages}
          onClose={() => setForwardMessageId(null)}
        />
      )}
    </div>
  );
}


// ─── Typing text formatter ──────────────────────────────────────────────────

function formatTypingText(members: MockMember[]): string {
  if (members.length === 0) return "";
  if (members.length === 1) return `${members[0].name} is typing...`;
  if (members.length === 2) return `${members[0].name} and ${members[1].name} are typing...`;
  return `${members[0].name} and ${members.length - 1} others are typing...`;
}


// ─── Empty state ─────────────────────────────────────────────────────────────

export function ChatEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4">
        <MessageSquareIcon className="size-8" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1">Select a space</h3>
      <p className="text-sm text-muted-foreground max-w-xs">
        Choose a space from the sidebar to start chatting, or create a new one.
      </p>
    </div>
  );
}

