import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  BotIcon,
  PencilIcon,
  CpuIcon,
  LoaderIcon,
  CameraIcon,
  ArrowLeftIcon,
  UserIcon,
  PenIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { haseefsApi, mediaApi, type Haseef } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { PRESET_MODELS, PROVIDER_OPTIONS, getProviderForModel, isPresetModel } from "@/lib/models-config";
import { PREBUILT_PERSONAS, getPersonaById, type Persona } from "@/lib/personas";

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
  const [model, setModel] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [customProvider, setCustomProvider] = useState("openai");
  const [instructions, setInstructions] = useState("");
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [customPersonaName, setCustomPersonaName] = useState("");
  const [customPersonaDesc, setCustomPersonaDesc] = useState("");
  const [isCustomPersona, setIsCustomPersona] = useState(false);
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

        // Extract persona info
        const personaConfig = h.configJson?.persona as { id?: string; name?: string; description?: string } | undefined;
        if (personaConfig?.id && personaConfig.id !== "custom") {
          const prebuilt = getPersonaById(personaConfig.id);
          if (prebuilt) setSelectedPersona(prebuilt);
          else {
            setIsCustomPersona(true);
            setCustomPersonaName(personaConfig.name || "");
            setCustomPersonaDesc(personaConfig.description || "");
          }
        } else if (personaConfig?.id === "custom") {
          setIsCustomPersona(true);
          setCustomPersonaName(personaConfig.name || "");
          setCustomPersonaDesc(personaConfig.description || "");
        }

        // Extract model info
        const modelConfig = h.configJson?.model;
        if (modelConfig && typeof modelConfig === "object") {
          const modelId = (modelConfig as Record<string, string>).model || "";
          const provider = (modelConfig as Record<string, string>).provider || "openai";
          
          if (isPresetModel(modelId)) {
            setModel(modelId);
          } else {
            setModel("custom");
            setCustomModel(modelId);
            setCustomProvider(provider);
          }
        } else if (typeof modelConfig === "string") {
          setModel("custom");
          setCustomModel(modelConfig);
        }
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

  const models = [...PRESET_MODELS, { value: "custom", label: "Custom" }];
  const resolvedModel = model === "custom" ? customModel.trim() : model;

  const getProvider = (): string => {
    if (model === "custom") {
      return customProvider;
    }
    return getProviderForModel(model);
  };

  const buildPersonaPayload = () => {
    if (isCustomPersona && customPersonaName.trim() && customPersonaDesc.trim()) {
      return {
        id: "custom",
        name: customPersonaName.trim(),
        description: customPersonaDesc.trim(),
      };
    }
    if (selectedPersona) {
      return {
        id: selectedPersona.id,
        name: selectedPersona.name,
        description: selectedPersona.description,
        style: selectedPersona.style,
        traits: selectedPersona.traits,
      };
    }
    return undefined;
  };

  const handleSave = async () => {
    if (!haseef || !name.trim() || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const currentInstructions = (haseef.configJson?.instructions as string) || "";
      const configJson: Record<string, unknown> = { ...haseef.configJson };
      
      // Update instructions if changed
      if (instructions.trim() !== currentInstructions) {
        configJson.instructions = instructions.trim();
      }
      
      // Update model if changed
      if (resolvedModel) {
        configJson.model = {
          provider: getProvider(),
          model: resolvedModel,
        };
      }

      // Update persona
      const persona = buildPersonaPayload();
      if (persona) {
        configJson.persona = persona;
      } else {
        delete configJson.persona;
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

          {/* Persona selector */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <UserIcon className="size-4" />
                Persona
              </label>
              {(selectedPersona || isCustomPersona) && (
                <button
                  type="button"
                  onClick={() => { setSelectedPersona(null); setIsCustomPersona(false); }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground -mt-1">
              Choose a personality that defines how your Haseef communicates.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PREBUILT_PERSONAS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { setSelectedPersona(p); setIsCustomPersona(false); }}
                  className={cn(
                    "rounded-xl border-2 px-3 py-2.5 text-left transition-all",
                    selectedPersona?.id === p.id
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border hover:border-primary/30",
                  )}
                >
                  <span className="text-lg">{p.emoji}</span>
                  <span className="block text-xs font-medium mt-0.5">{p.name}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => { setSelectedPersona(null); setIsCustomPersona(true); }}
                className={cn(
                  "rounded-xl border-2 px-3 py-2.5 text-left transition-all",
                  isCustomPersona
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border hover:border-primary/30",
                )}
              >
                <PenIcon className="size-4 text-muted-foreground" />
                <span className="block text-xs font-medium mt-0.5">Custom</span>
              </button>
            </div>

            {selectedPersona && !isCustomPersona && (
              <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1">
                <p className="font-medium">{selectedPersona.name}</p>
                <p className="text-muted-foreground">{selectedPersona.description}</p>
                <p className="italic text-muted-foreground mt-1">"{selectedPersona.preview}"</p>
              </div>
            )}

            {isCustomPersona && (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <input
                  type="text"
                  placeholder="Persona name (e.g. The Scientist)"
                  value={customPersonaName}
                  onChange={(e) => setCustomPersonaName(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <textarea
                  placeholder="Describe the personality, tone, and communication style..."
                  value={customPersonaDesc}
                  onChange={(e) => setCustomPersonaDesc(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                />
              </div>
            )}
          </div>

          <Textarea
            label="Instructions"
            id="edit-haseef-instructions"
            placeholder="Additional instructions for your Haseef..."
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
