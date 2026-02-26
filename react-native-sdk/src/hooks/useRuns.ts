import { useState, useEffect, useCallback } from 'react';
import { useHsafaClient } from '../context';
import type { Run, ListRunsParams } from '../types';

export interface UseRunsOptions {
  smartSpaceId?: string;
  agentEntityId?: string;
  status?: Run['status'];
}

export interface UseRunsReturn {
  runs: Run[];
  isLoading: boolean;
  cancel: (runId: string) => Promise<void>;
  remove: (runId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useRuns(options?: UseRunsOptions): UseRunsReturn {
  const client = useHsafaClient();
  const [runs, setRuns] = useState<Run[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchRuns = useCallback(async () => {
    setIsLoading(true);
    try {
      const params: ListRunsParams = {};
      if (options?.smartSpaceId) params.smartSpaceId = options.smartSpaceId;
      if (options?.agentEntityId) params.agentEntityId = options.agentEntityId;
      if (options?.status) params.status = options.status;
      const { runs: r } = await client.runs.list(params);
      setRuns(r);
    } catch {
      // Silently handle
    } finally {
      setIsLoading(false);
    }
  }, [client, options?.smartSpaceId, options?.agentEntityId, options?.status]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  const cancel = useCallback(
    async (runId: string) => {
      await client.runs.cancel(runId);
      setRuns((prev: Run[]) =>
        prev.map((r: Run) => (r.id === runId ? { ...r, status: 'failed' as const } : r))
      );
    },
    [client]
  );

  const remove = useCallback(
    async (runId: string) => {
      await client.runs.delete(runId);
      setRuns((prev: Run[]) => prev.filter((r: Run) => r.id !== runId));
    },
    [client]
  );

  return { runs, isLoading, cancel, remove, refresh: fetchRuns };
}
