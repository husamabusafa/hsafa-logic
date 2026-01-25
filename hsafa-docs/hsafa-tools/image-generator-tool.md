# Image Generator Tool

## Overview

Generate images from text prompts using AI models (DALL-E, Stable Diffusion, etc.).

## Purpose

- Create marketing visuals and illustrations
- Generate product mockups
- Design icons and UI elements
- Turn text descriptions into images

## Execution Property

In agent config, use the `execution` property to pre-configure generation settings:

```json
{
  "provider": "dall-e|stable-diffusion|midjourney",
  "size": "1024x1024|landscape|portrait|square",
  "quality": "standard|hd",
  "style": "photorealistic|digital-art|anime|...",
  "includeContext": false  // Optional: pass message context to model (default: false)
}
```

**Options:**
- **`includeContext: false`** (default) - Model only receives the prompt
- **`includeContext: true`** - Model receives message context for better understanding

## Input

**Note:** This tool has a default `prompt` inputSchema that is automatically provided. Do not add `inputSchema` manually.

The default schema includes:
- `prompt` (required) - What to generate
- `negativePrompt` (optional) - What to avoid
- `numberOfImages` (optional) - How many images
- `seed` (optional) - For reproducibility
- `outputFormat` (optional) - url or base64

## Agent Config Example

### Without Context (Default)
```json
{
  "name": "createProductImage",
  "description": "Generate product images from description",
  "executionType": "image-generator",
  "execution": {
    "provider": "dall-e",
    "size": "1024x1024",
    "quality": "hd",
    "style": "photorealistic",
    "includeContext": false
  }
}
```
Model only sees the prompt.

### With Context
```json
{
  "name": "createContextualImage",
  "description": "Generate images with conversation context",
  "executionType": "image-generator",
  "execution": {
    "provider": "dall-e",
    "size": "1024x1024",
    "quality": "hd",
    "includeContext": true
  }
}
```
Model sees previous messages for better understanding of what to generate.

**Note:** Default `prompt` inputSchema is automatic - do not add manually.

## Examples

### Product Photo
```json
// Agent config execution:
{
  "provider": "dall-e",
  "size": "landscape",
  "quality": "hd",
  "style": "photorealistic"
}

// Agent input:
{
  "prompt": "Modern smartphone on white surface, professional lighting"
}
// Generates image with configured settings
```

### Icon
```json
// Agent config execution:
{
  "provider": "dall-e",
  "size": "512x512",
  "style": "flat-design"
}

// Agent input:
{
  "prompt": "Flat rocket icon, minimal design, blue"
}
// Generates icon
```

### Illustration
```json
// Agent config execution:
{
  "provider": "stable-diffusion",
  "style": "digital-art"
}

// Agent input:
{
  "prompt": "Abstract data network visualization, glowing blue lines",
  "negativePrompt": "people, text, watermarks"
}
// Generates illustration
```

## Response Format

```json
{
  "success": true,
  "images": [
    {
      "url": "https://...",
      "prompt": "original prompt",
      "size": "1024x1024"
    }
  ],
  "provider": "dall-e",
  "duration": 5000
}
```

## Common Styles

- `photorealistic` - Realistic photos
- `digital-art` - Digital illustrations
- `flat-design` - Minimalist icons
- `anime` - Anime style
- `3d-render` - 3D rendered

## Best Practices

1. Use detailed, specific prompts
2. Use negative prompts to exclude unwanted elements
3. Generate multiple variations (numberOfImages)
4. Use seeds for reproducible results

## Notes

- Generation typically takes 5-30 seconds
- Costs vary by provider and quality
- Some providers have content filters
