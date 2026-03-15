import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  BotIcon,
  PencilIcon,
  CpuIcon,
  LoaderIcon,
  CameraIcon,
  ArrowLeftIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { haseefsApi, mediaApi, type Haseef } from "@/lib/api";
import { useToast } from "@/components/ui/toast";

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
