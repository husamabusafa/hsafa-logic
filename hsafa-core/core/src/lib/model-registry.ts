import { createProviderRegistry, customProvider, wrapLanguageModel } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createXai } from '@ai-sdk/xai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { loggingMiddleware, costTrackingMiddleware, createDefaultSettingsMiddleware } from './model-middleware.js';

// =============================================================================
// Model Registry (Ship #6)
//
// Centralizes all LLM provider configuration in one place.
// Uses AI SDK's createProviderRegistry so model resolution is a one-liner:
//   registry.languageModel('openai:gpt-4o')
//
// Benefits:
//   - Single place to manage API keys and provider config
//   - Agent config just stores a string like "openai:gpt-5" instead of
//     a { provider, model } object
//   - Supports custom aliases (e.g. "fast" → "openai:gpt-4o-mini")
//   - Easy to add new providers
// =============================================================================

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const google = createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_API_KEY });
const xai = createXai({ apiKey: process.env.XAI_API_KEY });
const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });

export const registry = createProviderRegistry({
  openai,
  anthropic,
  google,
  xai,
  openrouter,
});

/**
 * Create a one-off provider instance with a user-supplied API key.
 * Falls back to the global registry if no apiKey is provided.
 */
function resolveBaseModel(
  provider: string,
  model: string,
  apiKey?: string,
) {
  if (!apiKey) {
    // Use the global registry (env var keys)
    const id = `${provider}:${model}`;
    return registry.languageModel(id as any);
  }

  // Create a one-off provider with the user's key
  switch (provider) {
    case 'openai':
      return createOpenAI({ apiKey })(model);
    case 'anthropic':
      return createAnthropic({ apiKey })(model);
    case 'google':
      return createGoogleGenerativeAI({ apiKey })(model);
    case 'xai':
      return createXai({ apiKey })(model);
    case 'openrouter':
      return createOpenRouter({ apiKey })(model);
    default: {
      // Unknown provider — fall back to registry
      const id = `${provider}:${model}`;
      return registry.languageModel(id as any);
    }
  }
}

/**
 * Resolve a model and wrap it with middleware (logging + cost tracking + defaults).
 * Supports legacy { provider, model } config → registry.languageModel('provider:model').
 * If config.apiKey is provided, creates a one-off provider with the user's key.
 */
export function resolveModel(
  config: { provider: string; model: string; apiKey?: string },
  defaults?: { temperature?: number; maxOutputTokens?: number },
) {
  const baseModel = resolveBaseModel(config.provider, config.model, config.apiKey);

  // Build middleware stack
  const middleware: any[] = [loggingMiddleware, costTrackingMiddleware];
  if (defaults?.temperature !== undefined || defaults?.maxOutputTokens !== undefined) {
    middleware.push(createDefaultSettingsMiddleware(defaults));
  }

  return wrapLanguageModel({
    model: baseModel,
    middleware,
  });
}
