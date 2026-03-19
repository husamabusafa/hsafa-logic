// =============================================================================
// ElevenLabs — TTS (Text-to-Speech) and STT (Speech-to-Text)
//
// Used for:
//   - TTS: When a haseef sends a voice message (text -> audio)
//   - STT: When a human sends a voice message (audio -> text transcription)
//
// API Key: ELEVENLABS_API_KEY env var
// Docs: https://elevenlabs.io/docs
//
// Supports Arabic, English, and 29+ languages via eleven_multilingual_v2
// =============================================================================

import fs from "fs/promises";
import path from "path";
import { ensureStorageDirs } from "./media-storage.js";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
const ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech";
const ELEVENLABS_STT_URL = "https://api.elevenlabs.io/v1/speech-to-text";
const STORAGE_PATH = process.env.MEDIA_STORAGE_PATH || "./uploads";

const TTS_MODEL = "eleven_multilingual_v2";
const STT_MODEL = "scribe_v1";

// Default voice IDs (ElevenLabs multilingual voices)
const DEFAULT_MALE_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";   // George
const DEFAULT_FEMALE_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"; // Sarah

export type VoiceGender = "male" | "female";

/** Resolve a voice ID from gender or explicit voiceId override */
export function resolveVoiceId(gender?: VoiceGender, voiceId?: string): string {
  if (voiceId) return voiceId;
  return gender === "female" ? DEFAULT_FEMALE_VOICE_ID : DEFAULT_MALE_VOICE_ID;
}

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
  gender?: VoiceGender,
): Promise<TtsResult> {
  if (!ELEVENLABS_API_KEY) {
    throw new Error("ELEVENLABS_API_KEY not configured");
  }

  await ensureStorageDirs();

  const resolvedVoice = resolveVoiceId(gender, voiceId);

  const response = await fetch(`${ELEVENLABS_TTS_URL}/${resolvedVoice}`, {
    method: "POST",
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: TTS_MODEL,
      output_format: "mp3_44100_128",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`ElevenLabs TTS failed (${response.status}): ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = Buffer.from(arrayBuffer);

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
  if (!ELEVENLABS_API_KEY) {
    throw new Error("ELEVENLABS_API_KEY not configured");
  }

  const formData = new FormData();
  const ab = audioBuffer.buffer.slice(
    audioBuffer.byteOffset,
    audioBuffer.byteOffset + audioBuffer.byteLength,
  ) as ArrayBuffer;
  const blob = new Blob([ab], { type: mimeType });
  formData.append("file", blob, `audio.${mimeToExt(mimeType)}`);
  formData.append("model_id", STT_MODEL);

  const response = await fetch(ELEVENLABS_STT_URL, {
    method: "POST",
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`ElevenLabs STT failed (${response.status}): ${errorText}`);
  }

  const result = (await response.json()) as {
    text?: string;
    language_code?: string;
    language_probability?: number;
  };

  return {
    text: result.text || "",
    language: result.language_code,
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
