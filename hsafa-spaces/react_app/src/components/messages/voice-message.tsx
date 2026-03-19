import { useState, useRef, useEffect, useMemo } from "react";
import { type MockMessage } from "@/lib/mock-data";
import { MicIcon, PlayIcon, PauseIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";

interface VoiceMessageProps {
  message: MockMessage;
  isOwn?: boolean;
}

// Generate a stable pseudo-random waveform from a seed string (messageId)
function generateWaveform(seed: string, bars: number): number[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  const result: number[] = [];
  for (let i = 0; i < bars; i++) {
    hash = ((hash << 5) - hash + i * 7 + 13) | 0;
    const val = ((hash >>> 0) % 100) / 100;
    // Shape: center-heavy with some variation
    const centerBias = 1 - Math.abs((i / bars) * 2 - 1) * 0.4;
    result.push(0.15 + val * 0.65 * centerBias);
  }
  return result;
}

export function VoiceMessage({ message, isOwn = false }: VoiceMessageProps) {
  const [playing, setPlaying] = useState(false);
  const [showTranscription, setShowTranscription] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(message.audioDuration || 0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const waveformRef = useRef<HTMLDivElement>(null);

  const BAR_COUNT = 36;
  const waveform = useMemo(() => generateWaveform(message.id, BAR_COUNT), [message.id]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const formatTime = (t: number) => {
    const mins = Math.floor(t / 60);
    const secs = Math.floor(t % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

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
    const handleEnded = () => { setPlaying(false); setCurrentTime(0); };
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => {
      if (audio.duration && isFinite(audio.duration)) setDuration(audio.duration);
    };

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
    <div className="space-y-1">
      {/* Hidden audio element */}
      {message.audioUrl && (
        <audio ref={audioRef} src={message.audioUrl} preload="metadata" />
      )}

      {/* Player */}
      <div className="flex items-center gap-2.5">
        <button
          onClick={handlePlayPause}
          disabled={!message.audioUrl}
          className={`size-9 rounded-full flex items-center justify-center shrink-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            isOwn
              ? "bg-white/20 text-white hover:bg-white/30"
              : "bg-primary/10 text-primary hover:bg-primary/20"
          }`}
        >
          {playing ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4 ml-0.5" />}
        </button>

        {/* Waveform visualization with progress + seek */}
        <div className="flex-1 min-w-0">
          <div
            ref={waveformRef}
            onClick={handleSeek}
            className="flex items-center gap-[1.5px] h-7 cursor-pointer"
          >
            {waveform.map((level, i) => {
              const barPct = (i / BAR_COUNT) * 100;
              const isPlayed = barPct <= progress;
              return (
                <div
                  key={i}
                  className={`w-[2.5px] rounded-full transition-colors ${
                    isOwn
                      ? (isPlayed ? "bg-white" : "bg-white/30")
                      : (isPlayed ? "bg-primary" : "bg-primary/25")
                  }`}
                  style={{ height: `${Math.max(3, level * 24)}px` }}
                />
              );
            })}
          </div>

          {/* Time row */}
          <div className="flex items-center justify-between mt-0.5">
            <span className={`text-[10px] tabular-nums ${isOwn ? "text-white/70" : "text-muted-foreground"}`}>
              {playing || currentTime > 0 ? formatTime(currentTime) : formatTime(duration)}
            </span>
            <div className="flex items-center gap-1">
              <MicIcon className={`size-2.5 ${isOwn ? "text-white/50" : "text-muted-foreground/60"}`} />
              <span className={`text-[10px] tabular-nums ${isOwn ? "text-white/50" : "text-muted-foreground/60"}`}>
                {formatTime(duration)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Transcription — collapsible */}
      {message.transcription && (
        <>
          <button
            onClick={() => setShowTranscription(!showTranscription)}
            className={`flex items-center gap-1 text-[11px] transition-colors mt-0.5 ${isOwn ? "text-white/60 hover:text-white/80" : "text-muted-foreground/70 hover:text-muted-foreground"}`}
          >
            {showTranscription ? <ChevronUpIcon className="size-3" /> : <ChevronDownIcon className="size-3" />}
            <span>{showTranscription ? "Hide" : "Show"} transcription</span>
          </button>

          {showTranscription && (
            <p className={`text-xs leading-relaxed italic border-l-2 pl-2 mt-1 ${isOwn ? "text-white/80 border-white/30" : "text-muted-foreground border-primary/20"}`}>
              {message.transcription}
            </p>
          )}
        </>
      )}
    </div>
  );
}
