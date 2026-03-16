import { useState } from "react";
import { type MockMessage } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { LayoutDashboardIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInteractive } from "@/lib/interactive-context";
import { ResponsesDrawer } from "./responses-drawer";

interface CardMessageProps {
  message: MockMessage;
}

export function CardMessage({ message }: CardMessageProps) {
  const { respondToMessage, currentEntityId } = useInteractive();
  const [submitting, setSubmitting] = useState<string | null>(null);

  const actions = message.cardActions || [];
  const isClosed = message.status === "closed";
  const allowUpdate = message.allowUpdate !== false;
  const myResponse = message.responseSummary?.responses?.find(
    (r) => r.entityId === currentEntityId,
  );
  const myChoice = myResponse?.value as string | undefined;
  const hasResponded = !!myChoice;

  const handleAction = async (value: string) => {
    setSubmitting(value);
    try {
      await respondToMessage(message.id, value);
    } catch (err) {
      console.error("Failed to respond to card:", err);
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="space-y-3">
      {message.cardImageUrl && (
        <div className="h-40 w-full overflow-hidden rounded-2xl border border-border/40 shadow-sm">
          <img
            src={message.cardImageUrl}
            alt={message.cardTitle || "Card image"}
            className="h-full w-full object-cover"
          />
        </div>
      )}

      <div>
        <div className="flex items-center gap-2">
          {!message.cardImageUrl && (
            <div className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <LayoutDashboardIcon className="size-4 shrink-0" />
            </div>
          )}
          <span className="text-sm font-semibold text-foreground">{message.cardTitle}</span>
        </div>
        {message.cardBody && (
          <p className="mt-1 text-xs leading-relaxed text-foreground/80">{message.cardBody}</p>
        )}

        {actions.length > 0 && !isClosed && (
          <div className="mt-3 flex flex-wrap gap-2">
            {actions.map((action) => (
              <Button
                key={action.value}
                size="sm"
                variant="outline"
                disabled={submitting !== null || (hasResponded && !allowUpdate)}
                onClick={() => handleAction(action.value)}
                className={cn(
                  "h-8 rounded-xl border text-xs shadow-none",
                  myChoice === action.value
                    ? action.style === "danger"
                      ? "border-red-500/30 bg-red-500/12 text-red-700 dark:text-red-300"
                      : "border-primary/30 bg-primary/12 text-primary"
                    : action.style === "danger"
                      ? "border-border/60 bg-background/60 text-foreground hover:border-red-500/20 hover:bg-red-500/5"
                      : "border-border/60 bg-background/60 text-foreground hover:border-primary/20 hover:bg-primary/5",
                  hasResponded && !allowUpdate && "cursor-not-allowed opacity-60",
                )}
              >
                {submitting === action.value ? "..." : action.label}
              </Button>
            ))}
          </div>
        )}

        <ResponsesDrawer responseSummary={message.responseSummary} />
      </div>
    </div>
  );
}
