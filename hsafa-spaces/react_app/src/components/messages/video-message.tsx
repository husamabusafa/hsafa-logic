import { type MockMessage } from "@/lib/mock-data";
import { PlayIcon } from "lucide-react";

interface VideoMessageProps {
  message: MockMessage;
}

export function VideoMessage({ message }: VideoMessageProps) {
  const duration = message.videoDuration || 0;
  const mins = Math.floor(duration / 60);
  const secs = duration % 60;

  return (
    <div className="space-y-1">
      <div className="relative rounded-lg overflow-hidden max-w-sm cursor-pointer group">
        {message.videoThumbnailUrl ? (
          <img
            src={message.videoThumbnailUrl}
            alt="Video thumbnail"
            className="w-full h-auto max-h-48 object-cover"
          />
        ) : (
          <div className="w-full h-36 bg-muted flex items-center justify-center">
            <PlayIcon className="size-10 text-muted-foreground" />
          </div>
        )}

        {/* Play overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
          <div className="size-12 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-sm">
            <PlayIcon className="size-5 text-white ml-0.5" />
          </div>
        </div>

        {/* Duration badge */}
        <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/70 text-white text-[10px] tabular-nums">
          {mins}:{secs.toString().padStart(2, "0")}
        </div>
      </div>
    </div>
  );
}
