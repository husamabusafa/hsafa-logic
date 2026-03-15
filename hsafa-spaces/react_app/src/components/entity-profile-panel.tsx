import {
  XIcon,
  BotIcon,
  ChevronLeftIcon,
  CalendarIcon,
  MapPinIcon,
  MessageSquareIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { MockSpace, MockMember } from "@/lib/mock-data";
import { RoleBadge } from "@/components/space-details";

export function EntityProfilePanel({
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
            src={member.avatarUrl}
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
