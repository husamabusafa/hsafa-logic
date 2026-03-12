import { useState, useRef, useEffect, useCallback } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import {
  currentUser,
  mockMessages,
  mockTypingUsers,
  type MockSpace,
  type MockMember,
} from "@/lib/mock-data";
import { MessageRenderer } from "@/components/messages/message-renderer";

interface ChatViewProps {
  space: MockSpace;
  onToggleDetails: () => void;
  onBack?: () => void;
}

type ComponentType = "confirmation" | "vote" | "choice" | "form" | "card" | "file" | "video" | "chart";

const COMPONENT_TYPES: { type: ComponentType; icon: typeof CheckCircleIcon; label: string; description: string }[] = [
  { type: "confirmation", icon: CheckCircleIcon, label: "Confirmation", description: "Ask for yes/no approval" },
  { type: "vote", icon: BarChart3Icon, label: "Poll / Vote", description: "Create a poll with options" },
  { type: "choice", icon: ListIcon, label: "Choice", description: "Present multiple choices" },
  { type: "form", icon: ClipboardListIcon, label: "Form", description: "Collect structured data" },
  { type: "card", icon: LayoutDashboardIcon, label: "Rich Card", description: "Card with image and actions" },
  { type: "file", icon: FileIcon, label: "File", description: "Share a document" },
  { type: "video", icon: VideoIcon, label: "Video", description: "Share a video" },
  { type: "chart", icon: PieChartIcon, label: "Chart", description: "Visualize data as a chart" },
];

