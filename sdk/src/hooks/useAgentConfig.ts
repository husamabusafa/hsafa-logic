import { useState, useEffect } from 'react';

export interface UseAgentConfigResult {
  agentConfig: string | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Hook to load agent configuration from the server
 * @param agentName - Name of the agent (without .hsafa extension)
 * @param baseUrl - Base URL of the server (default: '')
 * @returns Object with agentConfig, loading, and error states
 */
export function useAgentConfig(agentName: string, baseUrl: string = ''): UseAgentConfigResult {
  const [agentConfig, setAgentConfig] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!agentName) {
      setError(new Error('Agent name is required'));
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    fetch(`${baseUrl}/api/agent-config/${agentName}`)
      .then(async (response) => {
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Failed to load agent config: ${response.statusText}`);
        }
        return response.json();
      })
      .then((data) => {
        setAgentConfig(data.agentConfig);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      });
  }, [agentName, baseUrl]);

  return { agentConfig, loading, error };
}
