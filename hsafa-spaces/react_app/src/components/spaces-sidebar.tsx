import { useState } from "react";
import { PlusIcon, SearchIcon, LoaderIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { SmartSpace } from "@/lib/api";

interface SpacesSidebarProps {
  spaces: SmartSpace[];
  selectedSpaceId: string | null;
  onSelectSpace: (spaceId: string) => void;
  onCreateSpace: () => void;
  isLoading?: boolean;
}

export function SpacesSidebar({ spaces, selectedSpaceId, onSelectSpace, onCreateSpace, isLoading }: SpacesSidebarProps) {
  const [search, setSearch] = useState("");

  const filtered = spaces.filter((s) =>
    (s.name || "").toLowerCase().includes(search.toLowerCase()),
  );

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

function SpaceItem({ space, isSelected, onClick }: { space: SmartSpace; isSelected: boolean; onClick: () => void }) {
  const name = space.name || "Unnamed Space";

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
        <div className={cn(
          "flex size-12 items-center justify-center rounded-full bg-primary/15 text-primary font-semibold text-sm",
        )}>
          {name.charAt(0).toUpperCase()}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium truncate text-foreground/80 block">
          {name}
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
