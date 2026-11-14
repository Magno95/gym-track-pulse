import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import type { Animated, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

export const TabBarScrollContext = createContext<{
  progress: Animated.Value;
  expand: () => void;
  beginInteraction: () => void;
  endInteraction: () => void;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
} | null>(null);

export function useTabBarScrollState() {
  return useContext(TabBarScrollContext);
}

/** Only the focused screen can resize the bar; modal scroll views are ignored. */
export function useTabBarScroll(contentKey?: string) {
  const { onScroll, expand } = useTabBarScrollState() ?? {};
  const focused = useRef(false);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    expand?.();
    return () => { focused.current = false; };
  }, [expand]));
  useEffect(() => {
    if (focused.current) expand?.();
  }, [expand, contentKey]);
  return useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (focused.current) onScroll?.(event);
  }, [onScroll]);
}
