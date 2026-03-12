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
        {messages.map((msg, idx) => {
          // Only show avatar on LAST message in a consecutive group
          const isFirstInGroup = idx === 0 || messages[idx - 1].entityId !== msg.entityId || messages[idx - 1].type === "system";
          const isLastInGroup = idx === messages.length - 1 || messages[idx + 1].entityId !== msg.entityId || messages[idx + 1].type === "system";
          const showAvatar = isLastInGroup;           // Avatar only on last message
          const showSenderName = isFirstInGroup;      // Name only on first message
          return (
            <div key={msg.id} ref={(el) => { messageRefs.current[msg.id] = el; }} className="transition-all">
              <MessageRenderer
                message={msg}
                member={space.members.find((m) => m.entityId === msg.entityId)}
                isOwn={msg.entityId === currentUser.entityId}
                showSender={showAvatar}
                showSenderName={showSenderName}
                otherMemberCount={space.members.length - 1}
                onReply={handleReply}
                onScrollToMessage={handleScrollToMessage}
              />
            </div>
          );
        })}

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
                  onClick={() => { setAiGenType(null); setAiPrompt(""); setAiGenerated(false); setAiGenerating(false); }}
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
                        if (e.key === "Enter" && aiPrompt.trim()) {
                          setAiGenerating(true);
                          setTimeout(() => { setAiGenerating(false); setAiGenerated(true); }, 1500);
                        }
                      }}
                      autoFocus
                    />
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        disabled={!aiPrompt.trim() || aiGenerating}
                        onClick={() => {
                          setAiGenerating(true);
                          setTimeout(() => { setAiGenerating(false); setAiGenerated(true); }, 1500);
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
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                      <p className="text-xs font-medium text-primary mb-2">Generated Preview</p>
                      <AiGeneratedPreview type={aiGenType} prompt={aiPrompt} />
                    </div>

                    <div className="flex gap-2 justify-end">
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

// ─── AI Generated Component Preview ─────────────────────────────────────────

function AiGeneratedPreview({ type, prompt }: { type: ComponentType; prompt: string }) {
  switch (type) {
    case "chart":
      return <ChartPreview />;
    case "vote":
      return <VotePreview prompt={prompt} />;
    case "confirmation":
      return <ConfirmationPreview prompt={prompt} />;
    case "choice":
      return <ChoicePreview prompt={prompt} />;
    case "form":
      return <FormPreview prompt={prompt} />;
    case "card":
      return <CardPreview prompt={prompt} />;
    case "file":
      return <FilePreview prompt={prompt} />;
    case "video":
      return <VideoPreview prompt={prompt} />;
    default:
      return <div className="text-sm text-muted-foreground">Component preview for: {prompt.slice(0, 50)}...</div>;
  }
}

function ChartPreview() {
  const data = [
    { label: "Jan", value: 45 },
    { label: "Feb", value: 72 },
    { label: "Mar", value: 58 },
    { label: "Apr", value: 90 },
    { label: "May", value: 65 },
  ];
  const max = Math.max(...data.map((d) => d.value));

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Monthly Sales Report</p>
      <div className="flex items-end gap-2 h-24">
        {data.map((d) => (
          <div key={d.label} className="flex-1 flex flex-col items-center gap-1">
            <div
              className="w-full bg-primary/70 rounded-t"
              style={{ height: `${(d.value / max) * 80}px` }}
            />
            <span className="text-[10px] text-muted-foreground">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function VotePreview({ prompt }: { prompt: string }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{prompt.slice(0, 60) || "Quick Poll"}</p>
      <div className="space-y-1.5">
        {["Option A", "Option B", "Option C"].map((opt, i) => (
          <div key={opt} className="flex items-center gap-2">
            <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary/60 flex items-center px-2"
                style={{ width: `${[60, 30, 10][i]}%` }}
              >
                <span className="text-[10px] text-white font-medium">{[60, 30, 10][i]}%</span>
              </div>
            </div>
            <span className="text-xs text-muted-foreground w-16">{opt}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConfirmationPreview({ prompt }: { prompt: string }) {
  return (
    <div className="space-y-3">
      <p className="text-sm">{prompt.slice(0, 80) || "Please confirm this action"}</p>
      <div className="flex gap-2">
        <button className="flex-1 py-1.5 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium">
          Confirm
        </button>
        <button className="flex-1 py-1.5 px-3 rounded-lg bg-muted text-foreground text-xs font-medium">
          Cancel
        </button>
      </div>
    </div>
  );
}

function ChoicePreview({ prompt }: { prompt: string }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{prompt.slice(0, 50) || "Select an option"}</p>
      <div className="space-y-1">
        {["Choice 1", "Choice 2", "Choice 3"].map((c) => (
          <button key={c} className="w-full text-left px-3 py-2 rounded-lg bg-muted hover:bg-muted/80 text-sm transition-colors">
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}

function FormPreview({ prompt }: { prompt: string }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{prompt.slice(0, 40) || "Form"}</p>
      <div className="space-y-1.5">
        <input placeholder="Name" className="w-full px-2 py-1.5 rounded border border-border bg-background text-xs" disabled />
        <input placeholder="Email" className="w-full px-2 py-1.5 rounded border border-border bg-background text-xs" disabled />
      </div>
    </div>
  );
}

function CardPreview({ prompt }: { prompt: string }) {
  return (
    <div className="rounded-lg overflow-hidden border border-border">
      <div className="h-16 bg-gradient-to-r from-primary/30 to-primary/10" />
      <div className="p-2">
        <p className="text-sm font-medium">{prompt.slice(0, 40) || "Rich Card"}</p>
        <p className="text-xs text-muted-foreground">Card description goes here...</p>
      </div>
    </div>
  );
}

function FilePreview({ prompt }: { prompt: string }) {
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg bg-muted">
      <div className="size-8 rounded bg-primary/20 flex items-center justify-center">
        <FileIcon className="size-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{prompt.slice(0, 30) || "document.pdf"}</p>
        <p className="text-xs text-muted-foreground">2.4 MB · PDF</p>
      </div>
    </div>
  );
}

function VideoPreview({ prompt }: { prompt: string }) {
  return (
    <div className="rounded-lg overflow-hidden bg-muted aspect-video flex items-center justify-center">
      <div className="text-center">
        <VideoIcon className="size-8 text-muted-foreground mx-auto mb-1" />
        <p className="text-xs text-muted-foreground">{prompt.slice(0, 30) || "Video preview"}</p>
      </div>
    </div>
  );
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
