type ComponentType = "confirmation" | "vote" | "choice" | "form" | "card" | "chart";

interface AiGeneratedPreviewProps {
  type: ComponentType;
  data: Record<string, unknown> | null;
  prompt: string;
}

export function AiGeneratedPreview({ type, data, prompt }: AiGeneratedPreviewProps) {
  if (!data) {
    return <div className="text-sm text-muted-foreground italic">No preview available</div>;
  }

  switch (type) {
    case "chart":
      return <ChartPreview data={data} />;
    case "vote":
      return <VotePreview data={data} />;
    case "confirmation":
      return <ConfirmationPreview data={data} />;
    case "choice":
      return <ChoicePreview data={data} />;
    case "form":
      return <FormPreview data={data} />;
    case "card":
      return <CardPreview data={data} />;
    default:
      return <pre className="text-xs text-muted-foreground whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>;
  }
}

function ChartPreview({ data }: { data: Record<string, unknown> }) {
  const title = data.title as string || "Chart";
  const chartData = data.data as { labels?: string[]; datasets?: Array<{ label?: string; data?: number[] }> } | undefined;
  const labels = chartData?.labels ?? [];
  const values = chartData?.datasets?.[0]?.data ?? [];
  const max = Math.max(...values, 1);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{title}</p>
      <div className="flex items-end gap-2 h-24">
        {labels.map((label, i) => (
          <div key={label} className="flex-1 flex flex-col items-center gap-1">
            <div
              className="w-full bg-primary/70 rounded-t"
              style={{ height: `${((values[i] || 0) / max) * 80}px` }}
            />
            <span className="text-[10px] text-muted-foreground truncate w-full text-center">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function VotePreview({ data }: { data: Record<string, unknown> }) {
  const title = data.title as string || "Poll";
  const options = (data.options as string[]) ?? [];

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{title}</p>
      <div className="space-y-1.5">
        {options.map((opt) => (
          <div key={opt} className="flex items-center gap-2">
            <div className="flex-1 h-7 bg-muted rounded-full overflow-hidden flex items-center px-3">
              <span className="text-xs">{opt}</span>
            </div>
          </div>
        ))}
      </div>
      {!!data.allowMultiple && <p className="text-[10px] text-muted-foreground">Multiple selections allowed</p>}
    </div>
  );
}

function ConfirmationPreview({ data }: { data: Record<string, unknown> }) {
  const title = data.title as string || "Confirmation";
  const message = data.message as string || "";
  const confirmLabel = data.confirmLabel as string || "Confirm";
  const rejectLabel = data.rejectLabel as string || "Cancel";

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">{title}</p>
        {message && <p className="text-xs text-muted-foreground mt-0.5">{message}</p>}
      </div>
      <div className="flex gap-2">
        <button className="flex-1 py-1.5 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium">
          {confirmLabel}
        </button>
        <button className="flex-1 py-1.5 px-3 rounded-lg bg-muted text-foreground text-xs font-medium">
          {rejectLabel}
        </button>
      </div>
    </div>
  );
}

function ChoicePreview({ data }: { data: Record<string, unknown> }) {
  const text = data.text as string || "Select an option";
  const options = (data.options as Array<{ label?: string; value?: string; description?: string }>) ?? [];

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{text}</p>
      <div className="space-y-1">
        {options.map((c, i) => (
          <button key={i} className="w-full text-left px-3 py-2 rounded-lg bg-muted hover:bg-muted/80 text-sm transition-colors">
            <span>{c.label || c.value}</span>
            {c.description && <span className="text-[10px] text-muted-foreground ml-2">{c.description}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function FormPreview({ data }: { data: Record<string, unknown> }) {
  const title = data.title as string || "Form";
  const description = data.description as string;
  const fields = (data.fields as Array<{ name?: string; label?: string; type?: string; required?: boolean }>) ?? [];

  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="text-[10px] text-muted-foreground">{description}</p>}
      </div>
      <div className="space-y-1.5">
        {fields.map((f, i) => (
          <div key={i}>
            <label className="text-[10px] text-muted-foreground">{f.label}{f.required && " *"}</label>
            <input
              placeholder={f.label || f.name}
              className="w-full px-2 py-1.5 rounded border border-border bg-background text-xs"
              disabled
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function CardPreview({ data }: { data: Record<string, unknown> }) {
  const title = data.title as string || "Card";
  const body = data.body as string || "";
  const imageUrl = data.imageUrl as string | null;
  const actions = (data.actions as Array<{ label?: string; style?: string }>) ?? [];

  return (
    <div className="rounded-lg overflow-hidden border border-border">
      {imageUrl ? (
        <div className="h-20 bg-muted flex items-center justify-center text-xs text-muted-foreground">
          🖼 {imageUrl}
        </div>
      ) : (
        <div className="h-12 bg-gradient-to-r from-primary/30 to-primary/10" />
      )}
      <div className="p-2 space-y-2">
        <div>
          <p className="text-sm font-medium">{title}</p>
          {body && <p className="text-xs text-muted-foreground">{body}</p>}
        </div>
        {actions.length > 0 && (
          <div className="flex gap-1.5">
            {actions.map((a, i) => (
              <button
                key={i}
                className={`flex-1 py-1 px-2 rounded text-[10px] font-medium ${
                  a.style === "primary" ? "bg-primary text-primary-foreground"
                  : a.style === "danger" ? "bg-destructive text-destructive-foreground"
                  : "bg-muted text-foreground"
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
