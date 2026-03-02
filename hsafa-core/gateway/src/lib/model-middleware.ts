// =============================================================================
// Language Model Middleware (Ship #15)
//
// Cross-cutting concerns applied to every LLM call via wrapLanguageModel.
// Uses the AI SDK's LanguageModelV3Middleware specification.
// =============================================================================

/**
 * Logging middleware — logs LLM call duration and token usage.
 * Reads agent identity from providerOptions.hsafa metadata.
 */
export const loggingMiddleware = {
  specificationVersion: 'v3' as const,

  wrapGenerate: async ({ doGenerate, params }: any) => {
    const start = Date.now();
    const result = await doGenerate();
    const duration = Date.now() - start;

    const agentName = params.providerMetadata?.hsafa?.agentName as string | undefined;
    const inputTokens = result.usage?.inputTokens?.total ?? result.usage?.inputTokens ?? '?';
    const outputTokens = result.usage?.outputTokens?.total ?? result.usage?.outputTokens ?? '?';
    console.log(
      `[llm] ${agentName ?? 'unknown'} generate: ${duration}ms, ` +
      `input=${inputTokens}, output=${outputTokens}`
    );

    return result;
  },

  wrapStream: async ({ doStream, params }: any) => {
    const start = Date.now();
    const { stream, ...rest } = await doStream();

    const agentName = params.providerMetadata?.hsafa?.agentName as string | undefined;

    const transformStream = new TransformStream({
      flush() {
        const duration = Date.now() - start;
        console.log(`[llm] ${agentName ?? 'unknown'} stream: ${duration}ms`);
      },
    });

    return {
      stream: stream.pipeThrough(transformStream),
      ...rest,
    };
  },
};

/**
 * Cost tracking middleware — tracks cumulative token usage per agent.
 * Stores in-memory counters; can be extended to persist to DB or metrics.
 */
const agentTokenUsage = new Map<string, { input: number; output: number; calls: number }>();

export const costTrackingMiddleware = {
  specificationVersion: 'v3' as const,

  wrapGenerate: async ({ doGenerate, params }: any) => {
    const result = await doGenerate();
    const agentId = params.providerMetadata?.hsafa?.agentEntityId as string | undefined;
    if (agentId && result.usage) {
      const inputTotal = typeof result.usage.inputTokens === 'object'
        ? result.usage.inputTokens.total ?? 0
        : result.usage.inputTokens ?? 0;
      const outputTotal = typeof result.usage.outputTokens === 'object'
        ? result.usage.outputTokens.total ?? 0
        : result.usage.outputTokens ?? 0;
      trackUsage(agentId, inputTotal, outputTotal);
    }
    return result;
  },
};

function trackUsage(agentId: string, input: number, output: number) {
  const existing = agentTokenUsage.get(agentId) ?? { input: 0, output: 0, calls: 0 };
  existing.input += input;
  existing.output += output;
  existing.calls += 1;
  agentTokenUsage.set(agentId, existing);
}

/** Get cumulative token usage for an agent (useful for admin/debug endpoints) */
export function getAgentUsage(agentId: string) {
  return agentTokenUsage.get(agentId) ?? { input: 0, output: 0, calls: 0 };
}

/**
 * Default settings middleware — applies temperature and maxOutputTokens
 * from agent config so they don't need to be passed on every call.
 */
export function createDefaultSettingsMiddleware(settings: {
  temperature?: number;
  maxOutputTokens?: number;
}) {
  return {
    specificationVersion: 'v3' as const,

    transformParams: async ({ params }: any) => {
      return {
        ...params,
        temperature: params.temperature ?? settings.temperature,
        maxOutputTokens: params.maxOutputTokens ?? settings.maxOutputTokens,
      };
    },
  };
}
