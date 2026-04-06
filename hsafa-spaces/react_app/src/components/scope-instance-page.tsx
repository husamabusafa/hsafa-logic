import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
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
  ClockIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CodeTerminal, type CodeTerminalHandle, EnvEditor } from "@/components/env-editor";
import { scopesApi, type ScopeInstance, type ScopeDeployment } from "@/lib/api";

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

// ── Env Text Helpers ─────────────────────────────────────────────────────────

function configKeyToEnvKey(key: string): string {
  return key.replace(/([A-Z])/g, "_$1").toUpperCase().replace(/^_/, "");
}

function buildEnvTextFromInstance(instance: ScopeInstance): string {
  if (instance.configs.length === 0) return "# No configuration yet. Add KEY=value lines.\n";

  const lines: string[] = [];
  for (const cfg of instance.configs) {
    const envKey = configKeyToEnvKey(cfg.key);
    if (cfg.isSecret) {
      lines.push(`# ${envKey} [secret] — leave empty to keep current value`);
      lines.push(`${envKey}=`);
    } else {
      lines.push(`${envKey}=${cfg.value ?? ""}`);
    }
  }
  return lines.join("\n");
}

function parseEnvTextForSave(
  text: string,
  instance: ScopeInstance,
): Array<{ key: string; value: string; isSecret?: boolean }> {
  // Build reverse map: ENV_KEY → original stored key
  const envToOriginal: Record<string, string> = {};
  const secretKeys = new Set<string>();
  for (const c of instance.configs) {
    envToOriginal[configKeyToEnvKey(c.key)] = c.key;
    if (c.isSecret) secretKeys.add(c.key);
  }

  const configs: Array<{ key: string; value: string; isSecret?: boolean }> = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 1) continue;
    const envKey = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!value) continue; // skip empty — preserves existing secrets
    const originalKey = envToOriginal[envKey] ?? envKey;
    const isSecret = secretKeys.has(originalKey);
    configs.push({ key: originalKey, value, isSecret });
  }
  return configs;
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

