import { useState, useEffect, useCallback, useMemo } from "react";
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

// ── Main Component ───────────────────────────────────────────────────────────

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
  const [editConfigs, setEditConfigs] = useState<Record<string, string>>({});
  const [revealedSecrets, setRevealedSecrets] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { instance: inst } = await scopesApi.getInstance(instanceId);
      setInstance(inst);
      setEditName(inst.name);
      setEditDescription(inst.description || "");
      setEditActive(inst.active);

      // Build initial config values from existing configs
      const cfgValues: Record<string, string> = {};
      for (const c of inst.configs) {
        cfgValues[c.key] = c.isSecret ? "" : (c.value ?? "");
      }
      setEditConfigs(cfgValues);
      setRevealedSecrets(new Set());
    } catch (err) {
      console.error("Failed to load instance:", err);
      setError("Failed to load scope instance");
    } finally {
      setLoading(false);
    }
  }, [instanceId]);

  useEffect(() => { load(); }, [load]);

  // Parse the config schema from the template
  const { fields: schemaFields, required: requiredKeys } = useMemo(
    () => parseConfigSchema(instance?.template.configSchema as Record<string, unknown> | undefined),
    [instance],
  );
  const hasConfigSchema = Object.keys(schemaFields).length > 0;

  // Merged config keys: schema fields + any existing configs not in schema
  const configKeys = useMemo(() => {
    const keys = new Set(Object.keys(schemaFields));
    for (const c of instance?.configs ?? []) keys.add(c.key);
    return [...keys];
  }, [schemaFields, instance]);

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
    if (!instance) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      // Build configs array — only include keys that have a value or were changed
      const configs: Array<{ key: string; value: string; isSecret?: boolean }> = [];
      for (const key of configKeys) {
        const val = editConfigs[key];
        if (val === undefined || val === "") continue; // skip empty (don't overwrite secrets with empty)
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
  const isBuiltIn = !!(instance as any).builtIn;

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
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">Active</label>
                <button
                  onClick={() => setEditActive(!editActive)}
                  className={cn("transition-colors", editActive ? "text-green-500" : "text-muted-foreground")}
                >
                  {editActive ? <ToggleRightIcon className="size-6" /> : <ToggleLeftIcon className="size-6" />}
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Configuration */}
        {(hasConfigSchema || instance.configs.length > 0) && !isBuiltIn && (
          <section>
            <h2 className="text-sm font-semibold mb-3">Configuration</h2>
            <div className="space-y-3">
              {configKeys.map((key) => {
                const field = schemaFields[key];
                const existingCfg = instance.configs.find((c) => c.key === key);
                const isSecret = field?.secret ?? existingCfg?.isSecret ?? false;
                const isRequired = requiredKeys.includes(key);
                const fieldType = field?.type ?? "string";
                const description = field?.description;
                const placeholder = field?.default !== undefined ? `Default: ${field.default}` : "";

                // Boolean field → checkbox
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

                // Number field
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

                // Secret string field
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

                // Default: text string field
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

        {/* Errors / Success */}
        {error && <p className="text-xs text-red-500">{error}</p>}
        {success && <p className="text-xs text-green-500">{success}</p>}

        {/* Actions */}
        {!isBuiltIn && (
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
        )}
      </div>
    </div>
  );
}
