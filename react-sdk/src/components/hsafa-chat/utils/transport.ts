import { DefaultChatTransport } from "ai";

export function createHsafaTransport(
  baseUrl: string,
  agentName: string,
  agentConfig: string,
  chatId: string,
  templateParams?: Record<string, unknown>
) {
  // Handle empty agentConfig gracefully (gateway mode doesn't use this transport)
  let parsedConfig: unknown = null;
  if (agentConfig && agentConfig.trim()) {
    try {
      parsedConfig = JSON.parse(agentConfig);
    } catch {
      console.warn('[HsafaTransport] Failed to parse agentConfig, using null');
    }
  }

  return new DefaultChatTransport({
    api: `${baseUrl}/api/agent`,
    body: {
      agentConfig: parsedConfig,
      chatId,
      ...templateParams,
    },
  });
}


