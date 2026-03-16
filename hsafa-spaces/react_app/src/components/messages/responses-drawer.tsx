import { useState } from "react";
import { UsersIcon, ChevronDownIcon } from "lucide-react";
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
          "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
          total > 0
            ? "border-primary/15 bg-primary/5 text-primary/80 hover:bg-primary/10 hover:text-primary"
            : "border-border/60 bg-background/60 text-muted-foreground/70 hover:bg-muted/40 hover:text-foreground",
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
        <div className="mt-2 max-h-40 space-y-1.5 overflow-y-auto rounded-2xl border border-border/40 bg-background/80 p-2.5 shadow-sm">
          {responses.map((r) => (
            <div
              key={r.entityId}
              className="flex items-start gap-2 rounded-xl bg-muted/35 px-2 py-1 text-[11px]"
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
                <span className="font-medium text-foreground">{r.entityName}</span>
                <span className="ml-1.5 text-muted-foreground">{fmt(r.value)}</span>
              </div>
              <span className="shrink-0 tabular-nums text-[9px] text-muted-foreground/70">
                {new Date(r.respondedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
