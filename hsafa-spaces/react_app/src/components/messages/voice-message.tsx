import { useState, useRef, useEffect, useCallback } from "react";
import { type MockMessage } from "@/lib/mock-data";
import { MicIcon, PlayIcon, PauseIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";

interface VoiceMessageProps {
  message: MockMessage;
  isOwn?: boolean;
}

const BAR_COUNT = 48;

// Fallback: stable pseudo-random waveform from a seed string
function generateFallbackWaveform(seed: string, bars: number): number[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  const result: number[] = [];
  for (let i = 0; i < bars; i++) {
    hash = ((hash << 5) - hash + i * 7 + 13) | 0;
    const val = ((hash >>> 0) % 100) / 100;
    const centerBias = 1 - Math.abs((i / bars) * 2 - 1) * 0.4;
    result.push(0.15 + val * 0.65 * centerBias);
  }
  return result;
}

// Extract real waveform peaks from audio data via Web Audio API
async function extractWaveform(url: string, bars: number): Promise<number[]> {
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  try {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const channelData = audioBuffer.getChannelData(0);
    const samplesPerBar = Math.floor(channelData.length / bars);
    const peaks: number[] = [];
    for (let i = 0; i < bars; i++) {
      let sum = 0;
      const start = i * samplesPerBar;
      const end = Math.min(start + samplesPerBar, channelData.length);
      for (let j = start; j < end; j++) {
        sum += Math.abs(channelData[j]);
      }
      peaks.push(sum / (end - start));
    }
    // Normalize to 0..1
    const max = Math.max(...peaks, 0.001);
    return peaks.map((p) => Math.max(0.08, p / max));
  } finally {
    await audioCtx.close();
  }
}

// Waveform cache to avoid re-decoding on re-renders
const waveformCache = new Map<string, number[]>();

export function VoiceMessage({ message, isOwn = false }: VoiceMessageProps) {
  const [playing, setPlaying] = useState(false);
  const [showTranscription, setShowTranscription] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(message.audioDuration || 0);
  const [waveform, setWaveform] = useState<number[]>(() => {
    if (message.audioUrl && waveformCache.has(message.audioUrl)) {
      return waveformCache.get(message.audioUrl)!;
    }
    return generateFallbackWaveform(message.id, BAR_COUNT);
  });
  const [waveformReady, setWaveformReady] = useState(() =>
    !!(message.audioUrl && waveformCache.has(message.audioUrl))
  );
  const audioRef = useRef<HTMLAudioElement>(null);
  const waveformRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const formatTime = (t: number) => {
    const mins = Math.floor(t / 60);
    const secs = Math.floor(t % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Decode real waveform on mount
  useEffect(() => {
    if (!message.audioUrl) return;
    if (waveformCache.has(message.audioUrl)) {
      setWaveform(waveformCache.get(message.audioUrl)!);
      setWaveformReady(true);
      return;
    }
    let cancelled = false;
    extractWaveform(message.audioUrl, BAR_COUNT)
      .then((peaks) => {
        if (cancelled) return;
        waveformCache.set(message.audioUrl!, peaks);
        setWaveform(peaks);
        setWaveformReady(true);
      })
      .catch(() => {
        if (!cancelled) setWaveformReady(true);
      });
    return () => { cancelled = true; };
  }, [message.audioUrl]);

  const handlePlayPause = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch((err) => {
        console.error("Audio playback failed:", err);
      });
    }
  };

  const seekToPosition = useCallback(
    (clientX: number) => {
      if (!audioRef.current || !waveformRef.current) return;
      const rect = waveformRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, x / rect.width));
      const newTime = percentage * duration;
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    },
    [duration]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      isDragging.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      seekToPosition(e.clientX);
    },
    [seekToPosition]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging.current) return;
      seekToPosition(e.clientX);
    },
    [seekToPosition]
  );

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

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
    <div className="space-y-1 max-w-[320px]">
      {message.audioUrl && (
        <audio ref={audioRef} src={message.audioUrl} preload="metadata" />
      )}

      {/* Player row */}
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

        {/* Waveform — bars stretch to fill width so seek always maps correctly */}
        <div className="flex-1 min-w-0">
          <div
            ref={waveformRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="flex items-center gap-[1px] h-8 cursor-pointer select-none touch-none"
          >
            {waveform.map((level, i) => {
              const barPct = ((i + 0.5) / BAR_COUNT) * 100;
              const isPlayed = barPct <= progress;
              return (
                <div
                  key={i}
                  className="flex-1 flex items-center justify-center h-full"
                >
                  <div
                    className={`w-full max-w-[3px] rounded-full transition-colors duration-150 ${
                      isOwn
                        ? isPlayed ? "bg-white" : "bg-white/30"
                        : isPlayed ? "bg-primary" : "bg-primary/25"
                    } ${!waveformReady ? "animate-pulse" : ""}`}
                    style={{
                      height: `${Math.max(3, level * 28)}px`,
                      borderRadius: "9999px",
                    }}
                  />
                </div>
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
