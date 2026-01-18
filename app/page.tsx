'use client';

import { HsafaChat } from '@/sdk/src/components/HsafaChat';
import { useAgentConfig } from '@/sdk/src/hooks/useAgentConfig';

export default function Home() {
  const { agentConfig, loading, error } = useAgentConfig('basic-chat');

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-white">
        <div className="text-center">
          <div className="mb-4 text-2xl">Loading agent...</div>
          <div className="text-zinc-400">Initializing HSAFA agent configuration</div>
        </div>
      </div>
    );
  }

  if (error || !agentConfig) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-white">
        <div className="max-w-md text-center">
          <div className="mb-4 text-2xl text-red-500">Error loading agent</div>
          <div className="text-zinc-400">
            {error?.message || 'Failed to load agent configuration'}
          </div>
          <div className="mt-4 text-sm text-zinc-500">
            Make sure the agent config exists at: .hsafa/agents/basic-chat.hsafa
          </div>
        </div>
      </div>
    );
  }

  return (
    <HsafaChat
      agentName="basic-chat"
      agentConfig={agentConfig}
      fullPageChat={true}
      theme="dark"
      title="HSAFA Agent"
      placeholder="Ask me anything..."
      emptyStateMessage="Hi! I'm your AI assistant. How can I help you today?"
    />
  );
}
