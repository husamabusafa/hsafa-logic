import type { ToolExecutionOptions } from 'ai';
import { generateImage, generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { writeFile, mkdir } from 'fs/promises';
import { randomUUID } from 'crypto';
import path from 'path';
import type { ImageGeneratorExecution } from '../types.js';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'images');
const GATEWAY_URL = process.env.GATEWAY_URL || `http://localhost:${process.env.PORT || 3001}`;

function mapSize(size: string): `${number}x${number}` | undefined {
  const normalized = size.trim().toLowerCase();
  if (normalized === 'square') return '1024x1024';
  if (normalized === 'landscape') return '1792x1024';
  if (normalized === 'portrait') return '1024x1792';
  if (/^\d+x\d+$/.test(normalized)) return normalized as `${number}x${number}`;
  return undefined;
}

function extFromMediaType(mediaType: string): string {
  const map: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
  return map[mediaType] ?? 'png';
}

async function saveImage(base64: string, mediaType: string): Promise<string> {
  await mkdir(UPLOADS_DIR, { recursive: true });
  const ext = extFromMediaType(mediaType);
  const filename = `${randomUUID()}.${ext}`;
  const filePath = path.join(UPLOADS_DIR, filename);
  await writeFile(filePath, Buffer.from(base64, 'base64'));
  return `${GATEWAY_URL}/uploads/images/${filename}`;
}

function resolveApiKey(execution: ImageGeneratorExecution): string {
  if (execution.apiKey) return execution.apiKey;
  const envMap: Record<string, string | undefined> = {
    'dall-e': process.env.OPENAI_API_KEY,
    'openai': process.env.OPENAI_API_KEY,
    'openrouter': process.env.OPENROUTER_API_KEY,
  };
  const key = envMap[execution.provider];
  if (key) return key;
  throw new Error(`No API key for provider: ${execution.provider}. Set execution.apiKey or env var.`);
}

export async function executeImageGenerator(
  execution: ImageGeneratorExecution,
  input: unknown,
  options?: ToolExecutionOptions
): Promise<unknown> {
  const prompt =
    input && typeof input === 'object' && 'prompt' in (input as Record<string, unknown>)
      ? String((input as Record<string, unknown>).prompt ?? '')
      : '';

  if (!prompt) throw new Error('Image generator requires a prompt');

  const apiKey = resolveApiKey(execution);
  const started = Date.now();

  // OpenRouter: use generateText → result.files
  if (execution.provider === 'openrouter') {
    const openrouter = createOpenRouter({ apiKey });
    const model = execution.model ?? 'google/gemini-2.0-flash-exp:free';

    const result = await generateText({
      model: openrouter.chat(model),
      prompt,
      abortSignal: options?.abortSignal,
    });

    const files = (result.files ?? []).filter((f) => f.mediaType?.startsWith('image/'));
    const first = files[0];
    const images = first
      ? [{ url: await saveImage(first.base64, first.mediaType!), mediaType: first.mediaType! }]
      : [];

    return { success: true, provider: 'openrouter', model, images, duration: Date.now() - started };
  }

  // DALL-E / OpenAI image API
  const openai = createOpenAI({ apiKey, ...(execution.baseURL ? { baseURL: execution.baseURL } : {}) });
  const model = execution.model ?? 'dall-e-3';
  const size = mapSize(execution.size);

  const { images } = await generateImage({
    model: openai.image(model),
    prompt,
    ...(size ? { size } : {}),
    providerOptions: {
      openai: {
        quality: execution.quality,
        ...(execution.style ? { style: execution.style } : {}),
      },
    },
    abortSignal: options?.abortSignal,
  });

  const saved = await Promise.all(
    images.map(async (img) => ({
      url: await saveImage(img.base64, img.mediaType ?? 'image/png'),
      mediaType: img.mediaType ?? 'image/png',
    }))
  );

  return { success: true, provider: execution.provider, model, images: saved, duration: Date.now() - started };
}
