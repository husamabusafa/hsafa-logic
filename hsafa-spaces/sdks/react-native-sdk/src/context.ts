import { createContext, useContext } from 'react';
import type { HsafaClient } from './client';

export interface HsafaContextValue {
  client: HsafaClient;
}

export const HsafaContext = createContext<HsafaContextValue | null>(null);

export function useHsafaClient(): HsafaClient {
  const ctx = useContext(HsafaContext);
  if (!ctx) {
    throw new Error('useHsafaClient must be used within a <HsafaProvider>');
  }
  return ctx.client;
}
