import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  skillsApi,
  haseefsApi,
  type SkillTemplate,
  type SkillInstance,
  type HaseefSkill,
  type HaseefListItem,
} from "../lib/api.js";
import {
  Wrench,
  Plus,
  X,
  Bot,
  Sparkles,
  Database,
  Clock,
  Loader2,
  Trash2,
  AlertCircle,
  Wifi,
  WifiOff,
  ArrowLeft,
  ChevronRight,
  Zap,
} from "lucide-react";

// ── Shared helpers ───────────────────────────────────────────────────────────

function getCategoryIcon(category: string | null) {
  if (category === "data") return Database;
  if (category === "automation") return Clock;
  return Sparkles;
}

function StatusBadge({ status, connected }: { status: string; connected?: boolean }) {
  if (status === "active" && connected) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs rounded-full">
        <Wifi className="w-3 h-3" /> Connected
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 text-xs rounded-full">
        <WifiOff className="w-3 h-3" /> Disconnected
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-xs rounded-full">
        <AlertCircle className="w-3 h-3" /> Error
      </span>
    );
  }
  return (
    <span className="px-1.5 py-0.5 bg-muted text-muted-foreground text-xs rounded-full">
      {status}
    </span>
  );
}

// ── Page 1: My Skills ────────────────────────────────────────────────────────

