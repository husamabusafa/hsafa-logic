import { useState, useEffect, useCallback } from "react";
import {
  PuzzleIcon,
  WrenchIcon,
  Loader2Icon,
  TrashIcon,
  SaveIcon,
  MessageSquareIcon,
  CalendarIcon,
  PlugIcon,
  DatabaseIcon,
  ChevronLeftIcon,
  PlusIcon,
  PackageIcon,
  EyeIcon,
  EyeOffIcon,
  AlertTriangleIcon,
  ImageIcon,
  TagIcon,
  CodeIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  scopesApi,
  type ScopeTemplate,
} from "@/lib/api";

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
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm mx-4 animate-in fade-in zoom-in-95 duration-150">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex items-center justify-center size-10 rounded-full bg-red-500/10 text-red-500 shrink-0">
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
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
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

// ── Tool Editor ──────────────────────────────────────────────────────────────

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

function ToolRow({
  tool,
  onUpdate,
  onRemove,
}: {
  tool: ToolDef;
  onUpdate: (t: ToolDef) => void;
  onRemove: () => void;
}) {
  const [schemaText, setSchemaText] = useState(() => JSON.stringify(tool.inputSchema, null, 2));
  const [schemaError, setSchemaError] = useState("");

  function handleSchemaBlur() {
    try {
      const parsed = JSON.parse(schemaText);
      setSchemaError("");
      onUpdate({ ...tool, inputSchema: parsed });
    } catch {
      setSchemaError("Invalid JSON");
    }
  }

  return (
    <div className="p-3 rounded-lg border border-border bg-card space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Name</label>
          <input
            type="text"
            value={tool.name}
            onChange={(e) => onUpdate({ ...tool, name: e.target.value })}
            className="mt-0.5 w-full px-2 py-1.5 text-sm font-mono rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="get_weather"
          />
        </div>
        <div>
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Description</label>
          <input
            type="text"
            value={tool.description}
            onChange={(e) => onUpdate({ ...tool, description: e.target.value })}
            className="mt-0.5 w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Get the current weather"
          />
        </div>
      </div>
      <div>
        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Input Schema (JSON)</label>
        <textarea
          value={schemaText}
          onChange={(e) => setSchemaText(e.target.value)}
          onBlur={handleSchemaBlur}
          className="mt-0.5 w-full px-2 py-1.5 text-xs font-mono rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
          rows={3}
        />
        {schemaError && <p className="text-[10px] text-red-500 mt-0.5">{schemaError}</p>}
      </div>
      <button
        onClick={onRemove}
        className="flex items-center gap-1 text-[11px] text-red-500 hover:text-red-600 transition-colors"
      >
        <TrashIcon className="size-3" /> Remove tool
      </button>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

interface ScopeTemplatePageProps {
  templateId: string;
  onBack: () => void;
}

export function ScopeTemplatePage({ templateId, onBack }: ScopeTemplatePageProps) {
  const [template, setTemplate] = useState<ScopeTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Editable fields
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editIcon, setEditIcon] = useState("");
  const [editImageUrl, setEditImageUrl] = useState("");
  const [editInstructions, setEditInstructions] = useState("");
  const [editTools, setEditTools] = useState<ToolDef[]>([]);
  const [editPublished, setEditPublished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  const [dirty, setDirty] = useState(false);

  // Delete
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isPrebuilt = template?.category === "prebuilt";
  const isCustom = !isPrebuilt && !!template?.authorId;

  const fetchTemplate = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { template: t } = await scopesApi.getTemplate(templateId);
      setTemplate(t);
      setEditName(t.name);
      setEditDescription(t.description || "");
      setEditIcon(t.icon || "");
      setEditImageUrl(t.imageUrl || "");
      setEditInstructions(t.instructions || "");
      setEditTools(t.tools || []);
      setEditPublished(t.published);
      setDirty(false);
    } catch (err: any) {
      setError(err.message || "Failed to load template");
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => { fetchTemplate(); }, [fetchTemplate]);

  function markDirty() { setDirty(true); }

  async function handleSave() {
    setSaving(true);
    setSaveError("");
    setSaveSuccess("");
    try {
      const { template: updated } = await scopesApi.updateTemplate(templateId, {
        name: editName.trim(),
        description: editDescription.trim(),
        icon: editIcon.trim() || undefined,
        imageUrl: editImageUrl.trim() || undefined,
        instructions: editInstructions.trim() || undefined,
        tools: editTools,
        published: editPublished,
      });
      setTemplate(updated);
      setDirty(false);
      setSaveSuccess("Template saved");
      setTimeout(() => setSaveSuccess(""), 3000);
    } catch (err: any) {
      setSaveError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await scopesApi.deleteTemplate(templateId);
      onBack();
    } catch (err: any) {
      setSaveError(err.message || "Failed to delete");
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  function addTool() {
    setEditTools((prev) => [...prev, { name: "", description: "", inputSchema: { type: "object", properties: {} } }]);
    markDirty();
  }

  function updateTool(idx: number, tool: ToolDef) {
    setEditTools((prev) => prev.map((t, i) => i === idx ? tool : t));
    markDirty();
  }

  function removeTool(idx: number) {
    setEditTools((prev) => prev.filter((_, i) => i !== idx));
    markDirty();
  }

  // Icon list for selector
  const iconOptions = [
    { value: "", label: "Default (Puzzle)" },
    { value: "MessageSquare", label: "Message" },
    { value: "Calendar", label: "Calendar" },
    { value: "Database", label: "Database" },
    { value: "Plug", label: "Plug" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !template) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-sm text-red-500">{error || "Template not found"}</p>
        <button onClick={onBack} className="text-sm text-primary hover:underline">Go Back</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeftIcon className="size-4" /> Back
        </button>
        <div className="w-px h-6 bg-border" />
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={cn(
            "flex items-center justify-center size-10 rounded-lg shrink-0",
            isPrebuilt ? "bg-primary/10 text-primary" : "bg-violet-500/10 text-violet-600",
          )}>
            <ScopeIcon icon={template.icon} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold truncate">{template.name}</h1>
              <span className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-medium uppercase">
                {template.category}
              </span>
              {isCustom && (
                template.published ? (
                  <span className="flex items-center gap-1 text-[10px] font-medium text-green-600 bg-green-500/10 px-1.5 py-0.5 rounded-full">
                    <EyeIcon className="size-3" /> Published
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                    <EyeOffIcon className="size-3" /> Draft
                  </span>
                )
              )}
            </div>
            <p className="text-xs text-muted-foreground font-mono">{template.slug}</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="space-y-8 max-w-2xl">
          {/* Info Grid */}
          <div className="grid gap-px rounded-lg border border-border overflow-hidden bg-border">
            {[
              { label: "Slug", value: <span className="font-mono text-sm">{template.slug}</span> },
              { label: "Category", value: <span className="text-sm capitalize">{template.category}</span> },
              { label: "Tools", value: <span className="text-sm">{template.tools.length} tool{template.tools.length !== 1 ? "s" : ""}</span> },
              ...(template._count?.instances !== undefined ? [{ label: "Instances", value: <span className="text-sm">{template._count.instances}</span> }] : []),
              ...(template.imageUrl ? [{ label: "Image", value: <span className="text-xs font-mono text-muted-foreground break-all">{template.imageUrl}</span> }] : []),
              ...(template.createdAt ? [{ label: "Created", value: <span className="text-sm">{new Date(template.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</span> }] : []),
            ].map((row, i) => (
              <div key={i} className="flex items-center bg-card">
                <div className="w-32 shrink-0 px-4 py-3 text-xs font-medium text-muted-foreground bg-muted/50">{row.label}</div>
                <div className="flex-1 px-4 py-3">{row.value}</div>
              </div>
            ))}
          </div>

          {/* Editable Section (only for custom templates) */}
          {isCustom && (
            <section className="space-y-4">
              <h3 className="text-sm font-semibold">Settings</h3>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Name</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => { setEditName(e.target.value); markDirty(); }}
                    className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">Description</label>
                  <textarea
                    value={editDescription}
                    onChange={(e) => { setEditDescription(e.target.value); markDirty(); }}
                    className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                    rows={2}
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><TagIcon className="size-3" /> Icon</label>
                  <select
                    value={editIcon}
                    onChange={(e) => { setEditIcon(e.target.value); markDirty(); }}
                    className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    {iconOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><ImageIcon className="size-3" /> Docker Image</label>
                  <input
                    type="text"
                    value={editImageUrl}
                    onChange={(e) => { setEditImageUrl(e.target.value); markDirty(); }}
                    className="mt-1 w-full px-3 py-2 text-sm font-mono rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="myregistry/my-scope:latest"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1"><CodeIcon className="size-3" /> Instructions</label>
                  <textarea
                    value={editInstructions}
                    onChange={(e) => { setEditInstructions(e.target.value); markDirty(); }}
                    className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none font-mono"
                    rows={4}
                    placeholder="System instructions for haseefs using this scope..."
                  />
                </div>

                {/* Published toggle */}
                <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-card">
                  <div>
                    <p className="text-sm font-medium flex items-center gap-2">
                      {editPublished ? <EyeIcon className="size-4 text-green-500" /> : <EyeOffIcon className="size-4 text-muted-foreground" />}
                      {editPublished ? "Published" : "Draft"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {editPublished ? "Visible to all users in the Templates tab." : "Only visible to you."}
                    </p>
                  </div>
                  <button
                    onClick={() => { setEditPublished(!editPublished); markDirty(); }}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors",
                      editPublished
                        ? "border-green-300 dark:border-green-800 bg-green-500/10 text-green-600"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {editPublished ? "Unpublish" : "Publish"}
                  </button>
                </div>
              </div>

              {saveError && <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 px-3 py-2 rounded-lg">{saveError}</p>}
              {saveSuccess && <p className="text-xs text-green-500 bg-green-50 dark:bg-green-950/20 px-3 py-2 rounded-lg">{saveSuccess}</p>}

              <button
                onClick={handleSave}
                disabled={saving || !dirty}
                className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2Icon className="size-4 animate-spin" /> : <SaveIcon className="size-4" />}
                Save Template
              </button>
            </section>
          )}

          {/* Tools */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <WrenchIcon className="size-4" /> Tools ({editTools.length})
              </h3>
              {isCustom && (
                <button
                  onClick={addTool}
                  className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  <PlusIcon className="size-3" /> Add Tool
                </button>
              )}
            </div>

            {editTools.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-border rounded-lg">
                <WrenchIcon className="size-8 mx-auto mb-2 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No tools defined yet.</p>
                {isCustom && (
                  <button
                    onClick={addTool}
                    className="mt-3 text-xs font-medium text-primary hover:underline"
                  >
                    + Add your first tool
                  </button>
                )}
              </div>
            ) : isCustom ? (
              <div className="space-y-2">
                {editTools.map((tool, i) => (
                  <ToolRow
                    key={i}
                    tool={tool}
                    onUpdate={(t) => updateTool(i, t)}
                    onRemove={() => removeTool(i)}
                  />
                ))}
              </div>
            ) : (
              <div className="grid gap-px rounded-lg border border-border overflow-hidden bg-border">
                {editTools.map((tool) => (
                  <div key={tool.name} className="flex items-start gap-3 px-4 py-3 bg-card">
                    <code className="text-xs font-semibold bg-muted px-1.5 py-0.5 rounded mt-0.5">{tool.name}</code>
                    <p className="text-xs text-muted-foreground">{tool.description}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Instructions (read-only for prebuilt) */}
          {isPrebuilt && template.instructions && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <CodeIcon className="size-4" /> Instructions
              </h3>
              <pre className="text-xs text-muted-foreground bg-muted/30 p-4 rounded-lg border border-border overflow-x-auto font-mono whitespace-pre-wrap">
                {template.instructions}
              </pre>
            </section>
          )}

          {/* Danger Zone (custom only) */}
          {isCustom && (
            <section className="rounded-lg border border-red-200 dark:border-red-900/50 overflow-hidden">
              <div className="px-4 py-2.5 bg-red-50 dark:bg-red-950/20 border-b border-red-200 dark:border-red-900/50">
                <p className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wider">Danger Zone</p>
              </div>
              <div className="p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Delete this template</p>
                  <p className="text-xs text-muted-foreground">Permanently remove the template and all its instances. This cannot be undone.</p>
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
        </div>
      </div>

      <ConfirmModal
        open={showDeleteConfirm}
        title="Delete Template"
        description={`Are you sure you want to delete "${template.name}"? All instances of this template will also be deleted. This action cannot be undone.`}
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
