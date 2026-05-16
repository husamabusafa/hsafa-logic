// =============================================================================
// Image Generation Skill Template
//
// Lets a haseef generate images via two providers:
//   - "openai"  — OpenAI Images API (gpt-image-1, dall-e-3)
//   - "gemini"  — Gemini 2.5 Flash Image ("nano-banana") via Google AI API
//
// The provider returns the raw image (base64 or URL); we always re-host it
// via media-storage so the URL is stable and reachable from any client.
// The agent then calls spaces.send_image(imageUrl: <url>) to deliver it.
// =============================================================================

import type { SkillTemplateDefinition, SkillHandler, ToolCallContext } from "../types.js";
import { storeFile } from "../../media-storage.js";

// =============================================================================
// Config
// =============================================================================

interface ImageGenConfig {
  provider: "openai" | "gemini" | "openrouter";
  apiKey: string;
  model?: string;        // override the default model for the provider
  baseUrl?: string;      // optional override for OpenAI-compatible endpoints
  defaultSize?: string;  // e.g. "1024x1024"
  publicBaseUrl?: string; // base URL used when re-hosting (e.g. http://localhost:3005)
}

const DEFAULT_OPENAI_MODEL = "gpt-image-1";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-image-preview";
const DEFAULT_OPENROUTER_MODEL = "google/gemini-3.1-flash-image-preview";
const DEFAULT_SIZE = "1024x1024";

// =============================================================================
// Tools
// =============================================================================

const tools = [
  {
    name: "generate_image",
    description:
      "Generate an image from a text prompt. Returns a stable HTTP URL you can pass to spaces.send_image. " +
      "Use a vivid, descriptive prompt — the more concrete details (subject, style, lighting, composition), the better.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Detailed description of the image to generate.",
        },
        size: {
          type: "string",
          description:
            "Image size as WIDTHxHEIGHT (e.g. '1024x1024', '1792x1024', '1024x1792'). Provider-dependent. Default 1024x1024.",
        },
        style: {
          type: "string",
          description:
            "Optional style hint, e.g. 'photo realistic', 'oil painting', 'minimal flat illustration'. Appended to the prompt.",
        },
      },
      required: ["prompt"],
    },
    mode: "sync" as const,
  },
];

// =============================================================================
// Template Definition
// =============================================================================

