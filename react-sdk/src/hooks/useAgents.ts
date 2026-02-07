"use client";

import { useState, useEffect, useCallback } from 'react';
import { useHsafaClient } from '../context.js';
import type { Agent, CreateAgentParams } from '../types.js';

export interface UseAgentsReturn {
  agents: Agent[];
  isLoading: boolean;
  create: (params: CreateAgentParams) => Promise<{ agentId: string; configHash: string; created: boolean }>;
  remove: (agentId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useAgents(): UseAgentsReturn {
  const client = useHsafaClient();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAgents = useCallback(async () => {
    setIsLoading(true);
    try {
      const { agents: a } = await client.agents.list();
      setAgents(a);
    } catch {
      // Silently handle
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const create = useCallback(
    async (params: CreateAgentParams) => {
      const result = await client.agents.create(params);
      await fetchAgents();
      return result;
    },
    [client, fetchAgents]
  );

  const remove = useCallback(
    async (agentId: string) => {
      await client.agents.delete(agentId);
      setAgents((prev) => prev.filter((a) => a.id !== agentId));
    },
    [client]
  );

  return { agents, isLoading, create, remove, refresh: fetchAgents };
}
