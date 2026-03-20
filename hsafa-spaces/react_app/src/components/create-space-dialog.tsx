import { useState, useEffect, useMemo } from "react";
import { UsersIcon, UserIcon, LoaderIcon, BotIcon, CheckIcon, XIcon, MailIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { haseefsApi, spacesApi, basesApi, type HaseefListItem, type Contact } from "@/lib/api";

// ─── Types ───────────────────────────────────────────────────────────────────

type DirectTarget =
  | { kind: "contact"; entityId: string; displayName: string; avatarUrl?: string | null }
  | { kind: "haseef"; entityId: string; name: string }
  | { kind: "email"; email: string };

interface CreateSpaceDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (space: {
    name: string;
    description: string;
    isGroup: boolean;
    memberEntityIds: string[];
    inviteEmails: string[];
  }) => Promise<void>;
}

export function CreateSpaceDialog({ open, onClose, onCreate }: CreateSpaceDialogProps) {
  const { user } = useAuth();
  const currentUserName = user?.name || "You";
  const [isGroup, setIsGroup] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Group fields
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedEntityIds, setSelectedEntityIds] = useState<Set<string>>(new Set());
  const [inviteEmails, setInviteEmails] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState("");

  // Direct fields
  const [directTarget, setDirectTarget] = useState<DirectTarget | null>(null);
  const [directSearch, setDirectSearch] = useState("");

  // Shared data
  const [haseefs, setHaseefs] = useState<HaseefListItem[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Fetch haseefs + contacts + base members when dialog opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setIsLoadingData(true);
    Promise.all([
      haseefsApi.list().then(({ haseefs: list }) => list).catch(() => [] as HaseefListItem[]),
      spacesApi.listContacts().then(({ contacts: list }) => list).catch(() => [] as Contact[]),
      basesApi.list().then(({ bases }) => bases).catch(() => []),
    ]).then(([h, c, bases]) => {
      if (cancelled) return;

      // Merge base members into contacts/haseefs so all base members are visible
      const currentEntityId = user?.entityId;
      const haseefMap = new Map(h.map((item) => [item.entityId, item]));
      const contactMap = new Map(c.map((item) => [item.entityId, item]));

      for (const base of bases) {
        for (const member of base.members) {
          if (member.entityId === currentEntityId) continue; // skip self
          if (member.type === "agent" && !haseefMap.has(member.entityId)) {
            // Add base haseef as a synthetic HaseefListItem
            haseefMap.set(member.entityId, {
              haseefId: member.entityId,
              entityId: member.entityId,
              name: member.displayName,
              avatarUrl: member.avatarUrl,
              createdAt: "",
            });
          } else if (member.type === "human" && !contactMap.has(member.entityId)) {
            // Add base human as a contact
            contactMap.set(member.entityId, {
              entityId: member.entityId,
              displayName: member.displayName,
              type: "human",
              avatarUrl: member.avatarUrl,
            });
          }
        }
      }

      setHaseefs(Array.from(haseefMap.values()));
      setContacts(Array.from(contactMap.values()));
    }).finally(() => {
      if (!cancelled) setIsLoadingData(false);
    });
    return () => { cancelled = true; };
  }, [open, user?.entityId]);

  // ─── Group helpers ──────────────────────────────────────────────────

  const toggleHaseef = (entityId: string) => {
    setSelectedEntityIds((prev) => {
      const next = new Set(prev);
      if (next.has(entityId)) next.delete(entityId);
      else next.add(entityId);
      return next;
    });
  };

  const toggleContact = (contact: Contact) => {
    setSelectedEntityIds((prev) => {
      const next = new Set(prev);
      if (next.has(contact.entityId)) next.delete(contact.entityId);
      else next.add(contact.entityId);
      return next;
    });
  };

  const addEmail = () => {
    const trimmed = emailInput.trim().toLowerCase();
    if (trimmed.includes("@") && !inviteEmails.includes(trimmed)) {
      setInviteEmails((prev) => [...prev, trimmed]);
    }
    setEmailInput("");
  };

  // ─── Direct helpers ─────────────────────────────────────────────────

  const filteredDirectItems = useMemo(() => {
    const q = directSearch.toLowerCase();
    const matchedContacts = contacts
      .filter((c) => (c.displayName || "").toLowerCase().includes(q))
      .map((c) => ({ kind: "contact" as const, ...c }));
    const matchedHaseefs = haseefs
      .filter((h) => h.name.toLowerCase().includes(q))
      .map((h) => ({ kind: "haseef" as const, entityId: h.entityId, name: h.name }));
    return [...matchedContacts, ...matchedHaseefs];
  }, [contacts, haseefs, directSearch]);

  const directTargetName = directTarget
    ? directTarget.kind === "contact"
      ? directTarget.displayName || "Unknown"
      : directTarget.kind === "haseef"
        ? directTarget.name
        : directTarget.email
    : "";

  // ─── Create handler ─────────────────────────────────────────────────

  const handleCreate = async () => {
    if (isCreating) return;

    if (isGroup && !name.trim()) return;
    if (!isGroup && !directTarget) return;

    setIsCreating(true);
    setError(null);
    try {
      if (isGroup) {
        await onCreate({
          name: name.trim(),
          description: description.trim(),
          isGroup: true,
          memberEntityIds: [...selectedEntityIds],
          inviteEmails,
        });
      } else {
        // Direct space — name format: "Member1 ↔ Member2" (stored in DB)
        const memberEntityIds: string[] = [];
        const emails: string[] = [];
        let targetName = "";

        if (directTarget!.kind === "contact") {
          memberEntityIds.push(directTarget!.entityId);
          targetName = directTarget!.displayName || "Unknown";
        } else if (directTarget!.kind === "haseef") {
          memberEntityIds.push(directTarget!.entityId);
          targetName = directTarget!.name;
        } else {
          emails.push(directTarget!.email);
          targetName = directTarget!.email;
        }

        // Format: "CurrentUser ↔ TargetName"
        const spaceName = `${currentUserName} ↔ ${targetName}`;

        await onCreate({
          name: spaceName,
          description: "",
          isGroup: false,
          memberEntityIds,
          inviteEmails: emails,
        });
      }
      resetState();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to create space");
    } finally {
      setIsCreating(false);
    }
  };

  const resetState = () => {
    setName("");
    setDescription("");
    setIsGroup(true);
    setSelectedEntityIds(new Set());
    setInviteEmails([]);
    setEmailInput("");
    setDirectTarget(null);
    setDirectSearch("");
    setError(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  // ─── Computed ───────────────────────────────────────────────────────

  const canCreate = isGroup ? !!name.trim() : !!directTarget;

  // ─── Render ─────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onClose={handleClose}>
      <DialogHeader onClose={handleClose}>
        <DialogTitle>Create a new space</DialogTitle>
        <DialogDescription>
          {isGroup
            ? "Create a group space with multiple members."
            : "Start a 1-on-1 conversation with someone."}
        </DialogDescription>
      </DialogHeader>

      {/* Space type selector */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <button
          onClick={() => { setIsGroup(true); setDirectTarget(null); setDirectSearch(""); }}
          className={cn(
            "flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-colors",
            isGroup
              ? "border-primary bg-primary/5"
              : "border-border hover:border-border/80 hover:bg-muted/50",
          )}
        >
          <UsersIcon className={cn("size-6", isGroup ? "text-primary" : "text-muted-foreground")} />
          <div className="text-center">
            <p className={cn("text-sm font-medium", isGroup ? "text-primary" : "text-foreground")}>Group</p>
            <p className="text-[11px] text-muted-foreground">Multiple members</p>
          </div>
        </button>
        <button
          onClick={() => { setIsGroup(false); setSelectedEntityIds(new Set()); setInviteEmails([]); setEmailInput(""); }}
          className={cn(
            "flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-colors",
            !isGroup
              ? "border-primary bg-primary/5"
              : "border-border hover:border-border/80 hover:bg-muted/50",
          )}
        >
          <UserIcon className={cn("size-6", !isGroup ? "text-primary" : "text-muted-foreground")} />
          <div className="text-center">
            <p className={cn("text-sm font-medium", !isGroup ? "text-primary" : "text-foreground")}>Direct</p>
            <p className="text-[11px] text-muted-foreground">1-on-1 chat</p>
          </div>
        </button>
      </div>

      {/* ── DIRECT MODE ───────────────────────────────────────────────── */}
      {!isGroup && (
        <div className="space-y-3">
          {/* Selected target chip */}
          {directTarget ? (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 flex items-center gap-3">
              {directTarget.kind === "contact" ? (
                <Avatar name={directTarget.displayName || "?"} src={directTarget.avatarUrl} size="sm" />
              ) : directTarget.kind === "haseef" ? (
                <div className="flex size-8 items-center justify-center rounded-full bg-emerald-500/15 shrink-0">
                  <BotIcon className="size-3.5 text-emerald-600" />
                </div>
              ) : (
                <div className="flex size-8 items-center justify-center rounded-full bg-blue-500/15 shrink-0">
                  <MailIcon className="size-3.5 text-blue-600" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{directTargetName}</p>
                <p className="text-[11px] text-muted-foreground">
                  {directTarget.kind === "contact" ? "Existing contact" : directTarget.kind === "haseef" ? "Haseef" : "Email invitation"}
                </p>
              </div>
              <button
                onClick={() => setDirectTarget(null)}
                className="p-1 rounded-md hover:bg-muted/60 transition-colors"
              >
                <XIcon className="size-4 text-muted-foreground" />
              </button>
            </div>
          ) : (
            <>
              {/* Search / email input */}
              <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/60" />
                <input
                  placeholder="Search contacts, haseefs, or enter email..."
                  value={directSearch}
                  onChange={(e) => setDirectSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && directSearch.includes("@")) {
                      e.preventDefault();
                      setDirectTarget({ kind: "email", email: directSearch.trim().toLowerCase() });
                      setDirectSearch("");
                    }
                  }}
                  autoFocus
                  className={cn(
                    "w-full h-10 rounded-lg bg-muted/60 pl-9 pr-3 text-sm",
                    "placeholder:text-muted-foreground/60",
                    "focus:outline-none focus:ring-2 focus:ring-ring/30",
                  )}
                />
              </div>

              {/* Picker list */}
              {isLoadingData ? (
                <div className="flex items-center justify-center py-6">
                  <LoaderIcon className="size-4 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="max-h-[220px] overflow-y-auto rounded-lg border border-border divide-y divide-border">
                  {filteredDirectItems.length === 0 && !directSearch.includes("@") && (
                    <p className="text-xs text-muted-foreground text-center py-6">
                      No contacts or haseefs found.
                      {directSearch ? " Try entering an email address." : ""}
                    </p>
                  )}

                  {/* Show "invite by email" option if input looks like email */}
                  {directSearch.includes("@") && (
                    <button
                      onClick={() => {
                        setDirectTarget({ kind: "email", email: directSearch.trim().toLowerCase() });
                        setDirectSearch("");
                      }}
                      className="flex items-center gap-2.5 w-full px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex size-8 items-center justify-center rounded-full bg-blue-500/15 shrink-0">
                        <MailIcon className="size-3.5 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium">Invite {directSearch.trim()}</span>
                        <p className="text-[11px] text-muted-foreground">Send email invitation</p>
                      </div>
                    </button>
                  )}

                  {filteredDirectItems.map((item) => (
                    <button
                      key={item.kind === "contact" ? `c-${item.entityId}` : `h-${item.entityId}`}
                      onClick={() => {
                        if (item.kind === "contact") {
                          setDirectTarget({ kind: "contact", entityId: item.entityId, displayName: item.displayName || "Unknown", avatarUrl: item.avatarUrl });
                        } else {
                          setDirectTarget({ kind: "haseef", entityId: item.entityId, name: item.name });
                        }
                        setDirectSearch("");
                      }}
                      className="flex items-center gap-2.5 w-full px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
                    >
                      {item.kind === "contact" ? (
                        <Avatar name={item.displayName || "?"} src={item.avatarUrl} size="sm" />
                      ) : (
                        <div className="flex size-8 items-center justify-center rounded-full bg-emerald-500/15 shrink-0">
                          <BotIcon className="size-3.5 text-emerald-600" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium truncate">
                          {item.kind === "contact" ? item.displayName || "Unknown" : item.name}
                        </span>
                        <p className="text-[11px] text-muted-foreground">
                          {item.kind === "contact" ? "Contact" : "Haseef"}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── GROUP MODE ────────────────────────────────────────────────── */}
      {isGroup && (
        <div className="space-y-4">
          <Input
            label="Space name"
            id="space-name"
            placeholder="e.g. Product Team"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <Textarea
            label="Description (optional)"
            id="space-desc"
            placeholder="What's this space about?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />

          {/* Selected chips (contacts + haseefs + emails) */}
          {(selectedEntityIds.size > 0 || inviteEmails.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {contacts
                .filter((c) => selectedEntityIds.has(c.entityId))
                .map((c) => (
                  <button
                    key={c.entityId}
                    onClick={() => toggleContact(c)}
                    className="flex items-center gap-1 px-2 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-medium hover:bg-blue-500/20 transition-colors"
                  >
                    <UserIcon className="size-3" />
                    {c.displayName || "Unknown"}
                    <XIcon className="size-3" />
                  </button>
                ))}
              {haseefs
                .filter((h) => selectedEntityIds.has(h.entityId))
                .map((h) => (
                  <button
                    key={h.entityId}
                    onClick={() => toggleHaseef(h.entityId)}
                    className="flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-medium hover:bg-emerald-500/20 transition-colors"
                  >
                    <BotIcon className="size-3" />
                    {h.name}
                    <XIcon className="size-3" />
                  </button>
                ))}
              {inviteEmails.map((email) => (
                <button
                  key={email}
                  onClick={() => setInviteEmails((prev) => prev.filter((e) => e !== email))}
                  className="flex items-center gap-1 px-2 py-1 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 text-xs font-medium hover:bg-violet-500/20 transition-colors"
                >
                  <MailIcon className="size-3" />
                  {email}
                  <XIcon className="size-3" />
                </button>
              ))}
            </div>
          )}

          {/* Members picker: Contacts + Haseefs combined list */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Add members</label>

            {isLoadingData ? (
              <div className="flex items-center justify-center py-4">
                <LoaderIcon className="size-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="max-h-[160px] overflow-y-auto rounded-lg border border-border divide-y divide-border">
                {contacts.length === 0 && haseefs.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No contacts or haseefs available yet.
                  </p>
                )}

                {/* Contacts */}
                {contacts.map((c) => {
                  const selected = selectedEntityIds.has(c.entityId);
                  return (
                    <button
                      key={c.entityId}
                      onClick={() => toggleContact(c)}
                      className={cn(
                        "flex items-center gap-2.5 w-full px-3 py-2.5 text-left transition-colors",
                        selected ? "bg-primary/5" : "hover:bg-muted/50",
                      )}
                    >
                      <Avatar name={c.displayName || "?"} src={c.avatarUrl} size="sm" />
                      <span className="text-sm font-medium flex-1 truncate">{c.displayName || "Unknown"}</span>
                      {selected && <CheckIcon className="size-4 text-primary shrink-0" />}
                    </button>
                  );
                })}

                {/* Haseefs */}
                {haseefs.map((h) => {
                  const selected = selectedEntityIds.has(h.entityId);
                  return (
                    <button
                      key={h.entityId}
                      onClick={() => toggleHaseef(h.entityId)}
                      className={cn(
                        "flex items-center gap-2.5 w-full px-3 py-2.5 text-left transition-colors",
                        selected ? "bg-primary/5" : "hover:bg-muted/50",
                      )}
                    >
                      <div className="flex size-8 items-center justify-center rounded-full bg-emerald-500/15 shrink-0">
                        <BotIcon className="size-3.5 text-emerald-600" />
                      </div>
                      <span className="text-sm font-medium flex-1 truncate">{h.name}</span>
                      {selected && <CheckIcon className="size-4 text-primary shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Invite by email */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              <MailIcon className="size-3.5 inline mr-1.5" />
              Invite by email
            </label>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="Enter email address..."
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && emailInput.includes("@")) {
                    e.preventDefault();
                    addEmail();
                  }
                }}
                className={cn(
                  "flex-1 h-9 rounded-lg bg-muted/60 px-3 text-sm",
                  "placeholder:text-muted-foreground/60",
                  "focus:outline-none focus:ring-2 focus:ring-ring/30",
                )}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!emailInput.includes("@")}
                onClick={addEmail}
              >
                Add
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              New users will receive an invitation after the space is created.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive mt-3">
          {error}
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={handleClose} disabled={isCreating}>Cancel</Button>
        <Button onClick={handleCreate} disabled={!canCreate || isCreating}>
          {isCreating && <LoaderIcon className="size-4 animate-spin" />}
          {isCreating ? "Creating..." : isGroup ? "Create group" : "Start chat"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
