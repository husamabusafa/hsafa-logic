import { useState } from "react";
import { type MockMessage } from "@/lib/mock-data";
import { BarChart3Icon, CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInteractive } from "@/lib/interactive-context";
import { ResponsesDrawer } from "./responses-drawer";

interface VoteMessageProps {
  message: MockMessage;
}

export function VoteMessage({ message }: VoteMessageProps) {
  const { respondToMessage, currentEntityId } = useInteractive();
  const [submitting, setSubmitting] = useState<string | null>(null);

  const options = message.options || [];
  const counts = message.responseSummary?.counts || {};
  const totalVotes = message.responseSummary?.totalResponses || 0;
  const myResponse = message.responseSummary?.responses?.find(
    (r) => r.entityId === currentEntityId
  );
  const myVote = myResponse?.value as string | undefined;
  const isClosed = message.status === "closed";

  const handleVote = async (option: string) => {
    setSubmitting(option);
    try {
      await respondToMessage(message.id, option);
    } catch (err) {
      console.error("Failed to vote:", err);
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <BarChart3Icon className="size-4 text-primary shrink-0" />
        <span className="text-sm font-semibold">{message.title}</span>
      </div>

      <div className="space-y-1.5">
        {options.map((option) => {
          const count = counts[option] || 0;
          const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          const isMyVote = myVote === option;

          return (
            <button
              key={option}
              disabled={isClosed || submitting !== null}
              onClick={() => handleVote(option)}
              className={cn(
                "w-full relative rounded-lg border px-2.5 py-1.5 text-left transition-all overflow-hidden",
                isMyVote
                  ? "border-primary/50 bg-primary/10"
                  : "border-border/50 hover:border-primary/30",
                isClosed && "opacity-70 cursor-default"
              )}
            >
              <div
                className={cn("absolute inset-0 rounded-lg", isMyVote ? "bg-primary/15" : "bg-muted/40")}
                style={{ width: `${pct}%` }}
              />
              <div className="relative flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  {isMyVote && <CheckIcon className="size-3 text-primary shrink-0" />}
                  <span className={cn("text-xs", isMyVote ? "font-medium text-primary" : "")}>{option}</span>
                </div>
                <span className="text-[10px] opacity-70 tabular-nums shrink-0">{count} · {pct}%</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-[10px] opacity-60">
        <span>{totalVotes} {totalVotes === 1 ? "vote" : "votes"}</span>
        <span>{isClosed ? "Closed" : myVote ? "Tap to change" : "Tap to vote"}</span>
      </div>

      <ResponsesDrawer responseSummary={message.responseSummary} />
    </div>
  );
}
