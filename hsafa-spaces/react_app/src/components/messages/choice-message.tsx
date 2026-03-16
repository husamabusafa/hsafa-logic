import { useState } from "react";
import { type MockMessage } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { ListIcon, XCircleIcon, CheckIcon } from "lucide-react";
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
  const allowUpdate = message.allowUpdate !== false;
  const myResponse = message.responseSummary?.responses?.find(
    (r) => r.entityId === currentEntityId,
  );
  const myChoice = myResponse?.value as string | undefined;
  const hasResponded = !!myChoice;

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

  const getOptionClass = (value: string, style?: string) => {
    const selected = myChoice === value;
    if (style === "danger") {
      return selected
        ? "border-red-500/30 bg-red-500/12 text-red-700 dark:text-red-300"
        : "border-border/60 bg-background/60 text-foreground hover:border-red-500/20 hover:bg-red-500/5";
    }
    if (style === "primary") {
      return selected
        ? "border-primary/30 bg-primary/12 text-primary"
        : "border-border/60 bg-background/60 text-foreground hover:border-primary/20 hover:bg-primary/5";
    }
    return selected
      ? "border-primary/25 bg-accent text-foreground"
      : "border-border/60 bg-background/60 text-foreground hover:border-primary/15 hover:bg-muted/50";
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ListIcon className="size-4 shrink-0" />
        </div>
        <span className="text-sm font-semibold text-foreground">{message.title}</span>
      </div>

      {!isClosed && (
        <div className="flex flex-wrap gap-2">
          {options.map((opt) => (
            <Button
              key={opt.value}
              size="sm"
              variant="ghost"
              disabled={submitting !== null || (hasResponded && !allowUpdate)}
              onClick={() => handleChoose(opt.value)}
              className={cn(
                "h-8 rounded-xl border text-xs shadow-none transition-all",
                getOptionClass(opt.value, opt.style),
                hasResponded && !allowUpdate && "cursor-not-allowed opacity-60",
              )}
            >
              {myChoice === opt.value && <CheckIcon className="size-3 mr-1 shrink-0" />}
              {submitting === opt.value ? "..." : opt.label}
            </Button>
          ))}
        </div>
      )}

      {hasResponded && !isClosed && (
        <p className="text-[10px] text-muted-foreground">
          Your answer: {options.find((o) => o.value === myChoice)?.label ?? myChoice}
        </p>
      )}

      {isClosed && (
        <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
          <XCircleIcon className="size-3.5" />
          <span>This choice was closed.</span>
        </div>
      )}

      <ResponsesDrawer responseSummary={message.responseSummary} />
    </div>
  );
}
