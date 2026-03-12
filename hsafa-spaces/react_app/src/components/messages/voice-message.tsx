import { useState } from "react";
import { type MockMessage } from "@/lib/mock-data";
import { MicIcon, PlayIcon, PauseIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";

interface VoiceMessageProps {
  message: MockMessage;
}

export function VoiceMessage({ message }: VoiceMessageProps) {
  const [playing, setPlaying] = useState(false);
  const [showTranscription, setShowTranscription] = useState(false);
  const duration = message.audioDuration || 0;
  const mins = Math.floor(duration / 60);
  const secs = duration % 60;

  return (
    <div className="space-y-1.5">
      {/* Player */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setPlaying(!playing)}
          className="size-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 hover:bg-primary/20 transition-colors"
        >
          {playing ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4 ml-0.5" />}
        </button>

        {/* Waveform visualization (simulated) */}
        <div className="flex-1 flex items-center gap-[2px] h-6">
          {Array.from({ length: 28 }).map((_, i) => {
            const height = 4 + Math.sin(i * 0.8) * 12 + Math.random() * 8;
            return (
              <div
                key={i}
                className="w-[3px] rounded-full bg-primary/40"
                style={{ height: `${Math.max(4, Math.min(24, height))}px` }}
              />
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <MicIcon className="size-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground tabular-nums">
            {mins}:{secs.toString().padStart(2, "0")}
          </span>
        </div>
      </div>

      {/* Transcription toggle */}
      {message.transcription && (
        <button
          onClick={() => setShowTranscription(!showTranscription)}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {showTranscription ? <ChevronUpIcon className="size-3" /> : <ChevronDownIcon className="size-3" />}
          <span>{showTranscription ? "Hide" : "Show"} transcription</span>
        </button>
      )}

      {showTranscription && message.transcription && (
        <p className="text-xs text-muted-foreground leading-relaxed italic border-l-2 border-border pl-2">
          {message.transcription}
        </p>
      )}
    </div>
  );
}
