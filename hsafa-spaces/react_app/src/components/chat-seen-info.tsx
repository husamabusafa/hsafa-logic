import {
  XIcon,
  CheckCheckIcon,
  EyeIcon,
} from "lucide-react";
import type { MockMember } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export function SeenInfoPopup({
  messageId,
  seenBy,
  members,
  currentEntityId,
  senderId,
  onClose,
}: {
  messageId: string;
  seenBy: string[];
  members: MockMember[];
  currentEntityId: string;
  senderId: string;
  onClose: () => void;
}) {
  // All members except the sender and current user
  const relevantMembers = members.filter(
    (m) => m.entityId !== senderId,
  );
  const seenSet = new Set(seenBy);

  const seenMembers = relevantMembers.filter((m) => seenSet.has(m.entityId));
  const unseenMembers = relevantMembers.filter((m) => !seenSet.has(m.entityId));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-xs bg-popover border border-border rounded-xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <EyeIcon className="size-4 text-primary" />
            <span className="text-sm font-semibold">Message Info</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted transition-colors">
            <XIcon className="size-4 text-muted-foreground" />
          </button>
        </div>

        <div className="max-h-64 overflow-y-auto">
          {/* Seen */}
          {seenMembers.length > 0 && (
            <div className="px-4 pt-3 pb-1">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Seen by ({seenMembers.length})
              </p>
              {seenMembers.map((m) => (
                <div key={m.entityId} className="flex items-center gap-2.5 py-1.5">
                  <div className={cn(
                    "size-7 rounded-full flex items-center justify-center shrink-0",
                    m.type === "agent" ? "bg-emerald-500" : (m.avatarColor || "bg-primary"),
                  )}>
                    <span className="text-[10px] text-white font-bold">{m.name.charAt(0)}</span>
                  </div>
                  <span className="text-sm">{m.name}</span>
                  <CheckCheckIcon className="size-3.5 text-blue-300 ml-auto" />
                </div>
              ))}
            </div>
          )}

          {/* Not seen */}
          {unseenMembers.length > 0 && (
            <div className="px-4 pt-3 pb-3">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Not seen ({unseenMembers.length})
              </p>
              {unseenMembers.map((m) => (
                <div key={m.entityId} className="flex items-center gap-2.5 py-1.5">
                  <div className={cn(
                    "size-7 rounded-full flex items-center justify-center shrink-0 opacity-50",
                    m.type === "agent" ? "bg-emerald-500" : (m.avatarColor || "bg-primary"),
                  )}>
                    <span className="text-[10px] text-white font-bold">{m.name.charAt(0)}</span>
                  </div>
                  <span className="text-sm text-muted-foreground">{m.name}</span>
                </div>
              ))}
            </div>
          )}

          {relevantMembers.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No members</p>
          )}
        </div>
      </div>
    </div>
  );
}
