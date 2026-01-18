import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { xai } from '@ai-sdk/xai';
import type { LanguageModel } from 'ai';
import type { ModelConfig } from './types';

export class ModelResolverError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelResolverError';
  }
}

export function resolveModel(config: ModelConfig): LanguageModel {
  const { provider, name } = config;

  try {
    switch (provider.toLowerCase()) {
      case 'openai':
        return openai(name);
      
      case 'anthropic':
        return anthropic(name);
      
      case 'google':
        return google(name);
      
      case 'xai':
        return xai(name);
      
      default:
        throw new ModelResolverError(
          `Unsupported provider: ${provider}. Supported providers: openai, anthropic, google, xai`
        );
    }
  } catch (error) {
    if (error instanceof ModelResolverError) {
      throw error;
    }
    throw new ModelResolverError(
      `Failed to resolve model ${provider}/${name}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export function getModelSettings(config: ModelConfig) {
  return {
    temperature: config.temperature,
    maxTokens: config.maxOutputTokens,
  };
}
