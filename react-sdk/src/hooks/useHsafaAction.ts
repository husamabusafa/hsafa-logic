import { useEffect } from 'react';
import { useHsafa, type HsafaActionHandler } from '../providers/HsafaProvider';

export function useHsafaAction(name: string, handler: HsafaActionHandler) {
  const { registerAction } = useHsafa();

  useEffect(() => {
    if (!name || !handler) return;
    return registerAction(name, handler);
  }, [name, handler, registerAction]);
}
