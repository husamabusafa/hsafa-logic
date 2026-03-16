// =============================================================================
// Cartesia.ai — TTS (Text-to-Speech) and STT (Speech-to-Text)
//
// Used for:
//   - TTS: When a haseef sends a voice message (text -> audio)
//   - STT: When a human sends a voice message (audio -> text transcription)
//
// API Key: CARTESIA_API_KEY env var
// Docs: https://docs.cartesia.ai
// =============================================================================

import fs from "fs/promises";
import path from "path";
import { ensureStorageDirs } from "./media-storage.js";

const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY || "";
const CARTESIA_TTS_URL = "https://api.cartesia.ai/tts/bytes";
const CARTESIA_STT_URL = "https://api.cartesia.ai/transcribe";
const STORAGE_PATH = process.env.MEDIA_STORAGE_PATH || "./uploads";

// Default voice — Cartesia's "Barbershop Man" (natural male voice)
const DEFAULT_VOICE_ID = "a0e99841-438c-4a64-b679-ae501e7d6091";
const DEFAULT_MODEL_ID = "sonic-2";

// =============================================================================
// TTS — Convert text to audio (for haseef voice messages)
// =============================================================================

export interface TtsResult {
  audioUrl: string;
  audioDuration: number;
  filePath: string;
}

export async function textToSpeech(
  text: string,
  baseUrl: string,
  voiceId?: string,
): Promise<TtsResult> {
  if (!CARTESIA_API_KEY) {
    throw new Error("CARTESIA_API_KEY not configured");
  }

  await ensureStorageDirs();

  const response = await fetch(CARTESIA_TTS_URL, {
    method: "POST",
    headers: {
      "Cartesia-Version": "2024-06-10",
      "X-API-Key": CARTESIA_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model_id: DEFAULT_MODEL_ID,
      transcript: text,
      voice: {
        mode: "id",
        id: voiceId || DEFAULT_VOICE_ID,
      },
      output_format: {
        container: "mp3",
        bit_rate: 128000,
        sample_rate: 44100,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`Cartesia TTS failed (${response.status}): ${errorText}`);
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());

  // Save to disk
  const filename = `voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
  const filePath = path.join(STORAGE_PATH, filename);
  await fs.writeFile(filePath, audioBuffer);

  // Estimate duration from file size (128kbps MP3 ~ 16KB per second)
  const audioDuration = Math.round(audioBuffer.length / 16000);

  const audioUrl = `${baseUrl}/api/media/files/${filename}`;

  return { audioUrl, audioDuration, filePath };
}

// =============================================================================
// STT — Transcribe audio to text (for human voice messages)
// =============================================================================

export interface SttResult {
  text: string;
  language?: string;
  duration?: number;
}

export async function speechToText(
  audioBuffer: Buffer,
  mimeType: string,
): Promise<SttResult> {
  if (!CARTESIA_API_KEY) {
    throw new Error("CARTESIA_API_KEY not configured");
  }

  // Cartesia expects multipart form data for transcription
  const formData = new FormData();
  // Copy into a fresh ArrayBuffer to satisfy strict DOM typings
  const ab = audioBuffer.buffer.slice(audioBuffer.byteOffset, audioBuffer.byteOffset + audioBuffer.byteLength) as ArrayBuffer;
  const blob = new Blob([ab], { type: mimeType });
  formData.append("file", blob, `audio.${mimeToExt(mimeType)}`);
  formData.append("model", DEFAULT_MODEL_ID);
  formData.append("language", "en");

  const response = await fetch(CARTESIA_STT_URL, {
    method: "POST",
    headers: {
      "Cartesia-Version": "2024-06-10",
      "X-API-Key": CARTESIA_API_KEY,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`Cartesia STT failed (${response.status}): ${errorText}`);
  }

  const result = await response.json() as { text?: string; language?: string; duration?: number };

  return {
    text: result.text || "",
    language: result.language,
    duration: result.duration,
  };
}

// =============================================================================
// Helpers
// =============================================================================

function mimeToExt(mimeType: string): string {
  const map: Record<string, string> = {
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/wave": "wav",
    "audio/x-wav": "wav",
    "audio/ogg": "ogg",
    "audio/webm": "webm",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
  };
  return map[mimeType] || "wav";
}
