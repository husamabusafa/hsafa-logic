import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  PlusIcon,
  BotIcon,
  CpuIcon,
  LoaderIcon,
  CalendarIcon,
  ActivityIcon,
  DownloadIcon,
  CheckIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { haseefsApi, type HaseefListItem } from "@/lib/api";

// ─── Grid Page ───────────────────────────────────────────────────────────────

interface HaseefsGridPageProps {
  haseefs: HaseefListItem[];
  isLoading: boolean;
  onImported?: () => void;
}

export function HaseefsGridPage({ haseefs, isLoading, onImported }: HaseefsGridPageProps) {
  const navigate = useNavigate();
  const [showImport, setShowImport] = useState(false);

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
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setShowImport(true)}>
              <DownloadIcon className="size-4" />
              Import
            </Button>
            <Button onClick={() => navigate("/haseefs/new")}>
              <PlusIcon className="size-4" />
              New Haseef
            </Button>
          </div>
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

      <ImportHaseefDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={() => {
          setShowImport(false);
          onImported?.();
        }}
      />
    </div>
  );
}

// ─── Import Dialog ───────────────────────────────────────────────────────────

interface ImportableHaseef {
  id: string;
  name: string;
  description: string | null;
  createdAt: string | null;
}

function ImportHaseefDialog({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const { toast } = useToast();
  const [items, setItems] = useState<ImportableHaseef[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualId, setManualId] = useState("");
  const [importingId, setImportingId] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { haseefs } = await haseefsApi.listImportable();
      setItems(haseefs);
    } catch (err: any) {
      setError(err?.message || "Failed to load haseefs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setManualId("");
      fetchList();
    }
  }, [open, fetchList]);

  const doImport = async (haseefId: string) => {
    if (!haseefId) return;
    setImportingId(haseefId);
    try {
      const { haseef } = await haseefsApi.import(haseefId);
      toast(`Imported ${haseef.name}`, "success");
      onImported();
    } catch (err: any) {
      toast(err?.message || "Could not import haseef", "error");
    } finally {
      setImportingId(null);
    }
  };

  const trimmedManual = manualId.trim();

  return (
    <Dialog open={open} onClose={onClose} className="max-w-lg">
      <DialogHeader onClose={onClose}>
        <DialogTitle>Import existing Haseef</DialogTitle>
        <DialogDescription>
          Claim a Haseef that already exists in Core but isn't owned by anyone in Spaces yet.
        </DialogDescription>
      </DialogHeader>

      {/* List of importable haseefs */}
      <div className="space-y-2 max-h-72 overflow-y-auto -mx-1 px-1">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <LoaderIcon className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="text-sm text-destructive py-4">{error}</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            No unclaimed haseefs available.
          </div>
        ) : (
          items.map((h) => (
            <div
              key={h.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
            >
              <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <BotIcon className="size-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">{h.name}</div>
                <div className="text-xs text-muted-foreground font-mono truncate">{h.id}</div>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={importingId !== null}
                onClick={() => doImport(h.id)}
              >
                {importingId === h.id ? (
                  <LoaderIcon className="size-3.5 animate-spin" />
                ) : (
                  <>
                    <CheckIcon className="size-3.5" />
                    Claim
                  </>
                )}
              </Button>
            </div>
          ))
        )}
      </div>

      {/* Manual paste */}
      <div className="mt-4 pt-4 border-t border-border">
        <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
          Or paste a Haseef ID
        </label>
        <div className="flex items-center gap-2">
          <Input
            placeholder="haseef-id-uuid"
            value={manualId}
            onChange={(e) => setManualId(e.target.value)}
            className="font-mono text-xs"
          />
          <Button
            disabled={!trimmedManual || importingId !== null}
            onClick={() => doImport(trimmedManual)}
          >
            {importingId === trimmedManual ? (
              <LoaderIcon className="size-4 animate-spin" />
            ) : (
              "Import"
            )}
          </Button>
        </div>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
