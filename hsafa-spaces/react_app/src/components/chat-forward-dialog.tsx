import { useState, useEffect } from "react";
import {
  XIcon,
  ForwardIcon,
  SearchIcon,
  CheckIcon,
  Loader2Icon,
  AlertCircleIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { spacesApi, type SmartSpace } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { MockMessage } from "@/lib/mock-data";

interface ForwardDialogProps {
  message: MockMessage;
  currentSpaceId: string;
  currentEntityId: string;
  onClose: () => void;
  onForwarded?: () => void;
}

export function ForwardDialog({
  message,
  currentSpaceId,
  currentEntityId,
  onClose,
  onForwarded,
}: ForwardDialogProps) {
  const [search, setSearch] = useState("");
  const [spaces, setSpaces] = useState<SmartSpace[]>([]);
  const [selectedSpaces, setSelectedSpaces] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch user's spaces on mount
  useEffect(() => {
    let mounted = true;
    spacesApi
      .list()
      .then((res) => {
        if (!mounted) return;
        setSpaces(res.smartSpaces.filter((s) => s.id !== currentSpaceId));
        setLoading(false);
      })
      .catch(() => {
        if (!mounted) return;
        setError("Failed to load spaces");
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [currentSpaceId]);

  // Build message preview text
  const getMessagePreview = () => {
    if (message.content) return message.content;
    if (message.transcription) return `[Voice] ${message.transcription}`;
    if (message.imageCaption) return `[Image] ${message.imageCaption}`;
    if (message.videoDuration) return `[Video (${message.videoDuration}s)]`;
    if (message.fileName) return `[File] ${message.fileName}`;
    if (message.title) return message.title;
    if (message.formTitle) return `[Form] ${message.formTitle}`;
    if (message.cardTitle) return `[Card] ${message.cardTitle}`;
    return "Message";
  };

  // Build forward metadata based on message type
  const buildForwardPayload = () => {
    const base = {
      content: message.content || "",
      type: message.type as string,
      metadata: {} as Record<string, unknown>,
    };

    switch (message.type) {
      case "voice":
        base.metadata = {
          type: "voice",
          payload: {
            audioUrl: message.audioUrl,
            audioDuration: message.audioDuration,
            transcription: message.transcription,
          },
        };
        break;
      case "image":
        base.metadata = {
          type: "image",
          payload: {
            imageUrl: message.imageUrl,
            caption: message.imageCaption,
          },
        };
        break;
      case "video":
        base.metadata = {
          type: "video",
          payload: {
            videoUrl: message.videoUrl,
            duration: message.videoDuration,
          },
        };
        break;
      case "file":
        base.metadata = {
          type: "file",
          payload: {
            fileUrl: message.fileUrl,
            fileName: message.fileName,
            fileMimeType: message.fileMimeType,
            fileSize: message.fileSize,
          },
        };
        break;
      default:
        base.metadata = { type: message.type };
    }

    return base;
  };

  const filtered = spaces.filter((s) =>
    (s.name || "").toLowerCase().includes(search.toLowerCase()),
  );

  const toggleSpace = (spaceId: string) => {
    if (sending) return;
    setSelectedSpaces((prev) =>
      prev.includes(spaceId) ? prev.filter((id) => id !== spaceId) : [...prev, spaceId],
    );
  };

  const handleForward = async () => {
    if (selectedSpaces.length === 0) return;

    setSending(true);
    setError(null);

    const payload = buildForwardPayload();
    const errors: string[] = [];

    await Promise.all(
      selectedSpaces.map(async (spaceId) => {
        try {
          await spacesApi.sendMessage(spaceId, {
            entityId: currentEntityId,
            content: payload.content,
            type: payload.type,
            metadata: payload.metadata,
          });
        } catch {
          errors.push(spaceId);
        }
      }),
    );

    setSending(false);

    if (errors.length > 0) {
      setError(`Failed to forward to ${errors.length} space(s)`);
      if (errors.length < selectedSpaces.length) {
        setSent(true);
        onForwarded?.();
        setTimeout(onClose, 1500);
      }
    } else {
      setSent(true);
      onForwarded?.();
      setTimeout(onClose, 1200);
    }
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
          <button
            onClick={onClose}
            disabled={sending}
            className="p-1 rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
          >
            <XIcon className="size-4 text-muted-foreground" />
          </button>
        </div>

        {sent ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <div className="size-10 rounded-full bg-green-500/15 flex items-center justify-center">
              <CheckIcon className="size-5 text-green-500" />
            </div>
            <p className="text-sm font-medium">Forwarded successfully!</p>
            <p className="text-xs text-muted-foreground">
              {selectedSpaces.length} space{selectedSpaces.length > 1 ? "s" : ""}
            </p>
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2Icon className="size-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading spaces...</p>
          </div>
        ) : (
          <>
            {/* Message preview */}
            <div className="px-4 py-3 bg-muted/30 border-b border-border">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">
                Message from {message.senderName}
              </p>
              <p className="text-sm line-clamp-2">{getMessagePreview()}</p>
            </div>

            {/* Error banner */}
            {error && (
              <div className="mx-4 mt-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-2">
                <AlertCircleIcon className="size-4 text-red-500 shrink-0" />
                <p className="text-xs text-red-500">{error}</p>
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
              {filtered.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">
                    {spaces.length === 0
                      ? "No other spaces to forward to"
                      : "No spaces match your search"}
                  </p>
                </div>
              ) : (
                filtered.map((s) => {
                  const isSelected = selectedSpaces.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      onClick={() => toggleSpace(s.id)}
                      disabled={sending}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors",
                        isSelected
                          ? "bg-primary/10"
                          : "hover:bg-muted/60",
                        sending && "opacity-60 cursor-not-allowed",
                      )}
                    >
                      <Avatar
                        name={s.name || "Unnamed"}
                        color={s.metadata?.avatarColor as string | undefined}
                        size="sm"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{s.name || "Unnamed"}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {s.members?.length ?? 0} members
                        </p>
                      </div>
                      {isSelected && (
                        <div className="size-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                          <CheckIcon className="size-3 text-primary-foreground" />
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <span className="text-xs text-muted-foreground">
                {selectedSpaces.length > 0 ? `${selectedSpaces.length} selected` : "Select spaces"}
              </span>
              <Button
                size="sm"
                disabled={selectedSpaces.length === 0 || sending}
                onClick={handleForward}
              >
                {sending ? (
                  <>
                    <Loader2Icon className="size-3.5 mr-1.5 animate-spin" />
                    Forwarding...
                  </>
                ) : (
                  <>
                    <ForwardIcon className="size-3.5 mr-1.5" />
                    Forward
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
