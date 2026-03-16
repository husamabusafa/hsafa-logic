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
  const myResponse = message.responseSummary?.responses?.find(
    (r) => r.entityId === currentEntityId,
  );
  const hasResponded = !!myResponse;

  const [formData, setFormData] = useState<Record<string, string>>(() => {
    // Pre-fill with previous response if updating
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

  const showForm = (!hasResponded || editing) && !isClosed;

  const handleSubmit = async () => {
    // Validate required fields
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
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <ClipboardListIcon className="size-4 text-primary shrink-0" />
        <span className="text-sm font-semibold">{message.formTitle}</span>
      </div>
      {message.formDescription && (
        <p className="text-xs opacity-70">{message.formDescription}</p>
      )}

      {showForm && (
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
                  value={formData[field.name] || ""}
                  onChange={(e) => setFormData((prev) => ({ ...prev, [field.name]: e.target.value }))}
                  className="w-full rounded-lg border border-border/50 bg-background/50 px-2.5 py-1.5 text-xs resize-none h-12 focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              ) : field.type === "select" ? (
                <select
                  value={formData[field.name] || ""}
                  onChange={(e) => setFormData((prev) => ({ ...prev, [field.name]: e.target.value }))}
                  className="w-full rounded-lg border border-border/50 bg-background/50 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
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
                  className="w-full rounded-lg border border-border/50 bg-background/50 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              )}
            </div>
          ))}
          <Button size="sm" className="w-full h-7 text-xs" disabled={submitting} onClick={handleSubmit}>
            {submitting ? "Submitting..." : hasResponded ? "Update Response" : "Submit"}
          </Button>
        </div>
      )}

      {hasResponded && !editing && !isClosed && (
        <div className="flex items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
            <CheckIcon className="size-3.5" />
            <span>You submitted your response</span>
          </div>
          <button
            onClick={() => setEditing(true)}
            className="text-primary/70 hover:text-primary underline text-[11px]"
          >
            Edit
          </button>
        </div>
      )}

      {isClosed && !hasResponded && (
        <div className="text-xs opacity-60">This form is closed.</div>
      )}

      <ResponsesDrawer responseSummary={message.responseSummary} formatValue={formatValue} />
    </div>
  );
}
