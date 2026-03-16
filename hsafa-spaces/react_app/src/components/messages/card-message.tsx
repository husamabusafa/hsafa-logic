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
  const myResponse = message.responseSummary?.responses?.find(
    (r) => r.entityId === currentEntityId,
  );
  const myChoice = myResponse?.value as string | undefined;

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
    <div className="space-y-2 -mx-3.5 -mt-2">
      {message.cardImageUrl && (
        <div className="w-full h-36 overflow-hidden rounded-t-2xl">
          <img
            src={message.cardImageUrl}
            alt={message.cardTitle || "Card image"}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <div className="px-3.5">
        <div className="flex items-center gap-2">
          {!message.cardImageUrl && <LayoutDashboardIcon className="size-4 text-primary shrink-0" />}
          <span className="text-sm font-semibold">{message.cardTitle}</span>
        </div>
        {message.cardBody && (
          <p className="text-xs opacity-80 leading-relaxed mt-1">{message.cardBody}</p>
        )}

        {actions.length > 0 && !isClosed && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {actions.map((action) => (
              <Button
                key={action.value}
                size="sm"
                disabled={submitting !== null}
                onClick={() => handleAction(action.value)}
                variant={myChoice === action.value ? "default" : action.style === "danger" ? "destructive" : action.style === "primary" ? "default" : "outline"}
                className={cn("h-7 text-xs", myChoice === action.value && "ring-2 ring-primary ring-offset-1 ring-offset-background")}
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
