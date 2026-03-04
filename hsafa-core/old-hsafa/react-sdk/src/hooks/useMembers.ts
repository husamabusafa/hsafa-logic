"use client";

import { useState, useEffect, useCallback } from 'react';
import { useHsafaClient } from '../context.js';
import type { Membership } from '../types.js';

export interface UseMembersReturn {
  members: Membership[];
  isLoading: boolean;
  refresh: () => Promise<void>;
}

export function useMembers(smartSpaceId: string | null | undefined): UseMembersReturn {
  const client = useHsafaClient();
  const [members, setMembers] = useState<Membership[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!smartSpaceId) {
      setMembers([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { members: m } = await client.spaces.listMembers(smartSpaceId);
      setMembers(m);
    } catch {
      // Silently handle - members will be empty
    } finally {
      setIsLoading(false);
    }
  }, [client, smartSpaceId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { members, isLoading, refresh: fetch };
}
