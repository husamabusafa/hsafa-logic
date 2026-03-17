import { useState, useRef, useEffect } from "react";
import { type MockMessage } from "@/lib/mock-data";
import { MicIcon, PlayIcon, PauseIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";

interface VoiceMessageProps {
  message: MockMessage;
}

export function VoiceMessage({ message }: VoiceMessageProps) {
  const [playing, setPlaying] = useState(false);
  const [showTranscription, setShowTranscription] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const duration = message.audioDuration || 0;
  const mins = Math.floor(duration / 60);
  const secs = duration % 60;

  const handlePlayPause = () => {
    if (!audioRef.current) return;
    
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(err => {
        console.error("Audio playback failed:", err);
      });
    }
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handlePlay = () => setPlaying(true);
    const handlePause = () => setPlaying(false);
    const handleEnded = () => setPlaying(false);

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  return (
    <div className="space-y-1.5">
      {/* Hidden audio element */}
      {message.audioUrl && (
        <audio ref={audioRef} src={message.audioUrl} preload="metadata" />
      )}

      {/* Player */}
      <div className="flex items-center gap-3">
        <button
          onClick={handlePlayPause}
          disabled={!message.audioUrl}
          className="size-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 hover:bg-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
