import { useState, useRef } from "react";
import {
  XIcon,
  ShieldIcon,
  CrownIcon,
  UserPlusIcon,
  BotIcon,
  LogOutIcon,
  SettingsIcon,
  ChevronLeftIcon,
  ImageIcon,
  UsersIcon,
  TrashIcon,
  ChevronDownIcon,
  LoaderIcon,
  EyeIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { MockSpace, MockMember } from "@/lib/mock-data";
import { mediaApi, spacesApi } from "@/lib/api";

export interface AvailableHaseef {
  entityId: string;
  name: string;
  description?: string;
}

export function SpaceSettingsPanel({
  space,
  onBack,
  onClose,
  onInvite,
  onDeleteSpace,
  onLeaveSpace,
  currentEntityId,
  onSaveSettings,
  onUpdateMemberRole,
  onRemoveMember,
  onAddMember,
  availableHaseefs,
}: {
  space: MockSpace;
  onBack: () => void;
  onClose: () => void;
  onInvite: () => void;
  onDeleteSpace?: () => Promise<void>;
  onLeaveSpace?: () => Promise<void>;
  currentEntityId?: string;
  onSaveSettings?: (data: { name?: string; description?: string }) => Promise<void>;
  onUpdateMemberRole?: (entityId: string, role: string) => Promise<void>;
  onRemoveMember?: (entityId: string) => Promise<void>;
  onAddMember?: (entityId: string) => Promise<void>;
  availableHaseefs?: AvailableHaseef[];
}) {
  const [name, setName] = useState(space.name);
  const [description, setDescription] = useState(space.description);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [addingHaseefId, setAddingHaseefId] = useState<string | null>(null);
  const [spaceImageUrl, setSpaceImageUrl] = useState<string | null>(
    (space as any).metadata?.imageUrl || null,
  );
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingImage(true);
    try {
      const result = await mediaApi.upload(file);
      const imageUrl = result.url;
      await spacesApi.update(space.id, { metadata: { imageUrl } });
      setSpaceImageUrl(imageUrl);
    } catch (err) {
      console.error("Image upload error:", err);
    } finally {
      setIsUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };
  const myMember = currentEntityId
    ? space.members.find((m) => m.entityId === currentEntityId)
    : undefined;
  const isOwner = myMember?.role === "owner";
  const isAdmin = myMember?.role === "admin" || isOwner;

  const humans = space.members.filter((m) => m.type === "human");
  const agents = space.members.filter((m) => m.type === "agent");

  const handleSave = async () => {
    if (!onSaveSettings || isSaving) return;
    setIsSaving(true);
    try {
      await onSaveSettings({ name, description });
    } catch (err) {
      console.error("Save settings error:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddHaseef = async (entityId: string) => {
    if (!onAddMember || addingHaseefId) return;
    setAddingHaseefId(entityId);
    try {
      await onAddMember(entityId);
    } catch (err) {
      console.error("Add haseef error:", err);
    } finally {
      setAddingHaseefId(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 h-14 shrink-0 border-b border-border px-4">
        <Button variant="ghost" size="icon" onClick={onBack} className="size-8">
          <ChevronLeftIcon className="size-4" />
        </Button>
        <SettingsIcon className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground flex-1">Space Settings</h3>
        <Button variant="ghost" size="icon" onClick={onClose} className="size-8">
          <XIcon className="size-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* General Settings */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">General</h4>
          <div className="space-y-3">
            {/* Space Image */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Space Image</label>
              <div className="flex items-center gap-3">
                {spaceImageUrl ? (
                  <img src={spaceImageUrl} alt={space.name} className="size-14 rounded-xl object-cover border border-border" />
                ) : (
                  <div className="size-14 rounded-xl bg-muted flex items-center justify-center border border-border">
                    <ImageIcon className="size-6 text-muted-foreground/40" />
                  </div>
                )}
                {isAdmin && (
                  <>
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageUpload}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isUploadingImage}
                      onClick={() => imageInputRef.current?.click()}
                    >
                      {isUploadingImage ? (
                        <><LoaderIcon className="size-3.5 animate-spin mr-1.5" />Uploading...</>
                      ) : (
                        <>{spaceImageUrl ? "Change" : "Upload"}</>
                      )}
                    </Button>
                  </>
                )}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Space Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!isAdmin}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={!isAdmin}
                rows={3}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
              />
            </div>
            {isAdmin && onSaveSettings && (
              <Button
                size="sm"
                disabled={isSaving || (name === space.name && description === space.description)}
                onClick={handleSave}
              >
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            )}
          </div>
        </div>

        {/* Members */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Members ({space.members.length})
            </h4>
            {isAdmin && (
              <Button size="sm" variant="outline" onClick={onInvite}>
                <UserPlusIcon className="size-3.5 mr-1.5" />
                Invite
              </Button>
            )}
          </div>

          {/* Humans */}
          <div className="mb-3">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              People ({humans.length})
            </span>
            <div className="mt-2 space-y-1">
              {humans.map((m) => (
                <MemberSettingsRow
                  key={m.entityId}
                  member={m}
                  isAdmin={isAdmin}
                  isOwner={isOwner}
                  currentEntityId={currentEntityId}
                  onChangeRole={onUpdateMemberRole ? (role) => onUpdateMemberRole(m.entityId, role) : undefined}
                  onRemove={onRemoveMember ? () => onRemoveMember(m.entityId) : undefined}
                />
              ))}
            </div>
          </div>

          {/* Agents */}
          {agents.length > 0 && (
            <div>
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Haseefs ({agents.length})
              </span>
              <div className="mt-2 space-y-1">
                {agents.map((m) => (
                  <MemberSettingsRow
                    key={m.entityId}
                    member={m}
                    isAdmin={isAdmin}
                    isOwner={isOwner}
                    currentEntityId={currentEntityId}
                    onChangeRole={onUpdateMemberRole ? (role) => onUpdateMemberRole(m.entityId, role) : undefined}
                    onRemove={onRemoveMember ? () => onRemoveMember(m.entityId) : undefined}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Add Haseef */}
        {isAdmin && availableHaseefs && availableHaseefs.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Add Haseef to Space</h4>
            <div className="space-y-2">
              {availableHaseefs.map((h) => (
                <div key={h.entityId} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-8 items-center justify-center rounded-full bg-emerald-500/15 shrink-0">
                      <BotIcon className="size-3.5 text-emerald-600" />
                    </div>
                    <div>
                      <span className="text-sm font-medium">{h.name}</span>
                      {h.description && <p className="text-[11px] text-muted-foreground">{h.description}</p>}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={addingHaseefId === h.entityId}
                    onClick={() => handleAddHaseef(h.entityId)}
                  >
                    {addingHaseefId === h.entityId ? "Adding..." : "Add"}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Danger Zone */}
        <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-card p-4">
          <h4 className="text-xs font-semibold text-red-600 dark:text-red-400 mb-3">Danger Zone</h4>
          <div className="space-y-3">
            {!isOwner && onLeaveSpace && (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Leave Space</p>
                  <p className="text-[11px] text-muted-foreground">You will lose access to all messages.</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/30"
                  disabled={isLeaving}
                  onClick={async () => {
                    setIsLeaving(true);
                    try { await onLeaveSpace(); } catch { setIsLeaving(false); }
                  }}
                >
                  <LogOutIcon className="size-3.5 mr-1.5" />
                  {isLeaving ? "Leaving..." : "Leave"}
                </Button>
              </div>
            )}
            {isOwner && onDeleteSpace && (
              <div className={cn("flex items-center justify-between", !isOwner && "pt-3 border-t border-red-200 dark:border-red-900/50")}>
                <div>
                  <p className="text-sm font-medium">Delete Space</p>
                  <p className="text-[11px] text-muted-foreground">Permanently delete this space and all messages.</p>
                </div>
                {!confirmDelete ? (
                  <Button size="sm" variant="destructive" onClick={() => setConfirmDelete(true)}>
                    <TrashIcon className="size-3.5 mr-1.5" />
                    Delete
                  </Button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmDelete(false)}
                      disabled={isDeleting}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={isDeleting}
                      onClick={async () => {
                        setIsDeleting(true);
                        try { await onDeleteSpace(); } catch { setIsDeleting(false); setConfirmDelete(false); }
                      }}
                    >
                      {isDeleting ? "Deleting..." : "Confirm"}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MemberSettingsRow({
  member,
  isAdmin,
  isOwner,
  currentEntityId,
  onChangeRole,
  onRemove,
}: {
  member: MockMember;
  isAdmin: boolean;
  isOwner: boolean;
  currentEntityId?: string;
  onChangeRole?: (role: string) => Promise<void>;
  onRemove?: () => Promise<void>;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [loading, setLoading] = useState(false);
  const isCurrentUser = member.entityId === currentEntityId;
  const isAgent = member.type === "agent";
  const canManage = isAdmin && !isCurrentUser && member.role !== "owner";

  const roleIcon = {
    owner: CrownIcon,
    admin: ShieldIcon,
    member: UsersIcon,
    viewer: EyeIcon,
  }[member.role];
  const RoleIcon = roleIcon;

  const handleChangeRole = async (newRole: string) => {
    if (!onChangeRole || loading) return;
    setLoading(true);
    setShowMenu(false);
    try {
      await onChangeRole(newRole);
    } catch (err) {
      console.error("Change role error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async () => {
    if (!onRemove || loading) return;
    setLoading(true);
    setShowMenu(false);
    try {
      await onRemove();
    } catch (err) {
      console.error("Remove member error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-muted/50 transition-colors">
      <Avatar name={member.name} src={member.avatarUrl} color={member.avatarColor} size="sm" isOnline={member.isOnline} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium truncate">
            {member.name}
            {isCurrentUser && <span className="text-muted-foreground font-normal"> (you)</span>}
          </span>
          {isAgent && <BotIcon className="size-3 text-emerald-500 shrink-0" />}
        </div>
        <span className="text-[11px] text-muted-foreground">
          {member.isOnline ? (isAgent ? "Active" : "Online") : (member.lastSeen || "Offline")}
        </span>
      </div>

      <div className="relative">
        <button
          onClick={() => canManage && setShowMenu(!showMenu)}
          disabled={!canManage || loading}
          className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium",
            member.role === "owner" ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" :
            member.role === "admin" ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" :
            "bg-muted text-muted-foreground",
            canManage && !loading && "cursor-pointer hover:opacity-80",
            loading && "opacity-50",
          )}
        >
          <RoleIcon className="size-3" />
          <span className="capitalize">{loading ? "..." : member.role}</span>
          {canManage && !loading && <ChevronDownIcon className="size-3" />}
        </button>

        {showMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
            <div className="absolute right-0 top-full mt-1 z-50 bg-popover border rounded-lg shadow-lg py-1 min-w-[140px]">
              {isOwner && member.role !== "admin" && (
                <button
                  onClick={() => handleChangeRole("admin")}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors flex items-center gap-2"
                >
                  <ShieldIcon className="size-3.5" /> Make Admin
                </button>
              )}
              {isOwner && member.role === "admin" && (
                <button
                  onClick={() => handleChangeRole("member")}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors flex items-center gap-2"
                >
                  <UsersIcon className="size-3.5" /> Make Member
                </button>
              )}
              <button
                onClick={handleRemove}
                className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center gap-2"
              >
                <TrashIcon className="size-3.5" /> Remove
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
