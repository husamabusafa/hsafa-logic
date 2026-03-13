import { useState, useEffect, useCallback } from "react";
import {
  PlusIcon,
  BotIcon,
  SparklesIcon,
  MessageSquareIcon,
  PencilIcon,
  TrashIcon,
  ChevronRightIcon,
  CpuIcon,
  LoaderIcon,
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
import { haseefsApi, spacesApi, type HaseefListItem, type Haseef, type SmartSpace } from "@/lib/api";

// ─── Sidebar ─────────────────────────────────────────────────────────────────

interface HaseefsSidebarProps {
  haseefs: HaseefListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  isLoading?: boolean;
}

export function HaseefsSidebar({ haseefs, selectedId, onSelect, onCreate, isLoading }: HaseefsSidebarProps) {
  return (
    <>
      <div className="flex items-center justify-between px-4 h-14 shrink-0">
        <h2 className="text-lg font-semibold text-foreground">Haseefs</h2>
        <Button variant="ghost" size="icon" onClick={onCreate} title="Create haseef">
          <PlusIcon className="size-5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <LoaderIcon className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {haseefs.map((h) => (
              <button
                key={h.haseefId}
                onClick={() => onSelect(h.haseefId)}
                className={cn(
                  "flex items-center gap-3 w-full px-3 py-3 text-left transition-colors",
                  selectedId === h.haseefId
                    ? "bg-primary/8 border-l-2 border-l-primary"
                    : "hover:bg-muted/60 border-l-2 border-l-transparent",
                )}
              >
                <Avatar name={h.name} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-foreground truncate">{h.name}</span>
                    <BotIcon className="size-3 text-emerald-500 shrink-0" />
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    Created {new Date(h.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </button>
            ))}

            {haseefs.length === 0 && (
              <div className="px-4 py-8 text-center">
                <BotIcon className="size-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No haseefs yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Create one to get started</p>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

// ─── Detail View ─────────────────────────────────────────────────────────────

interface HaseefDetailProps {
  haseefId: string;
  onDeleted: () => void;
}

export function HaseefDetail({ haseefId, onDeleted }: HaseefDetailProps) {
  const [haseef, setHaseef] = useState<Haseef | null>(null);
  const [connectedSpaces, setConnectedSpaces] = useState<SmartSpace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    haseefsApi.get(haseefId)
      .then(async ({ haseef: h }) => {
        if (cancelled) return;
        setHaseef(h);

        // Fetch connected spaces by checking memberships
        try {
          const { smartSpaces } = await spacesApi.list();
          // We'll show all user spaces — the server haseef detail
          // doesn't return connected spaces directly, but we can
          // check which spaces this entity is a member of
          setConnectedSpaces(smartSpaces);
        } catch {
          // non-fatal
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Failed to load haseef");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [haseefId]);

  const handleDelete = useCallback(async () => {
    if (!haseef) return;
    setIsDeleting(true);
    try {
      await haseefsApi.delete(haseef.id);
      setShowDeleteConfirm(false);
      onDeleted();
    } catch (err: any) {
      setError(err.message || "Failed to delete");
      setIsDeleting(false);
    }
  }, [haseef, onDeleted]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoaderIcon className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !haseef) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <p className="text-sm text-destructive">{error || "Haseef not found"}</p>
      </div>
    );
  }

  const model = (haseef.configJson?.model as Record<string, string>)?.model
    || (haseef.configJson?.model as string)
    || "unknown";

  const instructions = (haseef.configJson?.instructions as string) || "";

  return (
    <div className="h-full overflow-y-auto bg-muted/20">
      <div className="max-w-xl mx-auto p-6 space-y-4">
        {/* Profile Card */}
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <Avatar name={haseef.name} size="lg" />
          <h2 className="text-xl font-semibold text-foreground mt-3">{haseef.name}</h2>
          {haseef.description && (
            <p className="text-sm text-muted-foreground mt-1">{haseef.description}</p>
          )}

          <div className="flex items-center justify-center gap-2 mt-3">
            <Badge variant="outline" className="gap-1">
              <CpuIcon className="size-2.5" />
              {model}
            </Badge>
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-2 gap-2 mt-5">
            <ActionButton
              icon={PencilIcon}
              label="Edit"
              onClick={() => setShowEdit(true)}
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
            This action cannot be undone. The haseef will be permanently removed from all connected spaces.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} disabled={isDeleting}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? <LoaderIcon className="size-4 animate-spin" /> : <TrashIcon className="size-4" />}
            {isDeleting ? "Deleting..." : "Delete permanently"}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Edit Haseef Modal */}
      {showEdit && (
        <EditHaseefDialog
          haseef={haseef}
          onClose={() => setShowEdit(false)}
          onSaved={(updated) => {
            setHaseef(updated);
            setShowEdit(false);
          }}
        />
      )}

        {/* Instructions Card */}
        {instructions && (
          <div className="rounded-2xl border border-border bg-card p-5">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Instructions
            </h4>
            <div className="rounded-lg bg-muted/30 p-3">
              <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
                {instructions}
              </p>
            </div>
          </div>
        )}

        {/* Details Card */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Details
          </h4>
          <div className="space-y-2 text-sm">
            {haseef.createdAt && (
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
            )}
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
  onCreate: (data: { name: string; description: string; model: string; instructions: string }) => Promise<void>;
}

export function CreateHaseefDialog({ open, onClose, onCreate }: CreateHaseefDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [model, setModel] = useState("gpt-4o");
  const [customModel, setCustomModel] = useState("");
  const [instructions, setInstructions] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const models = [
    { value: "gpt-4o", label: "GPT-4o" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini" },
    { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
    { value: "o3-mini", label: "o3-mini" },
    { value: "custom", label: "Custom" },
  ];

  const resolvedModel = model === "custom" ? customModel.trim() : model;

  const handleCreate = async () => {
    if (!name.trim() || isCreating) return;
    setIsCreating(true);
    setError(null);
    try {
      await onCreate({ name: name.trim(), description: description.trim(), model: resolvedModel, instructions: instructions.trim() });
      setName(""); setDescription(""); setModel("gpt-4o"); setCustomModel(""); setInstructions("");
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to create haseef");
    } finally {
      setIsCreating(false);
    }
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
          {model === "custom" && (
            <input
              type="text"
              placeholder="e.g. openrouter/meta-llama/llama-3.1-70b"
              value={customModel}
              onChange={(e) => setCustomModel(e.target.value)}
              className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          )}
        </div>

        <Textarea
          label="Instructions"
          id="haseef-instructions"
          placeholder="Describe how this haseef should behave..."
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={4}
        />

        {error && (
          <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={isCreating}>Cancel</Button>
        <Button onClick={handleCreate} disabled={!name.trim() || !resolvedModel || isCreating}>
          {isCreating ? <LoaderIcon className="size-4 animate-spin" /> : <SparklesIcon className="size-4" />}
          {isCreating ? "Creating..." : "Create Haseef"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Edit Haseef Dialog ──────────────────────────────────────────────────────

function EditHaseefDialog({
  haseef,
  onClose,
  onSaved,
}: {
  haseef: Haseef;
  onClose: () => void;
  onSaved: (updated: Haseef) => void;
}) {
  const currentModel =
    (haseef.configJson?.model as Record<string, string>)?.model ||
    (haseef.configJson?.model as string) ||
    "";
  const currentInstructions = (haseef.configJson?.instructions as string) || "";

  const [name, setName] = useState(haseef.name);
  const [description, setDescription] = useState(haseef.description || "");
  const [instructions, setInstructions] = useState(currentInstructions);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim() || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const configJson: Record<string, unknown> = { ...haseef.configJson };
      if (instructions.trim() !== currentInstructions) {
        configJson.instructions = instructions.trim();
      }
      const { haseef: updated } = await haseefsApi.update(haseef.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        configJson,
      });
      onSaved(updated);
    } catch (err: any) {
      setError(err.message || "Failed to update haseef");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose}>
      <DialogHeader onClose={onClose}>
        <DialogTitle>Edit {haseef.name}</DialogTitle>
        <DialogDescription>Update this haseef's details.</DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <Input
          label="Name"
          id="edit-haseef-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <Textarea
          label="Description"
          id="edit-haseef-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Model</label>
          <p className="text-sm text-foreground bg-muted/40 px-3 py-2 rounded-lg">
            <CpuIcon className="size-3.5 inline mr-1.5 text-muted-foreground" />
            {currentModel || "unknown"}
          </p>
        </div>
        <Textarea
          label="Instructions"
          id="edit-haseef-instructions"
          placeholder="Describe how this haseef should behave..."
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={4}
        />

        {error && (
          <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
        <Button onClick={handleSave} disabled={!name.trim() || isSaving}>
          {isSaving ? <LoaderIcon className="size-4 animate-spin" /> : <PencilIcon className="size-4" />}
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
