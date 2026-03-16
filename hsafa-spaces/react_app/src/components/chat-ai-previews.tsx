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
  const chartType = data.chartType as string || "bar";

  // Normalize: AI may return flat array [{label, value}] or Chart.js {labels, datasets}
  let labels: string[] = [];
  let values: number[] = [];
  const rawData = data.data;
  if (Array.isArray(rawData)) {
    labels = rawData.map((d: Record<string, unknown>) => (d.label as string) || "");
    values = rawData.map((d: Record<string, unknown>) => (d.value as number) || 0);
  } else if (rawData && typeof rawData === "object") {
    const obj = rawData as { labels?: string[]; datasets?: Array<{ data?: number[] }> };
    labels = obj.labels ?? [];
    values = obj.datasets?.[0]?.data ?? [];
  }
  const max = Math.max(...values, 1);
  const total = values.reduce((a, b) => a + b, 0);
  const defaultColors = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#f97316", "#ec4899"];

  if (!labels.length) {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground italic">No chart data</p>
      </div>
    );
  }

  if (chartType === "pie") {
    let currentAngle = 0;
    const segments = labels.map((label, i) => {
      const pct = total > 0 ? (values[i] || 0) / total : 0;
      const startAngle = currentAngle;
      const endAngle = currentAngle + pct * 360;
      currentAngle = endAngle;
      return { label, value: values[i] || 0, pct, startAngle, endAngle, color: defaultColors[i % defaultColors.length] };
    });

    return (
      <div className="space-y-2">
        <p className="text-sm font-medium">{title}</p>
        <div className="flex items-center gap-4">
          <svg viewBox="0 0 100 100" className="size-16 shrink-0">
            {segments.map((seg, i) => {
              const startRad = ((seg.startAngle - 90) * Math.PI) / 180;
              const endRad = ((seg.endAngle - 90) * Math.PI) / 180;
              const largeArc = seg.endAngle - seg.startAngle > 180 ? 1 : 0;
              const x1 = 50 + 45 * Math.cos(startRad);
              const y1 = 50 + 45 * Math.sin(startRad);
              const x2 = 50 + 45 * Math.cos(endRad);
              const y2 = 50 + 45 * Math.sin(endRad);
              const d = `M 50 50 L ${x1} ${y1} A 45 45 0 ${largeArc} 1 ${x2} ${y2} Z`;
              return <path key={i} d={d} fill={seg.color} opacity={0.85} />;
            })}
          </svg>
          <div className="space-y-0.5 min-w-0">
            {segments.map((seg, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div className="size-2 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                <span className="text-[10px] truncate">{seg.label}</span>
                <span className="text-[9px] opacity-60 tabular-nums ml-auto">{Math.round(seg.pct * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (chartType === "line") {
    return (
      <div className="space-y-2">
        <p className="text-sm font-medium">{title}</p>
        <div className="h-20 flex items-end gap-1">
          {labels.map((label, i) => {
            const pct = (values[i] || 0) / max * 100;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                <div className="w-1.5 rounded-t-full bg-primary/70" style={{ height: `${Math.max(4, pct)}%` }} />
                <span className="text-[8px] opacity-60 truncate max-w-full">{label}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Default: bar
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{title}</p>
      <div className="flex items-end gap-2 h-20">
        {labels.map((label, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-[9px] tabular-nums text-muted-foreground">{values[i]}</span>
            <div
              className="w-full bg-primary/70 rounded-t"
              style={{ height: `${((values[i] || 0) / max) * 60}px`, minHeight: 4 }}
            />
            <span className="text-[9px] text-muted-foreground truncate w-full text-center">{label}</span>
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
      <div className="flex flex-wrap gap-1.5">
        {options.map((c, i) => (
          <button key={i} className="px-3 py-1.5 rounded-lg border border-border bg-muted/50 text-xs transition-colors">
            {c.label || c.value}
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
