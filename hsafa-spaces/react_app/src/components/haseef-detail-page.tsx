import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  BotIcon,
  PencilIcon,
  TrashIcon,
  CpuIcon,
  LoaderIcon,
  ArrowLeftIcon,
  CalendarIcon,
  ActivityIcon,
  MessageSquareIcon,
  ClockIcon,
  TrendingUpIcon,
  ZapIcon,
  CopyIcon,
  CheckIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { haseefsApi, type Haseef } from "@/lib/api";
import { useToast } from "@/components/ui/toast";

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
