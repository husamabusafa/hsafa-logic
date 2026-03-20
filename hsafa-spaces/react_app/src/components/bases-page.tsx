import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  PlusIcon,
  UsersIcon,
  BotIcon,
  CopyIcon,
  CheckIcon,
  RefreshCwIcon,
  TrashIcon,
  LogOutIcon,
  LoaderIcon,
  ShieldIcon,
  CrownIcon,
  UserIcon,
  LinkIcon,
  XIcon,
  ChevronRightIcon,
  PencilIcon,
  QrCodeIcon,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { basesApi, haseefsApi, spacesApi, type Base, type BaseMember, type HaseefListItem } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";

// ─── Bases Page ──────────────────────────────────────────────────────────────

export function BasesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { baseId } = useParams<{ baseId?: string }>();
  const [bases, setBases] = useState<Base[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  const fetchBases = useCallback(async () => {
    try {
      const { bases: list } = await basesApi.list();
      setBases(list);
    } catch (err) {
      console.error("Failed to fetch bases:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBases();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoaderIcon className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Detail view when baseId is in URL
  if (baseId) {
    const selectedBase = bases.find((b) => b.id === baseId);
    if (selectedBase) {
      return (
        <BaseDetail
          base={selectedBase}
          currentEntityId={user?.entityId ?? ""}
          onBack={() => navigate("/bases")}
          onRefresh={fetchBases}
        />
      );
    }
    // If base not found yet (still loading or invalid ID), show loading or 404
    if (loading) {
      return (
        <div className="flex items-center justify-center h-full">
          <LoaderIcon className="size-6 animate-spin text-muted-foreground" />
        </div>
      );
    }
    // Invalid base ID - redirect to bases list
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <p className="text-muted-foreground mb-4">Base not found</p>
        <Button onClick={() => navigate("/bases")}>Back to Bases</Button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Bases</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Group your humans and Haseefs together
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowJoin(true)}>
              <LinkIcon className="size-4" />
              Join
            </Button>
            <Button onClick={() => setShowCreate(true)}>
              <PlusIcon className="size-4" />
              New Base
            </Button>
          </div>
        </div>

        {/* Base list */}
        {bases.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4">
              <UsersIcon className="size-8" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">No bases yet</h3>
            <p className="text-sm text-muted-foreground max-w-xs mb-4">
              Create a base to group your Haseefs and invite collaborators.
            </p>
            <Button onClick={() => setShowCreate(true)}>
              <PlusIcon className="size-4" />
              Create Base
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {bases.map((base) => (
              <BaseCard
                key={base.id}
                base={base}
                onClick={() => navigate(`/bases/${base.id}`)}
              />
            ))}
          </div>
        )}

        {/* Create dialog */}
        {showCreate && (
          <CreateBaseDialog
            onClose={() => setShowCreate(false)}
            onCreated={(base) => {
              setBases((prev) => [...prev, base]);
              setShowCreate(false);
              navigate(`/bases/${base.id}`);
              toast("Base created", "success");
            }}
          />
        )}

        {/* Join dialog */}
        {showJoin && (
          <JoinBaseDialog
            onClose={() => setShowJoin(false)}
            onJoined={(base) => {
              setBases((prev) => [...prev, base]);
              setShowJoin(false);
              navigate(`/bases/${base.id}`);
              toast("Joined base!", "success");
            }}
          />
        )}
      </div>
    </div>
  );
}

// ─── Base Card ───────────────────────────────────────────────────────────────

function BaseCard({ base, onClick }: { base: Base; onClick: () => void }) {
  const humans = base.members.filter((m) => m.type === "human");
  const agents = base.members.filter((m) => m.type === "agent");

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-2xl border border-border bg-card p-5 hover:border-primary/40 hover:shadow-md transition-all"
    >
      <div className="flex items-center gap-4">
        <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <UsersIcon className="size-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground truncate">{base.name}</h3>
            <RoleBadge role={base.myRole} />
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <UserIcon className="size-3" />
              {humans.length} human{humans.length !== 1 ? "s" : ""}
            </span>
            <span className="flex items-center gap-1">
              <BotIcon className="size-3" />
              {agents.length} Haseef{agents.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
        <ChevronRightIcon className="size-4 text-muted-foreground" />
      </div>
    </button>
  );
}

// ─── Base Detail ─────────────────────────────────────────────────────────────

function BaseDetail({
  base,
  currentEntityId,
  onBack,
  onRefresh,
}: {
  base: Base;
  currentEntityId: string;
  onBack: () => void;
  onRefresh: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [copiedCode, setCopiedCode] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(base.name);

  const [copiedLink, setCopiedLink] = useState(false);
  const [showAddHaseef, setShowAddHaseef] = useState(false);
  const [inviteLinkActive, setInviteLinkActive] = useState(base.inviteLinkActive);
  const [showQR, setShowQR] = useState(false);
  const [isTogglingLink, setIsTogglingLink] = useState(false);

  const isAdmin = base.myRole === "owner" || base.myRole === "admin";
  const isOwner = base.myRole === "owner";

  const humans = base.members.filter((m) => m.type === "human");
  const agents = base.members.filter((m) => m.type === "agent");

  const inviteLink = `${window.location.origin}/join/${base.inviteCode}`;

  const handleToggleLink = async () => {
    setIsTogglingLink(true);
    try {
      const result = await basesApi.toggleInviteLink(base.id, !inviteLinkActive);
      setInviteLinkActive(result.inviteLinkActive);
      toast(result.inviteLinkActive ? "Invite link activated" : "Invite link deactivated", "success");
    } catch (err: any) {
      toast(err.message || "Failed to toggle invite link", "error");
    } finally {
      setIsTogglingLink(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopiedLink(true);
    toast("Invite link copied!", "success");
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(base.inviteCode);
    setCopiedCode(true);
    toast("Invite code copied!", "success");
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleRegenerateCode = async () => {
    try {
      await basesApi.regenerateCode(base.id);
      await onRefresh();
      toast("Invite code regenerated", "success");
    } catch (err: any) {
      toast(err.message || "Failed to regenerate code", "error");
    }
  };

  const handleSaveName = async () => {
    if (!nameValue.trim() || nameValue.trim() === base.name) {
      setEditingName(false);
      return;
    }
    try {
      await basesApi.update(base.id, { name: nameValue.trim() });
      await onRefresh();
      setEditingName(false);
      toast("Name updated", "success");
    } catch (err: any) {
      toast(err.message || "Failed to update name", "error");
    }
  };

  const handleRemoveMember = async (entityId: string) => {
    try {
      await basesApi.removeMember(base.id, entityId);
      await onRefresh();
      toast("Member removed", "success");
    } catch (err: any) {
      toast(err.message || "Failed to remove member", "error");
    }
  };

  const handleUpdateRole = async (entityId: string, role: string) => {
    try {
      await basesApi.updateMemberRole(base.id, entityId, role);
      await onRefresh();
      toast("Role updated", "success");
    } catch (err: any) {
      toast(err.message || "Failed to update role", "error");
    }
  };

  const handleLeave = async () => {
    try {
      await basesApi.removeMember(base.id, currentEntityId);
      await onRefresh();
      onBack();
      toast("Left base", "success");
    } catch (err: any) {
      toast(err.message || "Failed to leave base", "error");
    }
  };

  const handleDelete = async () => {
    try {
      await basesApi.delete(base.id);
      await onRefresh();
      onBack();
      toast("Base deleted", "success");
    } catch (err: any) {
      toast(err.message || "Failed to delete base", "error");
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto p-6">
        {/* Back + Title */}
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
        >
          ← Back to Bases
        </button>

        {/* Base header */}
        <div className="rounded-2xl border border-border bg-card p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="size-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <UsersIcon className="size-7 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              {editingName ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={nameValue}
                    onChange={(e) => setNameValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                    className="text-lg font-bold bg-transparent border-b border-primary outline-none text-foreground"
                  />
                  <Button size="sm" variant="ghost" onClick={handleSaveName}>
                    <CheckIcon className="size-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setEditingName(false); setNameValue(base.name); }}>
                    <XIcon className="size-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold text-foreground">{base.name}</h1>
                  <RoleBadge role={base.myRole} />
                  {isAdmin && (
                    <button onClick={() => setEditingName(true)} className="text-muted-foreground hover:text-foreground">
                      <PencilIcon className="size-3.5" />
                    </button>
                  )}
                </div>
              )}
              <p className="text-sm text-muted-foreground mt-1">
                {base.memberCount} member{base.memberCount !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          {/* Invite link + code */}
          <div className="mt-5 p-4 rounded-xl bg-muted/50 border border-border space-y-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Invite Link</p>
              <div className="flex items-center gap-2">
                <div className={cn(
                  "flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground truncate font-mono",
                  !inviteLinkActive && "opacity-50 line-through",
                )}>
                  {inviteLink}
                </div>
                <Button size="sm" variant="outline" onClick={handleCopyLink} disabled={!inviteLinkActive}>
                  {copiedLink ? <CheckIcon className="size-3.5" /> : <LinkIcon className="size-3.5" />}
                  {copiedLink ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Code</p>
                <div className="flex items-center gap-2">
                  <p className={cn("text-base font-mono font-bold tracking-wider text-foreground", !inviteLinkActive && "opacity-50 line-through")}>{base.inviteCode}</p>
                  <button onClick={handleCopyCode} className="text-muted-foreground hover:text-foreground" disabled={!inviteLinkActive}>
                    {copiedCode ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
                  </button>
                </div>
              </div>
              {isAdmin && (
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={handleRegenerateCode}>
                    <RefreshCwIcon className="size-3.5" />
                    Regenerate
                  </Button>
                  <Button
                    size="sm"
                    variant={inviteLinkActive ? "outline" : "default"}
                    onClick={handleToggleLink}
                    disabled={isTogglingLink}
                  >
                    {isTogglingLink ? "..." : inviteLinkActive ? "Deactivate" : "Activate"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowQR(!showQR)}>
                    <QrCodeIcon className="size-3.5" />
                  </Button>
                </div>
              )}
            </div>

            {/* QR Code */}
            {showQR && inviteLinkActive && (
              <div className="flex justify-center p-4 bg-white rounded-lg border border-border">
                <QRCodeSVG value={inviteLink} size={180} level="M" />
              </div>
            )}

            {!inviteLinkActive && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                This invite link is currently deactivated. No one can join using it.
              </p>
            )}

            {inviteLinkActive && (
              <p className="text-xs text-muted-foreground">
                Share the link or code so others can join your base
              </p>
            )}
          </div>
        </div>

        {/* Humans */}
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <UserIcon className="size-4" />
            Humans ({humans.length})
          </h2>
          <div className="space-y-2">
            {humans.map((m) => (
              <MemberRow
                key={m.entityId}
                member={m}
                isMe={m.entityId === currentEntityId}
                canManage={isOwner && m.entityId !== currentEntityId}
                onRemove={() => handleRemoveMember(m.entityId)}
                onChangeRole={(role) => handleUpdateRole(m.entityId, role)}
              />
            ))}
          </div>
        </div>

        {/* Haseefs */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <BotIcon className="size-4" />
              Haseefs ({agents.length})
            </h2>
            <Button size="sm" variant="outline" onClick={() => setShowAddHaseef(true)}>
              <PlusIcon className="size-3.5" />
              Add Haseef
            </Button>
          </div>
          {agents.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No Haseefs in this base yet. Click "Add Haseef" to add one you own.
            </p>
          ) : (
            <div className="space-y-2">
              {agents.map((m) => (
                <MemberRow
                  key={m.entityId}
                  member={m}
                  isMe={false}
                  canManage={isAdmin}
                  onRemove={() => handleRemoveMember(m.entityId)}
                  onChangeRole={() => {}}
                />
              ))}
            </div>
          )}
        </div>

        {/* Add Haseef Dialog */}
        {showAddHaseef && (
          <AddHaseefDialog
            baseId={base.id}
            existingEntityIds={new Set(base.members.map((m) => m.entityId))}
            onClose={() => setShowAddHaseef(false)}
            onAdded={async () => {
              await onRefresh();
              setShowAddHaseef(false);
              toast("Haseef added to base", "success");
            }}
          />
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t border-border">
          {!isOwner && (
            <Button variant="outline" className="text-red-500 hover:text-red-600" onClick={handleLeave}>
              <LogOutIcon className="size-4" />
              Leave Base
            </Button>
          )}
          {isOwner && (
            <Button variant="outline" className="text-red-500 hover:text-red-600" onClick={handleDelete}>
              <TrashIcon className="size-4" />
              Delete Base
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Member Row ──────────────────────────────────────────────────────────────

function MemberRow({
  member,
  isMe,
  canManage,
  onRemove,
  onChangeRole,
}: {
  member: BaseMember;
  isMe: boolean;
  canManage: boolean;
  onRemove: () => void;
  onChangeRole: (role: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card">
      <div className={cn(
        "size-9 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-bold",
        member.type === "agent" ? "bg-emerald-500" : "bg-primary",
      )}>
        {member.type === "agent" ? (
          <BotIcon className="size-4" />
        ) : (
          member.displayName?.charAt(0)?.toUpperCase() || "?"
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">
            {member.displayName}
          </span>
          {isMe && <span className="text-xs text-muted-foreground">(you)</span>}
          <RoleBadge role={member.role} small />
        </div>
        <span className="text-xs text-muted-foreground capitalize">{member.type}</span>
      </div>
      {canManage && (
        <div className="flex items-center gap-1">
          {member.type === "human" && member.role !== "admin" && (
            <Button size="sm" variant="ghost" title="Make admin" onClick={() => onChangeRole("admin")}>
              <ShieldIcon className="size-3.5" />
            </Button>
          )}
          {member.type === "human" && member.role === "admin" && (
            <Button size="sm" variant="ghost" title="Make member" onClick={() => onChangeRole("member")}>
              <UserIcon className="size-3.5" />
            </Button>
          )}
          <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600" onClick={onRemove}>
            <XIcon className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Role Badge ──────────────────────────────────────────────────────────────

function RoleBadge({ role, small }: { role: string; small?: boolean }) {
  if (role === "member") return null;
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-0.5",
        small ? "text-[9px] px-1 py-0" : "text-[10px]",
        role === "owner" ? "border-amber-500/40 text-amber-600" : "border-blue-500/40 text-blue-600",
      )}
    >
      {role === "owner" ? <CrownIcon className={cn(small ? "size-2" : "size-2.5")} /> : <ShieldIcon className={cn(small ? "size-2" : "size-2.5")} />}
      {role}
    </Badge>
  );
}

// ─── Create Base Dialog ──────────────────────────────────────────────────────

function CreateBaseDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (base: Base) => void;
}) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      const { base } = await basesApi.create({ name: name.trim() });
      onCreated(base);
    } catch (err: any) {
      console.error("Create base error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-xl w-full max-w-md p-6 mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Create Base</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <XIcon className="size-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-foreground mb-1.5">Name</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. My Team, Family, Project X"
            className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <div className="flex justify-end gap-2 mt-5">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!name.trim() || loading}>
              {loading && <LoaderIcon className="size-4 animate-spin" />}
              Create
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Join Base Dialog ────────────────────────────────────────────────────────

function JoinBaseDialog({
  onClose,
  onJoined,
}: {
  onClose: () => void;
  onJoined: (base: Base) => void;
}) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{ id: string; name: string; memberCount: number } | null>(null);
  const [error, setError] = useState("");

  const handleLookup = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError("");
    setPreview(null);
    try {
      const { base } = await basesApi.resolveCode(code.trim());
      setPreview(base);
    } catch {
      setError("Invalid invite code");
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    setLoading(true);
    setError("");
    try {
      const { base } = await basesApi.join(code.trim());
      onJoined(base);
    } catch (err: any) {
      setError(err.message || "Failed to join");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-xl w-full max-w-md p-6 mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Join a Base</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <XIcon className="size-5" />
          </button>
        </div>

        <label className="block text-sm font-medium text-foreground mb-1.5">Invite Code</label>
        <div className="flex gap-2">
          <input
            autoFocus
            value={code}
            onChange={(e) => { setCode(e.target.value.toUpperCase()); setPreview(null); setError(""); }}
            placeholder="e.g. ABCD1234"
            className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-mono tracking-wider text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 uppercase"
          />
          <Button onClick={handleLookup} disabled={!code.trim() || loading}>
            {loading ? <LoaderIcon className="size-4 animate-spin" /> : "Lookup"}
          </Button>
        </div>

        {error && <p className="text-sm text-red-500 mt-2">{error}</p>}

        {preview && (
          <div className="mt-4 p-4 rounded-xl border border-border bg-muted/30">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <UsersIcon className="size-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{preview.name}</p>
                <p className="text-xs text-muted-foreground">{preview.memberCount} member{preview.memberCount !== 1 ? "s" : ""}</p>
              </div>
            </div>
            <Button className="w-full mt-3" onClick={handleJoin} disabled={loading}>
              {loading ? <LoaderIcon className="size-4 animate-spin" /> : "Join Base"}
            </Button>
          </div>
        )}

        <div className="flex justify-end mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Haseef Dialog ───────────────────────────────────────────────────────

function AddHaseefDialog({
  baseId,
  existingEntityIds,
  onClose,
  onAdded,
}: {
  baseId: string;
  existingEntityIds: Set<string>;
  onClose: () => void;
  onAdded: () => Promise<void>;
}) {
  const [haseefs, setHaseefs] = useState<HaseefListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    haseefsApi.list().then(({ haseefs: list }) => {
      setHaseefs(list);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const available = haseefs.filter((h) => h.entityId && !existingEntityIds.has(h.entityId));

  const handleAdd = async (h: HaseefListItem) => {
    if (!h.entityId) return;
    setAdding(h.entityId);
    try {
      await basesApi.addMember(baseId, h.entityId);
      await onAdded();
    } catch (err: any) {
      console.error("Failed to add haseef:", err);
    } finally {
      setAdding(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-xl w-full max-w-md p-6 mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Add Haseef to Base</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <XIcon className="size-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <LoaderIcon className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : available.length === 0 ? (
          <div className="text-center py-8">
            <BotIcon className="size-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {haseefs.length === 0
                ? "You don't own any Haseefs yet."
                : "All your Haseefs are already in this base."}
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {available.map((h) => (
              <div
                key={h.haseefId}
                className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:border-primary/30 transition-colors"
              >
                {h.avatarUrl ? (
                  <img src={h.avatarUrl} alt={h.name} className="size-9 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="size-9 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                    <BotIcon className="size-4 text-white" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{h.name}</p>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleAdd(h)}
                  disabled={adding === h.entityId}
                >
                  {adding === h.entityId ? (
                    <LoaderIcon className="size-3.5 animate-spin" />
                  ) : (
                    <PlusIcon className="size-3.5" />
                  )}
                  Add
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end mt-4">
          <Button variant="outline" onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Join By Link Page ───────────────────────────────────────────────────────

export function JoinByLinkPage() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [preview, setPreview] = useState<{ id: string; name: string; memberCount: number } | null>(null);
  const [error, setError] = useState("");
  const [joined, setJoined] = useState(false);

  // Extract code from URL
  useEffect(() => {
    const pathParts = window.location.pathname.split("/");
    const inviteCode = pathParts[pathParts.length - 1];
    if (inviteCode) {
      setCode(inviteCode);
      basesApi.resolveCode(inviteCode).then(({ base }) => {
        setPreview(base);
      }).catch(() => {
        setError("Invalid or expired invite link");
      }).finally(() => setLoading(false));
    } else {
      setError("No invite code found");
      setLoading(false);
    }
  }, []);

  const handleJoin = async () => {
    setJoining(true);
    setError("");
    try {
      await basesApi.join(code);
      setJoined(true);
      toast("Joined base!", "success");
    } catch (err: any) {
      setError(err.message || "Failed to join");
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-dvh bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-border bg-card p-8 shadow-lg text-center">
          {loading ? (
            <LoaderIcon className="size-8 animate-spin text-muted-foreground mx-auto" />
          ) : error && !preview ? (
            <>
              <div className="size-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
                <XIcon className="size-8 text-red-500" />
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-2">Invalid Link</h2>
              <p className="text-sm text-muted-foreground mb-4">{error}</p>
              <Button variant="outline" onClick={() => window.location.href = "/bases"}>
                Go to Bases
              </Button>
            </>
          ) : joined ? (
            <>
              <div className="size-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
                <CheckIcon className="size-8 text-emerald-500" />
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-2">Joined!</h2>
              <p className="text-sm text-muted-foreground mb-4">
                You're now a member of <strong>{preview?.name}</strong>
              </p>
              <Button onClick={() => window.location.href = "/bases"}>
                Go to Bases
              </Button>
            </>
          ) : preview ? (
            <>
              <div className="size-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <UsersIcon className="size-8 text-primary" />
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-1">Join Base</h2>
              <p className="text-xl font-bold text-foreground mb-1">{preview.name}</p>
              <p className="text-sm text-muted-foreground mb-6">
                {preview.memberCount} member{preview.memberCount !== 1 ? "s" : ""}
              </p>
              {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
              {!isAuthenticated ? (
                <>
                  <p className="text-sm text-muted-foreground mb-4">Sign in to join this base</p>
                  <Button onClick={() => window.location.href = `/auth?redirect=/join/${code}`}>
                    Sign In
                  </Button>
                </>
              ) : (
                <Button className="w-full" onClick={handleJoin} disabled={joining}>
                  {joining ? <LoaderIcon className="size-4 animate-spin" /> : "Join Base"}
                </Button>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─── Join Space By Link Page ─────────────────────────────────────────────────

export function JoinSpaceByLinkPage() {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [preview, setPreview] = useState<{ id: string; name: string | null; memberCount: number } | null>(null);
  const [error, setError] = useState("");
  const [joined, setJoined] = useState(false);
  const [joinedSpaceId, setJoinedSpaceId] = useState<string | null>(null);

  useEffect(() => {
    const pathParts = window.location.pathname.split("/");
    const inviteCode = pathParts[pathParts.length - 1];
    if (inviteCode) {
      setCode(inviteCode);
      spacesApi.resolveSpaceCode(inviteCode).then(({ space }) => {
        setPreview(space);
      }).catch(() => {
        setError("Invalid or expired invite link");
      }).finally(() => setLoading(false));
    } else {
      setError("No invite code found");
      setLoading(false);
    }
  }, []);

  const handleJoin = async () => {
    setJoining(true);
    setError("");
    try {
      const { space } = await spacesApi.joinByCode(code);
      setJoined(true);
      setJoinedSpaceId(space.id);
      toast("Joined space!", "success");
    } catch (err: any) {
      if (err.message?.includes("Already a member")) {
        setError("You're already a member of this space");
      } else {
        setError(err.message || "Failed to join");
      }
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-dvh bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-border bg-card p-8 shadow-lg text-center">
          {loading ? (
            <LoaderIcon className="size-8 animate-spin text-muted-foreground mx-auto" />
          ) : error && !preview ? (
            <>
              <div className="size-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
                <XIcon className="size-8 text-red-500" />
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-2">Invalid Link</h2>
              <p className="text-sm text-muted-foreground mb-4">{error}</p>
              <Button variant="outline" onClick={() => window.location.href = "/spaces"}>
                Go to Spaces
              </Button>
            </>
          ) : joined ? (
            <>
              <div className="size-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
                <CheckIcon className="size-8 text-emerald-500" />
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-2">Joined!</h2>
              <p className="text-sm text-muted-foreground mb-4">
                You're now a member of <strong>{preview?.name || "this space"}</strong>
              </p>
              <Button onClick={() => window.location.href = joinedSpaceId ? `/spaces/${joinedSpaceId}` : "/spaces"}>
                Open Space
              </Button>
            </>
          ) : preview ? (
            <>
              <div className="size-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <UsersIcon className="size-8 text-primary" />
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-1">Join Space</h2>
              <p className="text-xl font-bold text-foreground mb-1">{preview.name || "Unnamed Space"}</p>
              <p className="text-sm text-muted-foreground mb-6">
                {preview.memberCount} member{preview.memberCount !== 1 ? "s" : ""}
              </p>
              {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
              {!isAuthenticated ? (
                <>
                  <p className="text-sm text-muted-foreground mb-4">Sign in to join this space</p>
                  <Button onClick={() => window.location.href = `/auth?redirect=/join/space/${code}`}>
                    Sign In
                  </Button>
                </>
              ) : (
                <Button className="w-full" onClick={handleJoin} disabled={joining}>
                  {joining ? <LoaderIcon className="size-4 animate-spin" /> : "Join Space"}
                </Button>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
