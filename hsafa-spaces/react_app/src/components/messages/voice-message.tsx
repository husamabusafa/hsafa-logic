import { useState, useRef, useEffect } from "react";
import { type MockMessage } from "@/lib/mock-data";
import { MicIcon, PlayIcon, PauseIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";

interface VoiceMessageProps {
  message: MockMessage;
}

export function VoiceMessage({ message }: VoiceMessageProps) {
  const [playing, setPlaying] = useState(false);
  const [showTranscription, setShowTranscription] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(message.audioDuration || 0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const waveformRef = useRef<HTMLDivElement>(null);

  const currentMins = Math.floor(currentTime / 60);
  const currentSecs = Math.floor(currentTime % 60);
  const totalMins = Math.floor(duration / 60);
  const totalSecs = Math.floor(duration % 60);
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

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

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !waveformRef.current) return;
    
    const rect = waveformRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const newTime = percentage * duration;
    
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handlePlay = () => setPlaying(true);
    const handlePause = () => setPlaying(false);
    const handleEnded = () => setPlaying(false);
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration);

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);

    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
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

        {/* Waveform visualization with progress */}
        <div 
          ref={waveformRef}
          onClick={handleSeek}
          className="flex-1 flex items-center gap-[2px] h-6 cursor-pointer relative"
        >
          {Array.from({ length: 28 }).map((_, i) => {
            const height = 4 + Math.sin(i * 0.8) * 12 + Math.random() * 8;
            const barProgress = (i / 28) * 100;
            const isPlayed = barProgress <= progress;
            return (
              <div
                key={i}
                className={`w-[3px] rounded-full transition-colors ${
                  isPlayed ? "bg-primary" : "bg-primary/30"
                }`}
                style={{ height: `${Math.max(4, Math.min(24, height))}px` }}
              />
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <MicIcon className="size-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground tabular-nums">
            {currentMins}:{currentSecs.toString().padStart(2, "0")} / {totalMins}:{totalSecs.toString().padStart(2, "0")}
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