function InstanceCard({
  instance,
  haseefs,
  attachedHaseefs,
  onDelete,
  onAttach,
  onDetach,
}: {
  instance: SkillInstance;
  haseefs: HaseefListItem[];
  attachedHaseefs: string[];
  onDelete: (id: string) => void;
  onAttach: (instanceId: string, haseefId: string) => void;
  onDetach: (instanceId: string, haseefId: string) => void;
}) {
  const [showAttach, setShowAttach] = useState(false);
  const Icon = getCategoryIcon(instance.template.category);

  return (
    <div className="bg-card border rounded-xl p-5 hover:shadow-md transition-all">
      <div className="flex items-start gap-3">
        <div className="p-2.5 bg-primary/10 rounded-xl">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold">{instance.displayName}</h3>
            <StatusBadge status={instance.status} connected={instance.connected} />
          </div>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">{instance.name}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {instance.template.displayName} &middot; {instance.template.toolDefinitions.length} tools
          </p>
          {instance.statusMessage && (
            <p className="text-xs text-destructive mt-1">{instance.statusMessage}</p>
          )}
        </div>
        <button
          onClick={() => onDelete(instance.id)}
          className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
          title="Delete instance"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Attached Haseefs */}
      <div className="mt-4 pt-3 border-t space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Attached to</span>
          {haseefs.length > 0 && (
            <button
              onClick={() => setShowAttach(!showAttach)}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              Attach
            </button>
          )}
        </div>

        {attachedHaseefs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No haseefs attached</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {attachedHaseefs.map((haseefId) => {
              const haseef = haseefs.find((h) => h.haseefId === haseefId);
              if (!haseef) return null;
              return (
                <span
                  key={haseefId}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-secondary text-secondary-foreground text-xs rounded-full"
                >
                  <Bot className="w-3 h-3" />
                  {haseef.name}
                  <button
                    onClick={() => onDetach(instance.id, haseefId)}
                    className="ml-0.5 p-0.5 hover:bg-secondary-foreground/10 rounded"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}

        {showAttach && (
          <div className="mt-2 p-2 border rounded-lg bg-background">
            <div className="space-y-0.5">
              {haseefs
                .filter((h) => !attachedHaseefs.includes(h.haseefId))
                .map((haseef) => (
                  <button
                    key={haseef.haseefId}
                    onClick={() => {
                      onAttach(instance.id, haseef.haseefId);
                      setShowAttach(false);
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-secondary rounded-lg text-left transition-colors"
                  >
                    <Bot className="w-4 h-4 text-muted-foreground" />
                    {haseef.name}
                  </button>
                ))}
              {haseefs.filter((h) => !attachedHaseefs.includes(h.haseefId)).length === 0 && (
                <p className="text-sm text-muted-foreground px-2 py-1">All haseefs attached</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function SkillsPage() {
  const navigate = useNavigate();
  const [instances, setInstances] = useState<SkillInstance[]>([]);
  const [haseefSkills, setHaseefSkills] = useState<Record<string, HaseefSkill[]>>({});
  const [haseefs, setHaseefs] = useState<HaseefListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    setError(null);
    try {
      const [instancesRes, haseefsRes] = await Promise.all([
        skillsApi.listInstances(),
        haseefsApi.list(),
      ]);

      setInstances(instancesRes.instances);
      setHaseefs(haseefsRes.haseefs);

      const haseefSkillsMap: Record<string, HaseefSkill[]> = {};
      await Promise.all(
        haseefsRes.haseefs.map(async (haseef) => {
          try {
            const res = await skillsApi.listForHaseef(haseef.haseefId);
            haseefSkillsMap[haseef.haseefId] = res.skills;
          } catch {
            haseefSkillsMap[haseef.haseefId] = [];
          }
        })
      );
      setHaseefSkills(haseefSkillsMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load skills");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete(instanceId: string) {
    if (!confirm("Delete this skill instance? This will disconnect it from all haseefs.")) return;
    try {
      await skillsApi.deleteInstance(instanceId);
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete instance");
    }
  }

  async function handleAttach(instanceId: string, haseefId: string) {
    try {
      await skillsApi.attachToHaseef(instanceId, haseefId);
      const res = await skillsApi.listForHaseef(haseefId);
      setHaseefSkills((prev) => ({ ...prev, [haseefId]: res.skills }));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to attach skill");
    }
  }

  async function handleDetach(instanceId: string, haseefId: string) {
    try {
      await skillsApi.detachFromHaseef(instanceId, haseefId);
      const res = await skillsApi.listForHaseef(haseefId);
      setHaseefSkills((prev) => ({ ...prev, [haseefId]: res.skills }));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to detach skill");
    }
  }

  function getAttachedHaseefs(instanceId: string): string[] {
    const attached: string[] = [];
    for (const [haseefId, hsList] of Object.entries(haseefSkills)) {
      if (hsList.some((hs) => hs.instanceId === instanceId)) {
        attached.push(haseefId);
      }
    }
    return attached;
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Wrench className="w-6 h-6" />
              My Skills
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage skill instances attached to your haseefs
            </p>
          </div>
          <button
            onClick={() => navigate("/skills/new")}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Skill
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="bg-destructive/10 text-destructive p-4 rounded-lg">
            {error}
          </div>
        ) : instances.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Wrench className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold mb-2">No skills yet</h2>
            <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
              Add skills to give your haseefs new abilities like database access, scheduling, and more.
            </p>
            <button
              onClick={() => navigate("/skills/new")}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add your first skill
            </button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {instances.map((inst) => (
              <InstanceCard
                key={inst.id}
                instance={inst}
                haseefs={haseefs}
                attachedHaseefs={getAttachedHaseefs(inst.id)}
                onDelete={handleDelete}
                onAttach={handleAttach}
                onDetach={handleDetach}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page 2: Template Gallery ─────────────────────────────────────────────────

export function SkillTemplateGallery() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<SkillTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    skillsApi.listTemplates().then((res) => {
      setTemplates(res.templates);
      setIsLoading(false);
    }).catch(() => setIsLoading(false));
  }, []);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate("/skills")}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to My Skills
          </button>
          <h1 className="text-2xl font-bold">Add a Skill</h1>
          <p className="text-muted-foreground mt-1">
            Choose a prebuilt skill template to set up for your haseefs
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {templates.map((t) => {
              const Icon = getCategoryIcon(t.category);
              return (
                <button
                  key={t.name}
                  onClick={() => navigate(`/skills/new/${t.name}`)}
                  className="bg-card border rounded-xl p-5 text-left hover:shadow-md hover:border-primary/30 transition-all group"
                >
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-primary/10 rounded-xl group-hover:bg-primary/15 transition-colors">
                      <Icon className="w-6 h-6 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-base">{t.displayName}</h3>
                        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {t.description}
                      </p>
                      <div className="flex items-center gap-3 mt-3">
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Zap className="w-3 h-3" />
                          {t.toolDefinitions.length} tools
                        </span>
                        {t.category && (
                          <span className="px-2 py-0.5 bg-secondary text-secondary-foreground text-xs rounded-full capitalize">
                            {t.category}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page 3: Template Detail + Create Form ────────────────────────────────────

export function SkillTemplateCreatePage() {
  const { templateName } = useParams<{ templateName: string }>();
  const navigate = useNavigate();
  const [template, setTemplate] = useState<SkillTemplate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [configFields, setConfigFields] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!templateName) return;
    skillsApi.getTemplate(templateName).then((res) => {
      setTemplate(res.template);
      // Pre-populate config fields from schema defaults
      const fields: Record<string, string> = {};
      const props = (res.template.configSchema as any)?.properties ?? {};
      for (const [key, schema] of Object.entries(props) as [string, any][]) {
        fields[key] = schema.default !== undefined ? String(schema.default) : "";
      }
      setConfigFields(fields);
      setIsLoading(false);
    }).catch(() => {
      setError("Template not found");
      setIsLoading(false);
    });
  }, [templateName]);

  async function handleCreate() {
    if (!template || !name.trim() || isCreating) return;
    setIsCreating(true);
    setError(null);
    try {
      // Build config from fields, parsing numbers and booleans
      const config: Record<string, unknown> = {};
      const props = (template.configSchema as any)?.properties ?? {};
      for (const [key, value] of Object.entries(configFields)) {
        if (!value && !(template.configSchema as any)?.required?.includes(key)) continue;
        const schema = props[key];
        if (schema?.type === "number") {
          config[key] = Number(value);
        } else if (schema?.type === "boolean") {
          config[key] = value === "true";
        } else {
          config[key] = value;
        }
      }

      await skillsApi.createInstance({
        name: name.trim(),
        displayName: displayName.trim() || name.trim(),
        templateName: template.name,
        config,
      });
      navigate("/skills");
    } catch (err: any) {
      setError(err.message || "Failed to create skill");
      setIsCreating(false);
    }
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!template) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-2xl mx-auto p-6">
          <button
            onClick={() => navigate("/skills/new")}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div className="bg-destructive/10 text-destructive p-4 rounded-lg">
            Template not found
          </div>
        </div>
      </div>
    );
  }

  const Icon = getCategoryIcon(template.category);
  const schemaProps = (template.configSchema as any)?.properties ?? {};
  const requiredFields: string[] = (template.configSchema as any)?.required ?? [];

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6">
        {/* Header */}
        <button
          onClick={() => navigate("/skills/new")}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to templates
        </button>

        {/* Template info card */}
        <div className="bg-card border rounded-xl p-6 mb-8">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-primary/10 rounded-xl">
              <Icon className="w-7 h-7 text-primary" />
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-bold">{template.displayName}</h1>
              <p className="text-muted-foreground mt-1">{template.description}</p>
              <div className="flex items-center gap-3 mt-3">
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Zap className="w-3 h-3" />
                  {template.toolDefinitions.length} tools
                </span>
                {template.category && (
                  <span className="px-2 py-0.5 bg-secondary text-secondary-foreground text-xs rounded-full capitalize">
                    {template.category}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Tools list */}
          <div className="mt-5 pt-4 border-t">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Available Tools</h3>
            <div className="space-y-1.5">
              {template.toolDefinitions.map((tool) => (
                <div key={tool.name} className="flex items-start gap-2 text-sm">
                  <Zap className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <span className="font-mono text-xs font-medium">{tool.name}</span>
                    <span className="text-muted-foreground ml-1.5">{tool.description}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Create form */}
        <div className="space-y-5">
          <h2 className="text-lg font-semibold">Create Instance</h2>

          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
              {error}
            </div>
          )}

          <div>
            <label className="text-sm font-medium block mb-1.5">Instance Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
              placeholder="e.g. production_db"
              className="w-full px-3 py-2.5 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            />
            <p className="text-xs text-muted-foreground mt-1">Lowercase, a-z, 0-9, underscores only. Used as the skill name in Core.</p>
          </div>

          <div>
            <label className="text-sm font-medium block mb-1.5">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={name || "e.g. Production Database"}
              className="w-full px-3 py-2.5 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            />
          </div>

          {/* Config fields from schema */}
          {Object.keys(schemaProps).length > 0 && (
            <div className="pt-2">
              <h3 className="text-sm font-semibold mb-3">Configuration</h3>
              <div className="space-y-4">
                {Object.entries(schemaProps).map(([key, schema]: [string, any]) => {
                  const isRequired = requiredFields.includes(key);
                  return (
                    <div key={key}>
                      <label className="text-sm font-medium block mb-1.5">
                        {key}
                        {isRequired && <span className="text-destructive ml-0.5">*</span>}
                      </label>
                      {schema.type === "boolean" ? (
                        <select
                          value={configFields[key] || "false"}
                          onChange={(e) => setConfigFields((prev) => ({ ...prev, [key]: e.target.value }))}
                          className="w-full px-3 py-2.5 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                        >
                          <option value="true">true</option>
                          <option value="false">false</option>
                        </select>
                      ) : (
                        <input
                          type={schema.type === "number" ? "number" : "text"}
                          value={configFields[key] || ""}
                          onChange={(e) => setConfigFields((prev) => ({ ...prev, [key]: e.target.value }))}
                          placeholder={schema.default !== undefined ? `Default: ${schema.default}` : ""}
                          className="w-full px-3 py-2.5 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                        />
                      )}
                      {schema.description && (
                        <p className="text-xs text-muted-foreground mt-1">{schema.description}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Submit */}
          <div className="pt-4 flex gap-3">
            <button
              onClick={() => navigate("/skills/new")}
              className="px-4 py-2.5 text-sm border rounded-lg hover:bg-secondary transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!name.trim() || isCreating}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 font-medium transition-colors"
            >
              {isCreating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              {isCreating ? "Creating..." : "Create Skill"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
