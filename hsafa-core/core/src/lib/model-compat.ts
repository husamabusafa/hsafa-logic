import type { ModelMessage } from './consciousness.js';

// =============================================================================
// Model Compatibility Utilities
//
// Handles provider-specific quirks so the rest of the codebase doesn't need to.
// =============================================================================

/**
 * Normalize system messages for Anthropic compatibility.
 * Anthropic doesn't support multiple system messages separated by user/assistant
 * messages. This converts any non-first system messages to user messages.
 * Safe for all providers — user messages are universally supported.
 */
export function normalizeSystemMessages(messages: ModelMessage[]): ModelMessage[] {
  let seenFirst = false;
  return messages.map((msg) => {
    if (msg.role === 'system') {
      if (!seenFirst) {
        seenFirst = true;
        return msg;
      }
      return { role: 'user' as const, content: msg.content };
    }
    return msg;
  });
}
