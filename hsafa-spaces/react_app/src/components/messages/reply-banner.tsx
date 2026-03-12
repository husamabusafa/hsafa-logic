import { type MessageType } from "@/lib/mock-data";
import { CornerUpRightIcon } from "lucide-react";

interface ReplyBannerProps {
  replyTo: { messageId: string; snippet: string; senderName: string; messageType: MessageType };
  onClick?: () => void;
}

export function ReplyBanner({ replyTo, onClick }: ReplyBannerProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors max-w-full"
    >
      <CornerUpRightIcon className="size-3 shrink-0" />
      <span className="font-medium shrink-0">{replyTo.senderName}</span>
      <span className="truncate">{replyTo.snippet}</span>
    </button>
  );
}