type InstanceTab = "general" | "configuration" | "logs" | "deployments";

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

  const defaultEnvText = useMemo(() => buildEnvTextFromInstance(instance), [instance]);
  const [envText, setEnvText] = useState(defaultEnvText);

  // Sync env text when instance data refreshes (e.g. after save)
  useEffect(() => {
    setEnvText(buildEnvTextFromInstance(instance));
  }, [instance]);

  const isBuiltIn = !!(instance as any).builtIn;

  async function handleSave() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const configs = parseEnvTextForSave(envText, instance);

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

      <EnvEditor
        value={envText}
        onChange={setEnvText}
        title={`${instance.scopeName}.env`}
      />

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
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const terminalRef = useRef<CodeTerminalHandle>(null);

  const isManaged = instance.deploymentType === "platform" || instance.deploymentType === "custom";
  const hasContainer = !!instance.containerId;

  const fetchLogs = useCallback(async () => {
    if (!hasContainer) return;
    setLoading(true);
    setError("");
    try {
      const res = await scopesApi.getInstanceLogs(instance.id, tail);
      setLogs(res.logs || "(no logs)");
      setTimeout(() => terminalRef.current?.scrollToBottom(), 50);
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

      <CodeTerminal
        ref={terminalRef}
        value={logs ?? ""}
        highlight="log"
        loading={logs === null}
        title={`${instance.scopeName} — logs`}
        titleRight={autoRefresh ? <span className="text-[9px] text-green-500 font-mono animate-pulse">LIVE</span> : undefined}
        minRows={20}
        maxRows={30}
        className="flex-1 min-h-0"
      />
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

// ── Deployment Status Badge ───────────────────────────────────────────────────

function DeploymentStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    running: { label: "Running", cls: "text-blue-500 bg-blue-500/10", icon: <Loader2Icon className="size-3 animate-spin" /> },
    success: { label: "Success", cls: "text-green-600 bg-green-500/10", icon: <CheckCircle2Icon className="size-3" /> },
    failed: { label: "Failed", cls: "text-red-500 bg-red-500/10", icon: <XCircleIcon className="size-3" /> },
    stopped: { label: "Stopped", cls: "text-zinc-500 bg-zinc-500/10", icon: <SquareIcon className="size-3" /> },
  };
  const cfg = map[status] ?? map.stopped;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full", cfg.cls)}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

// ── Deployments Tab ──────────────────────────────────────────────────────────

function DeploymentsTab({
  instance,
  activeDeploymentId,
  onSelectDeployment,
}: {
  instance: ScopeInstance;
  activeDeploymentId: string | null;
  onSelectDeployment: (deploymentId: string) => void;
}) {
  const [deployments, setDeployments] = useState<ScopeDeployment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchDeployments = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await scopesApi.listDeployments(instance.id);
      setDeployments(res.deployments);
      setTotal(res.total);
    } catch (err: any) {
      setError(err.message || "Failed to load deployments");
    } finally {
      setLoading(false);
    }
  }, [instance.id]);

  useEffect(() => { fetchDeployments(); }, [fetchDeployments]);

  // Auto-refresh while there's a running deployment
  useEffect(() => {
    const hasRunning = deployments.some((d) => d.status === "running");
    if (!hasRunning) return;
    const interval = setInterval(fetchDeployments, 5000);
    return () => clearInterval(interval);
  }, [deployments, fetchDeployments]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return <p className="text-xs text-red-500 py-8 text-center">{error}</p>;
  }

  if (deployments.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <RocketIcon className="size-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No deployments yet.</p>
        <p className="text-xs mt-1">Deploy this scope instance to see history here.</p>
      </div>
    );
  }

  function formatDuration(start: string, end: string | null) {
    if (!end) return "—";
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (ms < 1000) return `${ms}ms`;
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  }

  function formatTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  return (
    <div className="space-y-3 max-w-3xl">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{total} deployment{total !== 1 ? "s" : ""}</p>
        <button
          onClick={fetchDeployments}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border border-border hover:bg-muted transition-colors"
        >
          <RefreshCwIcon className="size-3" />
          Refresh
        </button>
      </div>

      <div className="rounded-lg border border-border overflow-hidden bg-card divide-y divide-border">
        {deployments.map((d) => (
          <button
            key={d.id}
            onClick={() => onSelectDeployment(d.id)}
            className={cn(
              "w-full flex items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/50",
              activeDeploymentId === d.id && "bg-muted/70",
            )}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <DeploymentStatusBadge status={d.status} />
                <span className="text-xs text-muted-foreground font-mono">{d.id.slice(0, 8)}</span>
              </div>
              <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <ClockIcon className="size-3" />
                  {formatTime(d.startedAt)}
                </span>
                <span>Duration: {formatDuration(d.startedAt, d.finishedAt)}</span>
                {d.imageUrl && (
                  <span className="font-mono truncate max-w-[200px]">{d.imageUrl.split("/").pop()}</span>
                )}
              </div>
              {d.errorMessage && (
                <p className="text-[11px] text-red-400 mt-1 truncate">{d.errorMessage}</p>
              )}
            </div>
            <ChevronRightIcon className="size-4 text-muted-foreground shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Deployment Detail View (real-time SSE logs) ──────────────────────────────

function highlightDeployLine(line: string): React.ReactNode {
  if (!line) return "\n";
  const lower = line.toLowerCase();
  const cls = cn(
    "text-zinc-400",
    lower.includes("error") && "text-red-400",
    lower.includes("warn") && "text-yellow-400",
    (lower.includes("successfully") || lower.includes("complete") || lower.includes("started")) && "text-green-400",
    lower.includes("pulling") && "text-cyan-400",
    lower.includes("image:") && "text-blue-400",
  );
  return <span className={cls}>{line}</span>;
}

function DeploymentDetailView({
  instanceId,
  deploymentId,
  onBack,
}: {
  instanceId: string;
  deploymentId: string;
  onBack: () => void;
}) {
  const [deployment, setDeployment] = useState<ScopeDeployment | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [status, setStatus] = useState<string>("loading");
  const [error, setError] = useState("");
  const terminalRef = useRef<CodeTerminalHandle>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let es: EventSource | null = null;

    // Fetch deployment metadata first
    scopesApi.getDeployment(instanceId, deploymentId).then(({ deployment: dep }) => {
      setDeployment(dep);
      setStatus(dep.status);

      // Connect SSE for live streaming (also replays existing logs)
      es = scopesApi.streamDeploymentLogs(instanceId, deploymentId);

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "log") {
            setLogLines((prev) => [...prev, data.line]);
            setTimeout(() => terminalRef.current?.scrollToBottom(), 50);
          } else if (data.type === "done") {
            setStatus(data.status);
            // Re-fetch deployment for final metadata
            scopesApi.getDeployment(instanceId, deploymentId).then(({ deployment: d }) => setDeployment(d)).catch(() => {});
            es?.close();
          } else if (data.type === "timeout") {
            es?.close();
          }
        } catch { /* ignore parse errors */ }
      };

      es.onerror = () => {
        // If the connection fails, fall back to fetched logs
        if (dep.logs) {
          setLogLines(dep.logs.split("\n").filter(Boolean));
        }
        es?.close();
      };
    }).catch((err) => {
      setError(err.message || "Failed to load deployment");
    });

    return () => { es?.close(); };
  }, [instanceId, deploymentId]);

  function handleCopy() {
    navigator.clipboard.writeText(logLines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (error) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p className="text-sm text-red-500">{error}</p>
        <button onClick={onBack} className="text-sm text-primary hover:underline mt-2">Go back</button>
      </div>
    );
  }

  const isLive = status === "running";

  const titleRight = (
    <div className="flex items-center gap-2">
      {isLive && <span className="text-[9px] text-blue-400 font-mono animate-pulse">STREAMING</span>}
      {status === "success" && <span className="text-[9px] text-green-400 font-mono">COMPLETE</span>}
      {status === "failed" && <span className="text-[9px] text-red-400 font-mono">FAILED</span>}
      <button
        onClick={handleCopy}
        disabled={logLines.length === 0}
        className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50"
      >
        {copied ? <CheckIcon className="size-3 text-green-500" /> : <CopyIcon className="size-3" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronRightIcon className="size-3 rotate-180" />
          All Deployments
        </button>
        <div className="flex-1" />
        {deployment && <DeploymentStatusBadge status={status} />}
        {deployment && (
          <span className="text-[11px] text-muted-foreground font-mono">{deployment.id.slice(0, 8)}</span>
        )}
      </div>

      {/* Metadata row */}
      {deployment && (
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1">
            <ClockIcon className="size-3" />
            {new Date(deployment.startedAt).toLocaleString()}
          </span>
          {deployment.finishedAt && (
            <span>Finished: {new Date(deployment.finishedAt).toLocaleString()}</span>
          )}
          {deployment.imageUrl && (
            <span className="font-mono">{deployment.imageUrl}</span>
          )}
          {deployment.containerId && (
            <span className="font-mono">Container: {deployment.containerId.slice(0, 12)}</span>
          )}
        </div>
      )}

      {/* Error banner */}
      {deployment?.errorMessage && (
        <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 p-3">
          <p className="text-xs font-medium text-red-700 dark:text-red-400 mb-1">Error</p>
          <p className="text-xs text-red-600 dark:text-red-400 font-mono break-all leading-relaxed">{deployment.errorMessage}</p>
        </div>
      )}

      {/* Terminal log viewer */}
      <CodeTerminal
        ref={terminalRef}
        value={logLines.join("\n")}
        highlight={highlightDeployLine}
        title={`deployment ${deploymentId.slice(0, 8)}`}
        titleRight={titleRight}
        loading={logLines.length === 0 && status === "loading"}
        minRows={20}
        maxRows={30}
        className="flex-1 min-h-0"
      />
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
  const tab: InstanceTab = (tabParam === "configuration" || tabParam === "logs" || tabParam === "deployments") ? tabParam : "general";
  const activeDeploymentId = searchParams.get("deployment");

  const setTab = useCallback((t: InstanceTab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (t === "general") next.delete("tab"); else next.set("tab", t);
      if (t !== "deployments") next.delete("deployment");
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const setActiveDeploymentId = useCallback((id: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id) next.set("deployment", id); else next.delete("deployment");
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const [acting, setActing] = useState<string | null>(null);

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
    try {
      const res = await scopesApi.deployInstance(instanceId);
      // Navigate to the deployment detail view with real-time logs
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", "deployments");
        if (res.deploymentId) next.set("deployment", res.deploymentId);
        return next;
      }, { replace: true });
      load(true);
    } catch (err: any) {
      console.error("Deploy failed:", err);
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
    ...(hasContainer && isRunning ? [{ key: "logs" as InstanceTab, label: "Logs", icon: <TerminalIcon className="size-3.5" /> }] : []),
    ...(isManaged ? [{ key: "deployments" as InstanceTab, label: "Deployments", icon: <RocketIcon className="size-3.5" /> }] : []),
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
        {tab === "logs" && hasContainer && isRunning && <LogsTab key={instance.containerId} instance={instance} />}
        {tab === "deployments" && !activeDeploymentId && (
          <DeploymentsTab
            instance={instance}
            activeDeploymentId={activeDeploymentId}
            onSelectDeployment={(id) => setActiveDeploymentId(id)}
          />
        )}
        {tab === "deployments" && activeDeploymentId && (
          <DeploymentDetailView
            instanceId={instance.id}
            deploymentId={activeDeploymentId}
            onBack={() => setActiveDeploymentId(null)}
          />
        )}
      </div>
    </div>
  );
}
