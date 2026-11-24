import { useEffect, useRef } from 'react';
import { api } from './api';

export function useFitWindow<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      const height = element.offsetHeight;
      if (height > 0) void api().invoke('window:set-content-height', { height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return ref;
}
