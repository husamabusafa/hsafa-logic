# Model Configuration Guide

## Quick Start: Adding/Updating Models

All preset models are defined in **`models-config.ts`** in this directory.

### To Add a New Model

Open `models-config.ts` and add to the `PRESET_MODELS` array:

```typescript
{
  value: "model-id",           // The exact model ID (e.g., "gpt-4o", "claude-opus-4")
  label: "Display Name",       // What users see in the UI
  provider: "openai",          // "openai" | "anthropic" | "openrouter"
  tag: "Optional Badge",       // Optional: shows below the model name (e.g., "OpenRouter")
}
```

### Examples

**OpenAI model:**
```typescript
{
  value: "gpt-4o",
  label: "GPT-4o",
  provider: "openai",
}
```

**Anthropic model:**
```typescript
{
  value: "claude-opus-4",
  label: "Claude Opus 4",
  provider: "anthropic",
}
```

**OpenRouter model (with tag):**
```typescript
{
  value: "deepseek/deepseek-chat",
  label: "DeepSeek Chat",
  tag: "OpenRouter",
  provider: "openrouter",
}
```

### To Remove a Model

Simply delete the entry from the `PRESET_MODELS` array.

### To Update a Model

Find the model in the array and update any field (value, label, provider, tag).

---

## Important Notes

- Changes apply to **both** create and edit pages automatically
- The `value` field must match the exact model ID used by the provider
- The `provider` field determines which API will be used
- The `tag` field is optional - use it to show additional info (like "OpenRouter", "Beta", etc.)

## Adding New Providers

If you need to add a new provider:

1. Add it to the `PROVIDER_OPTIONS` array in `models-config.ts`
2. Update the `ModelOption` type to include the new provider
3. Update the `getProviderForModel()` function to handle auto-detection for that provider

## Files That Use This Config

- `src/components/haseef-create-page.tsx` - Haseef creation form
- `src/components/haseef-edit-page.tsx` - Haseef editing form
- `src/lib/models-config.ts` - **The single source of truth**