export function ChatView({ space, onToggleDetails, onBack }: ChatViewProps) {
  const messages = mockMessages[space.id] || [];
  const typingEntityIds = mockTypingUsers[space.id] || [];
  const [inputValue, setInputValue] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [aiGenType, setAiGenType] = useState<ComponentType | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiGenerated, setAiGenerated] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const typingMembers = typingEntityIds
    .map((eid) => space.members.find((m) => m.entityId === eid))
    .filter(Boolean) as MockMember[];

  const onlineCount = space.members.filter(
    (m) => m.isOnline && m.entityId !== currentUser.entityId,
  ).length;

  const replyMessage = replyingTo ? messages.find((m) => m.id === replyingTo) : null;

  const handleReply = useCallback((messageId: string) => {
    setReplyingTo(messageId);
  }, []);

  const handleScrollToMessage = useCallback((messageId: string) => {
    const el = messageRefs.current[messageId];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary/50", "rounded-xl");
      setTimeout(() => el.classList.remove("ring-2", "ring-primary/50", "rounded-xl"), 1500);
    }
  }, []);

  // Format typing text for multiple entities
  const typingText = formatTypingText(typingMembers);

  return (
    <div className="flex flex-col h-full">
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
              color={space.members.find((m) => m.entityId !== currentUser.entityId)?.avatarColor}
              size="sm"
              isOnline={space.members.find((m) => m.entityId !== currentUser.entityId)?.isOnline}
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
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
        {messages.map((msg, idx) => (
          <div key={msg.id} ref={(el) => { messageRefs.current[msg.id] = el; }} className="transition-all">
            <MessageRenderer
              message={msg}
              member={space.members.find((m) => m.entityId === msg.entityId)}
              isOwn={msg.entityId === currentUser.entityId}
              showSender={idx === 0 || messages[idx - 1].entityId !== msg.entityId || messages[idx - 1].type === "system"}
              otherMemberCount={space.members.length - 1}
              onReply={handleReply}
              onScrollToMessage={handleScrollToMessage}
            />
          </div>
        ))}

        {/* Typing indicator — supports multiple entities */}
        {typingMembers.length > 0 && (
          <div className="flex items-center gap-1.5 mt-2 ml-10">
            {/* Stacked avatars for multiple typers */}
            {typingMembers.length > 1 ? (
              <div className="flex -space-x-1.5">
                {typingMembers.slice(0, 3).map((m) => (
                  <div
                    key={m.entityId}
                    className={`size-5 rounded-full ${m.avatarColor} ring-2 ring-background flex items-center justify-center`}
                  >
                    <span className="text-[8px] text-white font-bold">{m.name.charAt(0)}</span>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="rounded-full bg-muted px-3 py-1.5 flex items-center gap-1">
              <span className="size-1 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]" />
              <span className="size-1 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
              <span className="size-1 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
            </div>
            <span className="text-[10px] text-muted-foreground">{typingText}</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* AI Generation Panel */}
      {aiGenType && (
        <div className="shrink-0 border-t border-border bg-muted/30 px-4 py-3">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <SparklesIcon className="size-4 text-primary" />
                <span className="text-xs font-semibold text-primary">
                  AI Generate: {COMPONENT_TYPES.find((c) => c.type === aiGenType)?.label}
                </span>
              </div>
              <button
                onClick={() => { setAiGenType(null); setAiPrompt(""); setAiGenerated(false); setAiGenerating(false); }}
                className="p-0.5 rounded hover:bg-muted transition-colors"
              >
                <XIcon className="size-3.5 text-muted-foreground" />
              </button>
            </div>

            {!aiGenerated ? (
              <div className="flex gap-2">
                <input
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder={`Describe the ${COMPONENT_TYPES.find((c) => c.type === aiGenType)?.label.toLowerCase()} you want to create...`}
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && aiPrompt.trim()) {
                      setAiGenerating(true);
                      setTimeout(() => { setAiGenerating(false); setAiGenerated(true); }, 1500);
                    }
                  }}
                />
                <Button
                  size="sm"
                  disabled={!aiPrompt.trim() || aiGenerating}
                  onClick={() => {
                    setAiGenerating(true);
                    setTimeout(() => { setAiGenerating(false); setAiGenerated(true); }, 1500);
                  }}
                >
                  {aiGenerating ? (
                    <><LoaderIcon className="size-3.5 mr-1 animate-spin" /> Generating...</>
                  ) : (
                    <><SparklesIcon className="size-3.5 mr-1" /> Generate</>
                  )}
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
                  <span className="text-xs font-medium text-primary">Preview generated.</span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    "{aiPrompt}" — ready to send as {COMPONENT_TYPES.find((c) => c.type === aiGenType)?.label}.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setAiGenerated(false); }}
                  >
                    Regenerate
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setAiGenType(null); setAiPrompt(""); setAiGenerated(false);
                      console.log("Send AI-generated component:", aiGenType, aiPrompt);
                    }}
                  >
                    Send
                  </Button>
                </div>
              </div>
            )}
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

        <div className="p-3">
          <div className="flex items-end gap-2 max-w-3xl mx-auto">
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

            {/* Quick actions: image + mic */}
            <div className="flex items-center gap-0.5 shrink-0 pb-1">
              <button className="size-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors" title="Send image">
                <ImageIcon className="size-4 text-muted-foreground" />
              </button>
              <button className="size-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors" title="Voice message">
                <MicIcon className="size-4 text-muted-foreground" />
              </button>
            </div>

            {/* Text input */}
            <div className="flex-1 rounded-2xl border border-border bg-muted/50 focus-within:border-ring/50 focus-within:ring-1 focus-within:ring-ring/20">
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Type a message..."
                className="w-full bg-transparent px-4 py-2.5 text-sm resize-none focus:outline-none min-h-[40px] max-h-32"
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (inputValue.trim()) {
                      setInputValue("");
                      setReplyingTo(null);
                    }
                  }
                }}
              />
            </div>

            {/* Send button */}
            <Button
              size="icon"
              className="size-10 rounded-full shrink-0"
              disabled={!inputValue.trim()}
              onClick={() => {
                if (inputValue.trim()) {
                  setInputValue("");
                  setReplyingTo(null);
                }
              }}
            >
              <ArrowUpIcon className="size-4" />
            </Button>
          </div>
        </div>
      </div>
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
