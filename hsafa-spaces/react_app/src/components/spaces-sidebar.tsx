import { useState } from "react";
import { PlusIcon, SearchIcon, LoaderIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { SmartSpace } from "@/lib/api";

interface SpacesSidebarProps {
  spaces: SmartSpace[];
  selectedSpaceId: string | null;
  currentEntityId: string;
  onSelectSpace: (spaceId: string) => void;
  onCreateSpace: () => void;
  isLoading?: boolean;
}

export function SpacesSidebar({ spaces, selectedSpaceId, currentEntityId, onSelectSpace, onCreateSpace, isLoading }: SpacesSidebarProps) {
  const [search, setSearch] = useState("");

  const filtered = spaces.filter((s) => {
    const q = search.toLowerCase();
    if ((s.name || "").toLowerCase().includes(q)) return true;
    // Also search by member display names (for direct spaces)
    if (s.members?.some((m) => m.entityId !== currentEntityId && (m.displayName || "").toLowerCase().includes(q))) return true;
    return false;
  });

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 shrink-0">
        <div className="flex items-center">
          <img 
            src="/logo/dark-logo-spaces.svg" 
            alt="Hsafa Spaces" 
            className="h-7 w-auto dark:hidden"
          />
          <img 
            src="/logo/white-logo-spaces.svg" 
            alt="Hsafa Spaces" 
            className="h-7 w-auto hidden dark:block"
          />
        </div>
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
        {isLoading ? (
          <div className="flex justify-center py-8">
            <LoaderIcon className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {filtered.map((space) => (
              <SpaceItem
                key={space.id}
                space={space}
                currentEntityId={currentEntityId}
                isSelected={space.id === selectedSpaceId}
                onClick={() => onSelectSpace(space.id)}
              />
            ))}

            {filtered.length === 0 && (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-muted-foreground">No spaces found</p>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

function SpaceItem({ space, currentEntityId, isSelected, onClick }: { space: SmartSpace; currentEntityId: string; isSelected: boolean; onClick: () => void }) {
  const members = space.members || [];
  const isDirect = !!(space.metadata as any)?.isDirect || (members.length <= 2 && members.every((m) => m.type === "human"));
  const otherMember = isDirect ? members.find((m) => m.entityId !== currentEntityId) : null;
  const displayName = isDirect && otherMember
    ? (otherMember.displayName || "Unknown")
    : (space.name || "Unnamed Space");
  const isGroup = !isDirect;

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
        {isGroup ? (
          <div className={cn(
            "flex size-12 items-center justify-center rounded-full bg-primary/15 text-primary font-semibold text-sm",
          )}>
            {displayName.charAt(0).toUpperCase()}
          </div>
        ) : (
          <Avatar
            name={displayName}
            color={otherMember?.type === "agent" ? "bg-emerald-500" : "bg-primary"}
            size="md"
          />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium truncate text-foreground/80 block">
          {displayName}
        </span>
        {space.description && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {space.description}
          </p>
        )}
      </div>
    </button>
  );
}
