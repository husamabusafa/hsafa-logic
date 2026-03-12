import { type MockMessage, currentUser } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { CheckCircleIcon, XCircleIcon, ClockIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConfirmationMessageProps {
  message: MockMessage;
}

export function ConfirmationMessage({ message }: ConfirmationMessageProps) {
  const isResolved = message.status === "resolved";
  const isClosed = message.status === "closed";
  const isTarget = message.targetEntityIds?.includes(currentUser.entityId) ?? false;
  const outcome = message.resolution?.outcome;
  const responder = message.responseSummary?.responses?.[0];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {isResolved ? (
          outcome === "confirmed" ? (
            <CheckCircleIcon className="size-4 text-emerald-500 shrink-0" />
          ) : (
            <XCircleIcon className="size-4 text-red-500 shrink-0" />
          )
        ) : (
          <ClockIcon className="size-4 text-amber-500 shrink-0" />
        )}
        <span className="text-sm font-semibold">{message.title}</span>
      </div>

      {message.message && (
        <p className="text-sm opacity-80 leading-relaxed">{message.message}</p>
      )}

      {isResolved && responder && (
        <div className={cn(
          "flex items-center gap-2 text-xs font-medium",
          outcome === "confirmed" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
        )}>
          {outcome === "confirmed" ? <CheckCircleIcon className="size-3.5" /> : <XCircleIcon className="size-3.5" />}
          <span>{outcome === "confirmed" ? "Confirmed" : "Rejected"} by {responder.entityName}</span>
        </div>
      )}

      {isClosed && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <XCircleIcon className="size-3.5" />
          <span>Closed</span>
        </div>
      )}

      {message.status === "open" && isTarget && (
        <div className="flex gap-2 pt-1">
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white h-7 text-xs">
            {message.confirmLabel || "Confirm"}
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs">
            {message.rejectLabel || "Cancel"}
          </Button>
        </div>
      )}

      {message.status === "open" && !isTarget && (
        <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <ClockIcon className="size-3" />
          <span>Waiting for response...</span>
        </div>
      )}
    </div>
  );
}
