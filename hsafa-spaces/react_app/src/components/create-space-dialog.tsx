import { useState, useEffect } from "react";
import { UsersIcon, UserIcon, LoaderIcon, BotIcon, CheckIcon, XIcon, MailIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { haseefsApi, type HaseefListItem } from "@/lib/api";

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
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isGroup, setIsGroup] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Haseef selection
  const [haseefs, setHaseefs] = useState<HaseefListItem[]>([]);
  const [haseefsLoading, setHaseefsLoading] = useState(false);
  const [selectedEntityIds, setSelectedEntityIds] = useState<Set<string>>(new Set());

  // Human email invitations
  const [emailInput, setEmailInput] = useState("");
  const [inviteEmails, setInviteEmails] = useState<string[]>([]);

  // Fetch haseefs when dialog opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setHaseefsLoading(true);
    haseefsApi.list().then(({ haseefs: list }) => {
      if (!cancelled) setHaseefs(list);
    }).catch(() => {}).finally(() => {
      if (!cancelled) setHaseefsLoading(false);
    });
    return () => { cancelled = true; };
  }, [open]);

  const toggleHaseef = (entityId: string) => {
    setSelectedEntityIds((prev) => {
      const next = new Set(prev);
      if (next.has(entityId)) next.delete(entityId);
      else next.add(entityId);
      return next;
    });
  };

  const handleCreate = async () => {
    if (!name.trim() || isCreating) return;
    setIsCreating(true);
    setError(null);
    try {
      await onCreate({
        name: name.trim(),
        description: description.trim(),
        isGroup,
        memberEntityIds: [...selectedEntityIds],
        inviteEmails,
      });
      setName("");
      setDescription("");
      setIsGroup(true);
      setSelectedEntityIds(new Set());
      setInviteEmails([]);
      setEmailInput("");
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to create space");
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    setName("");
    setDescription("");
    setIsGroup(true);
    setSelectedEntityIds(new Set());
    setInviteEmails([]);
    setEmailInput("");
    setError(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose}>
      <DialogHeader onClose={handleClose}>
        <DialogTitle>Create a new space</DialogTitle>
        <DialogDescription>
          Spaces are where conversations happen. Add haseefs and invite people.
        </DialogDescription>
      </DialogHeader>

      {/* Space type selector */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <button
          onClick={() => setIsGroup(true)}
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
          onClick={() => setIsGroup(false)}
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

      <div className="space-y-4">
        <Input
          label="Space name"
          id="space-name"
          placeholder={isGroup ? "e.g. Product Team" : "e.g. John Doe"}
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

        {/* Haseef member picker */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Add Haseefs</label>
          {haseefsLoading ? (
            <div className="flex items-center justify-center py-4">
              <LoaderIcon className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : haseefs.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">
              No haseefs available. Create one first from the Haseefs page.
            </p>
          ) : (
            <>
              {/* Selected chips */}
              {selectedEntityIds.size > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {haseefs
                    .filter((h) => selectedEntityIds.has(h.entityId))
                    .map((h) => (
                      <button
                        key={h.entityId}
                        onClick={() => toggleHaseef(h.entityId)}
                        className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
                      >
                        <BotIcon className="size-3" />
                        {h.name}
                        <XIcon className="size-3" />
                      </button>
                    ))}
                </div>
              )}

              {/* Haseef list */}
              <div className="max-h-[140px] overflow-y-auto rounded-lg border border-border divide-y divide-border">
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
                      <div className="flex size-7 items-center justify-center rounded-full bg-emerald-500/15 shrink-0">
                        <BotIcon className="size-3.5 text-emerald-600" />
                      </div>
                      <span className="text-sm font-medium flex-1 truncate">{h.name}</span>
                      {selected && (
                        <CheckIcon className="size-4 text-primary shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Invite people by email */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">
            <MailIcon className="size-3.5 inline mr-1.5" />
            Invite People
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
                  const trimmed = emailInput.trim().toLowerCase();
                  if (!inviteEmails.includes(trimmed)) {
                    setInviteEmails((prev) => [...prev, trimmed]);
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
              type="button"
              size="sm"
              variant="outline"
              disabled={!emailInput.includes("@")}
              onClick={() => {
                const trimmed = emailInput.trim().toLowerCase();
                if (trimmed.includes("@") && !inviteEmails.includes(trimmed)) {
                  setInviteEmails((prev) => [...prev, trimmed]);
                }
                setEmailInput("");
              }}
            >
              Add
            </Button>
          </div>
          {inviteEmails.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {inviteEmails.map((email) => (
                <button
                  key={email}
                  onClick={() => setInviteEmails((prev) => prev.filter((e) => e !== email))}
                  className="flex items-center gap-1 px-2 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-medium hover:bg-blue-500/20 transition-colors"
                >
                  <MailIcon className="size-3" />
                  {email}
                  <XIcon className="size-3" />
                </button>
              ))}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            They'll receive an invitation after the space is created.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive mt-3">
          {error}
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={handleClose} disabled={isCreating}>Cancel</Button>
        <Button onClick={handleCreate} disabled={!name.trim() || isCreating}>
          {isCreating && <LoaderIcon className="size-4 animate-spin" />}
          {isCreating ? "Creating..." : "Create space"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
