import { useEffect } from 'react';
import type { ComponentType } from 'react';
import { useHsafa } from '../providers/HsafaProvider';

export function useHsafaComponent(name: string, component: ComponentType<unknown>) {
  const { registerComponent } = useHsafa();

  useEffect(() => {
    if (!name || !component) return;
    return registerComponent(name, component as ComponentType<any>);
  }, [name, component, registerComponent]);
}
