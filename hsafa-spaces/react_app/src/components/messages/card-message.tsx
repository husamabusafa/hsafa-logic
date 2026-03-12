import { type MockMessage } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { LayoutDashboardIcon } from "lucide-react";

interface CardMessageProps {
  message: MockMessage;
}

export function CardMessage({ message }: CardMessageProps) {
  const actions = message.cardActions || [];

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

        {actions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {actions.map((action) => (
              <Button
                key={action.value}
                size="sm"
                variant={action.style === "danger" ? "destructive" : action.style === "primary" ? "default" : "outline"}
                className="h-7 text-xs"
              >
                {action.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
