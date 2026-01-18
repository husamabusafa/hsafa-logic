import { DefaultChatTransport } from "ai";

export function createHsafaTransport(
  baseUrl: string,
  agentName: string,
  agentConfig: string,
  chatId: string,
  templateParams?: Record<string, unknown>
) {
  return new DefaultChatTransport({
    api: `${baseUrl}/api/agent`,
    fetch: async (input: unknown, init?: unknown) => {
      const reqInit = (init as { body?: any }) || {};
      const body = reqInit?.body ? JSON.parse(reqInit.body as string) : {};
      const mergedParams = templateParams && typeof templateParams === 'object' ? templateParams : {};
      
      // Extract messages from body and merge with agentConfig
      const enhancedBody = {
        ...mergedParams,
        agentConfig,
        messages: body.messages || [],
        chatId,
      } as Record<string, unknown>;
      
      return fetch(input as any, { ...(init as any), body: JSON.stringify(enhancedBody) });
    },
  });
}


