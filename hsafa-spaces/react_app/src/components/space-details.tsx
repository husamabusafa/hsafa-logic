import { useState, useMemo } from "react";
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
  SearchIcon,
  FileIcon,
  LinkIcon,
  ImageIcon,
  ExternalLinkIcon,
  DownloadIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { mockMessages, type MockSpace, type MockMember, type MockMessage } from "@/lib/mock-data";
import { EntityProfilePanel } from "@/components/entity-profile-panel";
import { SpaceSettingsPanel, type AvailableHaseef } from "@/components/space-settings-panel";

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
        src={member.avatarUrl}
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

export function RoleBadge({ role }: { role: MockMember["role"] }) {
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

