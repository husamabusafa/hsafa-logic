import { useState } from "react";
import { type MockMessage } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { CheckCircleIcon, XCircleIcon, ClockIcon } from "lucide-react";
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
  const myResponse = message.responseSummary?.responses?.find(
    (r) => r.entityId === currentEntityId,
  );
  const myChoice = myResponse?.value as string | undefined;

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
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <ClockIcon className="size-4 text-amber-500 shrink-0" />
        <span className="text-sm font-semibold">{message.title}</span>
      </div>

      {message.message && (
        <p className="text-sm opacity-80 leading-relaxed">{message.message}</p>
      )}

      {!isClosed && (
        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            disabled={submitting !== null}
            onClick={() => handleRespond("confirmed")}
            className={cn(
              "h-7 text-xs transition-all",
              myChoice === "confirmed"
                ? "bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-400 ring-offset-1 ring-offset-background"
                : "bg-emerald-600 hover:bg-emerald-700 text-white",
            )}
          >
            {submitting === "confirmed" ? "..." : (message.confirmLabel || "Confirm")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={submitting !== null}
            onClick={() => handleRespond("rejected")}
            className={cn(
              "h-7 text-xs transition-all",
              myChoice === "rejected" && "ring-2 ring-red-400 ring-offset-1 ring-offset-background",
            )}
          >
            {submitting === "rejected" ? "..." : (message.rejectLabel || "Cancel")}
          </Button>
        </div>
      )}

      {isClosed && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <XCircleIcon className="size-3.5" />
          <span>Closed</span>
        </div>
      )}

      <ResponsesDrawer responseSummary={message.responseSummary} formatValue={formatValue} />
    </div>
  );
}
