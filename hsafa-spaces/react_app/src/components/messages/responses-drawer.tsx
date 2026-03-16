import { useState } from "react";
import { UsersIcon, ChevronDownIcon, CheckCircleIcon, XCircleIcon } from "lucide-react";
import type { ResponseSummary } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

interface ResponsesDrawerProps {
  responseSummary?: ResponseSummary;
  /** Optional formatter for displaying response values (e.g. "confirmed" → "✓ Confirmed") */
  formatValue?: (value: unknown) => string;
}

export function ResponsesDrawer({ responseSummary, formatValue }: ResponsesDrawerProps) {
  const [open, setOpen] = useState(false);
  const total = responseSummary?.totalResponses || 0;
  const responses = responseSummary?.responses || [];

  const defaultFormat = (value: unknown): string => {
    if (typeof value === "object" && value !== null) {
      return Object.entries(value as Record<string, unknown>)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
    }
    return String(value);
  };

  const fmt = formatValue || defaultFormat;

  return (
    <div className="pt-1">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-1.5 text-[11px] transition-colors rounded-md px-1.5 py-0.5 -ml-1.5",
          total > 0
            ? "text-primary/80 hover:text-primary hover:bg-primary/5"
            : "text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/30",
        )}
      >
        <UsersIcon className="size-3" />
        <span className="font-medium">
          {total} {total === 1 ? "response" : "responses"}
        </span>
        {total > 0 && (
          <ChevronDownIcon
            className={cn("size-3 transition-transform", open && "rotate-180")}
          />
        )}
      </button>

      {open && total > 0 && (
        <div className="mt-1.5 space-y-1 max-h-40 overflow-y-auto rounded-lg bg-background/50 border border-border/30 p-2">
          {responses.map((r) => (
            <div
              key={r.entityId}
              className="flex items-start gap-2 text-[11px] py-0.5"
            >
              <div
                className={cn(
                  "size-5 rounded-full flex items-center justify-center shrink-0 text-[9px] font-bold text-white",
                  r.entityType === "agent" ? "bg-emerald-500" : "bg-primary",
                )}
              >
                {r.entityName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <span className="font-medium">{r.entityName}</span>
                <span className="ml-1.5 opacity-60">{fmt(r.value)}</span>
              </div>
              <span className="text-[9px] opacity-40 shrink-0 tabular-nums">
                {new Date(r.respondedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
