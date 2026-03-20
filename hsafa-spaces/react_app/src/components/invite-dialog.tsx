import { useState, useEffect } from "react";
import { SearchIcon, BotIcon, CheckIcon, MailIcon, ShieldIcon, UsersIcon, UserIcon, LoaderIcon, LinkIcon, CopyIcon, QrCodeIcon, RefreshCwIcon } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { spacesApi, invitationsApi, type Contact } from "@/lib/api";

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
  initialInviteCode?: string | null;
  initialInviteLinkActive?: boolean;
}

export function InviteDialog({
  open,
  onClose,
  spaceId,
  spaceName,
  memberEntityIds,
  availableHaseefs,
  onMembersChanged,
  initialInviteCode,
  initialInviteLinkActive,
}: InviteDialogProps) {
  const [tab, setTab] = useState<"people" | "haseefs" | "email" | "link">("people");
  const [search, setSearch] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // People (contacts) selection — direct add like WhatsApp
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());

  // Haseef selection (add directly as members)
  const [selectedHaseefIds, setSelectedHaseefIds] = useState<Set<string>>(new Set());

  // Email invitation
  const [emailInput, setEmailInput] = useState("");
  const [emailList, setEmailList] = useState<string[]>([]);

  // Link / code state
  const [inviteCode, setInviteCode] = useState<string | null>(initialInviteCode ?? null);
  const [inviteLinkActive, setInviteLinkActive] = useState(initialInviteLinkActive ?? true);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [isTogglingLink, setIsTogglingLink] = useState(false);

  const inviteLink = inviteCode ? `${window.location.origin}/join/space/${inviteCode}` : null;

  // Sync when props change (e.g. dialog re-opens after regenerate)
  useEffect(() => {
    setInviteCode(initialInviteCode ?? null);
    setInviteLinkActive(initialInviteLinkActive ?? true);
  }, [initialInviteCode, initialInviteLinkActive]);

  const handleGenerateCode = async () => {
    setIsGeneratingCode(true);
    try {
      const result = await spacesApi.regenerateCode(spaceId);
      setInviteCode(result.inviteCode);
      setInviteLinkActive(result.inviteLinkActive);
    } catch (err) {
      console.error("Generate invite code error:", err);
    } finally {
      setIsGeneratingCode(false);
    }
  };

  const handleCopyLink = () => {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyCode = () => {
    if (!inviteCode) return;
    navigator.clipboard.writeText(inviteCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleToggleLink = async () => {
    setIsTogglingLink(true);
    try {
      const result = await spacesApi.toggleInviteLink(spaceId, !inviteLinkActive);
      setInviteLinkActive(result.inviteLinkActive);
    } catch (err) {
      console.error("Toggle invite link error:", err);
    } finally {
      setIsTogglingLink(false);
    }
  };

  // Fetch contacts when dialog opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setContactsLoading(true);
    spacesApi.listContacts()
      .then(({ contacts: list }) => {
        if (!cancelled) setContacts(list);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setContactsLoading(false);
      });
    return () => { cancelled = true; };
  }, [open]);

  // Available contacts = contacts NOT already members of this space
  const availableContacts = contacts.filter(
    (c) => !memberEntityIds.has(c.entityId),
  );

  const filteredContacts = availableContacts.filter(
    (c) => (c.displayName || "").toLowerCase().includes(search.toLowerCase()),
  );

  const filteredHaseefs = availableHaseefs.filter(
    (h) => !memberEntityIds.has(h.entityId) && h.name.toLowerCase().includes(search.toLowerCase()),
  );

  const toggleContact = (entityId: string) => {
    setSelectedContactIds((prev) => {
      const next = new Set(prev);
      if (next.has(entityId)) next.delete(entityId);
      else next.add(entityId);
      return next;
    });
  };

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
      // Add contacts directly as members (WhatsApp-style)
      for (const entityId of selectedContactIds) {
        await spacesApi.addMember(spaceId, entityId, "member");
        addedCount++;
      }

      // Add haseefs directly as members
      for (const entityId of selectedHaseefIds) {
        await spacesApi.addMember(spaceId, entityId, "member");
        addedCount++;
      }

      // Send email invitations for new humans
      for (const email of emailList) {
        await invitationsApi.createForSpace(spaceId, { email, role: inviteRole });
        invitedCount++;
      }

      const parts: string[] = [];
      if (addedCount > 0) parts.push(`${addedCount} member${addedCount > 1 ? "s" : ""} added`);
      if (invitedCount > 0) parts.push(`${invitedCount} invitation${invitedCount > 1 ? "s" : ""} sent`);
      setSuccessMsg(parts.join(", ") + "!");

      setSelectedContactIds(new Set());
      setSelectedHaseefIds(new Set());
      setEmailList([]);
      onMembersChanged?.();

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
    setSelectedContactIds(new Set());
    setSelectedHaseefIds(new Set());
    setEmailList([]);
    setEmailInput("");
    setSearch("");
    setError(null);
    setSuccessMsg(null);
    onClose();
  };

  const totalSelected = selectedContactIds.size + selectedHaseefIds.size + emailList.length;

  return (
    <Dialog open={open} onClose={handleClose} className="max-w-md">
      <DialogHeader onClose={handleClose}>
        <DialogTitle>Invite to {spaceName}</DialogTitle>
        <DialogDescription>
          Add people, haseefs, or invite by email
        </DialogDescription>
      </DialogHeader>

      {/* Tabs */}
      <div className="flex border-b border-border mb-3">
        <button
          onClick={() => { setTab("people"); setSearch(""); }}
          className={cn(
            "flex-1 py-2 text-sm font-medium border-b-2 transition-colors",
            tab === "people"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <UserIcon className="size-4 inline mr-1.5" />
          People
        </button>
        <button
          onClick={() => { setTab("haseefs"); setSearch(""); }}
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
          onClick={() => { setTab("email"); setSearch(""); }}
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
        <button
          onClick={() => { setTab("link"); setSearch(""); }}
          className={cn(
            "flex-1 py-2 text-sm font-medium border-b-2 transition-colors",
            tab === "link"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <LinkIcon className="size-4 inline mr-1.5" />
          Link
        </button>
      </div>

      {/* People tab */}
      {tab === "people" && (
        <>
          <div className="relative mb-3">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search contacts..."
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
            {contactsLoading ? (
              <div className="flex items-center justify-center py-8">
                <LoaderIcon className="size-4 animate-spin text-muted-foreground" />
              </div>
            ) : filteredContacts.length === 0 ? (
              <EmptyList text={availableContacts.length === 0
                ? "No contacts available. People you share spaces with will appear here."
                : "No contacts match your search"
              } />
            ) : (
              filteredContacts.map((c) => (
                <button
                  key={c.entityId}
                  onClick={() => toggleContact(c.entityId)}
                  className={cn(
                    "flex items-center gap-3 w-full px-3 py-2.5 rounded-lg transition-colors text-left",
                    selectedContactIds.has(c.entityId) ? "bg-primary/8" : "hover:bg-muted/60",
                  )}
                >
                  <Avatar name={c.displayName || "?"} src={c.avatarUrl} size="sm" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-foreground truncate">{c.displayName || "Unknown"}</span>
                  </div>
                  <div
                    className={cn(
                      "flex size-5 items-center justify-center rounded-full border-2 transition-colors shrink-0",
                      selectedContactIds.has(c.entityId)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/30",
                    )}
                  >
                    {selectedContactIds.has(c.entityId) && <CheckIcon className="size-3" />}
                  </div>
                </button>
              ))
            )}
          </div>
        </>
      )}

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

      {/* Link tab */}
      {tab === "link" && (
        <div className="space-y-3">
          {!inviteCode ? (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground mb-3">Generate an invite link so anyone can join this space</p>
              <Button size="sm" onClick={handleGenerateCode} disabled={isGeneratingCode}>
                {isGeneratingCode ? (
                  <><LoaderIcon className="size-3.5 animate-spin mr-1.5" />Generating...</>
                ) : (
                  <><LinkIcon className="size-3.5 mr-1.5" />Generate Invite Link</>
                )}
              </Button>
            </div>
          ) : (
            <>
              {/* Invite Link */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Invite Link</p>
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "flex-1 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs font-mono truncate",
                    !inviteLinkActive && "opacity-50 line-through",
                  )}>
                    {inviteLink}
                  </div>
                  <Button size="sm" variant="outline" onClick={handleCopyLink} disabled={!inviteLinkActive}>
                    {copiedLink ? <><CheckIcon className="size-3.5" /> Copied</> : <><CopyIcon className="size-3.5" /> Copy</>}
                  </Button>
                </div>
              </div>

              {/* Code */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Code</p>
                  <div className="flex items-center gap-2">
                    <p className={cn("text-base font-mono font-bold tracking-wider text-foreground", !inviteLinkActive && "opacity-50 line-through")}>{inviteCode}</p>
                    <button onClick={handleCopyCode} className="text-muted-foreground hover:text-foreground" disabled={!inviteLinkActive}>
                      {copiedCode ? <CheckIcon className="size-3.5 text-emerald-500" /> : <CopyIcon className="size-3.5" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={handleGenerateCode} disabled={isGeneratingCode}>
                  <RefreshCwIcon className="size-3.5" />
                  {isGeneratingCode ? "..." : "Regenerate"}
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
                  <QrCodeIcon className="size-3.5 mr-1" />
                  {showQR ? "Hide QR" : "QR Code"}
                </Button>
              </div>

              {/* QR Code */}
              {showQR && inviteLinkActive && inviteLink && (
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
                  Share the link or code so others can join this space
                </p>
              )}
            </>
          )}
        </div>
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
            {(selectedContactIds.size + selectedHaseefIds.size) > 0 &&
              `${selectedContactIds.size + selectedHaseefIds.size} to add`}
            {(selectedContactIds.size + selectedHaseefIds.size) > 0 && emailList.length > 0 && " + "}
            {emailList.length > 0 && `${emailList.length} to invite`}
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

// ─── Join Space Dialog ──────────────────────────────────────────────────────

export function JoinSpaceDialog({
  open,
  onClose,
  onJoined,
}: {
  open: boolean;
  onClose: () => void;
  onJoined: (spaceId: string) => void;
}) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{ id: string; name: string | null; memberCount: number } | null>(null);
  const [error, setError] = useState("");

  const handleLookup = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError("");
    setPreview(null);
    try {
      const { space } = await spacesApi.resolveSpaceCode(code.trim());
      setPreview(space);
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
      const { space } = await spacesApi.joinByCode(code.trim());
      onJoined(space.id);
    } catch (err: any) {
      if (err.message?.includes("Already a member")) {
        setError("You're already a member of this space");
      } else {
        setError(err.message || "Failed to join");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setCode("");
    setPreview(null);
    setError("");
    onClose();
  };

  if (!open) return null;

  return (
    <Dialog open={open} onClose={handleClose} className="max-w-md">
      <DialogHeader onClose={handleClose}>
        <DialogTitle>Join a Space</DialogTitle>
        <DialogDescription>Enter an invite code to join an existing space</DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div className="flex gap-2">
          <input
            autoFocus
            value={code}
            onChange={(e) => { setCode(e.target.value.toUpperCase()); setPreview(null); setError(""); }}
            placeholder="e.g. ABCD1234"
            className={cn(
              "flex-1 h-10 rounded-lg bg-muted/60 px-3 text-sm font-mono tracking-wider uppercase",
              "placeholder:text-muted-foreground/60",
              "focus:outline-none focus:ring-2 focus:ring-ring/30",
            )}
          />
          <Button onClick={handleLookup} disabled={!code.trim() || loading}>
            {loading && !preview ? <LoaderIcon className="size-4 animate-spin" /> : "Lookup"}
          </Button>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        {preview && (
          <div className="p-4 rounded-xl border border-border bg-muted/30">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <UsersIcon className="size-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{preview.name || "Unnamed Space"}</p>
                <p className="text-xs text-muted-foreground">{preview.memberCount} member{preview.memberCount !== 1 ? "s" : ""}</p>
              </div>
            </div>
            <Button className="w-full mt-3" onClick={handleJoin} disabled={loading}>
              {loading ? <LoaderIcon className="size-4 animate-spin" /> : "Join Space"}
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
