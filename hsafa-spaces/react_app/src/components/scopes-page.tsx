import { useState, useEffect, useCallback } from "react";
import {
  PuzzleIcon,
  PlusIcon,
  SearchIcon,
  ChevronRightIcon,
  WrenchIcon,
  CheckCircle2Icon,
  XCircleIcon,
  Loader2Icon,
  MessageSquareIcon,
  CalendarIcon,
  PlugIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  scopesApi,
  type ScopeTemplate,
  type ScopeInstance,
  type CoreScopeStatus,
} from "@/lib/api";

// ── Icon resolver ────────────────────────────────────────────────────────────

function ScopeIcon({ icon, className }: { icon: string | null; className?: string }) {
  const cls = cn("size-5", className);
  switch (icon) {
    case "MessageSquare": return <MessageSquareIcon className={cls} />;
    case "Calendar": return <CalendarIcon className={cls} />;
    case "Plug": return <PlugIcon className={cls} />;
    default: return <PuzzleIcon className={cls} />;
  }
}

// ── Main Page ────────────────────────────────────────────────────────────────

interface ScopesPageProps {
  onNavigateToInstance?: (instanceId: string) => void;
  onNavigateToTemplate?: (templateId: string) => void;
}

export function ScopesPage({ onNavigateToInstance, onNavigateToTemplate }: ScopesPageProps) {
  const [tab, setTab] = useState<"instances" | "templates">("instances");
  const [templates, setTemplates] = useState<ScopeTemplate[]>([]);
  const [instances, setInstances] = useState<ScopeInstance[]>([]);
  const [statuses, setStatuses] = useState<CoreScopeStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ScopeTemplate | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, iRes, sRes] = await Promise.all([
        scopesApi.listTemplates(),
        scopesApi.listInstances(),
        scopesApi.getStatus().catch(() => ({ scopes: [] })),
      ]);
      setTemplates(tRes.templates);
      setInstances(iRes.instances);
      setStatuses(sRes.scopes);
    } catch (err) {
      console.error("Failed to load scopes:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const statusMap = new Map(statuses.map((s) => [s.name, s]));

  // ── Filtered lists ─────────────────────────────────────────────────────
  const filteredInstances = instances.filter((i) =>
    !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.scopeName.toLowerCase().includes(search.toLowerCase()),
  );
  const filteredTemplates = templates.filter((t) =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.slug.toLowerCase().includes(search.toLowerCase()),
  );

  // ── Create instance handler ────────────────────────────────────────────
  function openCreateFromTemplate(template: ScopeTemplate) {
    setSelectedTemplate(template);
    setShowCreateModal(true);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <PuzzleIcon className="size-6 text-primary" />
          <h1 className="text-xl font-semibold">Scopes</h1>
        </div>
      </div>

      {/* Tabs + Search */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border">
        <div className="flex gap-1 bg-muted rounded-lg p-0.5">
          <button
            onClick={() => setTab("instances")}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              tab === "instances" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            My Instances
          </button>
          <button
            onClick={() => setTab("templates")}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              tab === "templates" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Templates
          </button>
        </div>
        <div className="flex-1" />
        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 w-52"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : tab === "instances" ? (
          <InstancesList
            instances={filteredInstances}
            statusMap={statusMap}
            onNavigate={onNavigateToInstance}
          />
        ) : (
          <TemplatesList
            templates={filteredTemplates}
            onCreateFrom={openCreateFromTemplate}
            onNavigate={onNavigateToTemplate}
          />
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && selectedTemplate && (
        <CreateInstanceModal
          template={selectedTemplate}
          onClose={() => { setShowCreateModal(false); setSelectedTemplate(null); }}
          onCreated={() => { setShowCreateModal(false); setSelectedTemplate(null); load(); }}
        />
      )}
    </div>
  );
}

// ── Instances List ───────────────────────────────────────────────────────────

function InstancesList({
  instances,
  statusMap,
  onNavigate,
}: {
  instances: ScopeInstance[];
  statusMap: Map<string, CoreScopeStatus>;
  onNavigate?: (id: string) => void;
}) {
  if (instances.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <PuzzleIcon className="size-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm">No scope instances yet.</p>
        <p className="text-xs mt-1">Browse templates to create one.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {instances.map((inst) => {
        const status = statusMap.get(inst.scopeName);
        const connected = status?.connected ?? false;

        return (
          <button
            key={inst.id}
            onClick={() => onNavigate?.(inst.id)}
            className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:bg-muted/50 transition-colors text-left group"
          >
            <div className={cn(
              "flex items-center justify-center size-10 rounded-lg",
              connected ? "bg-green-500/10 text-green-600" : "bg-muted text-muted-foreground",
            )}>
              <ScopeIcon icon={inst.template.icon} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm truncate">{inst.name}</span>
                <span className="text-xs text-muted-foreground font-mono">({inst.scopeName})</span>
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-xs text-muted-foreground">{inst.template.name}</span>
                {inst.active ? (
                  <span className="flex items-center gap-1 text-xs">
                    {connected ? (
                      <><CheckCircle2Icon className="size-3 text-green-500" /> Connected</>
                    ) : (
                      <><XCircleIcon className="size-3 text-yellow-500" /> Disconnected</>
                    )}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Inactive</span>
                )}
              </div>
            </div>

            <ChevronRightIcon className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        );
      })}
    </div>
  );
}

// ── Templates List ───────────────────────────────────────────────────────────

function TemplatesList({
  templates,
  onCreateFrom,
  onNavigate,
}: {
  templates: ScopeTemplate[];
  onCreateFrom: (t: ScopeTemplate) => void;
  onNavigate?: (id: string) => void;
}) {
  if (templates.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-sm">No templates available.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {templates.map((tmpl) => (
        <div
          key={tmpl.id}
          className="flex flex-col p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-colors"
        >
          <div className="flex items-start gap-3">
            <div className="flex items-center justify-center size-10 rounded-lg bg-primary/10 text-primary shrink-0">
              <ScopeIcon icon={tmpl.icon} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-sm">{tmpl.name}</h3>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{tmpl.description}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <WrenchIcon className="size-3" /> {tmpl.tools.length} tools
            </span>
            {tmpl.requiredProfileFields.length > 0 && (
              <span>Requires: {tmpl.requiredProfileFields.join(", ")}</span>
            )}
            <span className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-medium uppercase">
              {tmpl.category}
            </span>
          </div>

          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
            <button
              onClick={() => onNavigate?.(tmpl.id)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              View Details
            </button>
            <div className="flex-1" />
            <button
              onClick={() => onCreateFrom(tmpl)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
            >
              <PlusIcon className="size-3" /> Create Instance
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Create Instance Modal ────────────────────────────────────────────────────

function CreateInstanceModal({
  template,
  onClose,
  onCreated,
}: {
  template: ScopeTemplate;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState(template.name);
  const [scopeName, setScopeName] = useState(template.slug);
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  // Config fields from template's configSchema
  const configProperties = (template.configSchema as any)?.properties ?? {};
  const configRequired = (template.configSchema as any)?.required ?? [];
  const configKeys = Object.keys(configProperties);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});

  async function handleCreate() {
    setError("");
    if (!name.trim()) { setError("Name is required"); return; }
    if (!scopeName.trim()) { setError("Scope name is required"); return; }

    setCreating(true);
    try {
      const configs = configKeys.map((key) => ({
        key,
        value: configValues[key] || "",
        isSecret: configProperties[key]?.format === "password" || configProperties[key]?.sensitive === true,
      })).filter((c) => c.value);

      await scopesApi.createInstance({
        templateId: template.id,
        name: name.trim(),
        scopeName: scopeName.trim(),
        description: description.trim() || undefined,
        configs: configs.length > 0 ? configs : undefined,
      });

      onCreated();
    } catch (err: any) {
      setError(err.message || "Failed to create instance");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex items-center justify-center size-10 rounded-lg bg-primary/10 text-primary">
              <ScopeIcon icon={template.icon} />
            </div>
            <div>
              <h2 className="font-semibold">Create {template.name} Instance</h2>
              <p className="text-xs text-muted-foreground">From template: {template.slug}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Instance Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="My Spaces"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Scope Name (unique identifier)</label>
              <input
                type="text"
                value={scopeName}
                onChange={(e) => setScopeName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-border bg-background font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="my-spaces"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Description (optional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                rows={2}
                placeholder="Optional description..."
              />
            </div>

            {/* Dynamic config fields from template's configSchema */}
            {configKeys.length > 0 && (
              <div className="pt-2 border-t border-border">
                <h3 className="text-xs font-medium text-muted-foreground mb-3">Configuration</h3>
                {configKeys.map((key) => {
                  const prop = configProperties[key];
                  const isRequired = configRequired.includes(key);
                  const isSecret = prop?.format === "password" || prop?.sensitive === true;
                  return (
                    <div key={key} className="mb-3">
                      <label className="text-xs font-medium text-muted-foreground">
                        {prop?.title || key}{isRequired && <span className="text-red-500 ml-0.5">*</span>}
                        {isSecret && <span className="text-xs text-yellow-600 ml-1">(secret)</span>}
                      </label>
                      {prop?.description && (
                        <p className="text-[10px] text-muted-foreground">{prop.description}</p>
                      )}
                      <input
                        type={isSecret ? "password" : "text"}
                        value={configValues[key] || ""}
                        onChange={(e) => setConfigValues({ ...configValues, [key]: e.target.value })}
                        className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                        placeholder={prop?.default || ""}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {error && (
              <p className="text-xs text-red-500">{error}</p>
            )}
          </div>

          <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {creating && <Loader2Icon className="size-4 animate-spin" />}
              Create
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
