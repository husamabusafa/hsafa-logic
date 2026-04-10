import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
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
  SettingsIcon,
  CopyIcon,
  CheckIcon,
  ChevronRightIcon,
  AlertTriangleIcon,
  EyeIcon,
  EyeOffIcon,
  KeyIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EnvEditor } from "@/components/env-editor";
import { scopesApi, type ScopeInstance, type ScopeInstanceConfig } from "@/lib/api";

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

// ── Env Row Type ─────────────────────────────────────────────────────────────

interface EnvRow {
  id: string; // local key for React list
  key: string;
  value: string;
  isSecret: boolean;
  isNew?: boolean; // true for rows added in the UI
}

function instanceConfigsToRows(configs: ScopeInstanceConfig[]): EnvRow[] {
  return configs.map((c, i) => ({
    id: c.id || `cfg-${i}`,
    key: c.key,
    value: c.value ?? "",
    isSecret: c.isSecret,
  }));
}

// ── Env Text ↔ Rows helpers (for developer mode) ────────────────────────────

function rowsToEnvText(rows: EnvRow[]): string {
  if (rows.length === 0) return "";
  return rows.map((r) => {
    const comment = r.isSecret ? " # secret" : "";
    return `${r.key}=${r.value}${comment}`;
  }).join("\n");
}

