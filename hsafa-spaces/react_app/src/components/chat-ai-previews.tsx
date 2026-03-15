import {
  FileIcon,
  VideoIcon,
} from "lucide-react";

type ComponentType = "confirmation" | "vote" | "choice" | "form" | "card" | "file" | "video" | "chart";

export function AiGeneratedPreview({ type, prompt }: { type: ComponentType; prompt: string }) {
  switch (type) {
    case "chart":
      return <ChartPreview />;
    case "vote":
      return <VotePreview prompt={prompt} />;
    case "confirmation":
      return <ConfirmationPreview prompt={prompt} />;
    case "choice":
      return <ChoicePreview prompt={prompt} />;
    case "form":
      return <FormPreview prompt={prompt} />;
    case "card":
      return <CardPreview prompt={prompt} />;
    case "file":
      return <FilePreview prompt={prompt} />;
    case "video":
      return <VideoPreview prompt={prompt} />;
    default:
      return <div className="text-sm text-muted-foreground">Component preview for: {prompt.slice(0, 50)}...</div>;
  }
}

function ChartPreview() {
  const data = [
    { label: "Jan", value: 45 },
    { label: "Feb", value: 72 },
    { label: "Mar", value: 58 },
    { label: "Apr", value: 90 },
    { label: "May", value: 65 },
  ];
  const max = Math.max(...data.map((d) => d.value));

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Monthly Sales Report</p>
      <div className="flex items-end gap-2 h-24">
        {data.map((d) => (
          <div key={d.label} className="flex-1 flex flex-col items-center gap-1">
            <div
              className="w-full bg-primary/70 rounded-t"
              style={{ height: `${(d.value / max) * 80}px` }}
            />
            <span className="text-[10px] text-muted-foreground">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function VotePreview({ prompt }: { prompt: string }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{prompt.slice(0, 60) || "Quick Poll"}</p>
      <div className="space-y-1.5">
        {["Option A", "Option B", "Option C"].map((opt, i) => (
          <div key={opt} className="flex items-center gap-2">
            <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary/60 flex items-center px-2"
                style={{ width: `${[60, 30, 10][i]}%` }}
              >
                <span className="text-[10px] text-white font-medium">{[60, 30, 10][i]}%</span>
              </div>
            </div>
            <span className="text-xs text-muted-foreground w-16">{opt}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConfirmationPreview({ prompt }: { prompt: string }) {
  return (
    <div className="space-y-3">
      <p className="text-sm">{prompt.slice(0, 80) || "Please confirm this action"}</p>
      <div className="flex gap-2">
        <button className="flex-1 py-1.5 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium">
          Confirm
        </button>
        <button className="flex-1 py-1.5 px-3 rounded-lg bg-muted text-foreground text-xs font-medium">
          Cancel
        </button>
      </div>
    </div>
  );
}

function ChoicePreview({ prompt }: { prompt: string }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{prompt.slice(0, 50) || "Select an option"}</p>
      <div className="space-y-1">
        {["Choice 1", "Choice 2", "Choice 3"].map((c) => (
          <button key={c} className="w-full text-left px-3 py-2 rounded-lg bg-muted hover:bg-muted/80 text-sm transition-colors">
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}

function FormPreview({ prompt }: { prompt: string }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{prompt.slice(0, 40) || "Form"}</p>
      <div className="space-y-1.5">
        <input placeholder="Name" className="w-full px-2 py-1.5 rounded border border-border bg-background text-xs" disabled />
        <input placeholder="Email" className="w-full px-2 py-1.5 rounded border border-border bg-background text-xs" disabled />
      </div>
    </div>
  );
}

function CardPreview({ prompt }: { prompt: string }) {
  return (
    <div className="rounded-lg overflow-hidden border border-border">
      <div className="h-16 bg-gradient-to-r from-primary/30 to-primary/10" />
      <div className="p-2">
        <p className="text-sm font-medium">{prompt.slice(0, 40) || "Rich Card"}</p>
        <p className="text-xs text-muted-foreground">Card description goes here...</p>
      </div>
    </div>
  );
}

function FilePreview({ prompt }: { prompt: string }) {
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg bg-muted">
      <div className="size-8 rounded bg-primary/20 flex items-center justify-center">
        <FileIcon className="size-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{prompt.slice(0, 30) || "document.pdf"}</p>
        <p className="text-xs text-muted-foreground">2.4 MB · PDF</p>
      </div>
    </div>
  );
}

function VideoPreview({ prompt }: { prompt: string }) {
  return (
    <div className="rounded-lg overflow-hidden bg-muted aspect-video flex items-center justify-center">
      <div className="text-center">
        <VideoIcon className="size-8 text-muted-foreground mx-auto mb-1" />
        <p className="text-xs text-muted-foreground">{prompt.slice(0, 30) || "Video preview"}</p>
      </div>
    </div>
  );
}
