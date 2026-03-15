import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  BotIcon,
  SparklesIcon,
  CpuIcon,
  LoaderIcon,
  CameraIcon,
  ArrowLeftIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { haseefsApi, mediaApi } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { PRESET_MODELS, PROVIDER_OPTIONS, getProviderForModel } from "@/lib/models-config";

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
  const [customProvider, setCustomProvider] = useState("openai");
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

  const models = [...PRESET_MODELS, { value: "custom", label: "Custom" }];
  const resolvedModel = model === "custom" ? customModel.trim() : model;

  const getProvider = (): string => {
    if (model === "custom") {
      return customProvider;
    }
    return getProviderForModel(model);
  };

  const handleCreate = async () => {
    if (!name.trim() || isCreating) return;
    setIsCreating(true);
    setError(null);
    try {
      const { haseef } = await haseefsApi.create({
        name: name.trim(),
        description: description.trim() || undefined,
        model: resolvedModel || undefined,
        provider: getProvider(),
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
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                    Provider
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {PROVIDER_OPTIONS.map((p) => (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => setCustomProvider(p.value)}
                        className={cn(
                          "rounded-lg border px-3 py-2 text-xs transition-all",
                          customProvider === p.value
                            ? "border-primary bg-primary/5 text-primary font-medium"
                            : "border-border hover:border-primary/30 text-foreground",
                        )}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  type="text"
                  placeholder="e.g. gpt-4o or meta-llama/llama-3.1-70b"
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
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
