import { type MockMessage, currentUser } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { ListIcon, ClockIcon, CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChoiceMessageProps {
  message: MockMessage;
}

export function ChoiceMessage({ message }: ChoiceMessageProps) {
  const options = message.choiceOptions || [];
  const isTarget = message.targetEntityIds?.includes(currentUser.entityId) ?? false;
  const isBroadcast = message.audience === "broadcast";
  const canRespond = isBroadcast || isTarget;
  const isResolved = message.status === "resolved";
  const isClosed = message.status === "closed";
  const myResponse = message.responseSummary?.responses?.find(
    (r) => r.entityId === currentUser.entityId
  );
  const myChoice = myResponse?.value as string | undefined;
  const responder = message.responseSummary?.responses?.[0];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <ListIcon className="size-4 text-primary shrink-0" />
        <span className="text-sm font-semibold">{message.title}</span>
      </div>

      {isResolved && responder && (
        <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
          <CheckIcon className="size-3.5" />
          <span>{responder.entityName} chose: {String(responder.value)}</span>
        </div>
      )}

      {!isResolved && !isClosed && canRespond && (
        <div className="flex flex-wrap gap-1.5">
          {options.map((opt) => (
            <Button
              key={opt.value}
              size="sm"
              variant={myChoice === opt.value ? "default" : opt.style === "danger" ? "destructive" : opt.style === "primary" ? "default" : "outline"}
              className={cn("h-7 text-xs", myChoice === opt.value && "ring-2 ring-primary ring-offset-1 ring-offset-background")}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      )}

      {!isResolved && !isClosed && !canRespond && (
        <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <ClockIcon className="size-3" />
          <span>Waiting for response...</span>
        </div>
      )}

      {isClosed && (
        <div className="text-xs opacity-60">This choice was closed.</div>
      )}
    </div>
  );
}
