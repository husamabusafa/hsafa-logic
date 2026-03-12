import { useState } from "react";
import {
  XIcon,
  ShieldIcon,
  CrownIcon,
  UserPlusIcon,
  BotIcon,
  LogOutIcon,
  SettingsIcon,
  CopyIcon,
  CheckIcon,
  ChevronLeftIcon,
  MailIcon,
  CalendarIcon,
  MapPinIcon,
  MessageSquareIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { currentUser, mockUsers, mockHaseefs, type MockSpace, type MockMember } from "@/lib/mock-data";

interface SpaceDetailsProps {
  space: MockSpace;
  onClose: () => void;
  onInvite: () => void;
}

export function SpaceDetails({ space, onClose, onInvite }: SpaceDetailsProps) {
  const [copiedId, setCopiedId] = useState(false);
  const [selectedMember, setSelectedMember] = useState<MockMember | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  if (showSettings) {
    return (
      <SpaceSettingsPanel
        space={space}
        onBack={() => setShowSettings(false)}
        onClose={onClose}
        onInvite={onInvite}
      />
    );
  }

  if (selectedMember) {
    return (
      <EntityProfilePanel
        member={selectedMember}
        space={space}
        onBack={() => setSelectedMember(null)}
        onClose={onClose}
      />
    );
  }

  const humanMembers = space.members.filter((m) => m.type === "human");
  const agentMembers = space.members.filter((m) => m.type === "agent");
  const isAdmin = space.members.some(
    (m) => m.entityId === currentUser.entityId && (m.role === "owner" || m.role === "admin"),
  );

  const handleCopyId = () => {
    navigator.clipboard.writeText(space.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between h-14 shrink-0 border-b border-border px-4">
        <h3 className="text-sm font-semibold text-foreground">Space Info</h3>
        <Button variant="ghost" size="icon" onClick={onClose} className="size-8">
          <XIcon className="size-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Space info */}
        <div className="px-4 py-5 text-center border-b border-border">
          <div className="flex size-16 items-center justify-center rounded-full bg-primary/15 text-primary font-bold text-xl mx-auto mb-3">
            {space.name.charAt(0).toUpperCase()}
          </div>
          <h2 className="text-lg font-semibold text-foreground">{space.name}</h2>
          <p className="text-sm text-muted-foreground mt-1">{space.description}</p>

          <div className="flex items-center justify-center gap-4 mt-3">
            <div className="text-center">
              <p className="text-sm font-semibold text-foreground">{space.members.length}</p>
              <p className="text-[11px] text-muted-foreground">Members</p>
            </div>
            <div className="w-px h-6 bg-border" />
            <div className="text-center">
              <p className="text-sm font-semibold text-foreground">{agentMembers.length}</p>
              <p className="text-[11px] text-muted-foreground">Haseefs</p>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 mt-3">
            <button
              onClick={handleCopyId}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {copiedId ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
              {copiedId ? "Copied!" : "Copy Space ID"}
            </button>
          </div>
        </div>

        {/* Actions */}
        {isAdmin && (
          <div className="px-4 py-3 border-b border-border space-y-2">
            <Button variant="outline" size="sm" className="w-full" onClick={onInvite}>
              <UserPlusIcon className="size-4" />
              Invite members
            </Button>
            <Button variant="outline" size="sm" className="w-full" onClick={() => setShowSettings(true)}>
                <SettingsIcon className="size-4" />
                Space settings
              </Button>
          </div>
        )}

        {/* Human Members */}
        <div className="px-4 py-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            People · {humanMembers.length}
          </h4>
          <div className="space-y-0.5">
            {humanMembers.map((member) => (
              <MemberRow
                key={member.entityId}
                member={member}
                isCurrentUser={member.entityId === currentUser.entityId}
                onClick={() => setSelectedMember(member)}
              />
            ))}
          </div>
        </div>

        {/* Agent Members */}
        {agentMembers.length > 0 && (
          <div className="px-4 py-3 border-t border-border">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Haseefs · {agentMembers.length}
            </h4>
            <div className="space-y-0.5">
              {agentMembers.map((member) => (
                <MemberRow key={member.entityId} member={member} onClick={() => setSelectedMember(member)} />
              ))}
            </div>
          </div>
        )}

        {/* Danger zone */}
        <div className="px-4 py-4 border-t border-border mt-2">
          <Button variant="ghost" size="sm" className="w-full text-destructive hover:text-destructive hover:bg-destructive/10">
            <LogOutIcon className="size-4" />
            Leave space
          </Button>
        </div>
      </div>
    </div>
  );
}

function MemberRow({ member, isCurrentUser, onClick }: { member: MockMember; isCurrentUser?: boolean; onClick?: () => void }) {
  const isAgent = member.type === "agent";

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted/50 transition-colors w-full text-left"
    >
      <Avatar
        name={member.name}
        color={member.avatarColor}
        size="sm"
        isOnline={member.isOnline}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-foreground truncate">
            {member.name}
            {isCurrentUser && <span className="text-muted-foreground font-normal"> (you)</span>}
          </span>
          {isAgent && <BotIcon className="size-3 text-emerald-500 shrink-0" />}
        </div>
        {!isAgent && (
          <span className="text-[11px] text-muted-foreground">
            {member.isOnline ? "Online" : member.lastSeen || "Offline"}
          </span>
        )}
        {isAgent && (
          <span className="text-[11px] text-emerald-500">
            {member.isOnline ? "Active" : "Idle"}
          </span>
        )}
      </div>

      <RoleBadge role={member.role} />
    </button>
  );
}

function RoleBadge({ role }: { role: MockMember["role"] }) {
  if (role === "owner") {
    return (
      <Badge variant="warning" className="gap-0.5">
        <CrownIcon className="size-2.5" />
        Owner
      </Badge>
    );
  }
  if (role === "admin") {
    return (
      <Badge variant="secondary" className="gap-0.5">
        <ShieldIcon className="size-2.5" />
        Admin
      </Badge>
    );
  }
  return null;
}

function EntityProfilePanel({
  member,
  space,
  onBack,
  onClose,
}: {
  member: MockMember;
  space: MockSpace;
  onBack: () => void;
  onClose: () => void;
}) {
  const isAgent = member.type === "agent";
  const userData = mockUsers.find((u) => u.entityId === member.entityId);
  const haseefData = mockHaseefs.find((h) => h.entityId === member.entityId);
  const isCurrentUser = member.entityId === currentUser.entityId;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 h-14 shrink-0 border-b border-border px-4">
        <Button variant="ghost" size="icon" onClick={onBack} className="size-8">
          <ChevronLeftIcon className="size-4" />
        </Button>
        <h3 className="text-sm font-semibold text-foreground flex-1">Profile</h3>
        <Button variant="ghost" size="icon" onClick={onClose} className="size-8">
          <XIcon className="size-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-6 text-center border-b border-border">
          <Avatar
            name={member.name}
            color={member.avatarColor}
            size="lg"
            isOnline={member.isOnline}
          />
          <h2 className="text-lg font-semibold text-foreground mt-3">
            {member.name}
            {isCurrentUser && <span className="text-muted-foreground font-normal text-sm"> (you)</span>}
          </h2>
          <div className="flex items-center justify-center gap-1.5 mt-1">
            {isAgent && <BotIcon className="size-3.5 text-emerald-500" />}
            <span className={cn("text-sm", isAgent ? "text-emerald-500" : "text-muted-foreground")}>
              {isAgent ? (member.isOnline ? "Active Haseef" : "Idle Haseef") : (member.isOnline ? "Online" : "Offline")}
            </span>
          </div>
          <div className="mt-2">
            <RoleBadge role={member.role} />
          </div>
        </div>

        <div className="px-4 py-4 space-y-3">
          {userData?.email && (
            <div className="flex items-center gap-3">
              <MailIcon className="size-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-[11px] text-muted-foreground">Email</p>
                <p className="text-sm text-foreground">{userData.email}</p>
              </div>
            </div>
          )}

          {haseefData?.description && (
            <div className="flex items-start gap-3">
              <MessageSquareIcon className="size-4 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] text-muted-foreground">Description</p>
                <p className="text-sm text-foreground">{haseefData.description}</p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <CalendarIcon className="size-4 text-muted-foreground shrink-0" />
            <div>
              <p className="text-[11px] text-muted-foreground">Joined</p>
              <p className="text-sm text-foreground">{member.joinedAt ? new Date(member.joinedAt).toLocaleDateString() : "Unknown"}</p>
            </div>
          </div>

          {member.lastSeen && !member.isOnline && (
            <div className="flex items-center gap-3">
              <MapPinIcon className="size-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-[11px] text-muted-foreground">Last seen</p>
                <p className="text-sm text-foreground">{member.lastSeen}</p>
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-border">
          <p className="text-[11px] text-muted-foreground uppercase font-semibold tracking-wider mb-2">
            In this space
          </p>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Role: <span className="font-medium text-foreground capitalize">{member.role}</span></span>
          </div>
        </div>

        {!isCurrentUser && !isAgent && (
          <div className="px-4 py-3 border-t border-border">
            <Button variant="outline" size="sm" className="w-full">
              <MessageSquareIcon className="size-4" />
              Send direct message
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Space Settings Panel (inline in side panel) ─────────────────────────────

import {
  CrownIcon as CrownIcon2,
  ShieldIcon as ShieldIcon2,
  UsersIcon,
  TrashIcon as TrashIcon2,
  ChevronDownIcon,
} from "lucide-react";
import { mockHaseefs as mockHaseefsData } from "@/lib/mock-data";

function SpaceSettingsPanel({
  space,
  onBack,
  onClose,
  onInvite,
}: {
  space: MockSpace;
  onBack: () => void;
  onClose: () => void;
  onInvite: () => void;
}) {
  const [name, setName] = useState(space.name);
  const [description, setDescription] = useState(space.description);
  const myMember = space.members.find((m) => m.entityId === currentUser.entityId);
  const isOwner = myMember?.role === "owner";
  const isAdmin = myMember?.role === "admin" || isOwner;

  const humans = space.members.filter((m) => m.type === "human");
  const agents = space.members.filter((m) => m.type === "agent");
  const availableHaseefs = mockHaseefsData.filter(
    (h) => !space.members.some((m) => m.entityId === h.entityId)
  );

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
          <div className="rounded-xl border border-border bg-card p-4">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Add Haseef to Space</h4>
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
        <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-card p-4">
          <h4 className="text-xs font-semibold text-red-600 dark:text-red-400 mb-3">Danger Zone</h4>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Leave Space</p>
                <p className="text-[11px] text-muted-foreground">You will lose access to all messages.</p>
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
                  <p className="text-[11px] text-muted-foreground">Permanently delete this space and all messages.</p>
                </div>
                <Button size="sm" variant="destructive">
                  <TrashIcon2 className="size-3.5 mr-1.5" />
                  Delete
                </Button>
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
    owner: CrownIcon2,
    admin: ShieldIcon2,
    member: UsersIcon,
  }[member.role];
  const RoleIcon = roleIcon;

  return (
    <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-muted/50 transition-colors">
      <Avatar name={member.name} color={member.avatarColor} size="sm" isOnline={member.isOnline} />
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

        {showMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
            <div className="absolute right-0 top-full mt-1 z-50 bg-popover border rounded-lg shadow-lg py-1 min-w-[140px]">
              {isOwner && member.role !== "admin" && (
                <button
                  onClick={() => setShowMenu(false)}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors flex items-center gap-2"
                >
                  <ShieldIcon2 className="size-3.5" /> Make Admin
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
                <TrashIcon2 className="size-3.5" /> Remove
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
