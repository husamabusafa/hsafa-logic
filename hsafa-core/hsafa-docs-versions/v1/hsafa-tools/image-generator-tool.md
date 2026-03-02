# Image Generator Tool

## Overview

Generate images from text prompts using AI models. Built on the Vercel AI SDK's `generateImage` and `generateText` functions. Supports OpenAI DALL-E, OpenRouter (Gemini, etc.), and any OpenAI-compatible image API. **Returns image URLs.**

## Purpose

- Create marketing visuals and illustrations
- Generate product mockups and thumbnails
- Design icons and UI elements
- Turn text descriptions into images

## How It Works

Under the hood, Hsafa Logic uses two strategies depending on the provider:

- **Image API providers** (DALL-E, OpenAI-compatible): Uses AI SDK `generateImage()` → returns image URLs
- **Language model providers** (OpenRouter with Gemini image-preview): Uses AI SDK `generateText()` → extracts generated image files → returns URLs

Both return the same response format with image URLs.

## Execution Property

```json
{
  "provider": "dall-e|openrouter|openai",
  "model": "model-name",
  "apiKey": "sk-...",
  "baseURL": "https://...",
  "size": "1024x1024|landscape|portrait|square",
  "quality": "standard|hd",
  "style": "vivid|natural|...",
  "includeContext": false
}
```

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `provider` | string | Yes | Provider identifier: `dall-e`, `openrouter`, `openai`, or any custom name |
| `model` | string | No | Model name. Defaults to `dall-e-3` for image APIs, `google/gemini-2.0-flash-exp:free` for OpenRouter |
| `apiKey` | string | No | API key. Falls back to env vars: `OPENAI_API_KEY`, `OPENROUTER_API_KEY` |
| `baseURL` | string | No | Custom API base URL (e.g. `https://openrouter.ai/api/v1`) |
| `size` | string | No | Image size: `1024x1024`, `landscape`, `portrait`, `square`. Default: `1024x1024` |
| `quality` | string | No | `standard` or `hd`. Default: `standard` |
| `style` | string | No | Provider-specific style (e.g. `vivid`, `natural` for DALL-E) |
| `includeContext` | boolean | No | Pass conversation context to model. Default: `false` |

## Input Schema

**Automatic.** A default `prompt` inputSchema is provided — do not add `inputSchema` manually.

```json
{
  "prompt": "string (required)"
}
```

## Agent Config Examples

### DALL-E (OpenAI)
```json
{
  "name": "generateImage",
  "description": "Generate images from text descriptions using DALL-E",
  "executionType": "image-generator",
  "execution": {
    "provider": "dall-e",
    "model": "dall-e-3",
    "size": "1024x1024",
    "quality": "hd",
    "style": "vivid"
  }
}
```

### OpenRouter (Gemini Image Preview)
```json
{
  "name": "generateImage",
  "description": "Generate images using Gemini via OpenRouter",
  "executionType": "image-generator",
  "execution": {
    "provider": "openrouter",
    "model": "google/gemini-2.0-flash-exp:free",
    "apiKey": "sk-or-v1-..."
  }
}
```

### Custom OpenAI-Compatible API
```json
{
  "name": "generateImage",
  "description": "Generate images via custom API",
  "executionType": "image-generator",
  "execution": {
    "provider": "openai",
    "model": "custom-model-name",
    "apiKey": "sk-...",
    "baseURL": "https://my-proxy.example.com/v1",
    "size": "1024x1024"
  }
}
```

## Response Format

```json
{
  "success": true,
  "provider": "openrouter",
  "model": "google/gemini-2.0-flash-exp:free",
  "images": [
    {
      "url": "data:image/png;base64,...",
      "mediaType": "image/png"
    }
  ],
  "duration": 8500
}
```

The `url` field contains:
- A **data URI** (`data:image/png;base64,...`) — works directly in `<img src>` tags
- Future: direct URLs when providers return them natively

## API Key Resolution

API keys are resolved in order:
1. `execution.apiKey` — hardcoded in agent config (for testing)
2. Environment variable — `OPENAI_API_KEY` (for `dall-e`/`openai`), `OPENROUTER_API_KEY` (for `openrouter`)

**Best practice:** Use environment variables in production. Only use `execution.apiKey` for development/testing.

## Best Practices

1. **Use detailed, specific prompts** — more detail yields better results
2. **Choose the right provider** — DALL-E for high-quality images, OpenRouter for cost-effective generation
3. **Set appropriate sizes** — larger sizes cost more and take longer
4. **Use environment variables** for API keys in production
5. **Handle errors gracefully** — image generation can fail due to content filters or rate limits

## Notes

- Generation typically takes 5–30 seconds depending on provider and model
- Costs vary by provider, model, and quality setting
- Some providers have content safety filters that may reject certain prompts
- The `prompt` inputSchema is automatic — do not define `inputSchema` manually for this tool type