export const imageGenTemplate: SkillTemplateDefinition = {
  name: "image_gen",
  displayName: "Image Generation",
  description:
    "Generate images from text prompts using OpenAI (gpt-image-1 / DALL·E) or Gemini Nano Banana (gemini-2.5-flash-image).",
  category: "media",
  configSchema: {
    type: "object",
    properties: {
      provider: {
        type: "string",
        title: "Provider",
        enum: ["openai", "gemini", "openrouter"],
        enumLabels: [
          "OpenAI (DALL·E / gpt-image-1)",
          "Gemini Nano Banana (2.5 Flash Image)",
          "OpenRouter (any image-capable model)",
        ],
        description: "Which image generation provider to use.",
        default: "openai",
      },
      apiKey: {
        type: "string",
        title: "API Key",
        format: "password",
        description:
          "API key for the chosen provider. Get one from platform.openai.com, aistudio.google.com, or openrouter.ai/keys.",
      },
      model: {
        type: "string",
        title: "Model",
        description: "Which model to use. Options change based on the selected provider.",
        // Custom UI extension: enum values depend on another field's value.
        "x-enumByField": {
          field: "provider",
          map: {
            openai: {
              enum: ["gpt-image-1", "dall-e-3"],
              enumLabels: ["gpt-image-1 (recommended)", "DALL·E 3"],
              default: "gpt-image-1",
            },
            gemini: {
              enum: ["gemini-2.5-flash-image-preview"],
              enumLabels: ["Gemini 2.5 Flash Image (Nano Banana)"],
              default: "gemini-2.5-flash-image-preview",
            },
            // OpenRouter has many image-capable models that change often;
            // render as a free-text input (no enum) with a sensible default.
            openrouter: {
              default: "google/gemini-3.1-flash-image-preview",
            },
          },
        },
      },
      defaultSize: {
        type: "string",
        title: "Default Image Size",
        enum: ["1024x1024", "1792x1024", "1024x1792"],
        enumLabels: ["Square 1024×1024", "Landscape 1792×1024", "Portrait 1024×1792"],
        description: "Used when the haseef doesn't specify a size.",
        default: "1024x1024",
      },
      baseUrl: {
        type: "string",
        title: "Custom API Base URL",
        description:
          "Advanced. Override the default API endpoint (useful for OpenAI-compatible proxies). Leave blank to use the provider default.",
      },
      publicBaseUrl: {
        type: "string",
        title: "Public Base URL",
        description:
          "Public URL of this server (used when re-hosting generated images so clients can reach them). Defaults to http://localhost:3005.",
      },
    },
    required: ["provider", "apiKey"],
  },
  tools,
  instructions: `You can generate images on demand.

WHEN TO USE:
  Use generate_image when the user asks for a picture, illustration, photo, drawing, design, logo, icon, etc.
  Examples: "draw a cat in space", "make me a logo for my coffee shop", "show me what a futuristic city looks like".

HOW TO USE:
  1. Call generate_image with a detailed prompt — be specific about subject, style, lighting, mood.
     Good: "A photorealistic golden retriever puppy sitting on a moss-covered rock in a misty forest, soft morning light"
     Bad:  "a dog"
  2. The tool returns { url, mimeType, width, height }. Take the url.
  3. IMMEDIATELY call spaces_send_image(imageUrl: url, caption: "<short caption>") to deliver it.

  Never describe the image in text — always send it via spaces_send_image. The user wants to SEE the picture, not read about it.

IF GENERATION FAILS:
  If generate_image returns an error (e.g. invalid model, missing API key, or provider issue), do NOT say "the image service is unavailable."
  Instead, send a spaces_send_message explaining the exact error and what the user needs to fix (e.g. "The configured OpenRouter model 'openai/gpt-5.4-image-2' doesn't support image output. Please update the skill instance to use a valid model like 'google/gemini-2.5-flash-image-preview'.")`,
  iconUrl: undefined,

  createHandler(instanceConfig: Record<string, unknown>): SkillHandler {
    const config = normalizeConfig(instanceConfig);

    return {
      async execute(toolName, args, ctx): Promise<unknown> {
        if (toolName !== "generate_image") {
          return { error: `Unknown tool: ${toolName}` };
        }
        const prompt = (args.prompt as string)?.trim();
        if (!prompt) return { error: "prompt is required" };

        const size = (args.size as string) || config.defaultSize || DEFAULT_SIZE;
        const style = (args.style as string)?.trim();
        const fullPrompt = style ? `${prompt}. Style: ${style}` : prompt;

        try {
          const generated = await generateImage(config, fullPrompt, size);
          const stored = await rehostImage(generated, ctx, config);
          return {
            success: true,
            url: stored.url,
            mimeType: stored.mimeType,
            width: generated.width,
            height: generated.height,
            provider: config.provider,
            model: config.model,
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[image_gen] generate failed (provider=${config.provider}):`, msg);
          return { error: `Image generation failed: ${msg}` };
        }
      },
    };
  },
};

// =============================================================================
// Config normalization
// =============================================================================

function normalizeConfig(raw: Record<string, unknown>): Required<Omit<ImageGenConfig, "model" | "baseUrl">> & {
  model: string;
  baseUrl: string;
} {
  const provider = (raw.provider as "openai" | "gemini" | "openrouter") || "openai";
  const apiKey = (raw.apiKey as string) || "";
  if (!apiKey) {
    // Don't throw in createHandler — let runtime errors surface per-call so a misconfigured
    // instance doesn't crash the whole skill manager boot.
    console.warn(`[image_gen] instance has no apiKey — generate_image will fail until configured`);
  }

  const defaults =
    provider === "openai"
      ? { model: DEFAULT_OPENAI_MODEL, baseUrl: "https://api.openai.com" }
      : provider === "gemini"
      ? { model: DEFAULT_GEMINI_MODEL, baseUrl: "https://generativelanguage.googleapis.com" }
      : { model: DEFAULT_OPENROUTER_MODEL, baseUrl: "https://openrouter.ai/api" };

  const model = (raw.model as string) || defaults.model;

  // OpenRouter sanity check: catch obviously invalid models early
  if (provider === "openrouter" && !model.includes("/")) {
    console.warn(
      `[image_gen] WARNING: model "${model}" does not contain a provider prefix (format: "provider/model"). ` +
        `OpenRouter image models must be fully qualified (e.g. "google/gemini-3.1-flash-image-preview"). ` +
        `Please update your skill instance config.`,
    );
  }

  return {
    provider,
    apiKey,
    model,
    baseUrl: ((raw.baseUrl as string) || defaults.baseUrl).replace(/\/$/, ""),
    defaultSize: (raw.defaultSize as string) || DEFAULT_SIZE,
    publicBaseUrl:
      ((raw.publicBaseUrl as string) || process.env.PUBLIC_BASE_URL || "http://localhost:3005").replace(
        /\/$/,
        "",
      ),
  };
}

// =============================================================================
// Generate — provider dispatch
// =============================================================================

interface GeneratedImage {
  buffer: Buffer;
  mimeType: string;
  width?: number;
  height?: number;
}

async function generateImage(
  config: ReturnType<typeof normalizeConfig>,
  prompt: string,
  size: string,
): Promise<GeneratedImage> {
  if (!config.apiKey) throw new Error("apiKey is not configured for this image_gen instance");

  if (config.provider === "openai") {
    return generateOpenAI(config, prompt, size);
  }
  if (config.provider === "gemini") {
    return generateGemini(config, prompt);
  }
  if (config.provider === "openrouter") {
    return generateOpenRouter(config, prompt);
  }
  throw new Error(`Unknown provider: ${(config as { provider: string }).provider}`);
}

// ----- OpenAI Images API -----
async function generateOpenAI(
  config: ReturnType<typeof normalizeConfig>,
  prompt: string,
  size: string,
): Promise<GeneratedImage> {
  const url = `${config.baseUrl}/v1/images/generations`;
  const body: Record<string, unknown> = {
    model: config.model,
    prompt,
    size,
    n: 1,
  };
  // dall-e-3 returns a URL by default; gpt-image-1 returns base64 by default.
  // Force base64 so we always re-host.
  if (config.model.startsWith("dall-e")) {
    body.response_format = "b64_json";
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI images API ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
  };
  const item = json.data?.[0];
  if (!item) throw new Error("OpenAI returned no image data");

  let buffer: Buffer;
  if (item.b64_json) {
    buffer = Buffer.from(item.b64_json, "base64");
  } else if (item.url) {
    const fetched = await fetch(item.url);
    if (!fetched.ok) throw new Error(`Failed to download OpenAI image: ${fetched.status}`);
    buffer = Buffer.from(await fetched.arrayBuffer());
  } else {
    throw new Error("OpenAI response had neither b64_json nor url");
  }

  // Parse size (e.g. "1024x1024")
  const [w, h] = size.split("x").map((n) => parseInt(n, 10));

  return {
    buffer,
    mimeType: "image/png",
    width: Number.isFinite(w) ? w : undefined,
    height: Number.isFinite(h) ? h : undefined,
  };
}

// ----- Gemini 2.5 Flash Image (Nano Banana) -----
async function generateGemini(
  config: ReturnType<typeof normalizeConfig>,
  prompt: string,
): Promise<GeneratedImage> {
  const url = `${config.baseUrl}/v1beta/models/${config.model}:generateContent?key=${encodeURIComponent(
    config.apiKey,
  )}`;

  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      responseModalities: ["IMAGE", "TEXT"],
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gemini API ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }>;
      };
    }>;
  };

  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const inline = parts.find((p) => p.inlineData?.data)?.inlineData;
  if (!inline?.data) {
    throw new Error("Gemini response contained no inline image data");
  }

  return {
    buffer: Buffer.from(inline.data, "base64"),
    mimeType: inline.mimeType || "image/png",
  };
}

// ----- OpenRouter (chat-completions endpoint with image modality) -----
async function generateOpenRouter(
  config: ReturnType<typeof normalizeConfig>,
  prompt: string,
): Promise<GeneratedImage> {
  const url = `${config.baseUrl}/v1/chat/completions`;

  const body = {
    model: config.model,
    messages: [{ role: "user", content: prompt }],
    // OpenRouter routes image-capable models when modalities includes "image".
    modalities: ["image", "text"],
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      // OpenRouter recommends these headers for attribution & rankings.
      "HTTP-Referer": process.env.PUBLIC_BASE_URL ?? "https://hsafa.com",
      "X-Title": "Hsafa Spaces",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const is404 = res.status === 404;
    const noEndpoints = text.toLowerCase().includes("no endpoints found");
    const noModalities = text.toLowerCase().includes("modalities");

    if (is404 && (noEndpoints || noModalities)) {
      throw new Error(
        `OpenRouter model "${config.model}" does not support image output. ` +
          `Pick a valid image-capable model slug from openrouter.ai/models (e.g. "google/gemini-3.1-flash-image-preview"). ` +
          `Then update your image_gen skill instance config with the correct model.`,
      );
    }

    throw new Error(`OpenRouter API ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{
      message?: {
        content?: unknown;
        // OpenRouter image responses may surface generated images here:
        images?: Array<{
          type?: string;
          image_url?: { url?: string };
          // Some providers return inline base64 here:
          data?: string;
          mimeType?: string;
        }>;
      };
    }>;
  };

  const message = json.choices?.[0]?.message;

  // ── Strategy 1: OpenRouter proprietary `message.images[]` ──────────
  if (message?.images && Array.isArray(message.images)) {
    const entry = message.images.find((i) => i.image_url?.url || i.data);
    if (entry?.image_url?.url) {
      return downloadOrDecode(entry.image_url.url);
    }
    if (entry?.data) {
      return {
        buffer: Buffer.from(entry.data, "base64"),
        mimeType: entry.mimeType || "image/png",
      };
    }
  }

  // ── Strategy 2: OpenAI-style content parts (array) ─────────────────
  if (Array.isArray(message?.content)) {
    for (const part of message.content) {
      if (typeof part === "object" && part) {
        // image_url part: { type: "image_url", image_url: { url: "..." } }
        const imgUrl = (part as any).image_url?.url;
        if (imgUrl) {
          return downloadOrDecode(imgUrl);
        }
        // image part: { type: "image", data: "base64...", mimeType: "image/png" }
        const imgData = (part as any).data;
        if (imgData) {
          return {
            buffer: Buffer.from(imgData, "base64"),
            mimeType: (part as any).mimeType || "image/png",
          };
        }
      }
    }
  }

  // ── Strategy 3: content is a string with markdown or data URLs ─────
  if (typeof message?.content === "string") {
    const content = message.content;

    // 3a) Markdown image: ![alt](data:image/png;base64,...) or ![alt](https://...)
    const mdMatch = content.match(/!\[[^\]]*\]\(([^)]+)\)/);
    if (mdMatch?.[1]) {
      return downloadOrDecode(mdMatch[1]);
    }

    // 3b) Standalone data URL
    const dataMatch = content.match(/(data:image\/[^;]+;base64,[A-Za-z0-9+/=]+)/);
    if (dataMatch?.[1]) {
      return downloadOrDecode(dataMatch[1]);
    }

    // 3c) Direct HTTP(S) URL to an image file
    const urlMatch = content.match(/(https?:\/\/[^\s"'<>]+\.(?:png|jpe?g|webp|gif))/i);
    if (urlMatch?.[1]) {
      return downloadOrDecode(urlMatch[1]);
    }
  }

  // Nothing found — log the raw response (truncated) for debugging
  console.error(
    `[image_gen] OpenRouter response had no image. Model="${config.model}". Raw content:`,
    JSON.stringify(message).slice(0, 600),
  );
  throw new Error(
    `OpenRouter response contained no image. Model "${config.model}" may not support image output, ` +
      `or the response format is unexpected. Check server logs for the raw response. ` +
      `Pick an image-capable model from openrouter.ai/models.`,
  );
}

/** Download an HTTP(S) URL or decode a data: URL into a buffer. */
async function downloadOrDecode(dataOrUrl: string): Promise<GeneratedImage> {
  if (dataOrUrl.startsWith("data:")) {
    const m = dataOrUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) throw new Error("Malformed data: URL in OpenRouter response");
    return {
      buffer: Buffer.from(m[2], "base64"),
      mimeType: m[1] || "image/png",
    };
  }

  const fetched = await fetch(dataOrUrl);
  if (!fetched.ok) throw new Error(`Failed to download OpenRouter image: ${fetched.status}`);
  return {
    buffer: Buffer.from(await fetched.arrayBuffer()),
    mimeType: fetched.headers.get("content-type") || "image/png",
  };
}

// =============================================================================
// Re-host the generated image via media-storage so the URL is stable
// =============================================================================

async function rehostImage(
  img: GeneratedImage,
  ctx: ToolCallContext,
  config: ReturnType<typeof normalizeConfig>,
): Promise<{ url: string; mimeType: string }> {
  // We need an entityId to attach the MediaAsset to. The haseef's own entity
  // is the natural owner — fall back to a synthetic uuid would require a fake
  // FK row, so instead we read the haseef's profile.entityId. Spaces sets this
  // when the haseef is provisioned. If missing, we fall back to ANY existing
  // entity in the DB — but at that point the instance is misconfigured.
  const entityId =
    (ctx.haseefProfile.spacesEntityId as string | undefined) ||
    (ctx.haseefProfile.entityId as string | undefined) ||
    (await firstHaseefEntityId(ctx.haseefId));

  if (!entityId) {
    throw new Error(
      "Could not resolve an entityId to own the generated image. " +
        "Ensure the haseef has a spacesEntityId in its profile.",
    );
  }

  const ext = img.mimeType === "image/jpeg" ? ".jpg" : ".png";
  const stored = await storeFile({
    entityId,
    file: {
      originalname: `generated-${Date.now()}${ext}`,
      mimetype: img.mimeType,
      size: img.buffer.length,
      buffer: img.buffer,
    },
    baseUrl: config.publicBaseUrl,
  });

  return { url: stored.url, mimeType: stored.mimeType };
}

// Look up an entity owned by this haseef as a last resort.
async function firstHaseefEntityId(haseefId: string): Promise<string | null> {
  const { prisma } = await import("../../db.js");
  const ownership = await prisma.haseefOwnership.findFirst({
    where: { haseefId },
    select: { entityId: true },
  });
  return ownership?.entityId ?? null;
}
