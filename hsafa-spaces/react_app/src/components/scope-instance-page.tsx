import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  DatabaseIcon,
  EyeIcon,
  EyeOffIcon,
  TerminalIcon,
  SettingsIcon,
  PlayIcon,
  SquareIcon,
  RotateCwIcon,
  RocketIcon,
  RefreshCwIcon,
  CopyIcon,
  CheckIcon,
  ChevronRightIcon,
  CircleDotIcon,
  AlertTriangleIcon,
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

// ── Config Schema Helpers ────────────────────────────────────────────────────

interface ConfigFieldSchema {
  type: string;
  description?: string;
  default?: unknown;
  secret?: boolean;
}

function parseConfigSchema(schema: Record<string, unknown> | undefined): {
  fields: Record<string, ConfigFieldSchema>;
  required: string[];
} {
  if (!schema || schema.type !== "object") return { fields: {}, required: [] };
  const props = (schema.properties ?? {}) as Record<string, ConfigFieldSchema>;
  const required = (schema.required ?? []) as string[];
  return { fields: props, required };
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

// ── Deploy Output Modal ──────────────────────────────────────────────────────

interface DeployOutput {
  status: "deploying" | "success" | "error";
  containerId?: string;
  containerStatus?: string;
  error?: string;
}

function DeployOutputModal({
  output,
  instanceName,
  onClose,
  onViewLogs,
}: {
  output: DeployOutput;
  instanceName: string;
  onClose: () => void;
  onViewLogs: () => void;
}) {
  const steps = [
    "Pulling Docker image",
    "Removing old container",
    "Building environment",
    "Creating container",
    "Starting container",
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={output.status !== "deploying" ? onClose : undefined} />
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-md mx-4">
        <div className="p-6 space-y-5">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className={cn(
              "flex items-center justify-center size-10 rounded-full shrink-0",
              output.status === "deploying" && "bg-blue-500/10 text-blue-500",
              output.status === "success" && "bg-green-500/10 text-green-500",
              output.status === "error" && "bg-red-500/10 text-red-500",
            )}>
              {output.status === "deploying" && <Loader2Icon className="size-5 animate-spin" />}
              {output.status === "success" && <CheckCircle2Icon className="size-5" />}
              {output.status === "error" && <XCircleIcon className="size-5" />}
            </div>
            <div>
              <h3 className="font-semibold text-base">
                {output.status === "deploying" && "Deploying..."}
                {output.status === "success" && "Deployed Successfully"}
                {output.status === "error" && "Deployment Failed"}
              </h3>
              <p className="text-xs text-muted-foreground">{instanceName}</p>
            </div>
          </div>

          {/* Steps */}
          <div className="rounded-lg border border-border overflow-hidden bg-muted/30">
            {steps.map((step, i) => {
              const activeIdx = output.status === "deploying" ? Math.min(i, steps.length - 1) : steps.length;
              let icon: React.ReactNode;
              let textCls: string;

              if (output.status === "success") {
                icon = <CheckCircle2Icon className="size-4 text-green-500" />;
                textCls = "text-muted-foreground";
              } else if (output.status === "error" && i === steps.length - 1) {
                icon = <XCircleIcon className="size-4 text-red-500" />;
                textCls = "text-red-500 font-medium";
              } else if (output.status === "error" && i < steps.length - 1) {
                icon = <CheckCircle2Icon className="size-4 text-green-500" />;
                textCls = "text-muted-foreground";
              } else if (output.status === "deploying" && i < activeIdx) {
                icon = <CheckCircle2Icon className="size-4 text-green-500" />;
                textCls = "text-muted-foreground";
              } else if (output.status === "deploying" && i === activeIdx) {
                icon = <Loader2Icon className="size-4 text-blue-500 animate-spin" />;
                textCls = "text-foreground font-medium";
              } else {
                icon = <div className="size-4 rounded-full border-2 border-border" />;
                textCls = "text-muted-foreground";
              }

              return (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-0">
                  <div className="shrink-0">{icon}</div>
                  <span className={cn("text-sm", textCls)}>{step}</span>
                </div>
              );
            })}
          </div>

          {/* Result details */}
          {output.status === "success" && output.containerId && (
            <div className="rounded-lg border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-950/20 p-3 space-y-1">
              <p className="text-xs font-medium text-green-700 dark:text-green-400">Container started</p>
              <p className="text-[11px] text-green-600 dark:text-green-500 font-mono">{output.containerId.slice(0, 12)}</p>
            </div>
          )}

          {output.status === "error" && output.error && (
            <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 p-3">
              <p className="text-xs font-medium text-red-700 dark:text-red-400 mb-1">Error</p>
              <p className="text-xs text-red-600 dark:text-red-400 font-mono break-all leading-relaxed">{output.error}</p>
            </div>
          )}

          {/* Actions */}
          {output.status !== "deploying" && (
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 text-sm rounded-lg border border-border font-medium hover:bg-muted transition-colors"
              >
                Close
              </button>
              {output.status === "success" && (
                <button
                  onClick={onViewLogs}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
                >
                  <TerminalIcon className="size-3.5" />
                  View Logs
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tab types ─────────────────────────────────────────────────────────────────

type InstanceTab = "general" | "configuration" | "logs";

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
          { label: "Template", value: (
            <div className="flex items-center gap-2">
              <ScopeIcon icon={instance.template.icon} className="size-4" />
              <span className="text-sm">{instance.template.name}</span>
              <span className="text-xs text-muted-foreground">({instance.template.slug})</span>
            </div>
          )},
          { label: "Created", value: <span className="text-sm">{new Date(instance.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span> },
          ...(instance.containerId ? [{ label: "Container ID", value: <span className="text-xs font-mono text-muted-foreground">{instance.containerId.slice(0, 12)}</span> }] : []),
          ...(instance.imageUrl ? [{ label: "Image", value: <span className="text-xs font-mono text-muted-foreground break-all">{instance.imageUrl}</span> }] : []),
        ].map((row, i) => (
          <div key={i} className="flex items-center bg-card">
            <div className="w-40 shrink-0 px-4 py-3 text-xs font-medium text-muted-foreground bg-muted/50">{row.label}</div>
            <div className="flex-1 px-4 py-3">{row.value}</div>
          </div>
        ))}
      </div>

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

// ── Configuration Tab ────────────────────────────────────────────────────────

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

  const buildCfgValues = (configs: ScopeInstance["configs"]) => {
    const cfgValues: Record<string, string> = {};
    for (const c of configs) {
      cfgValues[c.key] = c.isSecret ? "" : (c.value ?? "");
    }
    return cfgValues;
  };

  const [editConfigs, setEditConfigs] = useState<Record<string, string>>(() => buildCfgValues(instance.configs));
  const [revealedSecrets, setRevealedSecrets] = useState<Set<string>>(new Set());

  // Sync edit state when instance data refreshes (e.g. after save)
  useEffect(() => {
    setEditConfigs(buildCfgValues(instance.configs));
  }, [instance.configs]);

  const { fields: schemaFields, required: requiredKeys } = useMemo(
    () => parseConfigSchema(instance.template.configSchema as Record<string, unknown> | undefined),
    [instance],
  );
  const hasConfigSchema = Object.keys(schemaFields).length > 0;

  const configKeys = useMemo(() => {
    const keys = new Set(Object.keys(schemaFields));
    for (const c of instance.configs) keys.add(c.key);
    return [...keys];
  }, [schemaFields, instance]);

  const isBuiltIn = !!(instance as any).builtIn;

  function setConfigValue(key: string, value: string) {
    setEditConfigs((prev) => ({ ...prev, [key]: value }));
  }

  function toggleReveal(key: string) {
    setRevealedSecrets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const configs: Array<{ key: string; value: string; isSecret?: boolean }> = [];
      for (const key of configKeys) {
        const val = editConfigs[key];
        if (val === undefined || val === "") continue;
        const field = schemaFields[key];
        const isSecret = field?.secret ?? instance.configs.find((c) => c.key === key)?.isSecret ?? false;
        configs.push({ key, value: val, isSecret });
      }

      await scopesApi.updateInstance(instance.id, {
        configs: configs.length > 0 ? configs : undefined,
      });
      setSuccess("Configuration saved");
      setTimeout(() => setSuccess(""), 3000);
      onSaved();
    } catch (err: any) {
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (!hasConfigSchema && instance.configs.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <SettingsIcon className="size-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No configuration options for this scope.</p>
      </div>
    );
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
    <div className="space-y-4 max-w-2xl">
      <p className="text-xs text-muted-foreground">
        Environment variables and configuration for your scope instance. Secret values are masked — leave empty to keep current value.
      </p>

      <div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
        {configKeys.map((key) => {
          const field = schemaFields[key];
          const existingCfg = instance.configs.find((c) => c.key === key);
          const isSecret = field?.secret ?? existingCfg?.isSecret ?? false;
          const isRequired = requiredKeys.includes(key);
          const fieldType = field?.type ?? "string";
          const description = field?.description;
          const placeholder = field?.default !== undefined ? `Default: ${field.default}` : "";

          if (fieldType === "boolean") {
            const checked = editConfigs[key] !== undefined
              ? editConfigs[key] === "true"
              : (field?.default === true);
            return (
              <div key={key} className="flex items-center justify-between px-4 py-3 bg-card">
                <div>
                  <p className="text-sm font-mono font-medium">
                    {key}
                    {isRequired && <span className="text-red-500 ml-1">*</span>}
                  </p>
                  {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => setConfigValue(key, checked ? "false" : "true")}
                  className={cn("transition-colors", checked ? "text-green-500" : "text-muted-foreground")}
                >
                  {checked ? <ToggleRightIcon className="size-6" /> : <ToggleLeftIcon className="size-6" />}
                </button>
              </div>
            );
          }

          return (
            <div key={key} className="px-4 py-3 bg-card">
              <div className="flex items-center gap-2 mb-1.5">
                <label className="text-sm font-mono font-medium">
                  {key}
                  {isRequired && <span className="text-red-500 ml-1">*</span>}
                </label>
                {isSecret && <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-600">secret</span>}
              </div>
              {description && <p className="text-xs text-muted-foreground mb-2">{description}</p>}
              <div className="relative">
                <input
                  type={isSecret && !revealedSecrets.has(key) ? "password" : fieldType === "number" ? "number" : "text"}
                  value={editConfigs[key] ?? ""}
                  onChange={(e) => setConfigValue(key, e.target.value)}
                  placeholder={isSecret && existingCfg?.hasValue ? "••••••••  (leave empty to keep)" : placeholder}
                  className={cn(
                    "w-full px-3 py-2 text-sm rounded-lg border border-border bg-background font-mono focus:outline-none focus:ring-2 focus:ring-primary/30",
                    isSecret && "pr-10",
                  )}
                />
                {isSecret && (
                  <button
                    type="button"
                    onClick={() => toggleReveal(key)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                  >
                    {revealedSecrets.has(key) ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {error && <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 px-3 py-2 rounded-lg">{error}</p>}
      {success && <p className="text-xs text-green-500 bg-green-50 dark:bg-green-950/20 px-3 py-2 rounded-lg">{success}</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {saving ? <Loader2Icon className="size-4 animate-spin" /> : <SaveIcon className="size-4" />}
        Save Configuration
      </button>
    </div>
  );
}

// ── Logs Tab ──────────────────────────────────────────────────────────────────

function LogsTab({ instance }: { instance: ScopeInstance }) {
  const [logs, setLogs] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tail, setTail] = useState(200);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const [copied, setCopied] = useState(false);

  const isManaged = instance.deploymentType === "platform" || instance.deploymentType === "custom";
  const hasContainer = !!instance.containerId;

  const fetchLogs = useCallback(async () => {
    if (!hasContainer) return;
    setLoading(true);
    setError("");
    try {
      const res = await scopesApi.getInstanceLogs(instance.id, tail);
      setLogs(res.logs || "(no logs)");
      setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (err: any) {
      setError(err.message || "Failed to fetch logs");
    } finally {
      setLoading(false);
    }
  }, [instance.id, tail, hasContainer]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchLogs, 5000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, fetchLogs]);

  function handleCopy() {
    if (logs) {
      navigator.clipboard.writeText(logs);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (!isManaged && instance.deploymentType !== "external") {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <TerminalIcon className="size-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">Logs are not available for this deployment type.</p>
      </div>
    );
  }

  if (!hasContainer) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <TerminalIcon className="size-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No container running.</p>
        <p className="text-xs mt-1">Deploy the instance first to see logs.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2Icon className="size-3 animate-spin" /> : <RefreshCwIcon className="size-3" />}
          Refresh
        </button>
        <button
          onClick={() => setAutoRefresh(!autoRefresh)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors",
            autoRefresh ? "border-green-300 dark:border-green-800 bg-green-500/10 text-green-600" : "border-border bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          <CircleDotIcon className={cn("size-3", autoRefresh && "animate-pulse")} />
          {autoRefresh ? "Live" : "Auto"}
        </button>
        <select
          value={tail}
          onChange={(e) => setTail(Number(e.target.value))}
          className="px-2.5 py-1.5 text-xs rounded-lg border border-border bg-card text-foreground"
        >
          <option value={50}>50 lines</option>
          <option value={100}>100 lines</option>
          <option value={200}>200 lines</option>
          <option value={500}>500 lines</option>
        </select>
        <div className="flex-1" />
        <button
          onClick={handleCopy}
          disabled={!logs}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          {copied ? <CheckIcon className="size-3 text-green-500" /> : <CopyIcon className="size-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Terminal */}
      <div className="flex-1 min-h-0 rounded-lg overflow-hidden border border-zinc-800 bg-[#0d1117] flex flex-col">
        {/* Terminal title bar */}
        <div className="flex items-center gap-2 px-4 py-2 bg-[#161b22] border-b border-zinc-800">
          <div className="flex gap-1.5">
            <div className="size-3 rounded-full bg-[#ff5f57]" />
            <div className="size-3 rounded-full bg-[#febc2e]" />
            <div className="size-3 rounded-full bg-[#28c840]" />
          </div>
          <span className="text-[10px] text-zinc-500 font-mono ml-2">{instance.scopeName} — logs</span>
          {autoRefresh && <span className="text-[9px] text-green-500 font-mono ml-auto animate-pulse">LIVE</span>}
        </div>
        {/* Log content */}
        <div className="flex-1 overflow-auto p-4 font-mono text-[12px] leading-[1.7] min-h-[400px] max-h-[600px] selection:bg-blue-500/30">
          {logs === null ? (
            <div className="flex items-center justify-center h-full">
              <Loader2Icon className="size-5 animate-spin text-zinc-600" />
            </div>
          ) : (
            <>
              {logs.split("\n").map((line, i) => (
                <div key={i} className="hover:bg-white/[0.03] px-1 -mx-1 rounded group">
                  <span className="text-zinc-600 select-none mr-4 inline-block w-8 text-right text-[11px] group-hover:text-zinc-500">{i + 1}</span>
                  <span className={cn(
                    "text-zinc-400",
                    line.toLowerCase().includes("error") && "text-red-400",
                    line.toLowerCase().includes("warn") && "text-yellow-400",
                    (line.toLowerCase().includes("info") || line.toLowerCase().includes("connected") || line.toLowerCase().includes("ready")) && "text-green-400",
                    line.startsWith(">") && "text-cyan-400",
                  )}>{line}</span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </>
          )}
        </div>
      </div>
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
  const [tab, setTab] = useState<InstanceTab>("general");
  const [acting, setActing] = useState<string | null>(null);
  const [deployOutput, setDeployOutput] = useState<DeployOutput | null>(null);

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

  // ── Lifecycle actions (called from header) ────────────────────────────
  async function act(action: string, fn: () => Promise<unknown>) {
    setActing(action);
    try {
      await fn();
      load(true);
    } catch (err: any) {
      console.error(`Action ${action} failed:`, err);
    } finally {
      setActing(null);
    }
  }

  async function handleDeploy() {
    setActing("deploy");
    setDeployOutput({ status: "deploying" });
    try {
      const res = await scopesApi.deployInstance(instanceId);
      if (res.containerStatus === "error") {
        setDeployOutput({ status: "error", error: res.statusMessage || "Deployment failed" });
      } else {
        setDeployOutput({ status: "success", containerId: res.containerId, containerStatus: res.containerStatus });
      }
      load(true);
    } catch (err: any) {
      setDeployOutput({ status: "error", error: err.message || "Deployment failed" });
    } finally {
      setActing(null);
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

  const containerStatus = instance.containerStatus ?? "stopped";
  const isRunning = containerStatus === "running";
  const isStopped = containerStatus === "stopped";
  const isError = containerStatus === "error";
  const hasContainer = !!instance.containerId;
  const isManaged = instance.deploymentType === "platform" || instance.deploymentType === "custom";

  const tabs: { key: InstanceTab; label: string; icon: React.ReactNode }[] = [
    { key: "general", label: "General", icon: <SettingsIcon className="size-3.5" /> },
    { key: "configuration", label: "Configuration", icon: <WrenchIcon className="size-3.5" /> },
    { key: "logs", label: "Logs", icon: <TerminalIcon className="size-3.5" /> },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* ── Top bar: breadcrumb + status + actions ─────────────────────── */}
      <div className="px-6 py-3 border-b border-border space-y-3">
        {/* Breadcrumb row */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <button onClick={onBack} className="hover:text-foreground transition-colors">Scopes</button>
          <ChevronRightIcon className="size-3" />
          <span className="text-foreground font-medium truncate">{instance.name}</span>
        </div>

        {/* Name + status + actions row */}
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex items-center justify-center size-10 rounded-lg shrink-0",
            isRunning && instance.connected ? "bg-green-500/10 text-green-600"
              : isRunning ? "bg-blue-500/10 text-blue-500"
              : "bg-muted text-muted-foreground",
          )}>
            <ScopeIcon icon={instance.template.icon} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5">
              <h1 className="font-semibold text-lg truncate">{instance.name}</h1>
              <StatusLabel status={containerStatus} connected={instance.connected} />
            </div>
            <p className="text-xs text-muted-foreground font-mono">{instance.scopeName}</p>
          </div>

          {/* Action buttons - Coolify style */}
          {isManaged && (
            <div className="flex items-center gap-1.5">
              {(!hasContainer || isStopped || isError) && instance.imageUrl && (
                <HeaderAction
                  label={hasContainer ? "Redeploy" : "Deploy"}
                  icon={<RocketIcon className="size-3.5" />}
                  onClick={handleDeploy}
                  disabled={!!acting}
                  loading={acting === "deploy"}
                />
              )}
              {hasContainer && isStopped && (
                <HeaderAction
                  label="Start"
                  icon={<PlayIcon className="size-3.5" />}
                  onClick={() => act("start", () => scopesApi.startInstance(instance.id))}
                  disabled={!!acting}
                  loading={acting === "start"}
                  variant="success"
                />
              )}
              {hasContainer && isRunning && (
                <>
                  <HeaderAction
                    label="Restart"
                    icon={<RotateCwIcon className="size-3.5" />}
                    onClick={() => act("restart", () => scopesApi.restartInstance(instance.id))}
                    disabled={!!acting}
                    loading={acting === "restart"}
                  />
                  <HeaderAction
                    label="Stop"
                    icon={<SquareIcon className="size-3.5" />}
                    onClick={() => act("stop", () => scopesApi.stopInstance(instance.id))}
                    disabled={!!acting}
                    loading={acting === "stop"}
                    variant="danger"
                  />
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs (Coolify-style underline tabs) ──────────────────────── */}
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
        {tab === "logs" && <LogsTab instance={instance} />}
      </div>

      {/* Deploy output modal */}
      {deployOutput && (
        <DeployOutputModal
          output={deployOutput}
          instanceName={instance.name}
          onClose={() => setDeployOutput(null)}
          onViewLogs={() => { setDeployOutput(null); setTab("logs"); }}
        />
      )}
    </div>
  );
}
