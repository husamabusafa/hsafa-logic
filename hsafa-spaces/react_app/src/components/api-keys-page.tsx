import { useState, useEffect, useCallback } from "react";
import {
  KeyIcon,
  TrashIcon,
  LoaderIcon,
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  ShieldCheckIcon,
  ArrowLeftIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { apiKeysApi, type ApiKeyInfo } from "@/lib/api";
import { useToast } from "@/components/ui/toast";

const PROVIDERS = [
  {
    id: "openai",
    name: "OpenAI",
    placeholder: "sk-...",
    description: "GPT-4o, GPT-5, o1, o3",
    color: "bg-emerald-500",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    placeholder: "sk-ant-...",
    description: "Claude Sonnet, Haiku, Opus",
    color: "bg-orange-500",
  },
  {
    id: "google",
    name: "Google AI",
    placeholder: "AIza...",
    description: "Gemini 1.5 Flash, Pro",
    color: "bg-blue-500",
  },
  {
    id: "xai",
    name: "xAI (Grok)",
    placeholder: "xai-...",
    description: "Grok-2, Grok-3",
    color: "bg-zinc-800 dark:bg-zinc-700",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    placeholder: "sk-or-...",
    description: "Access 200+ models via one key",
    color: "bg-violet-500",
  },
] as const;

interface ApiKeysPageProps {
  onBack?: () => void;
}

export function ApiKeysPage({ onBack }: ApiKeysPageProps) {
  const { toast } = useToast();
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchKeys = useCallback(async () => {
    try {
      const { apiKeys } = await apiKeysApi.list();
      setKeys(apiKeys);
    } catch {
      // non-fatal
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const getKeyForProvider = (provider: string) =>
    keys.find((k) => k.provider === provider);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeftIcon className="size-4" />
              Back
            </button>
          )}
        </div>

        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <KeyIcon className="size-6" />
            API Keys
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Add your own LLM provider keys so your Haseefs use your accounts.
            Keys are encrypted at rest and never exposed after saving.
          </p>
        </div>

        {/* Security notice */}
        <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <ShieldCheckIcon className="size-5 text-primary shrink-0 mt-0.5" />
          <div className="text-sm text-foreground">
            <p className="font-medium">Encrypted & Secure</p>
            <p className="text-muted-foreground mt-0.5">
              Your API keys are encrypted with AES-256-GCM before being stored.
              We only show the last 4 characters for identification.
            </p>
          </div>
        </div>

        {/* Provider cards */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <LoaderIcon className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {PROVIDERS.map((provider) => (
              <ProviderCard
                key={provider.id}
                provider={provider}
                existing={getKeyForProvider(provider.id)}
                onSaved={fetchKeys}
                toast={toast}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Provider Card ──────────────────────────────────────────────────────────

function ProviderCard({
  provider,
  existing,
  onSaved,
  toast,
}: {
  provider: (typeof PROVIDERS)[number];
  existing: ApiKeyInfo | undefined;
  onSaved: () => void;
  toast: (message: string, type: "success" | "error") => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [keyValue, setKeyValue] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSave = async () => {
    if (!keyValue.trim() || isSaving) return;
    setIsSaving(true);
    try {
      await apiKeysApi.set(provider.id, keyValue.trim());
      toast(`${provider.name} key saved`, "success");
      setKeyValue("");
      setIsEditing(false);
      onSaved();
    } catch (err: any) {
      toast(err.message || "Failed to save key", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await apiKeysApi.remove(provider.id);
      toast(`${provider.name} key removed`, "success");
      onSaved();
    } catch (err: any) {
      toast(err.message || "Failed to remove key", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn("size-10 rounded-xl flex items-center justify-center text-white font-bold text-sm", provider.color)}>
            {provider.name.charAt(0)}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{provider.name}</h3>
            <p className="text-xs text-muted-foreground">{provider.description}</p>
          </div>
        </div>

        {existing && !isEditing && (
          <div className="flex items-center gap-1.5">
            <CheckIcon className="size-3.5 text-green-500" />
            <span className="text-xs text-green-600 font-medium">Connected</span>
          </div>
        )}
      </div>

      {/* Existing key display */}
      {existing && !isEditing && (
        <div className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
          <span className="text-sm font-mono text-muted-foreground">
            {existing.keyHint}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setIsEditing(true)}
            >
              Update
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <LoaderIcon className="size-3 animate-spin" />
              ) : (
                <TrashIcon className="size-3" />
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Add/Update key form */}
      {(isEditing || !existing) && (
        <div className="space-y-2">
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              placeholder={provider.placeholder}
              value={keyValue}
              onChange={(e) => setKeyValue(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-10 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
            >
              {showKey ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!keyValue.trim() || isSaving}
            >
              {isSaving ? (
                <LoaderIcon className="size-3.5 animate-spin" />
              ) : (
                <KeyIcon className="size-3.5" />
              )}
              {isSaving ? "Saving..." : "Save Key"}
            </Button>
            {isEditing && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsEditing(false);
                  setKeyValue("");
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