function envTextToRows(text: string, existingRows: EnvRow[]): EnvRow[] {
  const existingSecrets = new Set(existingRows.filter((r) => r.isSecret).map((r) => r.key));
  const result: EnvRow[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const rawKey = trimmed.slice(0, eqIdx).trim();
    if (!rawKey) continue;
    // Value: strip inline "# secret" comment
    let rest = trimmed.slice(eqIdx + 1);
    let isSecret = false;
    const secretTag = rest.match(/\s+#\s*secret\s*$/i);
    if (secretTag) {
      rest = rest.slice(0, secretTag.index!);
      isSecret = true;
    } else if (existingSecrets.has(rawKey)) {
      isSecret = true;
    }
    result.push({ id: `env-${result.length}-${Date.now()}`, key: rawKey, value: rest, isSecret });
  }
  return result;
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

// ── Tab types ─────────────────────────────────────────────────────────────────

type InstanceTab = "general" | "configuration";

// ── Status dot (Coolify-style) ───────────────────────────────────────────────

function StatusDot({ status, connected }: { status: string; connected?: boolean }) {
  const colorMap: Record<string, string> = {
    running: connected ? "bg-green-500" : "bg-blue-500",
    starting: "bg-blue-400 animate-pulse",
    building: "bg-amber-400 animate-pulse",
    stopped: "bg-zinc-400",
    error: "bg-red-500",
    removing: "bg-zinc-400 animate-pulse",
  };
  return <div className={cn("size-2.5 rounded-full", colorMap[status] ?? "bg-zinc-400")} />;
}

function StatusLabel({ status, connected }: { status: string; connected?: boolean }) {
  const labelMap: Record<string, { label: string; cls: string }> = {
    running: { label: connected ? "Connected" : "Running", cls: connected ? "text-green-600 bg-green-500/10" : "text-blue-500 bg-blue-500/10" },
    starting: { label: "Starting...", cls: "text-blue-500 bg-blue-500/10" },
    building: { label: "Building...", cls: "text-amber-600 bg-amber-500/10" },
    stopped: { label: "Stopped", cls: "text-zinc-500 bg-zinc-500/10" },
    error: { label: "Error", cls: "text-red-500 bg-red-500/10" },
    removing: { label: "Removing...", cls: "text-zinc-500 bg-zinc-500/10" },
  };
  const cfg = labelMap[status] ?? labelMap.stopped;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full", cfg.cls)}>
      <StatusDot status={status} connected={connected} />
      {cfg.label}
    </span>
  );
}

// ── Header Action Button (Coolify-style small buttons) ──────────────────────

function HeaderAction({
  label,
  icon,
  onClick,
  disabled,
  loading: isLoading,
  variant = "default",
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "default" | "danger" | "success";
}) {
  const variantCls = {
    default: "border-border text-foreground hover:bg-muted",
    danger: "border-red-300 dark:border-red-800 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20",
    success: "border-green-300 dark:border-green-800 text-green-600 hover:bg-green-50 dark:hover:bg-green-950/20",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled || isLoading}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50",
        variantCls[variant],
      )}
      title={label}
    >
      {isLoading ? <Loader2Icon className="size-3.5 animate-spin" /> : icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
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

// ── General Tab ──────────────────────────────────────────────────────────────

function GeneralTab({
  instance,
  onSaved,
  onDelete,
}: {
  instance: ScopeInstance;
  onSaved: () => void;
  onDelete: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editName, setEditName] = useState(instance.name);
  const [editDescription, setEditDescription] = useState(instance.description || "");
  const [editActive, setEditActive] = useState(instance.active);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isBuiltIn = !!(instance as any).builtIn;
  const tools = (instance.template.tools ?? []) as Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;

  async function handleSave() {
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
      onSaved();
    } catch (err: any) {
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await scopesApi.deleteInstance(instance.id);
      onDelete();
    } catch (err: any) {
      setError(err.message || "Failed to delete");
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Info grid */}
      <div className="grid gap-px rounded-lg border border-border overflow-hidden bg-border">
        {[
          { label: "Scope Name", value: <span className="font-mono text-sm">{instance.scopeName}</span> },
          { label: "Deployment Type", value: <span className="text-sm capitalize">{instance.deploymentType}</span> },
          { label: "Template", value: instance.templateId ? (
            <div className="flex items-center gap-2">
              <ScopeIcon icon={instance.template.icon} className="size-4" />
              <span className="text-sm">{instance.template.name}</span>
              <span className="text-xs text-muted-foreground">({instance.template.slug})</span>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">None (local scope)</span>
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

      {/* Editable fields */}
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

      {/* Danger Zone */}
      {!isBuiltIn && instance.ownerId && (
        <section className="rounded-lg border border-red-200 dark:border-red-900/50 overflow-hidden">
          <div className="px-4 py-2.5 bg-red-50 dark:bg-red-950/20 border-b border-red-200 dark:border-red-900/50">
            <p className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wider">Danger Zone</p>
          </div>
          <div className="p-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Delete this scope instance</p>
              <p className="text-xs text-muted-foreground">Permanently remove the instance and its container. This cannot be undone.</p>
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

      {/* Delete confirmation modal */}
      <ConfirmModal
        open={showDeleteConfirm}
        title="Delete Instance"
        description={`Are you sure you want to delete "${instance.name}"? This will permanently remove the instance and its container. This action cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}

// ── Configuration Tab (Coolify-style, dual-mode) ─────────────────────────────

type ConfigMode = "form" | "editor";

let _rowCounter = 0;
function nextRowId() { return `new-${++_rowCounter}-${Date.now()}`; }

function ConfigurationTab({
  instance,
  onSaved,
}: {
  instance: ScopeInstance;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [dirty, setDirty] = useState(false);
  const [rows, setRows] = useState<EnvRow[]>(() => instanceConfigsToRows(instance.configs));
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<ConfigMode>("form");
  const [envText, setEnvText] = useState(() => rowsToEnvText(instanceConfigsToRows(instance.configs)));

  // Skip the next effect cycle after a save so the stale `instance` prop
  // doesn't overwrite the freshly-saved rows.
  const justSavedRef = useRef(false);

  // Sync from DB when not dirty (e.g. after polling refresh)
  useEffect(() => {
    if (justSavedRef.current) {
      justSavedRef.current = false;
      return;
    }
    if (!dirty) {
      const newRows = instanceConfigsToRows(instance.configs);
      setRows(newRows);
      setEnvText(rowsToEnvText(newRows));
    }
  }, [instance, dirty]);

  const isBuiltIn = !!(instance as any).builtIn;

  // ── Form mode helpers ──────────────────────────────────────────────

  function updateRow(id: string, field: keyof EnvRow, value: string | boolean) {
    setRows((prev) => {
      const next = prev.map((r) => r.id === id ? { ...r, [field]: value } : r);
      setEnvText(rowsToEnvText(next));
      return next;
    });
    setDirty(true);
  }

  function removeRow(id: string) {
    setRows((prev) => {
      const next = prev.filter((r) => r.id !== id);
      setEnvText(rowsToEnvText(next));
      return next;
    });
    setDirty(true);
  }

  function addRow() {
    setRows((prev) => {
      const next = [...prev, { id: nextRowId(), key: "", value: "", isSecret: false, isNew: true }];
      setEnvText(rowsToEnvText(next));
      return next;
    });
    setDirty(true);
  }

  function toggleSecret(id: string) {
    setRows((prev) => {
      const next = prev.map((r) => r.id === id ? { ...r, isSecret: !r.isSecret } : r);
      setEnvText(rowsToEnvText(next));
      return next;
    });
    setDirty(true);
  }

  function toggleShowSecret(id: string) {
    setShowSecrets((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  // ── Editor mode helper ─────────────────────────────────────────────

  function handleEnvTextChange(text: string) {
    setEnvText(text);
    setRows(envTextToRows(text, rows));
    setDirty(true);
  }

  // ── Mode switch ────────────────────────────────────────────────────

  function switchMode(newMode: ConfigMode) {
    if (newMode === mode) return;
    if (newMode === "editor") {
      // Sync text from rows
      setEnvText(rowsToEnvText(rows));
    } else {
      // Sync rows from text
      setRows(envTextToRows(envText, rows));
    }
    setMode(newMode);
  }

  // ── Save ───────────────────────────────────────────────────────────

  async function handleSave() {
    // If in editor mode, sync rows from text first
    const currentRows = mode === "editor" ? envTextToRows(envText, rows) : rows;

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      // Validate: no empty keys
      const invalidRow = currentRows.find((r) => !r.key.trim());
      if (invalidRow) {
        setError("All environment variables must have a key.");
        setSaving(false);
        return;
      }

      // Validate: no duplicate keys
      const keys = currentRows.map((r) => r.key.trim());
      const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
      if (dupes.length > 0) {
        setError(`Duplicate key: ${dupes[0]}`);
        setSaving(false);
        return;
      }

      const configs = currentRows.map((r) => ({
        key: r.key.trim(),
        value: r.value,
        isSecret: r.isSecret,
      }));

      const { instance: saved } = await scopesApi.updateInstance(instance.id, {
        configs,
        _replaceAllConfigs: true,
      });

      // Prevent the stale-instance effect from overwriting these rows
      justSavedRef.current = true;

      const savedRows = instanceConfigsToRows(saved.configs);
      setRows(savedRows);
      setEnvText(rowsToEnvText(savedRows));
      setDirty(false);
      setShowSecrets({});
      setSuccess("Configuration saved. Redeploy to apply changes.");
      setTimeout(() => setSuccess(""), 5000);
      onSaved();
    } catch (err: any) {
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (isBuiltIn) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <SettingsIcon className="size-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">Configuration is managed by the platform for built-in scopes.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Header + mode toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Environment Variables</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure environment variables for your scope instance.
            {dirty && <span className="ml-2 text-amber-500 font-medium">● Unsaved changes</span>}
          </p>
        </div>
        <div className="flex items-center gap-0 rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => switchMode("form")}
            className={cn(
              "px-3 py-1.5 text-xs font-medium transition-colors",
              mode === "form"
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            Form
          </button>
          <button
            onClick={() => switchMode("editor")}
            className={cn(
              "px-3 py-1.5 text-xs font-medium transition-colors border-l border-border",
              mode === "editor"
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            .env
          </button>
        </div>
      </div>

      {/* ── Editor mode ──────────────────────────────────────────── */}
      {mode === "editor" && (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Edit as raw <code className="bg-muted px-1 rounded">.env</code> file. Add <code className="bg-muted px-1 rounded"># secret</code> after a value to mark it as secret.
          </p>
          <EnvEditor
            value={envText}
            onChange={handleEnvTextChange}
            title={`${instance.scopeName}.env`}
          />
        </div>
      )}

      {/* ── Form mode ────────────────────────────────────────────── */}
      {mode === "form" && (
        <>
          {rows.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-border rounded-lg">
              <SettingsIcon className="size-8 mx-auto mb-2 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No environment variables yet.</p>
              <button
                onClick={addRow}
                className="mt-3 text-xs font-medium text-primary hover:underline"
              >
                + Add Variable
              </button>
            </div>
          ) : (
            <div className="space-y-0">
              {/* Header */}
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2 px-1 pb-1.5">
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Key</span>
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Value</span>
                <span className="w-[72px]" />
              </div>

              {/* Rows */}
              <div className="space-y-1.5">
                {rows.map((row) => (
                  <div key={row.id} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center group">
                    <input
                      type="text"
                      value={row.key}
                      onChange={(e) => updateRow(row.id, "key", e.target.value)}
                      placeholder="KEY"
                      spellCheck={false}
                      className="px-3 py-2 text-sm font-mono rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/40"
                    />
                    <div className="relative">
                      <input
                        type={row.isSecret && !showSecrets[row.id] ? "password" : "text"}
                        value={row.value}
                        onChange={(e) => updateRow(row.id, "value", e.target.value)}
                        placeholder={row.isSecret && !row.isNew ? "••••••• (unchanged)" : "value"}
                        spellCheck={false}
                        className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/40 pr-8"
                      />
                      {row.isSecret && (
                        <button
                          type="button"
                          onClick={() => toggleShowSecret(row.id)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          title={showSecrets[row.id] ? "Hide" : "Show"}
                        >
                          {showSecrets[row.id]
                            ? <ToggleRightIcon className="size-4 text-primary" />
                            : <ToggleLeftIcon className="size-4" />
                          }
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => toggleSecret(row.id)}
                        className={cn(
                          "flex items-center gap-1 px-2 py-1.5 text-[10px] font-medium rounded-md border transition-colors",
                          row.isSecret
                            ? "border-amber-300 dark:border-amber-800 bg-amber-500/10 text-amber-600"
                            : "border-border text-muted-foreground hover:text-foreground",
                        )}
                        title={row.isSecret ? "Mark as plain text" : "Mark as secret"}
                      >
                        {row.isSecret ? "Secret" : "Plain"}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors rounded-md hover:bg-red-50 dark:hover:bg-red-950/20"
                        title="Remove"
                      >
                        <TrashIcon className="size-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add row button */}
              <button
                onClick={addRow}
                className="mt-3 flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
              >
                <span className="text-base leading-none">+</span> Add Variable
              </button>
            </div>
          )}
        </>
      )}

      {error && <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 px-3 py-2 rounded-lg">{error}</p>}
      {success && <p className="text-xs text-green-500 bg-green-50 dark:bg-green-950/20 px-3 py-2 rounded-lg">{success}</p>}

      <button
        onClick={handleSave}
        disabled={saving || !dirty}
        className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {saving ? <Loader2Icon className="size-4 animate-spin" /> : <SaveIcon className="size-4" />}
        Save Configuration
      </button>
    </div>
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
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab") as InstanceTab | null;
  const tab: InstanceTab = tabParam === "configuration" ? tabParam : "general";

  const setTab = useCallback((t: InstanceTab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (t === "general") next.delete("tab"); else next.set("tab", t);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { instance: inst } = await scopesApi.getInstance(instanceId);
      setInstance(inst);
    } catch (err) {
      console.error("Failed to load instance:", err);
      setError("Failed to load scope instance");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [instanceId]);

  useEffect(() => { load(); }, [load]);

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

  const tabs: { key: InstanceTab; label: string; icon: React.ReactNode }[] = [
    { key: "general", label: "General", icon: <SettingsIcon className="size-3.5" /> },
    ...(!isBuiltIn ? [{ key: "configuration" as InstanceTab, label: "Configuration", icon: <WrenchIcon className="size-3.5" /> }] : []),
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-3 border-b border-border space-y-3">
        {/* Breadcrumb row */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <button onClick={onBack} className="hover:text-foreground transition-colors">Skills</button>
          <ChevronRightIcon className="size-3" />
          <span className="text-foreground font-medium truncate">{instance.name}</span>
        </div>

        {/* Name + status row */}
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

      {/* ── Tabs ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-0 px-6 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              tab === t.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6">
        {error && <p className="text-xs text-red-500 mb-4">{error}</p>}
        {tab === "general" && <GeneralTab instance={instance} onSaved={() => load(true)} onDelete={onBack} />}
        {tab === "configuration" && <ConfigurationTab instance={instance} onSaved={() => load(true)} />}
      </div>

      {/* Success toast */}
      {actionSuccess && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-green-600 text-white text-sm font-medium shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200">
          <CheckCircle2Icon className="size-4" />
          {actionSuccess}
        </div>
      )}
    </div>
  );
}
