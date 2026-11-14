import { useCallback, useEffect, useMemo, useRef, type PropsWithChildren } from 'react';
import { Animated, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { createTabBarScrollTracker } from '@/data/tab-bar-scroll';
import { TabBarScrollContext } from '@/tab-bar-scroll';
import { useReducedMotion } from '@/hooks/useReducedMotion';

export function TabBarScrollProvider({ children }: PropsWithChildren) {
  const progress = useRef(new Animated.Value(0)).current;
  const lastProgress = useRef(0);
  const interacting = useRef(false);
  const reduced = useReducedMotion();
  const restoration = useRef<'idle' | 'animating' | 'rebasing'>('idle');
  const generation = useRef(0);
  const pendingScroll = useRef<NativeScrollEvent | null>(null);
  const tracker = useRef(createTabBarScrollTracker()).current;
  const update = useCallback((value: number) => {
    if (lastProgress.current === value) return;
    lastProgress.current = value;
    // Updating an animated target avoids rendering every screen on each scroll.
    progress.setValue(value);
  }, [progress]);
  const expand = useCallback(() => {
    const token = ++generation.current;
    tracker.reset();
    lastProgress.current = 0;
    pendingScroll.current = null;
    progress.stopAnimation();
    if (reduced) {
      restoration.current = 'idle';
      progress.setValue(0);
      return;
    }
    restoration.current = 'animating';
    Animated.spring(progress, { toValue: 0, stiffness: 420, damping: 36, mass: 0.8,
      overshootClamping: true, useNativeDriver: true, isInteraction: false }).start(({ finished }) => {
      if (finished && token === generation.current) restoration.current = 'idle';
    });
  }, [progress, reduced, tracker]);
  const beginInteraction = useCallback(() => {
    interacting.current = true;
    expand();
  }, [expand]);
  const endInteraction = useCallback(() => {
    interacting.current = false;
    tracker.reset();
  }, [tracker]);
  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (interacting.current) return;
    if (restoration.current !== 'idle') {
      pendingScroll.current = event.nativeEvent;
      if (restoration.current === 'rebasing') return;
      restoration.current = 'rebasing';
      const token = ++generation.current;
      // A new gesture takes over at the currently displayed size, even if the
      // touch-expansion spring has not finished. Keep only the newest event.
      progress.stopAnimation((current) => {
        if (token !== generation.current) return;
        tracker.reset(current);
        lastProgress.current = current;
        restoration.current = 'idle';
        if (pendingScroll.current) update(tracker.update(pendingScroll.current));
        pendingScroll.current = null;
      });
      return;
    }
    update(tracker.update(event.nativeEvent));
  }, [progress, tracker, update]);
  useEffect(() => () => { generation.current += 1; progress.stopAnimation(); }, [progress]);
  const value = useMemo(() => ({ progress, expand, beginInteraction, endInteraction, onScroll }),
    [progress, expand, beginInteraction, endInteraction, onScroll]);
  return <TabBarScrollContext.Provider value={value}>{children}</TabBarScrollContext.Provider>;
}
