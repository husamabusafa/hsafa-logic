import { useState } from "react";
import { PlusIcon, SearchIcon, UsersIcon, BotIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { MockSpace } from "@/lib/mock-data";

interface SpacesSidebarProps {
  spaces: MockSpace[];
  selectedSpaceId: string | null;
  onSelectSpace: (spaceId: string) => void;
  onCreateSpace: () => void;
}

export function SpacesSidebar({ spaces, selectedSpaceId, onSelectSpace, onCreateSpace }: SpacesSidebarProps) {
  const [search, setSearch] = useState("");

  const filtered = spaces.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 shrink-0">
        <h2 className="text-lg font-semibold text-foreground">Spaces</h2>
        <Button variant="ghost" size="icon" onClick={onCreateSpace} title="Create space">
          <PlusIcon className="size-5" />
        </Button>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search spaces..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={cn(
              "w-full h-9 rounded-lg bg-muted/60 pl-9 pr-3 text-sm",
              "placeholder:text-muted-foreground/60",
              "focus:outline-none focus:ring-2 focus:ring-ring/30 focus:bg-muted",
              "transition-colors",
            )}
          />
        </div>
      </div>

      {/* Spaces list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.map((space) => (
          <SpaceItem
            key={space.id}
            space={space}
            isSelected={space.id === selectedSpaceId}
            onClick={() => onSelectSpace(space.id)}
          />
        ))}

        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">No spaces found</p>
          </div>
        )}
      </div>
    </>
  );
}

function SpaceItem({ space, isSelected, onClick }: { space: MockSpace; isSelected: boolean; onClick: () => void }) {
  const onlineCount = space.members.filter((m) => m.isOnline && m.entityId !== "entity-husam").length;
  const agentCount = space.members.filter((m) => m.type === "agent").length;

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 w-full px-3 py-3 text-left transition-colors",
        isSelected
          ? "bg-primary/8 border-l-2 border-l-primary"
          : "hover:bg-muted/60 border-l-2 border-l-transparent",
      )}
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        {space.isGroup ? (
          <div className={cn(
            "flex size-12 items-center justify-center rounded-full bg-primary/15 text-primary font-semibold text-sm",
          )}>
            {space.name.charAt(0).toUpperCase()}
          </div>
        ) : (
          <Avatar
            name={space.name}
            color={space.members.find((m) => m.entityId !== "entity-husam")?.avatarColor}
            size="md"
            isOnline={space.members.find((m) => m.entityId !== "entity-husam")?.isOnline}
          />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={cn(
            "text-sm font-medium truncate",
            space.unreadCount > 0 ? "text-foreground" : "text-foreground/80",
          )}>
            {space.name}
          </span>
          {space.lastMessage && (
            <span className={cn(
              "text-[11px] shrink-0",
              space.unreadCount > 0 ? "text-primary font-medium" : "text-muted-foreground",
            )}>
              {space.lastMessage.time}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className="text-xs text-muted-foreground truncate">
            {space.lastMessage && (
              <>
                <span className="font-medium">{space.lastMessage.senderName}: </span>
                {space.lastMessage.content}
              </>
            )}
          </p>

          <div className="flex items-center gap-1 shrink-0">
            {space.isGroup && agentCount > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/60">
                <BotIcon className="size-3" />
                {agentCount}
              </span>
            )}
            {space.unreadCount > 0 && (
              <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {space.unreadCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
