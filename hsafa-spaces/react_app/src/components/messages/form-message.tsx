import { useState } from "react";
import { type MockMessage, currentUser } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { ClipboardListIcon, CheckIcon, UsersIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface FormMessageProps {
  message: MockMessage;
}

export function FormMessage({ message }: FormMessageProps) {
  const fields = message.formFields || [];
  const totalResponses = message.responseSummary?.totalResponses || 0;
  const hasResponded = message.responseSummary?.respondedEntityIds?.includes(currentUser.entityId) ?? false;
  const isClosed = message.status === "closed";
  const [showResponses, setShowResponses] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <ClipboardListIcon className="size-4 text-primary shrink-0" />
        <span className="text-sm font-semibold">{message.formTitle}</span>
      </div>
      {message.formDescription && (
        <p className="text-xs opacity-70">{message.formDescription}</p>
      )}

      {!hasResponded && !isClosed && (
        <div className="space-y-2 pt-1">
          {fields.map((field) => (
            <div key={field.name}>
              <label className="text-[11px] font-medium opacity-80 mb-0.5 block">
                {field.label}
                {field.required && <span className="text-red-500 ml-0.5">*</span>}
              </label>
              {field.type === "textarea" ? (
                <textarea
                  placeholder={field.placeholder}
                  className="w-full rounded-lg border border-border/50 bg-background/50 px-2.5 py-1.5 text-xs resize-none h-12 focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              ) : field.type === "select" ? (
                <select className="w-full rounded-lg border border-border/50 bg-background/50 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50">
                  <option value="">Select...</option>
                  {field.options?.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type}
                  placeholder={field.placeholder}
                  className="w-full rounded-lg border border-border/50 bg-background/50 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              )}
            </div>
          ))}
          <Button size="sm" className="w-full h-7 text-xs">Submit</Button>
        </div>
      )}

      {hasResponded && (
        <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
          <CheckIcon className="size-3.5" />
          <span>You submitted your response</span>
        </div>
      )}

      {isClosed && !hasResponded && (
        <div className="text-xs opacity-60">This form is closed.</div>
      )}

      <button
        onClick={() => setShowResponses(!showResponses)}
        className="flex items-center gap-1.5 text-[10px] opacity-60 hover:opacity-100 transition-opacity"
      >
        <UsersIcon className="size-3" />
        <span>{totalResponses} {totalResponses === 1 ? "response" : "responses"}</span>
      </button>

      {showResponses && totalResponses > 0 && (
        <div className="space-y-1.5 pt-1 border-t border-current/10 max-h-32 overflow-y-auto">
          {message.responseSummary?.responses?.map((r) => (
            <div key={r.entityId} className="text-[11px]">
              <span className="font-medium">{r.entityName}</span>
              <div className="mt-0.5 opacity-70">
                {typeof r.value === "object" && r.value !== null
                  ? Object.entries(r.value as Record<string, unknown>).map(([k, v]) => (
                      <div key={k} className={cn("flex gap-1")}>
                        <span className="font-medium capitalize">{k.replace(/_/g, " ")}:</span>
                        <span>{String(v)}</span>
                      </div>
                    ))
                  : String(r.value)
                }
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
