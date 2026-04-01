import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeftIcon,
  PuzzleIcon,
  WrenchIcon,
  CheckCircle2Icon,
  XCircleIcon,
  Loader2Icon,
  TrashIcon,
  SaveIcon,
  ToggleLeftIcon,
  ToggleRightIcon,
  MessageSquareIcon,
  CalendarIcon,
  PlugIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { scopesApi, type ScopeInstance } from "@/lib/api";

function ScopeIcon({ icon, className }: { icon: string | null; className?: string }) {
  const cls = cn("size-5", className);
  switch (icon) {
    case "MessageSquare": return <MessageSquareIcon className={cls} />;
    case "Calendar": return <CalendarIcon className={cls} />;
    case "Plug": return <PlugIcon className={cls} />;
    default: return <PuzzleIcon className={cls} />;
  }
}

interface ScopeInstancePageProps {
  instanceId: string;
  onBack: () => void;
}

export function ScopeInstancePage({ instanceId, onBack }: ScopeInstancePageProps) {
  const [instance, setInstance] = useState<ScopeInstance | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Edit state
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editActive, setEditActive] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { instance: inst } = await scopesApi.getInstance(instanceId);
      setInstance(inst);
      setEditName(inst.name);
      setEditDescription(inst.description || "");
      setEditActive(inst.active);
    } catch (err) {
      console.error("Failed to load instance:", err);
      setError("Failed to load scope instance");
    } finally {
      setLoading(false);
    }
  }, [instanceId]);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (!instance) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await scopesApi.updateInstance(instance.id, {
        name: editName.trim(),
        description: editDescription.trim() || undefined,
        active: editActive,
      });
      setSuccess("Saved successfully");
      setTimeout(() => setSuccess(""), 3000);
      load();
    } catch (err: any) {
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!instance) return;
    if (!confirm(`Delete scope instance "${instance.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await scopesApi.deleteInstance(instance.id);
      onBack();
    } catch (err: any) {
      setError(err.message || "Failed to delete");
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!instance) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-muted-foreground text-sm">Scope instance not found</p>
        <button onClick={onBack} className="text-sm text-primary hover:underline">Go back</button>
      </div>
    );
  }

  const tools = (instance.template.tools ?? []) as Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
          <ArrowLeftIcon className="size-4" />
        </button>
        <div className="flex items-center justify-center size-8 rounded-lg bg-primary/10 text-primary">
          <ScopeIcon icon={instance.template.icon} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-lg truncate">{instance.name}</h1>
          <p className="text-xs text-muted-foreground font-mono">{instance.scopeName}</p>
        </div>
        <span className={cn(
          "flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full",
          instance.active ? "bg-green-500/10 text-green-600" : "bg-muted text-muted-foreground",
        )}>
          {instance.active ? <CheckCircle2Icon className="size-3" /> : <XCircleIcon className="size-3" />}
          {instance.active ? "Active" : "Inactive"}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* General Info */}
        <section>
          <h2 className="text-sm font-semibold mb-3">General</h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Name</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                rows={2}
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Active</label>
              <button
                onClick={() => setEditActive(!editActive)}
                className={cn("transition-colors", editActive ? "text-green-500" : "text-muted-foreground")}
              >
                {editActive ? <ToggleRightIcon className="size-6" /> : <ToggleLeftIcon className="size-6" />}
              </button>
            </div>
          </div>
        </section>

        {/* Template Info */}
        <section>
          <h2 className="text-sm font-semibold mb-3">Template</h2>
          <div className="p-3 rounded-lg border border-border bg-muted/30">
            <div className="flex items-center gap-3">
              <ScopeIcon icon={instance.template.icon} className="text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{instance.template.name}</p>
                <p className="text-xs text-muted-foreground">{instance.template.slug} • {instance.template.category}</p>
              </div>
            </div>
            {instance.template.requiredProfileFields && instance.template.requiredProfileFields.length > 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                Required profile fields: {instance.template.requiredProfileFields.join(", ")}
              </p>
            )}
          </div>
        </section>

        {/* Tools */}
        <section>
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <WrenchIcon className="size-4" /> Tools ({tools.length})
          </h2>
          <div className="space-y-2">
            {tools.map((tool) => (
              <div key={tool.name} className="p-3 rounded-lg border border-border bg-card">
                <p className="text-sm font-mono font-medium">{tool.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{tool.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Config */}
        {instance.configs.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold mb-3">Configuration</h2>
            <div className="space-y-2">
              {instance.configs.map((cfg) => (
                <div key={cfg.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card">
                  <span className="text-sm font-mono">{cfg.key}</span>
                  <span className="text-xs text-muted-foreground">
                    {cfg.isSecret ? "••••••••" : cfg.value || "(empty)"}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Errors / Success */}
        {error && <p className="text-xs text-red-500">{error}</p>}
        {success && <p className="text-xs text-green-500">{success}</p>}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-4 border-t border-border">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2Icon className="size-4 animate-spin" /> : <SaveIcon className="size-4" />}
            Save Changes
          </button>
          <div className="flex-1" />
          <button
            onClick={handleDelete}
            disabled={deleting || !instance.ownerId}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg border border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors disabled:opacity-50"
            title={!instance.ownerId ? "Platform-owned instances cannot be deleted" : undefined}
          >
            {deleting ? <Loader2Icon className="size-4 animate-spin" /> : <TrashIcon className="size-4" />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
