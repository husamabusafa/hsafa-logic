import { useState } from "react";
import { type MockMessage } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { ListIcon, XCircleIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInteractive } from "@/lib/interactive-context";
import { ResponsesDrawer } from "./responses-drawer";

interface ChoiceMessageProps {
  message: MockMessage;
}

export function ChoiceMessage({ message }: ChoiceMessageProps) {
  const { respondToMessage, currentEntityId } = useInteractive();
  const [submitting, setSubmitting] = useState<string | null>(null);

  const options = message.choiceOptions || [];
  const isClosed = message.status === "closed";
  const myResponse = message.responseSummary?.responses?.find(
    (r) => r.entityId === currentEntityId
  );
  const myChoice = myResponse?.value as string | undefined;

  const handleChoose = async (value: string) => {
    setSubmitting(value);
    try {
      await respondToMessage(message.id, value);
    } catch (err) {
      console.error("Failed to choose:", err);
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <ListIcon className="size-4 text-primary shrink-0" />
        <span className="text-sm font-semibold">{message.title}</span>
      </div>

      {!isClosed && (
        <div className="flex flex-wrap gap-1.5">
          {options.map((opt) => (
            <Button
              key={opt.value}
              size="sm"
              disabled={submitting !== null}
              onClick={() => handleChoose(opt.value)}
              variant={myChoice === opt.value ? "default" : opt.style === "danger" ? "destructive" : opt.style === "primary" ? "default" : "outline"}
              className={cn("h-7 text-xs", myChoice === opt.value && "ring-2 ring-primary ring-offset-1 ring-offset-background")}
            >
              {submitting === opt.value ? "..." : opt.label}
            </Button>
          ))}
        </div>
      )}

      {isClosed && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <XCircleIcon className="size-3.5" />
          <span>This choice was closed.</span>
        </div>
      )}

      <ResponsesDrawer responseSummary={message.responseSummary} />
    </div>
  );
}
