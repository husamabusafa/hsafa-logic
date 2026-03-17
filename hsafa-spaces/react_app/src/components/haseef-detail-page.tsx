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
  PlusIcon,
  UsersIcon,
  HashIcon,
  EyeIcon,
  LinkIcon,
  UserIcon,
  LockIcon,
  XIcon,
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
import { haseefsApi, spacesApi, type Haseef, type HaseefListItem, type HaseefSpace, type Contact } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";

// ─── Detail Page ─────────────────────────────────────────────────────────────

interface HaseefDetailPageProps {
  onDeleted: () => void;
  allHaseefs?: HaseefListItem[];
}

export function HaseefDetailPage({ onDeleted, allHaseefs = [] }: HaseefDetailPageProps) {
  const { haseefId } = useParams<{ haseefId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [haseef, setHaseef] = useState<Haseef | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Spaces state
  const [spaces, setSpaces] = useState<HaseefSpace[]>([]);
  const [spacesLoading, setSpacesLoading] = useState(false);
  const [showCreateSpace, setShowCreateSpace] = useState(false);
  const [isCreatingSpace, setIsCreatingSpace] = useState(false);

  // Create space dialog state
  const [createMode, setCreateMode] = useState<"group" | "direct">("group");
  const [newSpaceName, setNewSpaceName] = useState("");
  const [directTarget, setDirectTarget] = useState<{
    kind: "haseef" | "contact";
    id: string;
    entityId: string;
    name: string;
  } | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);

  const fetchSpaces = useCallback(async () => {
    if (!haseefId) return;
    setSpacesLoading(true);
    try {
      const { spaces: s } = await haseefsApi.listSpaces(haseefId);
      setSpaces(s);
    } catch {
      // non-fatal
    } finally {
      setSpacesLoading(false);
    }
  }, [haseefId]);

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

  useEffect(() => {
    fetchSpaces();
  }, [fetchSpaces]);

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

  // Fetch contacts when create dialog opens
  useEffect(() => {
    if (!showCreateSpace) return;
    let cancelled = false;
    setContactsLoading(true);
    spacesApi.listContacts().then(({ contacts: c }) => {
      if (!cancelled) setContacts(c);
    }).catch(() => {}).finally(() => {
      if (!cancelled) setContactsLoading(false);
    });
    return () => { cancelled = true; };
  }, [showCreateSpace]);

  const resetCreateDialog = useCallback(() => {
    setShowCreateSpace(false);
    setCreateMode("group");
    setNewSpaceName("");
    setDirectTarget(null);
  }, []);

  const handleCreate = useCallback(async () => {
    if (!haseefId) return;
    setIsCreatingSpace(true);
    try {
      if (createMode === "group") {
        if (!newSpaceName.trim()) return;
        await haseefsApi.createSpace(haseefId, { name: newSpaceName.trim() });
        toast("Group space created", "success");
      } else {
        if (!directTarget) return;
        if (directTarget.kind === "haseef") {
          await haseefsApi.createDirectSpace(haseefId, { targetHaseefId: directTarget.id });
        } else {
          await haseefsApi.createDirectSpace(haseefId, { targetEntityId: directTarget.entityId });
        }
        toast("Direct space created", "success");
      }
      resetCreateDialog();
      await fetchSpaces();
    } catch (err: any) {
      toast(err.message || "Failed to create space", "error");
    } finally {
      setIsCreatingSpace(false);
    }
  }, [haseefId, createMode, newSpaceName, directTarget, toast, fetchSpaces, resetCreateDialog]);

  // Other haseefs for direct space (exclude current)
  const otherHaseefs = allHaseefs.filter((h) => h.haseefId !== haseefId);

  const canCreate = createMode === "group" ? !!newSpaceName.trim() : !!directTarget;

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
            value={spacesLoading ? "…" : String(spaces.length)}
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

        {/* Spaces Section */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <HashIcon className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">
                Spaces ({spaces.length})
              </h3>
            </div>
            <Button size="sm" onClick={() => setShowCreateSpace(true)}>
              <PlusIcon className="size-3.5" />
              New Space
            </Button>
          </div>

          {spacesLoading ? (
            <div className="flex items-center justify-center py-8">
              <LoaderIcon className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : spaces.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="size-10 rounded-xl bg-muted/50 flex items-center justify-center mb-2">
                <HashIcon className="size-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                Not in any spaces yet
              </p>
              <p className="text-xs text-muted-foreground/70 mt-0.5">
                Create a space or add this haseef to one
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {spaces.map((space) => {
                // Can the owner open this space?
                // haseef-human direct → can't open (private)
                // haseef-haseef direct / group → can open (read-only via ownership)
                const canOpen = space.canView;
                const isHumanDirect = space.directType === "haseef-human";
                const isHaseefDirect = space.directType === "haseef-haseef";

                return (
                  <div
                    key={space.id}
                    onClick={() => canOpen && navigate(`/spaces/${space.id}`)}
                    className={cn(
                      "w-full text-left rounded-xl border p-3.5 transition-all",
                      canOpen
                        ? "border-border/60 bg-background/50 hover:border-primary/40 hover:bg-background cursor-pointer group"
                        : "border-border/40 bg-muted/30 opacity-60 cursor-not-allowed",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className={cn(
                            "text-sm font-medium truncate",
                            canOpen ? "text-foreground group-hover:text-primary transition-colors" : "text-muted-foreground",
                          )}>
                            {space.name || "Unnamed Space"}
                          </h4>
                          {isHaseefDirect && (
                            <Badge variant="outline" className="text-[10px] gap-0.5 shrink-0">
                              <BotIcon className="size-2.5" />
                              Direct
                            </Badge>
                          )}
                          {isHumanDirect && (
                            <Badge variant="outline" className="text-[10px] gap-0.5 shrink-0">
                              <UserIcon className="size-2.5" />
                              Private
                            </Badge>
                          )}
                          {canOpen && (
                            <Badge variant="outline" className="text-[10px] gap-0.5 shrink-0">
                              <EyeIcon className="size-2.5" />
                              Read-only
                            </Badge>
                          )}
                          {!canOpen && isHumanDirect && (
                            <Badge variant="outline" className="text-[10px] gap-0.5 shrink-0 opacity-70">
                              <LockIcon className="size-2.5" />
                              No access
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1.5">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <UsersIcon className="size-3" />
                            {space.members.length} member{space.members.length !== 1 ? "s" : ""}
                          </div>
                          <div className="flex -space-x-1.5">
                            {space.members.slice(0, 5).map((m) => (
                              <div
                                key={m.entityId}
                                className={cn(
                                  "size-5 rounded-full border-2 border-background flex items-center justify-center text-[8px] font-bold text-white",
                                  m.type === "agent" ? "bg-emerald-500" : "bg-primary",
                                )}
                                title={m.name}
                              >
                                {m.name[0]?.toUpperCase()}
                              </div>
                            ))}
                            {space.members.length > 5 && (
                              <div className="size-5 rounded-full border-2 border-background bg-muted flex items-center justify-center text-[8px] font-medium text-muted-foreground">
                                +{space.members.length - 5}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Create Space Dialog (unified: Group / Direct) */}
        <Dialog open={showCreateSpace} onClose={resetCreateDialog}>
          <DialogHeader onClose={resetCreateDialog}>
            <DialogTitle>Create space for {haseef.name}</DialogTitle>
            <DialogDescription>
              {createMode === "group"
                ? "Create a group space. You can view it read-only."
                : "Create a 1-on-1 direct space for this haseef."}
            </DialogDescription>
          </DialogHeader>

          {/* Mode toggle */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <button
              onClick={() => { setCreateMode("group"); setDirectTarget(null); }}
              className={cn(
                "flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-colors",
                createMode === "group"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-border/80 hover:bg-muted/50",
              )}
            >
              <UsersIcon className={cn("size-6", createMode === "group" ? "text-primary" : "text-muted-foreground")} />
              <div className="text-center">
                <p className={cn("text-sm font-medium", createMode === "group" ? "text-primary" : "text-foreground")}>Group</p>
                <p className="text-[11px] text-muted-foreground">You can view (read-only)</p>
              </div>
            </button>
            <button
              onClick={() => { setCreateMode("direct"); setNewSpaceName(""); }}
              className={cn(
                "flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-colors",
                createMode === "direct"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-border/80 hover:bg-muted/50",
              )}
            >
              <UserIcon className={cn("size-6", createMode === "direct" ? "text-primary" : "text-muted-foreground")} />
              <div className="text-center">
                <p className={cn("text-sm font-medium", createMode === "direct" ? "text-primary" : "text-foreground")}>Direct</p>
                <p className="text-[11px] text-muted-foreground">1-on-1 space</p>
              </div>
            </button>
          </div>

          {/* GROUP MODE */}
          {createMode === "group" && (
            <div className="space-y-3">
              <Input
                label="Space name"
                id="haseef-space-name"
                placeholder="e.g. Research Lab"
                value={newSpaceName}
                onChange={(e) => setNewSpaceName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && canCreate && handleCreate()}
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground">
                {haseef.name} will be added as a member. You'll be added as a read-only viewer.
              </p>
            </div>
          )}

          {/* DIRECT MODE */}
          {createMode === "direct" && (
            <div className="space-y-3">
              {directTarget ? (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 flex items-center gap-3">
                  {directTarget.kind === "haseef" ? (
                    <div className="flex size-8 items-center justify-center rounded-full bg-emerald-500/15 shrink-0">
                      <BotIcon className="size-3.5 text-emerald-600" />
                    </div>
                  ) : (
                    <Avatar name={directTarget.name} size="sm" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{directTarget.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {directTarget.kind === "haseef" ? "Haseef — you can view (read-only)" : "Human — private, you cannot view"}
                    </p>
                  </div>
                  <button onClick={() => setDirectTarget(null)} className="p-1 rounded-md hover:bg-muted/60 transition-colors">
                    <XIcon className="size-4 text-muted-foreground" />
                  </button>
                </div>
              ) : (
                <>
                  <label className="text-sm font-medium text-foreground">Select who to pair with</label>
                  {contactsLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <LoaderIcon className="size-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="max-h-[260px] overflow-y-auto rounded-lg border border-border divide-y divide-border">
                      {otherHaseefs.length === 0 && contacts.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-6">
                          No contacts or other haseefs available.
                        </p>
                      )}

                      {/* Other haseefs */}
                      {otherHaseefs.length > 0 && (
                        <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/30">
                          Haseefs
                        </div>
                      )}
                      {otherHaseefs.map((h) => (
                        <button
                          key={h.haseefId}
                          onClick={() => setDirectTarget({ kind: "haseef", id: h.haseefId, entityId: h.entityId, name: h.name })}
                          className="flex items-center gap-2.5 w-full px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex size-8 items-center justify-center rounded-full bg-emerald-500/15 shrink-0">
                            <BotIcon className="size-3.5 text-emerald-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium truncate">{h.name}</span>
                            <p className="text-[11px] text-muted-foreground">You can view (read-only)</p>
                          </div>
                        </button>
                      ))}

                      {/* Contacts (humans) */}
                      {contacts.length > 0 && (
                        <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/30">
                          People
                        </div>
                      )}
                      {contacts.map((c) => (
                        <button
                          key={c.entityId}
                          onClick={() => setDirectTarget({ kind: "contact", id: c.entityId, entityId: c.entityId, name: c.displayName || "Unknown" })}
                          className="flex items-center gap-2.5 w-full px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
                        >
                          <Avatar name={c.displayName || "?"} src={c.avatarUrl} size="sm" />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium truncate">{c.displayName || "Unknown"}</span>
                            <p className="text-[11px] text-muted-foreground">Private — you cannot view</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={resetCreateDialog} disabled={isCreatingSpace}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!canCreate || isCreatingSpace}>
              {isCreatingSpace && <LoaderIcon className="size-4 animate-spin" />}
              {isCreatingSpace ? "Creating..." : createMode === "group" ? "Create group" : "Create direct space"}
            </Button>
          </DialogFooter>
        </Dialog>

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
