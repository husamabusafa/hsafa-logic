import { useState } from "react";
import { SearchIcon, UserPlusIcon, BotIcon, CheckIcon, MailIcon, ShieldIcon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { mockUsers, mockHaseefs, currentUser, type MockSpace } from "@/lib/mock-data";

interface InviteDialogProps {
  open: boolean;
  onClose: () => void;
  space: MockSpace;
}

export function InviteDialog({ open, onClose, space }: InviteDialogProps) {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"people" | "haseefs" | "email">("people");
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [emailInput, setEmailInput] = useState("");
  const [emailList, setEmailList] = useState<string[]>([]);

  const existingEntityIds = new Set(space.members.map((m) => m.entityId));

  // Filter available people (not already members, not current user)
  const availablePeople = mockUsers.filter(
    (u) =>
      u.entityId !== currentUser.entityId &&
      !existingEntityIds.has(u.entityId) &&
      u.name.toLowerCase().includes(search.toLowerCase()),
  );

  // Filter available haseefs (not already members)
  const availableHaseefs = mockHaseefs.filter(
    (h) =>
      !existingEntityIds.has(h.entityId) &&
      h.name.toLowerCase().includes(search.toLowerCase()),
  );

  const toggleInvite = (entityId: string) => {
    setInvited((prev) => {
      const next = new Set(prev);
      if (next.has(entityId)) next.delete(entityId);
      else next.add(entityId);
      return next;
    });
  };

  const handleSendInvites = () => {
    // Mock — just close
    setInvited(new Set());
    setSearch("");
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} className="max-w-md">
      <DialogHeader onClose={onClose}>
        <DialogTitle>Invite to {space.name}</DialogTitle>
        <DialogDescription>
          Add people or haseefs to this space
        </DialogDescription>
      </DialogHeader>

      {/* Tabs */}
      <div className="flex border-b border-border mb-3">
        <button
          onClick={() => setTab("people")}
          className={cn(
            "flex-1 py-2 text-sm font-medium border-b-2 transition-colors",
            tab === "people"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <UserPlusIcon className="size-4 inline mr-1.5" />
          People
        </button>
        <button
          onClick={() => setTab("haseefs")}
          className={cn(
            "flex-1 py-2 text-sm font-medium border-b-2 transition-colors",
            tab === "haseefs"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <BotIcon className="size-4 inline mr-1.5" />
          Haseefs
        </button>
        <button
          onClick={() => setTab("email")}
          className={cn(
            "flex-1 py-2 text-sm font-medium border-b-2 transition-colors",
            tab === "email"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <MailIcon className="size-4 inline mr-1.5" />
          Email
        </button>
      </div>

      {/* Search (for people/haseefs tabs) */}
      {tab !== "email" && (
        <div className="relative mb-3">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="text"
            placeholder={tab === "people" ? "Search people..." : "Search haseefs..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={cn(
              "w-full h-9 rounded-lg bg-muted/60 pl-9 pr-3 text-sm",
              "placeholder:text-muted-foreground/60",
              "focus:outline-none focus:ring-2 focus:ring-ring/30",
            )}
          />
        </div>
      )}

      {/* Email input */}
      {tab === "email" && (
        <div className="mb-3 space-y-2">
          <div className="flex gap-2">
            <input
              type="email"
              placeholder="Enter email address..."
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && emailInput.includes("@")) {
                  e.preventDefault();
                  if (!emailList.includes(emailInput.trim())) {
                    setEmailList((prev) => [...prev, emailInput.trim()]);
                  }
                  setEmailInput("");
                }
              }}
              className={cn(
                "flex-1 h-9 rounded-lg bg-muted/60 px-3 text-sm",
                "placeholder:text-muted-foreground/60",
                "focus:outline-none focus:ring-2 focus:ring-ring/30",
              )}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!emailInput.includes("@")}
              onClick={() => {
                if (emailInput.includes("@") && !emailList.includes(emailInput.trim())) {
                  setEmailList((prev) => [...prev, emailInput.trim()]);
                }
                setEmailInput("");
              }}
            >
              Add
            </Button>
          </div>
          {emailList.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {emailList.map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium"
                >
                  {email}
                  <button
                    onClick={() => setEmailList((prev) => prev.filter((e) => e !== email))}
                    className="hover:text-primary/70"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">Press Enter or click Add to queue emails. They'll receive an invitation link.</p>
        </div>
      )}

      {/* Role picker */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-muted-foreground">Invite as:</span>
        <button
          onClick={() => setInviteRole("member")}
          className={cn(
            "flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
            inviteRole === "member"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground",
          )}
        >
          <UsersIcon className="size-3" /> Member
        </button>
        <button
          onClick={() => setInviteRole("admin")}
          className={cn(
            "flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
            inviteRole === "admin"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground",
          )}
        >
          <ShieldIcon className="size-3" /> Admin
        </button>
      </div>

      {/* List */}
      <div className="max-h-[280px] overflow-y-auto -mx-2 px-2 space-y-0.5">
        {tab === "people" ? (
          availablePeople.length === 0 ? (
            <EmptyList text="No people to invite" />
          ) : (
            availablePeople.map((user) => (
              <InviteRow
                key={user.entityId}
                entityId={user.entityId}
                name={user.name}
                subtitle={user.email}
                avatarColor={user.avatarColor}
                isOnline={user.isOnline}
                isSelected={invited.has(user.entityId)}
                onToggle={() => toggleInvite(user.entityId)}
              />
            ))
          )
        ) : tab === "haseefs" ? (
          availableHaseefs.length === 0 ? (
            <EmptyList text="No haseefs to invite" />
          ) : (
            availableHaseefs.map((h) => (
              <InviteRow
                key={h.entityId}
                entityId={h.entityId}
                name={h.name}
                subtitle={h.description}
                avatarColor={h.avatarColor}
                isOnline={h.isOnline}
                isAgent
                isSelected={invited.has(h.entityId)}
                onToggle={() => toggleInvite(h.entityId)}
              />
            ))
          )
        ) : null}
      </div>

      {/* Footer */}
      {(invited.size > 0 || emailList.length > 0) && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
          <span className="text-sm text-muted-foreground">
            {invited.size + emailList.length} selected · as {inviteRole}
          </span>
          <Button onClick={handleSendInvites}>
            Send invites
          </Button>
        </div>
      )}
    </Dialog>
  );
}

function InviteRow({
  entityId,
  name,
  subtitle,
  avatarColor,
  isOnline,
  isAgent,
  isSelected,
  onToggle,
}: {
  entityId: string;
  name: string;
  subtitle: string;
  avatarColor: string;
  isOnline: boolean;
  isAgent?: boolean;
  isSelected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "flex items-center gap-3 w-full px-3 py-2.5 rounded-lg transition-colors text-left",
        isSelected ? "bg-primary/8" : "hover:bg-muted/60",
      )}
    >
      <Avatar name={name} color={avatarColor} size="sm" isOnline={isOnline} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium text-foreground truncate">{name}</span>
          {isAgent && <BotIcon className="size-3 text-emerald-500 shrink-0" />}
        </div>
        <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>
      </div>
      <div
        className={cn(
          "flex size-5 items-center justify-center rounded-full border-2 transition-colors shrink-0",
          isSelected
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/30",
        )}
      >
        {isSelected && <CheckIcon className="size-3" />}
      </div>
    </button>
  );
}

function EmptyList({ text }: { text: string }) {
  return (
    <div className="py-8 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
