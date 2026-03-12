import { useState } from "react";
import {
  PlusIcon,
  BotIcon,
  PowerIcon,
  SparklesIcon,
  MessageSquareIcon,
  PencilIcon,
  TrashIcon,
  ChevronRightIcon,
  CpuIcon,
  LinkIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { mockHaseefs, mockSpaces, type MockHaseef } from "@/lib/mock-data";

// ─── Sidebar ─────────────────────────────────────────────────────────────────

interface HaseefsSidebarProps {
  haseefs: MockHaseef[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
}

export function HaseefsSidebar({ haseefs, selectedId, onSelect, onCreate }: HaseefsSidebarProps) {
  return (
    <>
      <div className="flex items-center justify-between px-4 h-14 shrink-0">
        <h2 className="text-lg font-semibold text-foreground">Haseefs</h2>
        <Button variant="ghost" size="icon" onClick={onCreate} title="Create haseef">
          <PlusIcon className="size-5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {haseefs.map((h) => (
          <button
            key={h.id}
            onClick={() => onSelect(h.id)}
            className={cn(
              "flex items-center gap-3 w-full px-3 py-3 text-left transition-colors",
              selectedId === h.id
                ? "bg-primary/8 border-l-2 border-l-primary"
                : "hover:bg-muted/60 border-l-2 border-l-transparent",
            )}
          >
            <Avatar name={h.name} color={h.avatarColor} size="md" isOnline={h.isOnline} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-foreground truncate">{h.name}</span>
                <BotIcon className="size-3 text-emerald-500 shrink-0" />
              </div>
              <p className="text-xs text-muted-foreground truncate">{h.description}</p>
            </div>
            <StatusDot status={h.status} />
          </button>
        ))}

        {haseefs.length === 0 && (
          <div className="px-4 py-8 text-center">
            <BotIcon className="size-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No haseefs yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Create one to get started</p>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Detail View ─────────────────────────────────────────────────────────────

interface HaseefDetailProps {
  haseef: MockHaseef;
}

export function HaseefDetail({ haseef }: HaseefDetailProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const connectedSpaceNames = haseef.connectedSpaces
    .map((sid) => mockSpaces.find((s) => s.id === sid)?.name)
    .filter(Boolean) as string[];

  return (
    <div className="h-full overflow-y-auto bg-muted/20">
      <div className="max-w-xl mx-auto p-6 space-y-4">
        {/* Profile Card */}
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <Avatar name={haseef.name} color={haseef.avatarColor} size="lg" isOnline={haseef.isOnline} />
          <h2 className="text-xl font-semibold text-foreground mt-3">{haseef.name}</h2>
          <p className="text-sm text-muted-foreground mt-1">{haseef.description}</p>

          <div className="flex items-center justify-center gap-2 mt-3">
            <StatusBadge status={haseef.status} />
            <Badge variant="outline" className="gap-1">
              <CpuIcon className="size-2.5" />
              {haseef.model}
            </Badge>
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-3 gap-2 mt-5">
            <ActionButton
              icon={PencilIcon}
              label="Edit"
              onClick={() => {}}
            />
            <ActionButton
              icon={PowerIcon}
              label={haseef.status === "disabled" ? "Enable" : "Disable"}
              onClick={() => {}}
              variant={haseef.status === "disabled" ? "success" : "warning"}
            />
            <ActionButton
              icon={TrashIcon}
              label="Delete"
              onClick={() => setShowDeleteConfirm(true)}
              variant="danger"
            />
          </div>
        </div>

      {/* Delete Confirmation Modal */}
      <Dialog open={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} className="max-w-sm">
        <DialogHeader onClose={() => setShowDeleteConfirm(false)}>
          <DialogTitle>Delete {haseef.name}?</DialogTitle>
          <DialogDescription>
            This action cannot be undone. The haseef will be permanently removed.
          </DialogDescription>
        </DialogHeader>

        {connectedSpaceNames.length > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
            <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
              This haseef is connected to {connectedSpaceNames.length} space{connectedSpaceNames.length !== 1 ? "s" : ""}:
            </p>
            <div className="space-y-1">
              {connectedSpaceNames.map((name) => (
                <div key={name} className="flex items-center gap-2 text-sm text-foreground">
                  <MessageSquareIcon className="size-3.5 text-muted-foreground shrink-0" />
                  <span>{name}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              It will be removed from all these spaces upon deletion.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={() => {
              console.log("Delete haseef:", haseef.id);
              setShowDeleteConfirm(false);
            }}
          >
            <TrashIcon className="size-4" />
            Delete permanently
          </Button>
        </DialogFooter>
      </Dialog>

        {/* Connected Spaces Card */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Connected Spaces · {connectedSpaceNames.length}
            </h4>
            <Button variant="ghost" size="sm" className="h-6 text-xs">
              <LinkIcon className="size-3" />
              Connect
            </Button>
          </div>

          {connectedSpaceNames.length > 0 ? (
            <div className="space-y-1">
              {connectedSpaceNames.map((name) => (
                <div
                  key={name}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 bg-muted/50"
                >
                  <MessageSquareIcon className="size-4 text-muted-foreground" />
                  <span className="text-sm text-foreground">{name}</span>
                  <ChevronRightIcon className="size-3 text-muted-foreground ml-auto" />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground/60 py-3 text-center">
              Not connected to any spaces
            </p>
          )}
        </div>

        {/* Instructions Card */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Instructions
          </h4>
          <div className="rounded-lg bg-muted/30 p-3">
            <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
              {haseef.instructions}
            </p>
          </div>
        </div>

        {/* Details Card */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Details
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Created</span>
              <span className="text-foreground">
                {new Date(haseef.createdAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">ID</span>
              <span className="text-foreground font-mono text-xs">{haseef.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Entity ID</span>
              <span className="text-foreground font-mono text-xs">{haseef.entityId}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

export function HaseefEmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500 mb-4">
        <BotIcon className="size-8" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1">Select a Haseef</h3>
      <p className="text-sm text-muted-foreground max-w-xs mb-4">
        Choose a haseef from the sidebar to view details and manage settings, or create a new one.
      </p>
      <Button onClick={onCreate}>
        <PlusIcon className="size-4" />
        Create Haseef
      </Button>
    </div>
  );
}

// ─── Create Haseef Dialog ────────────────────────────────────────────────────

interface CreateHaseefDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (data: { name: string; description: string; model: string; instructions: string }) => void;
}

export function CreateHaseefDialog({ open, onClose, onCreate }: CreateHaseefDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [model, setModel] = useState("gpt-4o");
  const [instructions, setInstructions] = useState("");

  const models = [
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini" },
    { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
    { value: "o3-mini", label: "o3-mini" },
  ];

  const handleCreate = () => {
    if (!name.trim()) return;
    onCreate({ name: name.trim(), description: description.trim(), model, instructions: instructions.trim() });
    setName(""); setDescription(""); setModel("gpt-4o"); setInstructions("");
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader onClose={onClose}>
        <DialogTitle>Create a new Haseef</DialogTitle>
        <DialogDescription>
          Haseefs are AI agents that can participate in spaces and help your team.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <Input
          label="Name"
          id="haseef-name"
          placeholder="e.g. Research Assistant"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <Input
          label="Description"
          id="haseef-desc"
          placeholder="What does this haseef do?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        {/* Model selector */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Model</label>
          <div className="grid grid-cols-2 gap-2">
            {models.map((m) => (
              <button
                key={m.value}
                onClick={() => setModel(m.value)}
                className={cn(
                  "rounded-lg border-2 px-3 py-2 text-sm text-left transition-colors",
                  model === m.value
                    ? "border-primary bg-primary/5 text-primary font-medium"
                    : "border-border hover:border-border/80 text-foreground",
                )}
              >
                <CpuIcon className="size-3.5 inline mr-1.5" />
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <Textarea
          label="Instructions"
          id="haseef-instructions"
          placeholder="Describe how this haseef should behave..."
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={4}
        />
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleCreate} disabled={!name.trim()}>
          <SparklesIcon className="size-4" />
          Create Haseef
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: MockHaseef["status"] }) {
  return (
    <span
      className={cn(
        "size-2 rounded-full shrink-0",
        status === "active" && "bg-emerald-500",
        status === "idle" && "bg-amber-500",
        status === "disabled" && "bg-muted-foreground/30",
      )}
    />
  );
}

function StatusBadge({ status }: { status: MockHaseef["status"] }) {
  if (status === "active") return <Badge variant="success">Active</Badge>;
  if (status === "idle") return <Badge variant="warning">Idle</Badge>;
  return <Badge variant="secondary">Disabled</Badge>;
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  variant,
}: {
  icon: typeof PencilIcon;
  label: string;
  onClick: () => void;
  variant?: "success" | "warning" | "danger";
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 rounded-xl border border-border py-3 px-2 transition-colors",
        "hover:bg-muted/60",
        variant === "danger" && "hover:border-destructive/30 hover:bg-destructive/5",
        variant === "success" && "hover:border-emerald-500/30 hover:bg-emerald-500/5",
        variant === "warning" && "hover:border-amber-500/30 hover:bg-amber-500/5",
      )}
    >
      <Icon
        className={cn(
          "size-4",
          variant === "danger" && "text-destructive",
          variant === "success" && "text-emerald-500",
          variant === "warning" && "text-amber-500",
          !variant && "text-muted-foreground",
        )}
      />
      <span className="text-xs text-muted-foreground">{label}</span>
    </button>
  );
}
