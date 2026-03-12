import { type MockMessage, type MockMember, currentUser } from "@/lib/mock-data";
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
import { CheckIcon, CheckCheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface MessageRendererProps {
  message: MockMessage;
  member?: MockMember;
  isOwn: boolean;
  showSender: boolean;
  showSenderName?: boolean;  // Only show name on first message in group
  otherMemberCount: number;
  onReply: (messageId: string) => void;
  onScrollToMessage?: (messageId: string) => void;
}

export function MessageRenderer({
  message,
  member,
  isOwn,
  showSender,
  showSenderName = false,
  otherMemberCount,
  onReply,
  onScrollToMessage,
}: MessageRendererProps) {
  if (message.type === "system") {
    return <SystemMessage message={message} />;
  }

  const seenByOthers = message.seenBy.filter((eid) => eid !== currentUser.entityId);
  const allSeen = seenByOthers.length >= otherMemberCount;
  const time = new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const seenIndicator = isOwn ? (
    allSeen ? (
      <CheckCheckIcon className="size-3.5 text-blue-300" />
    ) : seenByOthers.length > 0 ? (
      <CheckCheckIcon className="size-3.5 opacity-60" />
    ) : (
      <CheckIcon className="size-3.5 opacity-60" />
    )
  ) : null;

  const content = renderContent(message);

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
          <div className={cn(
            "px-3.5 py-2 overflow-hidden bg-primary text-primary-foreground",
            showSender ? "rounded-2xl rounded-br-md" : "rounded-2xl"
          )}>
            {content}
            <div className="flex items-center justify-end gap-1 mt-1">
              <span className="text-[10px] opacity-70">{time}</span>
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
        <Avatar name={message.senderName} color={member?.avatarColor} size="sm" isOnline={member?.isOnline} />
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
          <div className={cn(
            "px-3.5 py-2 overflow-hidden bg-muted",
            showSender ? "rounded-2xl rounded-bl-md" : "rounded-2xl"
          )}>
            {content}
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
