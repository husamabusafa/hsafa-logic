import { useState } from "react";
import {
  SettingsIcon,
  ChevronLeftIcon,
  ShieldIcon,
  UsersIcon,
  BotIcon,
  CrownIcon,
  TrashIcon,
  LogOutIcon,
  ChevronDownIcon,
  UserPlusIcon,
  EyeIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  currentUser,
  mockHaseefs,
  type MockSpace,
  type MockMember,
} from "@/lib/mock-data";

interface SpaceSettingsProps {
  space: MockSpace;
  onBack: () => void;
  onOpenInvite?: () => void;
}

export function SpaceSettings({ space, onBack, onOpenInvite }: SpaceSettingsProps) {
  const [name, setName] = useState(space.name);
  const [description, setDescription] = useState(space.description);
  const myMember = space.members.find((m) => m.entityId === currentUser.entityId);
  const isOwner = myMember?.role === "owner";
  const isAdmin = myMember?.role === "admin" || isOwner;

  const humans = space.members.filter((m) => m.type === "human");
  const agents = space.members.filter((m) => m.type === "agent");
  const availableHaseefs = mockHaseefs.filter(
    (h) => !space.members.some((m) => m.entityId === h.entityId)
  );

  return (
    <div className="flex flex-col h-full bg-muted/20 overflow-y-auto">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 p-4 border-b bg-background">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ChevronLeftIcon className="size-5" />
        </Button>
        <SettingsIcon className="size-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Space Settings</h2>
      </div>

      <div className="flex-1 p-4 flex justify-center">
        <div className="w-full max-w-xl space-y-4">

          {/* General Settings */}
          <div className="bg-background rounded-xl shadow-sm p-5">
            <h3 className="text-sm font-semibold mb-4">General</h3>
            <div className="space-y-3">
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
              {isAdmin && (
                <Button size="sm" disabled={name === space.name && description === space.description}>
                  Save Changes
                </Button>
              )}
            </div>
          </div>

          {/* Members */}
          <div className="bg-background rounded-xl shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Members ({space.members.length})</h3>
              {isAdmin && (
                <Button size="sm" variant="outline" onClick={onOpenInvite}>
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
                  <MemberSettingsRow key={m.entityId} member={m} isAdmin={isAdmin} isOwner={isOwner} />
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
                    <MemberSettingsRow key={m.entityId} member={m} isAdmin={isAdmin} isOwner={isOwner} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Add Haseef */}
          {isAdmin && availableHaseefs.length > 0 && (
            <div className="bg-background rounded-xl shadow-sm p-5">
              <h3 className="text-sm font-semibold mb-3">Add Haseef to Space</h3>
              <div className="space-y-2">
                {availableHaseefs.map((h) => (
                  <div key={h.id} className="flex items-center justify-between py-1.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={h.name} color={h.avatarColor} size="sm" isOnline={h.isOnline} />
                      <div>
                        <span className="text-sm font-medium">{h.name}</span>
                        <p className="text-[11px] text-muted-foreground">{h.description}</p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline">Add</Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Danger Zone */}
          <div className="bg-background rounded-xl shadow-sm p-5 border border-red-200 dark:border-red-900/50">
            <h3 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-3">Danger Zone</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Leave Space</p>
                  <p className="text-xs text-muted-foreground">You will lose access to all messages in this space.</p>
                </div>
                <Button size="sm" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/30">
                  <LogOutIcon className="size-3.5 mr-1.5" />
                  Leave
                </Button>
              </div>
              {isOwner && (
                <div className="flex items-center justify-between pt-3 border-t border-red-200 dark:border-red-900/50">
                  <div>
                    <p className="text-sm font-medium">Delete Space</p>
                    <p className="text-xs text-muted-foreground">Permanently delete this space and all its messages.</p>
                  </div>
                  <Button size="sm" variant="destructive">
                    <TrashIcon className="size-3.5 mr-1.5" />
                    Delete
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Member Row with Role Management ────────────────────────────────────────

function MemberSettingsRow({
  member,
  isAdmin,
  isOwner,
}: {
  member: MockMember;
  isAdmin: boolean;
  isOwner: boolean;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const isCurrentUser = member.entityId === currentUser.entityId;
  const isAgent = member.type === "agent";
  const canManage = isAdmin && !isCurrentUser && member.role !== "owner";

  const roleIcon = {
    owner: CrownIcon,
    admin: ShieldIcon,
    member: UsersIcon,
    viewer: EyeIcon,
  }[member.role];
  const RoleIcon = roleIcon;

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

      {/* Role badge + dropdown */}
      <div className="relative">
        <button
          onClick={() => canManage && setShowMenu(!showMenu)}
          disabled={!canManage}
          className={cn(
            "flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium",
            member.role === "owner" ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" :
            member.role === "admin" ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" :
            "bg-muted text-muted-foreground",
            canManage && "cursor-pointer hover:opacity-80"
          )}
        >
          <RoleIcon className="size-3" />
          <span className="capitalize">{member.role}</span>
          {canManage && <ChevronDownIcon className="size-3" />}
        </button>

        {/* Role change dropdown */}
        {showMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
            <div className="absolute right-0 top-full mt-1 z-50 bg-popover border rounded-lg shadow-lg py-1 min-w-[140px]">
              {isOwner && member.role !== "admin" && (
                <button
                  onClick={() => setShowMenu(false)}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors flex items-center gap-2"
                >
                  <ShieldIcon className="size-3.5" /> Make Admin
                </button>
              )}
              {isOwner && member.role === "admin" && (
                <button
                  onClick={() => setShowMenu(false)}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors flex items-center gap-2"
                >
                  <UsersIcon className="size-3.5" /> Make Member
                </button>
              )}
              <button
                onClick={() => setShowMenu(false)}
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
