import { useCallback } from 'react';
import { LayoutAnimation } from 'react-native';
import { useReducedMotion } from './useReducedMotion';

/** Animate deliberate structural edits, never individual keyboard strokes. */
export function useSessionLayoutTransition() {
  const reducedMotion = useReducedMotion();
  return useCallback(() => {
    if (reducedMotion) return;
    LayoutAnimation.configureNext({
      duration: 280,
      update: { type: 'easeInEaseOut' },
      create: { type: 'easeOut', property: 'opacity', duration: 220 },
      delete: { type: 'easeOut', property: 'opacity', duration: 160 },
    });
  }, [reducedMotion]);
}
