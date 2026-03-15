import { useState } from "react";
import {
  XIcon,
  ForwardIcon,
  SearchIcon,
  CheckIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { mockSpaces } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export function ForwardDialog({
  messageId,
  currentSpaceId,
  messages,
  onClose,
}: {
  messageId: string;
  currentSpaceId: string;
  messages: any[];
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedSpaces, setSelectedSpaces] = useState<string[]>([]);
  const [sent, setSent] = useState(false);

  const forwardMessage = (messages as any[]).find((m: any) => m.id === messageId);
  const otherSpaces = mockSpaces.filter((s) => s.id !== currentSpaceId);
  const filtered = otherSpaces.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()),
  );

  const toggleSpace = (spaceId: string) => {
    setSelectedSpaces((prev) =>
      prev.includes(spaceId) ? prev.filter((id) => id !== spaceId) : [...prev, spaceId],
    );
  };

  const handleForward = () => {
    console.log("Forward message:", messageId, "to spaces:", selectedSpaces);
    setSent(true);
    setTimeout(onClose, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-popover border border-border rounded-xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <ForwardIcon className="size-4 text-primary" />
            <span className="text-sm font-semibold">Forward Message</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted transition-colors">
            <XIcon className="size-4 text-muted-foreground" />
          </button>
        </div>

        {sent ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <div className="size-10 rounded-full bg-green-500/15 flex items-center justify-center">
              <CheckIcon className="size-5 text-green-500" />
            </div>
            <p className="text-sm font-medium">Message forwarded!</p>
          </div>
        ) : (
          <>
            {/* Message preview */}
            {forwardMessage && (
              <div className="px-4 py-2.5 bg-muted/30 border-b border-border">
                <p className="text-xs text-muted-foreground mb-0.5">{forwardMessage.senderName}</p>
                <p className="text-sm truncate">
                  {forwardMessage.content || forwardMessage.title || forwardMessage.formTitle || forwardMessage.cardTitle || forwardMessage.imageCaption || forwardMessage.fileName || "Message"}
                </p>
              </div>
            )}

            {/* Search */}
            <div className="px-3 pt-3 pb-2">
              <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search spaces..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-9 rounded-lg bg-muted/60 pl-9 pr-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/30"
                  autoFocus
                />
              </div>
            </div>

            {/* Space list */}
            <div className="max-h-56 overflow-y-auto px-2 pb-2">
              {filtered.map((s) => {
                const isSelected = selectedSpaces.includes(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() => toggleSpace(s.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors",
                      isSelected ? "bg-primary/10" : "hover:bg-muted/60",
                    )}
                  >
                    <Avatar
                      name={s.name}
                      color={s.members[0]?.avatarColor}
                      size="sm"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{s.name}</p>
                      <p className="text-[11px] text-muted-foreground">{s.members.length} members</p>
                    </div>
                    {isSelected && (
                      <div className="size-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                        <CheckIcon className="size-3 text-primary-foreground" />
                      </div>
                    )}
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">No spaces found</p>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <span className="text-xs text-muted-foreground">
                {selectedSpaces.length > 0 ? `${selectedSpaces.length} selected` : "Select spaces"}
              </span>
              <Button
                size="sm"
                disabled={selectedSpaces.length === 0}
                onClick={handleForward}
              >
                <ForwardIcon className="size-3.5 mr-1.5" />
                Forward
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
