import { useState, useEffect, useCallback } from 'react';
import { useHsafaClient } from '../context';
import type {
  SmartSpace,
  CreateSmartSpaceParams,
  UpdateSmartSpaceParams,
} from '../types';

export interface UseSpacesReturn {
  spaces: SmartSpace[];
  isLoading: boolean;
  create: (params: CreateSmartSpaceParams) => Promise<SmartSpace>;
  update: (spaceId: string, params: UpdateSmartSpaceParams) => Promise<SmartSpace>;
  remove: (spaceId: string) => Promise<void>;
  addMember: (spaceId: string, entityId: string, role?: string) => Promise<void>;
  removeMember: (spaceId: string, entityId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useSpaces(): UseSpacesReturn {
  const client = useHsafaClient();
  const [spaces, setSpaces] = useState<SmartSpace[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSpaces = useCallback(async () => {
    setIsLoading(true);
    try {
      const { smartSpaces } = await client.spaces.list();
      setSpaces(smartSpaces);
    } catch {
      // Silently handle
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  useEffect(() => {
    fetchSpaces();
  }, [fetchSpaces]);

  const create = useCallback(
    async (params: CreateSmartSpaceParams) => {
      const { smartSpace } = await client.spaces.create(params);
      setSpaces((prev: SmartSpace[]) => [smartSpace, ...prev]);
      return smartSpace;
    },
    [client]
  );

  const update = useCallback(
    async (spaceId: string, params: UpdateSmartSpaceParams) => {
      const { smartSpace } = await client.spaces.update(spaceId, params);
      setSpaces((prev: SmartSpace[]) =>
        prev.map((s: SmartSpace) => (s.id === spaceId ? smartSpace : s))
      );
      return smartSpace;
    },
    [client]
  );

  const remove = useCallback(
    async (spaceId: string) => {
      await client.spaces.delete(spaceId);
      setSpaces((prev: SmartSpace[]) => prev.filter((s: SmartSpace) => s.id !== spaceId));
    },
    [client]
  );

  const addMember = useCallback(
    async (spaceId: string, entityId: string, role?: string) => {
      await client.spaces.addMember(spaceId, { entityId, role });
    },
    [client]
  );

  const removeMember = useCallback(
    async (spaceId: string, entityId: string) => {
      await client.spaces.removeMember(spaceId, entityId);
    },
    [client]
  );

  return { spaces, isLoading, create, update, remove, addMember, removeMember, refresh: fetchSpaces };
}
