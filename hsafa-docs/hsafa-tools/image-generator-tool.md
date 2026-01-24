# Image Generator Tool

## Overview

Generate images from text prompts using AI models (DALL-E, Stable Diffusion, etc.).

## Purpose

- Create marketing visuals and illustrations
- Generate product mockups
- Design icons and UI elements
- Turn text descriptions into images

## Input Schema

```json
{
  "prompt": "string",              // What to generate
  "negativePrompt": "string",      // Optional: what to avoid
  "provider": "dall-e|stable-diffusion|midjourney",
  "size": "1024x1024|landscape|portrait|square",
  "quality": "standard|hd",
  "style": "photorealistic|digital-art|anime|...",
  "numberOfImages": 1,
  "seed": 42,                       // Optional: for reproducibility
  "outputFormat": "url|base64"
}
```

## Examples

### Product Photo
```json
{
  "prompt": "Modern smartphone on white surface, professional lighting",
  "style": "photorealistic",
  "size": "landscape",
  "quality": "hd"
}
```

### Icon
```json
{
  "prompt": "Flat rocket icon, minimal design, blue",
  "size": "512x512",
  "style": "flat-design"
}
```

### Illustration
```json
{
  "prompt": "Abstract data network visualization, glowing blue lines",
  "negativePrompt": "people, text, watermarks",
  "style": "digital-art"
}
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
