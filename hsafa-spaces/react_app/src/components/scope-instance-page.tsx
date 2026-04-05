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
  InfoIcon,
  RefreshCwIcon,
  CopyIcon,
  CheckIcon,
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

function getDefaultValue(field: ConfigFieldSchema): string {
  if (field.type === "boolean") return field.default === true ? "true" : "false";
  if (field.default !== undefined) return String(field.default);
  return "";
}

// ── Tab types ─────────────────────────────────────────────────────────────────

type InstanceTab = "overview" | "config" | "logs" | "actions";

// ── Container Status Badge ────────────────────────────────────────────────────

function ContainerStatusBadge({ status, connected }: { status: string; connected?: boolean }) {
  const configs: Record<string, { icon: React.ReactNode; label: string; cls: string }> = {
    running: { icon: <CheckCircle2Icon className="size-3" />, label: connected ? "Connected" : "Running", cls: connected ? "text-green-600" : "text-blue-500" },
    starting: { icon: <Loader2Icon className="size-3 animate-spin" />, label: "Starting", cls: "text-blue-500" },
    building: { icon: <Loader2Icon className="size-3 animate-spin" />, label: "Building", cls: "text-amber-500" },
    stopped: { icon: <XCircleIcon className="size-3" />, label: "Stopped", cls: "text-muted-foreground" },
    error: { icon: <XCircleIcon className="size-3" />, label: "Error", cls: "text-red-500" },
    removing: { icon: <Loader2Icon className="size-3 animate-spin" />, label: "Removing", cls: "text-muted-foreground" },
  };
  const cfg = configs[status] ?? configs.stopped;
  return <span className={cn("flex items-center gap-1 text-xs font-medium", cfg.cls)}>{cfg.icon} {cfg.label}</span>;
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({ instance }: { instance: ScopeInstance }) {
  const tools = (instance.template.tools ?? []) as Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;

  return (
    <div className="space-y-6">
      {/* Info cards grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="p-4 rounded-xl border border-border bg-card">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Scope Name</p>
          <p className="text-sm font-mono">{instance.scopeName}</p>
        </div>
        <div className="p-4 rounded-xl border border-border bg-card">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Deployment</p>
          <p className="text-sm capitalize">{instance.deploymentType}</p>
        </div>
        <div className="p-4 rounded-xl border border-border bg-card">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Container</p>
          <ContainerStatusBadge status={instance.containerStatus ?? "stopped"} connected={instance.connected} />
          {instance.containerId && (
            <p className="text-[10px] text-muted-foreground font-mono mt-1">{instance.containerId.slice(0, 12)}</p>
          )}
        </div>
        <div className="p-4 rounded-xl border border-border bg-card">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Created</p>
          <p className="text-sm">{new Date(instance.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</p>
        </div>
      </div>

      {/* Description */}
      {instance.description && (
        <div className="p-4 rounded-xl border border-border bg-card">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Description</p>
          <p className="text-sm text-muted-foreground">{instance.description}</p>
        </div>
      )}

      {/* Image info */}
      {instance.imageUrl && (
        <div className="p-4 rounded-xl border border-border bg-card">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Image</p>
          <p className="text-xs font-mono text-muted-foreground break-all">{instance.imageUrl}</p>
        </div>
      )}

      {/* Template */}
      <section>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Template</h2>
        <div className="p-4 rounded-xl border border-border bg-card">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center size-9 rounded-lg bg-primary/10 text-primary">
              <ScopeIcon icon={instance.template.icon} />
            </div>
            <div>
              <p className="text-sm font-medium">{instance.template.name}</p>
              <p className="text-xs text-muted-foreground">{instance.template.slug} · {instance.template.category}</p>
            </div>
          </div>
          {instance.template.requiredProfileFields && instance.template.requiredProfileFields.length > 0 && (
            <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
              Required profile fields: {instance.template.requiredProfileFields.join(", ")}
            </p>
          )}
        </div>
      </section>

      {/* Tools */}
      <section>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <WrenchIcon className="size-3.5" /> Tools ({tools.length})
        </h2>
        {tools.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tools registered.</p>
        ) : (
          <div className="grid gap-2">
            {tools.map((tool) => (
              <div key={tool.name} className="p-3 rounded-xl border border-border bg-card">
                <p className="text-sm font-mono font-medium">{tool.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{tool.description}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Config Tab ────────────────────────────────────────────────────────────────

function ConfigTab({
  instance,
  onSaved,
}: {
  instance: ScopeInstance;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [editName, setEditName] = useState(instance.name);
  const [editDescription, setEditDescription] = useState(instance.description || "");
  const [editActive, setEditActive] = useState(instance.active);
  const [editConfigs, setEditConfigs] = useState<Record<string, string>>(() => {
    const cfgValues: Record<string, string> = {};
    for (const c of instance.configs) {
      cfgValues[c.key] = c.isSecret ? "" : (c.value ?? "");
    }
    return cfgValues;
  });
  const [revealedSecrets, setRevealedSecrets] = useState<Set<string>>(new Set());

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
        name: editName.trim(),
        description: editDescription.trim() || undefined,
        active: editActive,
        configs: configs.length > 0 ? configs : undefined,
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

  return (
    <div className="space-y-6 max-w-2xl">
      {/* General */}
      <section>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">General</h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              disabled={isBuiltIn}
              className={cn(
                "mt-1 w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30",
                isBuiltIn && "opacity-60 cursor-not-allowed",
              )}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              disabled={isBuiltIn}
              className={cn(
                "mt-1 w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none",
                isBuiltIn && "opacity-60 cursor-not-allowed",
              )}
              rows={2}
            />
          </div>
          {!isBuiltIn && (
            <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-card">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">Enable or disable this scope instance</p>
              </div>
              <button
                onClick={() => setEditActive(!editActive)}
                className={cn("transition-colors", editActive ? "text-green-500" : "text-muted-foreground")}
              >
                {editActive ? <ToggleRightIcon className="size-7" /> : <ToggleLeftIcon className="size-7" />}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Configuration fields */}
      {(hasConfigSchema || instance.configs.length > 0) && !isBuiltIn && (
        <section>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Configuration</h2>
          <div className="space-y-3">
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
                  <div key={key} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card">
                    <div>
                      <p className="text-sm font-mono">
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

              if (fieldType === "number") {
                return (
                  <div key={key} className="p-3 rounded-lg border border-border bg-card">
                    <label className="text-sm font-mono">
                      {key}
                      {isRequired && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
                    <input
                      type="number"
                      value={editConfigs[key] ?? ""}
                      onChange={(e) => setConfigValue(key, e.target.value)}
                      placeholder={placeholder}
                      className="mt-2 w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                );
              }

              if (isSecret) {
                const revealed = revealedSecrets.has(key);
                return (
                  <div key={key} className="p-3 rounded-lg border border-border bg-card">
                    <label className="text-sm font-mono">
                      {key}
                      {isRequired && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
                    <div className="relative mt-2">
                      <input
                        type={revealed ? "text" : "password"}
                        value={editConfigs[key] ?? ""}
                        onChange={(e) => setConfigValue(key, e.target.value)}
                        placeholder={existingCfg?.hasValue ? "••••••••  (leave empty to keep)" : placeholder}
                        className="w-full px-3 py-2 pr-10 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      <button
                        type="button"
                        onClick={() => toggleReveal(key)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                      >
                        {revealed ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div key={key} className="p-3 rounded-lg border border-border bg-card">
                  <label className="text-sm font-mono">
                    {key}
                    {isRequired && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
                  <input
                    type="text"
                    value={editConfigs[key] ?? ""}
                    onChange={(e) => setConfigValue(key, e.target.value)}
                    placeholder={placeholder}
                    className="mt-2 w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Save */}
      {error && <p className="text-xs text-red-500">{error}</p>}
      {success && <p className="text-xs text-green-500">{success}</p>}

      {!isBuiltIn && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 text-sm rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2Icon className="size-4 animate-spin" /> : <SaveIcon className="size-4" />}
          Save Changes
        </button>
      )}
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

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

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
      <div className="text-center py-12 text-muted-foreground">
        <TerminalIcon className="size-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm">Logs not available for this deployment type.</p>
      </div>
    );
  }

  if (!hasContainer) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <TerminalIcon className="size-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm">No container running.</p>
        <p className="text-xs mt-1">Deploy the instance to see logs.</p>
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
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-muted text-foreground hover:bg-muted/80 transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2Icon className="size-3 animate-spin" /> : <RefreshCwIcon className="size-3" />}
          Refresh
        </button>
        <button
          onClick={() => setAutoRefresh(!autoRefresh)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors",
            autoRefresh ? "bg-green-500/10 text-green-600" : "bg-muted text-muted-foreground hover:text-foreground",
          )}
        >
          {autoRefresh ? <ToggleRightIcon className="size-3.5" /> : <ToggleLeftIcon className="size-3.5" />}
          Auto-refresh
        </button>
        <select
          value={tail}
          onChange={(e) => setTail(Number(e.target.value))}
          className="px-2 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground"
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
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          {copied ? <CheckIcon className="size-3 text-green-500" /> : <CopyIcon className="size-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Terminal */}
      <div className="flex-1 min-h-0 rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950 flex flex-col">
        {/* Terminal title bar */}
        <div className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border-b border-zinc-800">
          <div className="flex gap-1.5">
            <div className="size-3 rounded-full bg-red-500/80" />
            <div className="size-3 rounded-full bg-yellow-500/80" />
            <div className="size-3 rounded-full bg-green-500/80" />
          </div>
          <span className="text-[10px] text-zinc-500 font-mono ml-2">{instance.scopeName} — logs</span>
        </div>
        {/* Log content */}
        <div className="flex-1 overflow-auto p-4 font-mono text-[12px] leading-[1.6] min-h-[400px] max-h-[600px]">
          {logs === null ? (
            <div className="flex items-center justify-center h-full">
              <Loader2Icon className="size-5 animate-spin text-zinc-600" />
            </div>
          ) : (
            <>
              {logs.split("\n").map((line, i) => (
                <div key={i} className="hover:bg-zinc-900/50 px-1 -mx-1 rounded">
                  <span className="text-zinc-600 select-none mr-3 inline-block w-8 text-right">{i + 1}</span>
                  <span className={cn(
                    "text-zinc-300",
                    line.toLowerCase().includes("error") && "text-red-400",
                    line.toLowerCase().includes("warn") && "text-yellow-400",
                    (line.toLowerCase().includes("info") || line.toLowerCase().includes("connected")) && "text-green-400",
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

// ── Actions Tab ───────────────────────────────────────────────────────────────

function ActionsTab({
  instance,
  onRefresh,
  onDelete,
}: {
  instance: ScopeInstance;
  onRefresh: () => void;
  onDelete: () => void;
}) {
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const isManaged = instance.deploymentType === "platform" || instance.deploymentType === "custom";
  const hasContainer = !!instance.containerId;
  const isRunning = instance.containerStatus === "running";
  const isStopped = instance.containerStatus === "stopped";
  const isError = instance.containerStatus === "error";
  const isBuiltIn = !!(instance as any).builtIn;

  async function act(action: string, label: string, fn: () => Promise<unknown>) {
    setActing(action);
    setError("");
    setSuccess("");
    try {
      await fn();
      setSuccess(`${label} succeeded`);
      setTimeout(() => setSuccess(""), 3000);
      onRefresh();
    } catch (err: any) {
      setError(err.message || `Failed to ${action}`);
    } finally {
      setActing(null);
    }
  }

  if (!isManaged && instance.deploymentType !== "external") {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <InfoIcon className="size-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm">No lifecycle actions available for built-in scopes.</p>
      </div>
    );
  }

  if (instance.deploymentType === "external") {
    return (
      <div className="space-y-6 max-w-lg">
        <div className="p-4 rounded-xl border border-border bg-card">
          <p className="text-sm font-medium mb-1">External Scope</p>
          <p className="text-xs text-muted-foreground">
            This scope is managed outside this platform. Status updates when the service connects to Core.
          </p>
        </div>
        {!isBuiltIn && (
          <DangerZone
            instanceName={instance.name}
            acting={acting}
            onDelete={() => act("delete", "Delete", () => { return scopesApi.deleteInstance(instance.id).then(() => onDelete()); })}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-lg">
      {/* Container status card */}
      <div className="p-4 rounded-xl border border-border bg-card">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Container Status</p>
        <ContainerStatusBadge status={instance.containerStatus ?? "stopped"} connected={instance.connected} />
        {instance.statusMessage && (
          <p className="text-xs text-red-400 mt-2">{instance.statusMessage}</p>
        )}
        {instance.imageUrl && (
          <p className="text-[10px] text-muted-foreground font-mono mt-2 break-all">Image: {instance.imageUrl}</p>
        )}
      </div>

      {/* Action buttons */}
      <div className="grid gap-3 sm:grid-cols-2">
        {/* Deploy / Re-deploy */}
        {(!hasContainer || isStopped || isError) && instance.imageUrl && (
          <button
            onClick={() => act("deploy", "Deploy", () => scopesApi.deployInstance(instance.id))}
            disabled={!!acting}
            className="flex items-center gap-2 p-4 rounded-xl border border-border bg-card hover:border-primary/30 hover:bg-muted/50 transition-colors disabled:opacity-50 text-left"
          >
            <div className="flex items-center justify-center size-9 rounded-lg bg-primary/10 text-primary">
              {acting === "deploy" ? <Loader2Icon className="size-4 animate-spin" /> : <RocketIcon className="size-4" />}
            </div>
            <div>
              <p className="text-sm font-medium">{hasContainer ? "Re-deploy" : "Deploy"}</p>
              <p className="text-xs text-muted-foreground">Build and start container</p>
            </div>
          </button>
        )}

        {/* Start */}
        {hasContainer && isStopped && (
          <button
            onClick={() => act("start", "Start", () => scopesApi.startInstance(instance.id))}
            disabled={!!acting}
            className="flex items-center gap-2 p-4 rounded-xl border border-border bg-card hover:border-green-500/30 hover:bg-green-500/5 transition-colors disabled:opacity-50 text-left"
          >
            <div className="flex items-center justify-center size-9 rounded-lg bg-green-500/10 text-green-600">
              {acting === "start" ? <Loader2Icon className="size-4 animate-spin" /> : <PlayIcon className="size-4" />}
            </div>
            <div>
              <p className="text-sm font-medium">Start</p>
              <p className="text-xs text-muted-foreground">Start the stopped container</p>
            </div>
          </button>
        )}

        {/* Stop */}
        {hasContainer && isRunning && (
          <button
            onClick={() => act("stop", "Stop", () => scopesApi.stopInstance(instance.id))}
            disabled={!!acting}
            className="flex items-center gap-2 p-4 rounded-xl border border-border bg-card hover:border-yellow-500/30 hover:bg-yellow-500/5 transition-colors disabled:opacity-50 text-left"
          >
            <div className="flex items-center justify-center size-9 rounded-lg bg-yellow-500/10 text-yellow-600">
              {acting === "stop" ? <Loader2Icon className="size-4 animate-spin" /> : <SquareIcon className="size-4" />}
            </div>
            <div>
              <p className="text-sm font-medium">Stop</p>
              <p className="text-xs text-muted-foreground">Stop the running container</p>
            </div>
          </button>
        )}

        {/* Restart */}
        {hasContainer && isRunning && (
          <button
            onClick={() => act("restart", "Restart", () => scopesApi.restartInstance(instance.id))}
            disabled={!!acting}
            className="flex items-center gap-2 p-4 rounded-xl border border-border bg-card hover:border-blue-500/30 hover:bg-blue-500/5 transition-colors disabled:opacity-50 text-left"
          >
            <div className="flex items-center justify-center size-9 rounded-lg bg-blue-500/10 text-blue-500">
              {acting === "restart" ? <Loader2Icon className="size-4 animate-spin" /> : <RotateCwIcon className="size-4" />}
            </div>
            <div>
              <p className="text-sm font-medium">Restart</p>
              <p className="text-xs text-muted-foreground">Restart the container</p>
            </div>
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 px-3 py-2 rounded-lg">{error}</p>}
      {success && <p className="text-xs text-green-500 bg-green-50 dark:bg-green-950/20 px-3 py-2 rounded-lg">{success}</p>}

      {/* Danger zone */}
      {!isBuiltIn && (
        <DangerZone
          instanceName={instance.name}
          acting={acting}
          onDelete={() => act("delete", "Delete", () => { return scopesApi.deleteInstance(instance.id).then(() => onDelete()); })}
        />
      )}
    </div>
  );
}

function DangerZone({ instanceName, acting, onDelete }: { instanceName: string; acting: string | null; onDelete: () => void }) {
  return (
    <div className="rounded-xl border border-red-200 dark:border-red-900/50 overflow-hidden">
      <div className="px-4 py-3 bg-red-50 dark:bg-red-950/20 border-b border-red-200 dark:border-red-900/50">
        <p className="text-sm font-medium text-red-700 dark:text-red-400">Danger Zone</p>
      </div>
      <div className="p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Delete this instance</p>
          <p className="text-xs text-muted-foreground">This will stop and remove the container permanently.</p>
        </div>
        <button
          onClick={() => {
            if (!confirm(`Delete instance "${instanceName}"? This cannot be undone.`)) return;
            onDelete();
          }}
          disabled={!!acting}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-red-300 dark:border-red-800 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors disabled:opacity-50"
        >
          {acting === "delete" ? <Loader2Icon className="size-3 animate-spin" /> : <TrashIcon className="size-3" />}
          Delete
        </button>
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
  const [tab, setTab] = useState<InstanceTab>("overview");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { instance: inst } = await scopesApi.getInstance(instanceId);
      setInstance(inst);
    } catch (err) {
      console.error("Failed to load instance:", err);
      setError("Failed to load scope instance");
    } finally {
      setLoading(false);
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

  const isRunning = (instance.containerStatus ?? "stopped") === "running";

  const tabs: { key: InstanceTab; label: string; icon: React.ReactNode }[] = [
    { key: "overview", label: "Overview", icon: <InfoIcon className="size-4" /> },
    { key: "config", label: "Config", icon: <SettingsIcon className="size-4" /> },
    { key: "logs", label: "Logs", icon: <TerminalIcon className="size-4" /> },
    { key: "actions", label: "Actions", icon: <RocketIcon className="size-4" /> },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
          <ArrowLeftIcon className="size-4" />
        </button>
        <div className={cn(
          "flex items-center justify-center size-9 rounded-lg",
          isRunning && instance.connected ? "bg-green-500/10 text-green-600"
            : isRunning ? "bg-blue-500/10 text-blue-500"
            : "bg-primary/10 text-primary",
        )}>
          <ScopeIcon icon={instance.template.icon} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-lg truncate">{instance.name}</h1>
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground font-mono">{instance.scopeName}</p>
            <span className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-medium uppercase">
              {instance.deploymentType}
            </span>
          </div>
        </div>
        <span className={cn(
          "flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium",
          instance.active ? "bg-green-500/10 text-green-600" : "bg-muted text-muted-foreground",
        )}>
          {instance.active ? <CheckCircle2Icon className="size-3" /> : <XCircleIcon className="size-3" />}
          {instance.active ? "Active" : "Inactive"}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-6 py-2 border-b border-border bg-muted/30">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              tab === t.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50",
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {error && <p className="text-xs text-red-500 mb-4">{error}</p>}
        {tab === "overview" && <OverviewTab instance={instance} />}
        {tab === "config" && <ConfigTab instance={instance} onSaved={load} />}
        {tab === "logs" && <LogsTab instance={instance} />}
        {tab === "actions" && <ActionsTab instance={instance} onRefresh={load} onDelete={onBack} />}
      </div>
    </div>
  );
}
