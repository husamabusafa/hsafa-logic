import { useState, useEffect, useCallback } from "react";
import {
  PuzzleIcon,
  WrenchIcon,
  CheckCircle2Icon,
  Loader2Icon,
  TrashIcon,
  SaveIcon,
  ToggleLeftIcon,
  ToggleRightIcon,
  MessageSquareIcon,
  CalendarIcon,
  PlugIcon,
  DatabaseIcon,
  CopyIcon,
  CheckIcon,
  ChevronRightIcon,
  AlertTriangleIcon,
  EyeIcon,
  EyeOffIcon,
  KeyIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { scopesApi, type ScopeInstance } from "@/lib/api";

function ScopeIcon({ icon, className }: { icon: string | null; className?: string }) {
  const cls = cn("size-5", className);
  switch (icon) {
    case "MessageSquare": return <MessageSquareIcon className={cls} />;
    case "Calendar": return <CalendarIcon className={cls} />;
    case "Database": return <DatabaseIcon className={cls} />;
    case "Plug": return <PlugIcon className={cls} />;
    default: return <PuzzleIcon className={cls} />;
  }
}

// ── Confirm Modal ────────────────────────────────────────────────────────────

function ConfirmModal({
  open,
  title,
  description,
  confirmLabel,
  confirmVariant = "danger",
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  confirmVariant?: "danger" | "primary";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  const btnCls = confirmVariant === "danger"
    ? "bg-red-600 text-white hover:bg-red-700"
    : "bg-primary text-primary-foreground hover:bg-primary/90";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm mx-4 animate-in fade-in zoom-in-95 duration-150">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={cn(
              "flex items-center justify-center size-10 rounded-full shrink-0",
              confirmVariant === "danger" ? "bg-red-500/10 text-red-500" : "bg-primary/10 text-primary",
            )}>
              <AlertTriangleIcon className="size-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-base">{title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{description}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-6">
            <button
              onClick={onCancel}
              disabled={loading}
              className="flex-1 px-4 py-2 text-sm rounded-lg border border-border font-medium hover:bg-muted transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={loading}
              className={cn("flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm rounded-lg font-medium transition-colors disabled:opacity-50", btnCls)}
            >
              {loading && <Loader2Icon className="size-4 animate-spin" />}
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Scope Key Section ─────────────────────────────────────────────────────────

function ScopeKeySection({ scopeKey }: { scopeKey: string }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(scopeKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <KeyIcon className="size-4" /> Scope Key
      </h3>
      <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-muted/30">
        <code className="flex-1 text-xs font-mono break-all select-all">
          {revealed ? scopeKey : "••••••••••••" + scopeKey.slice(-4)}
        </code>
        <button
          onClick={() => setRevealed(!revealed)}
          className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0"
          title={revealed ? "Hide" : "Reveal"}
        >
          {revealed ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
        </button>
        <button
          onClick={handleCopy}
          className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0"
          title="Copy"
        >
          {copied ? <CheckIcon className="size-4 text-green-500" /> : <CopyIcon className="size-4" />}
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Use this key in your scope service to connect to Core. Keep it secret.
      </p>
    </section>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

interface ScopeInstancePageProps {
  instanceId: string;
  onBack: () => void;
}

export function ScopeInstancePage({ instanceId, onBack }: ScopeInstancePageProps) {
  const [instance, setInstance] = useState<ScopeInstance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [success, setSuccess] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
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
      if (!silent) setLoading(false);
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
      load(true);
    } catch (err: any) {
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!instance) return;
    setDeleting(true);
    try {
      await scopesApi.deleteInstance(instance.id);
      onBack();
    } catch (err: any) {
      setError(err.message || "Failed to delete");
      setDeleting(false);
      setShowDeleteConfirm(false);
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

  const isBuiltIn = instance.deploymentType === "built-in" || !!(instance as any).builtIn;
  const tools = (instance.template.tools ?? []) as Array<{ name: string; description: string }>;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-3 border-b border-border space-y-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <button onClick={onBack} className="hover:text-foreground transition-colors">Skills</button>
          <ChevronRightIcon className="size-3" />
          <span className="text-foreground font-medium truncate">{instance.name}</span>
        </div>

        <div className="flex items-center gap-3">
          <div className={cn(
            "flex items-center justify-center size-10 rounded-lg shrink-0",
            isBuiltIn || instance.connected
              ? "bg-green-500/10 text-green-600"
              : "bg-muted text-muted-foreground",
          )}>
            <ScopeIcon icon={instance.template.icon} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5">
              <h1 className="font-semibold text-lg truncate">{instance.name}</h1>
              {isBuiltIn ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full text-green-600 bg-green-500/10">
                  <div className="size-2.5 rounded-full bg-green-500" />
                  Active
                </span>
              ) : (
                <span className={cn(
                  "inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full",
                  instance.connected ? "text-green-600 bg-green-500/10" : "text-muted-foreground bg-muted",
                )}>
                  <div className={cn("size-2.5 rounded-full", instance.connected ? "bg-green-500" : "bg-zinc-400")} />
                  {instance.connected ? "Connected" : "Disconnected"}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground font-mono">{instance.scopeName}</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="space-y-8 max-w-2xl">
          {/* Info grid */}
          <div className="grid gap-px rounded-lg border border-border overflow-hidden bg-border">
            {[
              { label: "Scope Name", value: <span className="font-mono text-sm">{instance.scopeName}</span> },
              { label: "Template", value: instance.templateId ? (
                <div className="flex items-center gap-2">
                  <ScopeIcon icon={instance.template.icon} className="size-4" />
                  <span className="text-sm">{instance.template.name}</span>
                  <span className="text-xs text-muted-foreground">({instance.template.slug})</span>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">None (external scope)</span>
              )},
              { label: "Created", value: <span className="text-sm">{new Date(instance.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span> },
            ].map((row, i) => (
              <div key={i} className="flex items-center bg-card">
                <div className="w-40 shrink-0 px-4 py-3 text-xs font-medium text-muted-foreground bg-muted/50">{row.label}</div>
                <div className="flex-1 px-4 py-3">{row.value}</div>
              </div>
            ))}
          </div>

          {/* Scope Key */}
          {!isBuiltIn && instance.coreScopeKey && <ScopeKeySection scopeKey={instance.coreScopeKey} />}

          {/* Tools */}
          {tools.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <WrenchIcon className="size-4" /> Tools ({tools.length})
              </h3>
              <div className="grid gap-px rounded-lg border border-border overflow-hidden bg-border">
                {tools.map((tool) => (
                  <div key={tool.name} className="flex items-start gap-3 px-4 py-3 bg-card">
                    <code className="text-xs font-semibold bg-muted px-1.5 py-0.5 rounded mt-0.5">{tool.name}</code>
                    <p className="text-xs text-muted-foreground">{tool.description}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Settings (non built-in) */}
          {!isBuiltIn && (
            <section className="space-y-4">
              <h3 className="text-sm font-semibold">Settings</h3>
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
                <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-card">
                  <div>
                    <p className="text-sm font-medium">Active</p>
                    <p className="text-xs text-muted-foreground">Enable or disable this scope</p>
                  </div>
                  <button
                    onClick={() => setEditActive(!editActive)}
                    className={cn("transition-colors", editActive ? "text-green-500" : "text-muted-foreground")}
                  >
                    {editActive ? <ToggleRightIcon className="size-7" /> : <ToggleLeftIcon className="size-7" />}
                  </button>
                </div>
              </div>

              {error && <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 px-3 py-2 rounded-lg">{error}</p>}
              {success && <p className="text-xs text-green-500 bg-green-50 dark:bg-green-950/20 px-3 py-2 rounded-lg">{success}</p>}

              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2Icon className="size-4 animate-spin" /> : <SaveIcon className="size-4" />}
                Save
              </button>
            </section>
          )}

          {/* Danger Zone */}
          {!isBuiltIn && instance.ownerId && (
            <section className="rounded-lg border border-red-200 dark:border-red-900/50 overflow-hidden">
              <div className="px-4 py-2.5 bg-red-50 dark:bg-red-950/20 border-b border-red-200 dark:border-red-900/50">
                <p className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wider">Danger Zone</p>
              </div>
              <div className="p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Delete this scope instance</p>
                  <p className="text-xs text-muted-foreground">Permanently remove the instance. This cannot be undone.</p>
                </div>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={deleting}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 shrink-0"
                >
                  {deleting ? <Loader2Icon className="size-3 animate-spin" /> : <TrashIcon className="size-3" />}
                  Delete
                </button>
              </div>
            </section>
          )}

          <ConfirmModal
            open={showDeleteConfirm}
            title="Delete Instance"
            description={`Are you sure you want to delete "${instance?.name}"? This action cannot be undone.`}
            confirmLabel="Delete"
            confirmVariant="danger"
            loading={deleting}
            onConfirm={handleDelete}
            onCancel={() => setShowDeleteConfirm(false)}
          />
        </div>
      </div>
    </div>
  );
}
