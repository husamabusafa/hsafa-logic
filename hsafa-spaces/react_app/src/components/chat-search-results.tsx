import { SearchIcon } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import type { MockSpace, MockMessage } from "@/lib/mock-data";

interface SearchResultsProps {
  messages: MockMessage[];
  query: string;
  space: MockSpace;
  onSelect: (messageId: string) => void;
}

export function SearchResults({ messages, query, space, onSelect }: SearchResultsProps) {
  const searchResults = messages.filter((m) => {
    const text = (m.content || m.title || m.formTitle || m.cardTitle || m.imageCaption || m.fileName || "").toLowerCase();
    return text.includes(query.toLowerCase()) || m.senderName.toLowerCase().includes(query.toLowerCase());
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (searchResults.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-12">
        <div className="size-12 rounded-full bg-muted flex items-center justify-center mb-3">
          <SearchIcon className="size-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground">No results found</p>
        <p className="text-xs text-muted-foreground mt-1">Try a different search term</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="sticky top-0 bg-background/95 backdrop-blur-sm py-2 px-2 border-b border-border z-10">
        <p className="text-xs text-muted-foreground font-medium">
          {searchResults.length} result{searchResults.length !== 1 ? "s" : ""}
        </p>
      </div>
      {searchResults.map((msg) => {
        const time = new Date(msg.createdAt).toLocaleDateString([], { month: "short", day: "numeric" });
        const text = msg.content || msg.title || msg.formTitle || msg.cardTitle || msg.imageCaption || msg.fileName || "Message";
        const member = space.members.find((m) => m.entityId === msg.entityId);
        
        return (
          <button
            key={msg.id}
            onClick={() => onSelect(msg.id)}
            className="w-full flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors text-left"
          >
            <Avatar
              name={msg.senderName}
              src={member?.avatarUrl}
              color={member?.avatarColor}
              size="sm"
              isOnline={member?.isOnline}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">{msg.senderName}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">{time}</span>
              </div>
              <p className="text-sm text-muted-foreground truncate mt-0.5">{text}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
