"use client";

import { useState, useEffect, useCallback } from 'react';
import { useHsafaClient } from '../context.js';
import type {
  Entity,
  CreateEntityParams,
  CreateAgentEntityParams,
  UpdateEntityParams,
  ListEntitiesParams,
} from '../types.js';

export interface UseEntitiesOptions {
  type?: 'human' | 'agent';
}

export interface UseEntitiesReturn {
  entities: Entity[];
  isLoading: boolean;
  create: (params: CreateEntityParams) => Promise<Entity>;
  createAgent: (params: CreateAgentEntityParams) => Promise<Entity>;
  update: (entityId: string, params: UpdateEntityParams) => Promise<Entity>;
  remove: (entityId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useEntities(options?: UseEntitiesOptions): UseEntitiesReturn {
  const client = useHsafaClient();
  const [entities, setEntities] = useState<Entity[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchEntities = useCallback(async () => {
    setIsLoading(true);
    try {
      const params: ListEntitiesParams = {};
      if (options?.type) params.type = options.type;
      const { entities: e } = await client.entities.list(params);
      setEntities(e);
    } catch {
      // Silently handle
    } finally {
      setIsLoading(false);
    }
  }, [client, options?.type]);

  useEffect(() => {
    fetchEntities();
  }, [fetchEntities]);

  const create = useCallback(
    async (params: CreateEntityParams) => {
      const { entity } = await client.entities.create(params);
      await fetchEntities();
      return entity;
    },
    [client, fetchEntities]
  );

  const createAgent = useCallback(
    async (params: CreateAgentEntityParams) => {
      const { entity } = await client.entities.createAgent(params);
      await fetchEntities();
      return entity;
    },
    [client, fetchEntities]
  );

  const update = useCallback(
    async (entityId: string, params: UpdateEntityParams) => {
      const { entity } = await client.entities.update(entityId, params);
      setEntities((prev) =>
        prev.map((e) => (e.id === entityId ? entity : e))
      );
      return entity;
    },
    [client]
  );

  const remove = useCallback(
    async (entityId: string) => {
      await client.entities.delete(entityId);
      setEntities((prev) => prev.filter((e) => e.id !== entityId));
    },
    [client]
  );

  return { entities, isLoading, create, createAgent, update, remove, refresh: fetchEntities };
}
