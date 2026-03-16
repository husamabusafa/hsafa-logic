import { useState } from "react";
import { type MockMessage } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { XCircleIcon, ClockIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInteractive } from "@/lib/interactive-context";
import { ResponsesDrawer } from "./responses-drawer";

interface ConfirmationMessageProps {
  message: MockMessage;
}

export function ConfirmationMessage({ message }: ConfirmationMessageProps) {
  const { respondToMessage, currentEntityId } = useInteractive();
  const [submitting, setSubmitting] = useState<string | null>(null);

  const isClosed = message.status === "closed";
  const allowUpdate = message.allowUpdate !== false;
  const myResponse = message.responseSummary?.responses?.find(
    (r) => r.entityId === currentEntityId,
  );
  const myChoice = myResponse?.value as string | undefined;
  const hasResponded = !!myChoice;

  const handleRespond = async (value: "confirmed" | "rejected") => {
    setSubmitting(value);
    try {
      await respondToMessage(message.id, value);
    } catch (err) {
      console.error("Failed to respond:", err);
    } finally {
      setSubmitting(null);
    }
  };

  const formatValue = (value: unknown) =>
    value === "confirmed" ? "Confirmed" : "Rejected";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex size-8 items-center justify-center rounded-xl bg-amber-500/12 text-amber-600 dark:text-amber-400">
          <ClockIcon className="size-4 shrink-0" />
        </div>
        <span className="text-sm font-semibold text-foreground">{message.title}</span>
      </div>

      {message.message && (
        <p className="text-sm leading-relaxed text-foreground/80">{message.message}</p>
      )}

      {!isClosed && (
        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            disabled={submitting !== null || (hasResponded && !allowUpdate)}
            onClick={() => handleRespond("confirmed")}
            variant="ghost"
            className={cn(
              "h-8 rounded-xl border text-xs shadow-none transition-all",
              myChoice === "confirmed"
                ? "border-emerald-500/50 bg-emerald-500 text-white hover:bg-emerald-600"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:border-emerald-500/40 hover:bg-emerald-500/15 dark:text-emerald-300",
              hasResponded && !allowUpdate && "cursor-not-allowed opacity-60",
            )}
          >
            {submitting === "confirmed" ? "..." : (message.confirmLabel || "Confirm")}
          </Button>
          <Button
            size="sm"
            disabled={submitting !== null || (hasResponded && !allowUpdate)}
            onClick={() => handleRespond("rejected")}
            variant="ghost"
            className={cn(
              "h-8 rounded-xl border text-xs shadow-none transition-all",
              myChoice === "rejected"
                ? "border-red-500/50 bg-red-500 text-white hover:bg-red-600"
                : "border-red-500/30 bg-red-500/10 text-red-700 hover:border-red-500/40 hover:bg-red-500/15 dark:text-red-300",
              hasResponded && !allowUpdate && "cursor-not-allowed opacity-60",
            )}
          >
            {submitting === "rejected" ? "..." : (message.rejectLabel || "Cancel")}
          </Button>
        </div>
      )}

      {isClosed && (
        <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
          <XCircleIcon className="size-3.5" />
          <span>Closed</span>
        </div>
      )}

      <ResponsesDrawer responseSummary={message.responseSummary} formatValue={formatValue} />
    </div>
  );
}
