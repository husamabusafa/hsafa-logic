import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  PlusIcon,
  BotIcon,
  SparklesIcon,
  PencilIcon,
  TrashIcon,
  CpuIcon,
  LoaderIcon,
  CameraIcon,
  ArrowLeftIcon,
  CalendarIcon,
  ActivityIcon,
  MessageSquareIcon,
  HashIcon,
  ClockIcon,
  TrendingUpIcon,
  ZapIcon,
  CopyIcon,
  CheckIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { haseefsApi, mediaApi, type HaseefListItem, type Haseef } from "@/lib/api";
import { useToast } from "@/components/ui/toast";

// ─── Grid Page ───────────────────────────────────────────────────────────────

interface HaseefsGridPageProps {
  haseefs: HaseefListItem[];
  isLoading: boolean;
}

export function HaseefsGridPage({ haseefs, isLoading }: HaseefsGridPageProps) {
  const navigate = useNavigate();

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Haseefs</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage your AI agents
            </p>
          </div>
          <Button onClick={() => navigate("/haseefs/new")}>
            <PlusIcon className="size-4" />
            New Haseef
          </Button>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <LoaderIcon className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : haseefs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4">
              <BotIcon className="size-8" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">No haseefs yet</h3>
            <p className="text-sm text-muted-foreground max-w-xs mb-4">
              Create your first AI agent to get started.
            </p>
            <Button onClick={() => navigate("/haseefs/new")}>
              <PlusIcon className="size-4" />
              Create Haseef
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {haseefs.map((h) => (
              <button
                key={h.haseefId}
                onClick={() => navigate(`/haseefs/${h.haseefId}`)}
                className="group text-left rounded-2xl border border-border bg-card p-5 hover:border-primary/40 hover:shadow-md transition-all"
              >
                <div className="flex items-start gap-3.5">
                  {h.avatarUrl ? (
                    <img
                      src={h.avatarUrl}
                      alt={h.name}
                      className="size-12 rounded-xl object-cover shrink-0 border border-border"
                    />
                  ) : (
                    <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <BotIcon className="size-6 text-primary" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                      {h.name}
                    </h3>
                    <div className="flex items-center gap-1.5 mt-1">
                      <CalendarIcon className="size-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {new Date(h.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Mini stats bar */}
                <div className="flex items-center gap-3 mt-4 pt-3 border-t border-border/60">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <ActivityIcon className="size-3" />
                    <span>Active</span>
                  </div>
                  <div className="flex-1" />
                  <Badge variant="outline" className="text-[10px] gap-0.5">
                    <CpuIcon className="size-2.5" />
                    AI
                  </Badge>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Detail Page ─────────────────────────────────────────────────────────────

interface HaseefDetailPageProps {
  onDeleted: () => void;
}

export function HaseefDetailPage({ onDeleted }: HaseefDetailPageProps) {
  const { haseefId } = useParams<{ haseefId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [haseef, setHaseef] = useState<Haseef | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    if (!haseefId) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    haseefsApi
      .get(haseefId)
      .then(({ haseef: h }) => {
        if (!cancelled) setHaseef(h);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Failed to load haseef");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [haseefId]);

  const handleDelete = useCallback(async () => {
    if (!haseef) return;
    setIsDeleting(true);
    try {
      await haseefsApi.delete(haseef.id);
      setShowDeleteConfirm(false);
      onDeleted();
      toast("Haseef deleted", "success");
      navigate("/haseefs");
    } catch (err: any) {
      toast(err.message || "Failed to delete haseef", "error");
      setIsDeleting(false);
    }
  }, [haseef, onDeleted, navigate, toast]);

  const copyToClipboard = useCallback((text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }, []);

  if (!haseefId) {
    navigate("/haseefs");
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoaderIcon className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !haseef) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <p className="text-sm text-destructive mb-3">{error || "Haseef not found"}</p>
        <Button variant="outline" onClick={() => navigate("/haseefs")}>
          <ArrowLeftIcon className="size-4" />
          Back to Haseefs
        </Button>
      </div>
    );
  }

  const model =
    (haseef.configJson?.model as Record<string, string>)?.model ||
    (haseef.configJson?.model as string) ||
    "unknown";

  const instructions = (haseef.configJson?.instructions as string) || "";

  const createdDate = haseef.createdAt
    ? new Date(haseef.createdAt).toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "—";

  const daysSinceCreation = haseef.createdAt
    ? Math.floor((Date.now() - new Date(haseef.createdAt).getTime()) / 86400000)
    : 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Back + Actions Header */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate("/haseefs")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeftIcon className="size-4" />
            Back to Haseefs
          </button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/haseefs/${haseef.id}/edit`)}
            >
              <PencilIcon className="size-3.5" />
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
              className="text-destructive hover:text-destructive hover:border-destructive/50 hover:bg-destructive/5"
            >
              <TrashIcon className="size-3.5" />
              Delete
            </Button>
          </div>
        </div>

        {/* Profile Hero */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-start gap-5">
            {haseef.avatarUrl ? (
              <img
                src={haseef.avatarUrl}
                alt={haseef.name}
                className="size-20 rounded-2xl object-cover border-2 border-border shrink-0"
              />
            ) : (
              <div className="size-20 rounded-2xl bg-primary/10 flex items-center justify-center border-2 border-border shrink-0">
                <BotIcon className="size-10 text-primary" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-bold text-foreground truncate">
                  {haseef.name}
                </h1>
                <Badge variant="outline" className="gap-1 shrink-0">
                  <CpuIcon className="size-2.5" />
                  {model}
                </Badge>
              </div>
              {haseef.description && (
                <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">
                  {haseef.description}
                </p>
              )}
              <div className="flex items-center gap-4 mt-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarIcon className="size-3" />
                  Created {createdDate}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ClockIcon className="size-3" />
                  {daysSinceCreation} day{daysSinceCreation !== 1 ? "s" : ""} old
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            icon={MessageSquareIcon}
            label="Messages"
            value="—"
            subtitle="All time"
            color="primary"
          />
          <StatCard
            icon={ActivityIcon}
            label="Runs"
            value="—"
            subtitle="Total"
            color="emerald"
          />
          <StatCard
            icon={TrendingUpIcon}
            label="Spaces"
            value="—"
            subtitle="Connected"
            color="blue"
          />
          <StatCard
            icon={ZapIcon}
            label="Status"
            value="Active"
            subtitle="Ready"
            color="amber"
          />
        </div>

        {/* Activity Chart Placeholder */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">Activity</h3>
            <Badge variant="outline" className="text-[10px]">Last 30 days</Badge>
          </div>
          <div className="h-32 flex items-end gap-1">
            {Array.from({ length: 30 }, (_, i) => {
              const h = Math.max(8, Math.random() * 100);
              const isToday = i === 29;
              return (
                <div
                  key={i}
                  className={cn(
                    "flex-1 rounded-t transition-colors",
                    isToday ? "bg-primary" : "bg-primary/20 hover:bg-primary/40",
                  )}
                  style={{ height: `${h}%` }}
                  title={`Day ${i + 1}`}
                />
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 text-center">
            Activity data will be available once the haseef starts processing messages
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Instructions */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Instructions
            </h3>
            {instructions ? (
              <div className="rounded-lg bg-muted/30 p-3 max-h-48 overflow-y-auto">
                <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
                  {instructions}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No instructions configured. Edit this haseef to add instructions.
              </p>
            )}
          </div>

          {/* IDs & Technical Details */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Technical Details
            </h3>
            <div className="space-y-3">
              <CopyableField
                label="Haseef ID"
                value={haseef.id}
                copied={copiedField === "id"}
                onCopy={() => copyToClipboard(haseef.id, "id")}
              />
              <CopyableField
                label="Entity ID"
                value={haseef.entityId}
                copied={copiedField === "entityId"}
                onCopy={() => copyToClipboard(haseef.entityId, "entityId")}
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Model</span>
                <Badge variant="outline" className="gap-1 text-[10px]">
                  <CpuIcon className="size-2.5" />
                  {model}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Created</span>
                <span className="text-xs text-foreground">{createdDate}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        <Dialog
          open={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          className="max-w-sm"
        >
          <DialogHeader onClose={() => setShowDeleteConfirm(false)}>
            <DialogTitle>Delete {haseef.name}?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. The haseef will be permanently
              removed from all connected spaces.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <LoaderIcon className="size-4 animate-spin" />
              ) : (
                <TrashIcon className="size-4" />
              )}
              {isDeleting ? "Deleting..." : "Delete permanently"}
            </Button>
          </DialogFooter>
        </Dialog>
      </div>
    </div>
  );
}

// ─── Create Page ─────────────────────────────────────────────────────────────

interface HaseefCreatePageProps {
  onCreated: () => void;
}

export function HaseefCreatePage({ onCreated }: HaseefCreatePageProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [model, setModel] = useState("gpt-5.2");
  const [customModel, setCustomModel] = useState("");
  const [instructions, setInstructions] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleAvatarUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const { url } = await mediaApi.upload(file);
      setAvatarUrl(url);
    } catch (err: any) {
      setError(err.message || "Failed to upload avatar");
    } finally {
      setIsUploading(false);
    }
  };

  const models = [
    { value: "gpt-5.2", label: "GPT-5.2" },
    { value: "claude-sonnet-4-6", label: "Claude Sonnet 4" },
    { value: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
    { value: "qwen/qwen3.5-flash-02-23", label: "Qwen 3.5 Flash", tag: "OpenRouter" },
    { value: "moonshotai/kimi-k2-thinking", label: "Kimi K2 Thinking", tag: "OpenRouter" },
    { value: "custom", label: "Custom" },
  ];

  const resolvedModel = model === "custom" ? customModel.trim() : model;

  const handleCreate = async () => {
    if (!name.trim() || isCreating) return;
    setIsCreating(true);
    setError(null);
    try {
      const { haseef } = await haseefsApi.create({
        name: name.trim(),
        description: description.trim() || undefined,
        model: resolvedModel || undefined,
        instructions: instructions.trim() || undefined,
        ...(avatarUrl ? { avatarUrl } : {}),
      });
      onCreated();
      toast("Haseef created", "success");
      navigate(`/haseefs/${haseef.id}`);
    } catch (err: any) {
      toast(err.message || "Failed to create haseef", "error");
      setIsCreating(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/haseefs")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeftIcon className="size-4" />
            Back
          </button>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-foreground">Create a new Haseef</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Haseefs are AI agents that can participate in spaces and help your team.
          </p>
        </div>

        {/* Form */}
        <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
          {/* Avatar upload */}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="relative group"
              disabled={isUploading}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Avatar"
                  className="size-24 rounded-2xl object-cover border-2 border-border"
                />
              ) : (
                <div className="size-24 rounded-2xl bg-primary/10 flex items-center justify-center border-2 border-dashed border-border">
                  <BotIcon className="size-10 text-primary" />
                </div>
              )}
              <div className="absolute inset-0 rounded-2xl bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {isUploading ? (
                  <LoaderIcon className="size-5 text-white animate-spin" />
                ) : (
                  <CameraIcon className="size-5 text-white" />
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleAvatarUpload(file);
                  e.target.value = "";
                }}
              />
            </button>
          </div>

          <Input
            label="Name"
            id="haseef-name"
            placeholder="e.g. Research Assistant"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />

          <Input
            label="Description"
            id="haseef-desc"
            placeholder="What does this haseef do?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          {/* Model selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Model</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {models.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setModel(m.value)}
                  className={cn(
                    "rounded-xl border-2 px-3 py-2.5 text-sm text-left transition-all",
                    model === m.value
                      ? "border-primary bg-primary/5 text-primary font-medium shadow-sm"
                      : "border-border hover:border-primary/30 text-foreground",
                  )}
                >
                  <CpuIcon className="size-3.5 inline mr-1.5" />
                  {m.label}
                  {"tag" in m && m.tag && (
                    <span className="block text-[10px] opacity-60 mt-0.5">{m.tag}</span>
                  )}
                </button>
              ))}
            </div>
            {model === "custom" && (
              <input
                type="text"
                placeholder="e.g. openrouter/meta-llama/llama-3.1-70b"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            )}
          </div>

          <Textarea
            label="Instructions"
            id="haseef-instructions"
            placeholder="Describe how this haseef should behave..."
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={5}
          />

          {error && (
            <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => navigate("/haseefs")}
            disabled={isCreating}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || !resolvedModel || isCreating}
          >
            {isCreating ? (
              <LoaderIcon className="size-4 animate-spin" />
            ) : (
              <SparklesIcon className="size-4" />
            )}
            {isCreating ? "Creating..." : "Create Haseef"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Page ───────────────────────────────────────────────────────────────

interface HaseefEditPageProps {
  onSaved: () => void;
}

export function HaseefEditPage({ onSaved }: HaseefEditPageProps) {
  const { haseefId } = useParams<{ haseefId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [haseef, setHaseef] = useState<Haseef | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarChanged, setAvatarChanged] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (!haseefId) return;
    let cancelled = false;
    setIsLoading(true);

    haseefsApi
      .get(haseefId)
      .then(({ haseef: h }) => {
        if (cancelled) return;
        setHaseef(h);
        setName(h.name);
        setDescription(h.description || "");
        setInstructions((h.configJson?.instructions as string) || "");
        setAvatarUrl(h.avatarUrl || null);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message || "Failed to load haseef");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [haseefId]);

  const handleAvatarUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const { url } = await mediaApi.upload(file);
      setAvatarUrl(url);
      setAvatarChanged(true);
    } catch (err: any) {
      setError(err.message || "Failed to upload avatar");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    if (!haseef || !name.trim() || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const currentInstructions = (haseef.configJson?.instructions as string) || "";
      const configJson: Record<string, unknown> = { ...haseef.configJson };
      if (instructions.trim() !== currentInstructions) {
        configJson.instructions = instructions.trim();
      }
      await haseefsApi.update(haseef.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        configJson,
        ...(avatarChanged ? { avatarUrl: avatarUrl || undefined } : {}),
      });
      onSaved();
      toast("Changes saved", "success");
      navigate(`/haseefs/${haseef.id}`);
    } catch (err: any) {
      toast(err.message || "Failed to update haseef", "error");
    } finally {
      setIsSaving(false);
    }
  };

  if (!haseefId) {
    navigate("/haseefs");
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoaderIcon className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadError || !haseef) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <p className="text-sm text-destructive mb-3">{loadError || "Haseef not found"}</p>
        <Button variant="outline" onClick={() => navigate("/haseefs")}>
          <ArrowLeftIcon className="size-4" />
          Back to Haseefs
        </Button>
      </div>
    );
  }

  const currentModel =
    (haseef.configJson?.model as Record<string, string>)?.model ||
    (haseef.configJson?.model as string) ||
    "unknown";

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/haseefs/${haseef.id}`)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeftIcon className="size-4" />
            Back
          </button>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-foreground">Edit {haseef.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Update this haseef's details and configuration.
          </p>
        </div>

        {/* Form */}
        <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
          {/* Avatar upload */}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="relative group"
              disabled={isUploading}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Avatar"
                  className="size-24 rounded-2xl object-cover border-2 border-border"
                />
              ) : (
                <div className="size-24 rounded-2xl bg-primary/10 flex items-center justify-center border-2 border-dashed border-border">
                  <BotIcon className="size-10 text-primary" />
                </div>
              )}
              <div className="absolute inset-0 rounded-2xl bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {isUploading ? (
                  <LoaderIcon className="size-5 text-white animate-spin" />
                ) : (
                  <CameraIcon className="size-5 text-white" />
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleAvatarUpload(file);
                  e.target.value = "";
                }}
              />
            </button>
          </div>

          <Input
            label="Name"
            id="edit-haseef-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />

          <Textarea
            label="Description"
            id="edit-haseef-desc"
            placeholder="What does this haseef do?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />

          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              Model
            </label>
            <div className="flex items-center gap-2 bg-muted/40 px-3 py-2.5 rounded-lg">
              <CpuIcon className="size-4 text-muted-foreground" />
              <span className="text-sm text-foreground">{currentModel}</span>
              <span className="text-[10px] text-muted-foreground ml-auto">
                (set at creation)
              </span>
            </div>
          </div>

          <Textarea
            label="Instructions"
            id="edit-haseef-instructions"
            placeholder="Describe how this haseef should behave..."
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={5}
          />

          {error && (
            <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => navigate(`/haseefs/${haseef.id}`)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || isSaving}>
            {isSaving ? (
              <LoaderIcon className="size-4 animate-spin" />
            ) : (
              <PencilIcon className="size-4" />
            )}
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Helper Components ───────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  subtitle,
  color,
}: {
  icon: typeof ActivityIcon;
  label: string;
  value: string;
  subtitle: string;
  color: "primary" | "emerald" | "blue" | "amber";
}) {
  const colors = {
    primary: "bg-primary/10 text-primary",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={cn("size-7 rounded-lg flex items-center justify-center", colors[color])}>
          <Icon className="size-3.5" />
        </div>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-xl font-bold text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>
    </div>
  );
}

function CopyableField({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-xs text-foreground font-mono truncate">{value}</span>
        <button
          onClick={onCopy}
          className="shrink-0 p-0.5 rounded hover:bg-muted transition-colors"
          title="Copy"
        >
          {copied ? (
            <CheckIcon className="size-3 text-emerald-500" />
          ) : (
            <CopyIcon className="size-3 text-muted-foreground" />
          )}
        </button>
      </div>
    </div>
  );
}
