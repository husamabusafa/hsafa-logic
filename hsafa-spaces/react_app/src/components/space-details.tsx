import { useState, useMemo, useRef } from "react";
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
  SearchIcon,
  FileIcon,
  LinkIcon,
  ImageIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  DownloadIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { mockMessages, type MockSpace, type MockMember, type MockMessage } from "@/lib/mock-data";

interface AvailableHaseef {
  entityId: string;
  name: string;
  description?: string;
}

interface SpaceDetailsProps {
  space: MockSpace;
  onClose: () => void;
  onInvite: () => void;
  onSearchClick?: () => void;
  onDeleteSpace?: () => Promise<void>;
  onLeaveSpace?: () => Promise<void>;
  currentEntityId?: string;
  onSaveSettings?: (data: { name?: string; description?: string }) => Promise<void>;
  onUpdateMemberRole?: (entityId: string, role: string) => Promise<void>;
  onRemoveMember?: (entityId: string) => Promise<void>;
  onAddMember?: (entityId: string) => Promise<void>;
  availableHaseefs?: AvailableHaseef[];
}

export function SpaceDetails({
  space, onClose, onInvite, onSearchClick, onDeleteSpace, onLeaveSpace,
  currentEntityId, onSaveSettings, onUpdateMemberRole, onRemoveMember, onAddMember, availableHaseefs,
}: SpaceDetailsProps) {
  const [copiedId, setCopiedId] = useState(false);
  const [selectedMember, setSelectedMember] = useState<MockMember | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<"info" | "docs" | "links">("info");

  const messages = mockMessages[space.id] || [];

  // Extract shared docs (file + image messages)
  const sharedDocs = useMemo(() =>
    messages.filter((m) => m.type === "file" || m.type === "image" || m.type === "video")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [messages],
  );

  // Extract links from text messages
  const sharedLinks = useMemo(() => {
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
    const links: { url: string; senderName: string; createdAt: string; messageId: string }[] = [];
    for (const msg of messages) {
      if (msg.content) {
        const urls = msg.content.match(urlRegex);
        if (urls) {
          for (const url of urls) {
            links.push({ url, senderName: msg.senderName, createdAt: msg.createdAt, messageId: msg.id });
          }
        }
      }
      if (msg.cardImageUrl) {
        links.push({ url: msg.cardImageUrl, senderName: msg.senderName, createdAt: msg.createdAt, messageId: msg.id });
      }
      if (msg.fileUrl) {
        links.push({ url: msg.fileUrl, senderName: msg.senderName, createdAt: msg.createdAt, messageId: msg.id });
      }
    }
    return links.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [messages]);

  if (showSettings) {
    return (
      <SpaceSettingsPanel
        space={space}
        onBack={() => setShowSettings(false)}
        onClose={onClose}
        onInvite={onInvite}
        onDeleteSpace={onDeleteSpace}
        onLeaveSpace={onLeaveSpace}
        currentEntityId={currentEntityId}
        onSaveSettings={onSaveSettings}
        onUpdateMemberRole={onUpdateMemberRole}
        onRemoveMember={onRemoveMember}
        onAddMember={onAddMember}
        availableHaseefs={availableHaseefs}
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
        currentEntityId={currentEntityId}
      />
    );
  }

  const humanMembers = space.members.filter((m) => m.type === "human");
  const agentMembers = space.members.filter((m) => m.type === "agent");
  const isAdmin = currentEntityId
    ? space.members.some(
        (m) => m.entityId === currentEntityId && (m.role === "owner" || m.role === "admin"),
      )
    : false;

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
        <div className="flex items-center gap-1">
          {onSearchClick && (
            <Button variant="ghost" size="icon" onClick={onSearchClick} className="size-8" title="Search messages">
              <SearchIcon className="size-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onClose} className="size-8">
            <XIcon className="size-4" />
          </Button>
        </div>
      </div>


      {/* Tabs: Info / Docs / Links */}
      <div className="flex border-b border-border shrink-0">
        {(["info", "docs", "links"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "flex-1 py-2.5 text-xs font-medium text-center transition-colors relative",
              activeTab === tab
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="flex items-center justify-center gap-1.5">
              {tab === "info" && "Info"}
              {tab === "docs" && (
                <>
                  <FileIcon className="size-3" />
                  Docs {sharedDocs.length > 0 && <span className="text-[10px] opacity-60">({sharedDocs.length})</span>}
                </>
              )}
              {tab === "links" && (
                <>
                  <LinkIcon className="size-3" />
                  Links {sharedLinks.length > 0 && <span className="text-[10px] opacity-60">({sharedLinks.length})</span>}
                </>
              )}
            </span>
            {activeTab === tab && (
              <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "info" && (
          <>
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
                    isCurrentUser={member.entityId === currentEntityId}
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
              {onLeaveSpace && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={onLeaveSpace}
                >
                  <LogOutIcon className="size-4" />
                  Leave space
                </Button>
              )}
            </div>
          </>
        )}

        {activeTab === "docs" && (
          <SharedDocsTab docs={sharedDocs} />
        )}

        {activeTab === "links" && (
          <SharedLinksTab links={sharedLinks} />
        )}
      </div>
    </div>
  );
}


// ─── Shared Docs Tab ────────────────────────────────────────────────────────

function SharedDocsTab({ docs }: { docs: MockMessage[] }) {
  if (docs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div className="size-12 rounded-full bg-muted flex items-center justify-center mb-3">
          <FileIcon className="size-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground">No shared documents</p>
        <p className="text-xs text-muted-foreground mt-1">Files, images and videos shared in this space will appear here.</p>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-1.5">
      {docs.map((doc) => {
        const time = new Date(doc.createdAt).toLocaleDateString([], { month: "short", day: "numeric" });
        const isImage = doc.type === "image";
        const isVideo = doc.type === "video";
        const isFile = doc.type === "file";
        const name = isImage ? (doc.imageCaption || "Image") : isVideo ? "Video" : (doc.fileName || "File");
        const size = isFile && doc.fileSize ? formatFileSize(doc.fileSize) : null;

        return (
          <div
            key={doc.id}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
          >
            <div className={cn(
              "size-9 rounded-lg flex items-center justify-center shrink-0",
              isImage ? "bg-blue-500/10 text-blue-500" :
              isVideo ? "bg-purple-500/10 text-purple-500" :
              "bg-orange-500/10 text-orange-500",
            )}>
              {isImage ? <ImageIcon className="size-4" /> : isVideo ? <FileIcon className="size-4" /> : <FileIcon className="size-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{name}</p>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span>{doc.senderName}</span>
                <span>·</span>
                <span>{time}</span>
                {size && <><span>·</span><span>{size}</span></>}
              </div>
            </div>
            <button className="p-1.5 rounded-md hover:bg-muted transition-colors shrink-0" title="Download">
              <DownloadIcon className="size-3.5 text-muted-foreground" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Shared Links Tab ───────────────────────────────────────────────────────

function SharedLinksTab({ links }: { links: { url: string; senderName: string; createdAt: string; messageId: string }[] }) {
  if (links.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div className="size-12 rounded-full bg-muted flex items-center justify-center mb-3">
          <LinkIcon className="size-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground">No shared links</p>
        <p className="text-xs text-muted-foreground mt-1">Links shared in messages will appear here.</p>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-1.5">
      {links.map((link, idx) => {
        const time = new Date(link.createdAt).toLocaleDateString([], { month: "short", day: "numeric" });
        let domain = "";
        try { domain = new URL(link.url).hostname; } catch { domain = link.url; }

        return (
          <a
            key={`${link.messageId}-${idx}`}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors group"
          >
            <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <LinkIcon className="size-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-primary truncate group-hover:underline">{domain}</p>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span>{link.senderName}</span>
                <span>·</span>
                <span>{time}</span>
              </div>
            </div>
            <ExternalLinkIcon className="size-3.5 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          </a>
        );
      })}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  currentEntityId,
}: {
  member: MockMember;
  space: MockSpace;
  onBack: () => void;
  onClose: () => void;
  currentEntityId?: string;
}) {
  const isAgent = member.type === "agent";
  const isCurrentUser = member.entityId === currentEntityId;

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
  LoaderIcon as LoaderIcon2,
} from "lucide-react";
import { mediaApi, spacesApi } from "@/lib/api";

function SpaceSettingsPanel({
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
                        <><LoaderIcon2 className="size-3.5 animate-spin mr-1.5" />Uploading...</>
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
                    <TrashIcon2 className="size-3.5 mr-1.5" />
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
    owner: CrownIcon2,
    admin: ShieldIcon2,
    member: UsersIcon,
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
                  <ShieldIcon2 className="size-3.5" /> Make Admin
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
                <TrashIcon2 className="size-3.5" /> Remove
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
