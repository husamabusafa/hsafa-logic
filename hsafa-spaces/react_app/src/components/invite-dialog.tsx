import { useState } from "react";
import { SearchIcon, BotIcon, CheckIcon, MailIcon, ShieldIcon, UsersIcon, LoaderIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { spacesApi, invitationsApi, type HaseefListItem } from "@/lib/api";

interface AvailableHaseef {
  entityId: string;
  name: string;
  description?: string;
}

interface InviteDialogProps {
  open: boolean;
  onClose: () => void;
  spaceId: string;
  spaceName: string;
  memberEntityIds: Set<string>;
  availableHaseefs: AvailableHaseef[];
  onMembersChanged?: () => void;
}

export function InviteDialog({
  open,
  onClose,
  spaceId,
  spaceName,
  memberEntityIds,
  availableHaseefs,
  onMembersChanged,
}: InviteDialogProps) {
  const [tab, setTab] = useState<"haseefs" | "email">("haseefs");
  const [search, setSearch] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Haseef selection (add directly as members)
  const [selectedHaseefIds, setSelectedHaseefIds] = useState<Set<string>>(new Set());

  // Email invitation
  const [emailInput, setEmailInput] = useState("");
  const [emailList, setEmailList] = useState<string[]>([]);

  const filteredHaseefs = availableHaseefs.filter(
    (h) => !memberEntityIds.has(h.entityId) && h.name.toLowerCase().includes(search.toLowerCase()),
  );

  const toggleHaseef = (entityId: string) => {
    setSelectedHaseefIds((prev) => {
      const next = new Set(prev);
      if (next.has(entityId)) next.delete(entityId);
      else next.add(entityId);
      return next;
    });
  };

  const addEmail = (email: string) => {
    const trimmed = email.trim().toLowerCase();
    if (trimmed.includes("@") && !emailList.includes(trimmed)) {
      setEmailList((prev) => [...prev, trimmed]);
    }
    setEmailInput("");
  };

  const handleSend = async () => {
    setIsSending(true);
    setError(null);
    setSuccessMsg(null);
    let addedCount = 0;
    let invitedCount = 0;

    try {
      // Add haseefs directly as members
      for (const entityId of selectedHaseefIds) {
        await spacesApi.addMember(spaceId, entityId, "member");
        addedCount++;
      }

      // Send email invitations for humans
      for (const email of emailList) {
        await invitationsApi.createForSpace(spaceId, { email, role: inviteRole });
        invitedCount++;
      }

      const parts: string[] = [];
      if (addedCount > 0) parts.push(`${addedCount} haseef${addedCount > 1 ? "s" : ""} added`);
      if (invitedCount > 0) parts.push(`${invitedCount} invitation${invitedCount > 1 ? "s" : ""} sent`);
      setSuccessMsg(parts.join(", ") + "!");

      setSelectedHaseefIds(new Set());
      setEmailList([]);
      onMembersChanged?.();

      // Auto-close after brief delay
      setTimeout(() => {
        setSuccessMsg(null);
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(err.message || "Failed to send invites");
    } finally {
      setIsSending(false);
    }
  };

  const handleClose = () => {
    setSelectedHaseefIds(new Set());
    setEmailList([]);
    setEmailInput("");
    setSearch("");
    setError(null);
    setSuccessMsg(null);
    onClose();
  };

  const totalSelected = selectedHaseefIds.size + emailList.length;

  return (
    <Dialog open={open} onClose={handleClose} className="max-w-md">
      <DialogHeader onClose={handleClose}>
        <DialogTitle>Invite to {spaceName}</DialogTitle>
        <DialogDescription>
          Add haseefs or invite people by email
        </DialogDescription>
      </DialogHeader>

      {/* Tabs */}
      <div className="flex border-b border-border mb-3">
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
          Invite by Email
        </button>
      </div>

      {/* Haseefs tab */}
      {tab === "haseefs" && (
        <>
          <div className="relative mb-3">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search haseefs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(
                "w-full h-9 rounded-lg bg-muted/60 pl-9 pr-3 text-sm",
                "placeholder:text-muted-foreground/60",
                "focus:outline-none focus:ring-2 focus:ring-ring/30",
              )}
            />
          </div>

          <div className="max-h-[280px] overflow-y-auto -mx-2 px-2 space-y-0.5">
            {filteredHaseefs.length === 0 ? (
              <EmptyList text="No haseefs available to add" />
            ) : (
              filteredHaseefs.map((h) => (
                <button
                  key={h.entityId}
                  onClick={() => toggleHaseef(h.entityId)}
                  className={cn(
                    "flex items-center gap-3 w-full px-3 py-2.5 rounded-lg transition-colors text-left",
                    selectedHaseefIds.has(h.entityId) ? "bg-primary/8" : "hover:bg-muted/60",
                  )}
                >
                  <div className="flex size-8 items-center justify-center rounded-full bg-emerald-500/15 shrink-0">
                    <BotIcon className="size-3.5 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-medium text-foreground truncate">{h.name}</span>
                      <BotIcon className="size-3 text-emerald-500 shrink-0" />
                    </div>
                    {h.description && <p className="text-[11px] text-muted-foreground truncate">{h.description}</p>}
                  </div>
                  <div
                    className={cn(
                      "flex size-5 items-center justify-center rounded-full border-2 transition-colors shrink-0",
                      selectedHaseefIds.has(h.entityId)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/30",
                    )}
                  >
                    {selectedHaseefIds.has(h.entityId) && <CheckIcon className="size-3" />}
                  </div>
                </button>
              ))
            )}
          </div>
        </>
      )}

      {/* Email tab */}
      {tab === "email" && (
        <>
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
                    addEmail(emailInput);
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
                onClick={() => addEmail(emailInput)}
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
            <p className="text-[11px] text-muted-foreground">
              Press Enter or click Add. They'll receive an invitation to join this space.
              {"\n"}If they don't have an account yet, they can register and accept.
            </p>
          </div>

          {/* Role picker for email invites */}
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
        </>
      )}

      {/* Error / Success */}
      {error && (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive mt-2">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400 mt-2">
          {successMsg}
        </div>
      )}

      {/* Footer */}
      {totalSelected > 0 && !successMsg && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
          <span className="text-sm text-muted-foreground">
            {selectedHaseefIds.size > 0 && `${selectedHaseefIds.size} haseef${selectedHaseefIds.size > 1 ? "s" : ""}`}
            {selectedHaseefIds.size > 0 && emailList.length > 0 && " + "}
            {emailList.length > 0 && `${emailList.length} email${emailList.length > 1 ? "s" : ""} as ${inviteRole}`}
          </span>
          <Button onClick={handleSend} disabled={isSending}>
            {isSending && <LoaderIcon className="size-4 animate-spin mr-1.5" />}
            {isSending ? "Sending..." : "Send"}
          </Button>
        </div>
      )}
    </Dialog>
  );
}

function EmptyList({ text }: { text: string }) {
  return (
    <div className="py-8 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
