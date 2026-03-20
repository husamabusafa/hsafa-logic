/**
 * Centralized model configuration
 * Update this file to add/remove/modify preset models available for haseef creation/editing
 */

export interface ModelOption {
  value: string;
  label: string;
  tag?: string;
  provider: "openai" | "anthropic" | "openrouter";
}

export const PRESET_MODELS: ModelOption[] = [
  {
    value: "gpt-5.2",
    label: "GPT-5.2",
    provider: "openai",
  },
  {
    value: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    provider: "anthropic",
  },
  {
    value: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    provider: "anthropic",
  },
  {
    value: "qwen/qwen3.5-flash-02-23",
    label: "Qwen 3.5 Flash",
    tag: "OpenRouter",
    provider: "openrouter",
  },
  {
    value: "moonshotai/kimi-k2-thinking",
    label: "Kimi K2 Thinking",
    tag: "OpenRouter",
    provider: "openrouter",
  },
];

/**
 * Provider options for custom models
 */
export const PROVIDER_OPTIONS = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openrouter", label: "OpenRouter" },
] as const;

/**
 * Get provider for a model ID
 * Auto-detects based on model name patterns
 */
export function getProviderForModel(modelId: string): string {
  // Check preset models first
  const preset = PRESET_MODELS.find((m) => m.value === modelId);
  if (preset) return preset.provider;

  // Auto-detect from model name
  if (modelId.startsWith("gpt")) return "openai";
  if (modelId.startsWith("claude")) return "anthropic";
  if (modelId.startsWith("qwen/") || modelId.startsWith("moonshotai/")) return "openrouter";

  return "openai"; // default
}

/**
 * Check if a model is in the preset list
 */
export function isPresetModel(modelId: string): boolean {
  return PRESET_MODELS.some((m) => m.value === modelId);
}
