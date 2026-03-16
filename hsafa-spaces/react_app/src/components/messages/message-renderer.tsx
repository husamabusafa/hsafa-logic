import { type MockMessage, type MockMember } from "@/lib/mock-data";
import { TextMessage } from "./text-message";
import { ConfirmationMessage } from "./confirmation-message";
import { VoteMessage } from "./vote-message";
import { ChoiceMessage } from "./choice-message";
import { FormMessage } from "./form-message";
import { CardMessage } from "./card-message";
import { ImageMessage } from "./image-message";
import { VoiceMessage } from "./voice-message";
import { VideoMessage } from "./video-message";
import { FileMessage } from "./file-message";
import { ChartMessage } from "./chart-message";
import { SystemMessage } from "./system-message";
import { ReplyBanner } from "./reply-banner";
import { Avatar } from "@/components/ui/avatar";
import { CheckIcon, CheckCheckIcon, CornerUpLeftIcon, ForwardIcon, CopyIcon, MoreHorizontalIcon, EyeIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface MessageRendererProps {
  message: MockMessage;
  member?: MockMember;
  isOwn: boolean;
  showSender: boolean;
  showSenderName?: boolean;
  otherMemberCount: number;
  currentEntityId?: string;
  onReply: (messageId: string) => void;
  onForward?: (messageId: string) => void;
  onScrollToMessage?: (messageId: string) => void;
  onSeenInfo?: (messageId: string) => void;
}

export function MessageRenderer({
  message,
  member,
  isOwn,
  showSender,
  showSenderName = false,
  otherMemberCount,
  currentEntityId,
  onReply,
  onForward,
  onScrollToMessage,
  onSeenInfo,
}: MessageRendererProps) {
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  if (message.type === "system") {
    return <SystemMessage message={message} />;
  }

  const isComponentMessage = ["confirmation", "vote", "choice", "form", "card", "chart"].includes(message.type);
  const seenByOthers = message.seenBy.filter((eid) => eid !== currentEntityId);
  const allSeen = seenByOthers.length >= otherMemberCount;
  const time = new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const seenIcon = allSeen ? (
    <CheckCheckIcon className="size-3.5 text-blue-300" />
  ) : seenByOthers.length > 0 ? (
    <CheckCheckIcon className="size-3.5 opacity-60" />
  ) : (
    <CheckIcon className="size-3.5 opacity-60" />
  );

  const seenIndicator = isOwn ? seenIcon : null;

  const content = renderContent(message);
  const contentNode = isComponentMessage ? (
    <div className="rounded-[18px] border border-border/50 bg-background/80 px-3 py-3 shadow-sm backdrop-blur-sm">
      {content}
    </div>
  ) : content;

  const handleCopy = () => {
    const text = message.content || message.title || message.formTitle || message.cardTitle || message.imageCaption || message.fileName || "";
    navigator.clipboard.writeText(text);
    setShowMoreMenu(false);
  };

  // Hover action buttons
  const actionButtons = (
    <>
      {showMoreMenu && <div className="fixed inset-0 z-30" onClick={() => setShowMoreMenu(false)} />}
      <div className={cn(
        "absolute top-0 z-40 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-background/95 backdrop-blur-sm border border-border/70 rounded-xl shadow-md px-0.5 py-0.5",
        isOwn ? "right-full mr-1.5" : "left-full ml-1.5",
      )}>
        <button
          onClick={() => onReply(message.id)}
          className="p-1.5 rounded-md hover:bg-muted transition-colors"
          title="Reply"
        >
          <CornerUpLeftIcon className="size-3.5 text-muted-foreground" />
        </button>
        <button
          onClick={() => onForward?.(message.id)}
          className="p-1.5 rounded-md hover:bg-muted transition-colors"
          title="Forward"
        >
          <ForwardIcon className="size-3.5 text-muted-foreground" />
        </button>
        <div className="relative">
          <button
            onClick={() => setShowMoreMenu((v) => !v)}
            className="p-1.5 rounded-md hover:bg-muted transition-colors"
            title="More"
          >
            <MoreHorizontalIcon className="size-3.5 text-muted-foreground" />
          </button>
          {showMoreMenu && (
            <div className={cn(
              "absolute top-full mt-1 z-50 w-36 bg-popover border border-border rounded-lg shadow-lg py-1",
              isOwn ? "right-0" : "left-0",
            )}>
              <button onClick={handleCopy} className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted text-sm text-left transition-colors">
                <CopyIcon className="size-3.5 text-muted-foreground" />
                Copy text
              </button>
              <button
                onClick={() => { onReply(message.id); setShowMoreMenu(false); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted text-sm text-left transition-colors"
              >
                <CornerUpLeftIcon className="size-3.5 text-muted-foreground" />
                Reply
              </button>
              <button
                onClick={() => { onForward?.(message.id); setShowMoreMenu(false); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted text-sm text-left transition-colors"
              >
                <ForwardIcon className="size-3.5 text-muted-foreground" />
                Forward
              </button>
              {onSeenInfo && isOwn && (
                <button
                  onClick={() => { onSeenInfo(message.id); setShowMoreMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted text-sm text-left transition-colors"
                >
                  <EyeIcon className="size-3.5 text-muted-foreground" />
                  Info
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );

  // Own messages — right-aligned bubble
  if (isOwn) {
    return (
      <div className={cn("flex flex-col items-end", showSenderName ? "mt-4" : "mt-1")}>
        {message.replyTo && (
          <div className="max-w-[75%] mb-0.5">
            <ReplyBanner replyTo={message.replyTo} onClick={() => onScrollToMessage?.(message.replyTo!.messageId)} />
          </div>
        )}
        <div className="max-w-[75%] group relative" onDoubleClick={() => onReply(message.id)}>
          {actionButtons}
          <div className={cn(
            "overflow-hidden shadow-sm",
            isComponentMessage
              ? "border border-primary/15 bg-primary/10 text-foreground backdrop-blur-sm p-1.5"
              : "bg-primary text-primary-foreground px-3.5 py-2.5",
            showSender ? "rounded-2xl rounded-br-md" : "rounded-2xl"
          )}>
            {contentNode}
            <div className="flex items-center justify-end gap-1 mt-1">
              <span className={cn("text-[10px]", isComponentMessage ? "text-muted-foreground" : "opacity-70")}>{time}</span>
              {seenIndicator}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Others' messages — left-aligned bubble
  return (
    <div className={cn("flex items-end gap-2", showSenderName ? "mt-4" : "mt-1")}>
      {showSender ? (
        <Avatar name={message.senderName} src={member?.avatarUrl} color={member?.avatarColor} size="sm" isOnline={member?.isOnline} />
      ) : (
        <div className="w-8" />
      )}
      <div className="max-w-[75%]">
        {showSenderName && (
          <div className="flex items-center gap-1.5 mb-0.5 ml-1">
            <span className="text-xs font-medium text-muted-foreground">{message.senderName}</span>
          </div>
        )}
        {message.replyTo && (
          <div className="mb-0.5">
            <ReplyBanner replyTo={message.replyTo} onClick={() => onScrollToMessage?.(message.replyTo!.messageId)} />
          </div>
        )}
        <div className="group relative" onDoubleClick={() => onReply(message.id)}>
          {actionButtons}
          <div className={cn(
            "overflow-hidden border shadow-sm backdrop-blur-sm",
            isComponentMessage
              ? "bg-card/70 border-border/50 p-1.5"
              : "bg-card border-border/60 px-3.5 py-2.5",
            showSender ? "rounded-2xl rounded-bl-md" : "rounded-2xl"
          )}>
            {contentNode}
            <div className="flex items-center justify-end mt-1">
              <span className="text-[10px] text-muted-foreground">{time}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function renderContent(message: MockMessage) {
  switch (message.type) {
    case "text":
      return <TextMessage message={message} />;
    case "confirmation":
      return <ConfirmationMessage message={message} />;
    case "vote":
      return <VoteMessage message={message} />;
    case "choice":
      return <ChoiceMessage message={message} />;
    case "form":
      return <FormMessage message={message} />;
    case "card":
      return <CardMessage message={message} />;
    case "image":
      return <ImageMessage message={message} />;
    case "voice":
      return <VoiceMessage message={message} />;
    case "video":
      return <VideoMessage message={message} />;
    case "file":
      return <FileMessage message={message} />;
    case "chart":
      return <ChartMessage message={message} />;
    default:
      return <TextMessage message={message} />;
  }
}
