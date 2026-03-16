import { useState } from "react";
import { type MockMessage } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { ClipboardListIcon, CheckIcon } from "lucide-react";
import { useInteractive } from "@/lib/interactive-context";
import { ResponsesDrawer } from "./responses-drawer";

interface FormMessageProps {
  message: MockMessage;
}

export function FormMessage({ message }: FormMessageProps) {
  const { respondToMessage, currentEntityId } = useInteractive();
  const fields = message.formFields || [];
  const isClosed = message.status === "closed";
  const allowUpdate = message.allowUpdate !== false;
  const myResponse = message.responseSummary?.responses?.find(
    (r) => r.entityId === currentEntityId,
  );
  const hasResponded = !!myResponse;

  const [formData, setFormData] = useState<Record<string, string>>(() => {
    if (myResponse && typeof myResponse.value === "object" && myResponse.value !== null) {
      const prev: Record<string, string> = {};
      for (const [k, v] of Object.entries(myResponse.value as Record<string, unknown>)) {
        prev[k] = String(v ?? "");
      }
      return prev;
    }
    return {};
  });
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState(false);

  const showForm = (!hasResponded || (editing && allowUpdate)) && !isClosed;

  const handleSubmit = async () => {
    for (const field of fields) {
      if (field.required && !formData[field.name]?.trim()) return;
    }
    setSubmitting(true);
    try {
      await respondToMessage(message.id, formData);
      setEditing(false);
    } catch (err) {
      console.error("Failed to submit form:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const formatValue = (value: unknown): string => {
    if (typeof value === "object" && value !== null) {
      return Object.entries(value as Record<string, unknown>)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
    }
    return String(value);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ClipboardListIcon className="size-4 shrink-0" />
        </div>
        <span className="text-sm font-semibold text-foreground">{message.formTitle}</span>
      </div>
      {message.formDescription && (
        <p className="text-xs text-muted-foreground">{message.formDescription}</p>
      )}

      {showForm && (
        <div className="space-y-3 rounded-2xl border border-border/40 bg-muted/25 p-3">
          {fields.map((field) => (
            <div key={field.name}>
              <label className="mb-1 block text-[11px] font-medium text-foreground/80">
                {field.label}
                {field.required && <span className="ml-0.5 text-red-500">*</span>}
              </label>
              {field.type === "textarea" ? (
                <textarea
                  placeholder={field.placeholder}
                  value={formData[field.name] || ""}
                  onChange={(e) => setFormData((prev) => ({ ...prev, [field.name]: e.target.value }))}
                  className="h-20 w-full resize-none rounded-xl border border-border/60 bg-background/80 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              ) : field.type === "select" ? (
                <select
                  value={formData[field.name] || ""}
                  onChange={(e) => setFormData((prev) => ({ ...prev, [field.name]: e.target.value }))}
                  className="w-full rounded-xl border border-border/60 bg-background/80 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="">Select...</option>
                  {field.options?.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type}
                  placeholder={field.placeholder}
                  value={formData[field.name] || ""}
                  onChange={(e) => setFormData((prev) => ({ ...prev, [field.name]: e.target.value }))}
                  className="w-full rounded-xl border border-border/60 bg-background/80 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              )}
            </div>
          ))}
          <Button size="sm" className="h-8 w-full rounded-xl text-xs shadow-sm" disabled={submitting} onClick={handleSubmit}>
            {submitting ? "Submitting..." : hasResponded ? "Update Response" : "Submit"}
          </Button>
        </div>
      )}

      {hasResponded && !editing && !isClosed && (
        <div className="flex items-center justify-between gap-2 rounded-2xl border border-emerald-500/15 bg-emerald-500/8 px-3 py-2 text-xs">
          <div className="flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
            <CheckIcon className="size-3.5" />
            <span>You submitted your response</span>
          </div>
          {allowUpdate && (
            <button
              onClick={() => setEditing(true)}
              className="rounded-full border border-border/60 bg-background/70 px-2 py-1 text-[11px] text-foreground/80 hover:bg-background"
            >
              Edit
            </button>
          )}
        </div>
      )}

      {isClosed && !hasResponded && (
        <div className="inline-flex rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">This form is closed.</div>
      )}

      <ResponsesDrawer responseSummary={message.responseSummary} formatValue={formatValue} />
    </div>
  );
}
