import { useState, useEffect, useCallback } from "react";
import {
  MailIcon,
  CheckIcon,
  XIcon,
  ClockIcon,
  ShieldIcon,
  UsersIcon,
  LoaderIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { invitationsApi, type Invitation } from "@/lib/api";

export function InvitationsPage() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const fetchInvitations = useCallback(async () => {
    try {
      const { invitations: list } = await invitationsApi.listMine("pending");
      setInvitations(list);
    } catch (err) {
      console.error("Failed to fetch invitations:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvitations();
  }, [fetchInvitations]);

  const pending = invitations.filter((inv) => inv.status === "pending");
  const responded = invitations.filter((inv) => inv.status !== "pending");

  const handleAccept = async (id: string) => {
    setActionInProgress(id);
    try {
      await invitationsApi.accept(id);
      await fetchInvitations();
    } catch (err) {
      console.error("Failed to accept invitation:", err);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDecline = async (id: string) => {
    setActionInProgress(id);
    try {
      await invitationsApi.decline(id);
      await fetchInvitations();
    } catch (err) {
      console.error("Failed to decline invitation:", err);
    } finally {
      setActionInProgress(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-muted/20">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-background px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <MailIcon className="size-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Invitations</h2>
            <p className="text-sm text-muted-foreground">
              {pending.length} pending {pending.length === 1 ? "invitation" : "invitations"}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <LoaderIcon className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-6">
            {/* Pending */}
            {pending.length > 0 && (
              <section>
                <h3 className="text-sm font-medium text-muted-foreground mb-3">Pending</h3>
                <div className="space-y-3">
                  {pending.map((inv) => (
                    <InvitationCard
                      key={inv.id}
                      invitation={inv}
                      onAccept={() => handleAccept(inv.id)}
                      onDecline={() => handleDecline(inv.id)}
                      isLoading={actionInProgress === inv.id}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Responded */}
            {responded.length > 0 && (
              <section>
                <h3 className="text-sm font-medium text-muted-foreground mb-3">Responded</h3>
                <div className="space-y-3">
                  {responded.map((inv) => (
                    <InvitationCard key={inv.id} invitation={inv} />
                  ))}
                </div>
              </section>
            )}

            {/* Empty */}
            {invitations.length === 0 && (
              <div className="text-center py-16">
                <div className="size-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                  <MailIcon className="size-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-1">No invitations</h3>
                <p className="text-sm text-muted-foreground">
                  You'll see invitations to join spaces here.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Invitation Card ────────────────────────────────────────────────────────

function InvitationCard({
  invitation,
  onAccept,
  onDecline,
  isLoading,
}: {
  invitation: Invitation;
  onAccept?: () => void;
  onDecline?: () => void;
  isLoading?: boolean;
}) {
  const isPending = invitation.status === "pending";
  const isAccepted = invitation.status === "accepted";
  const timeAgo = getTimeAgo(invitation.createdAt);

  const spaceName = invitation.smartSpace?.name || "Unknown Space";
  const inviterName = invitation.inviter?.displayName || "Someone";

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 transition-all",
        isPending ? "border-border shadow-sm" : "border-border/50 opacity-70"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Space avatar */}
        <Avatar name={spaceName} size="sm" />

        <div className="flex-1 min-w-0">
          {/* Space name + role */}
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-semibold text-foreground">{spaceName}</h4>
            <Badge variant={invitation.role === "admin" ? "default" : "secondary"}>
              {invitation.role === "admin" ? (
                <><ShieldIcon className="size-3 mr-0.5" /> Admin</>
              ) : (
                <><UsersIcon className="size-3 mr-0.5" /> Member</>
              )}
            </Badge>
          </div>

          {/* Inviter + time */}
          <p className="text-xs text-muted-foreground mt-0.5">
            Invited by <span className="font-medium">{inviterName}</span> · {timeAgo}
          </p>

          {/* Message */}
          {invitation.message && (
            <p className="text-sm text-foreground/80 mt-2 leading-relaxed">
              "{invitation.message}"
            </p>
          )}

          {/* Actions */}
          {isPending && (
            <div className="flex items-center gap-2 mt-3">
              <Button size="sm" onClick={onAccept} disabled={isLoading}>
                {isLoading ? <LoaderIcon className="size-3.5 mr-1 animate-spin" /> : <CheckIcon className="size-3.5 mr-1" />}
                Accept
              </Button>
              <Button size="sm" variant="outline" onClick={onDecline} disabled={isLoading}>
                <XIcon className="size-3.5 mr-1" />
                Decline
              </Button>
            </div>
          )}

          {/* Status badge for responded */}
          {!isPending && (
            <div className={cn(
              "flex items-center gap-1.5 mt-2 text-xs font-medium",
              isAccepted ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
            )}>
              {isAccepted ? (
                <><CheckIcon className="size-3.5" /> Accepted</>
              ) : (
                <><ClockIcon className="size-3.5" /> Declined</>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}
