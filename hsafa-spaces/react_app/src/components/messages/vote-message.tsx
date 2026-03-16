import { useState, useEffect } from "react";
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
    (r) => r.entityId === currentEntityId,
  );
  const serverVote = myResponse?.value as string | undefined;
  const isClosed = message.status === "closed";

  // Optimistic local state for immediate feedback
  const [optimisticVote, setOptimisticVote] = useState<string | undefined>(serverVote);

  // Sync optimistic state with server state when SSE update arrives
  useEffect(() => {
    setOptimisticVote(serverVote);
  }, [serverVote]);

  const myVote = optimisticVote;

  const handleVote = async (option: string) => {
    setSubmitting(option);
    setOptimisticVote(option); // Immediate UI update
    try {
      await respondToMessage(message.id, option);
    } catch (err) {
      console.error("Failed to vote:", err);
      setOptimisticVote(serverVote); // Rollback on error
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <BarChart3Icon className="size-4 shrink-0" />
        </div>
        <span className="text-sm font-semibold text-foreground">{message.title}</span>
      </div>

      <div className="space-y-2">
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
                "relative w-full overflow-hidden rounded-xl border bg-background/70 px-3 py-2 text-left transition-all",
                isMyVote
                  ? "border-primary/35 bg-primary/10 shadow-sm"
                  : "border-border/60 hover:border-primary/20 hover:bg-background/90",
                isClosed && "cursor-default opacity-70",
              )}
            >
              <div
                className={cn("absolute inset-0 rounded-xl", isMyVote ? "bg-primary/10" : "bg-muted/35")}
                style={{ width: `${pct}%` }}
              />
              <div className="relative flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  {isMyVote && <CheckIcon className="size-3 shrink-0 text-primary" />}
                  <span className={cn("text-xs", isMyVote ? "font-medium text-primary" : "text-foreground/85")}>{option}</span>
                </div>
                <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">{count} · {pct}%</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{totalVotes} {totalVotes === 1 ? "vote" : "votes"}</span>
        <span>{isClosed ? "Closed" : myVote ? "Tap to change" : "Tap to vote"}</span>
      </div>

      <ResponsesDrawer responseSummary={message.responseSummary} />
    </div>
  );
}
