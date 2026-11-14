import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, PanResponder, useWindowDimensions } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { completedExerciseSwipe, createExerciseSwipeGate, exerciseSwipeTarget, isExerciseSwipe, type ExerciseSection, type ExerciseSwipeTarget } from '../exercise-navigation';
import { useReducedMotion } from './useReducedMotion';

export const exercisePages: ExerciseSection[] = ['details', 'sessions', 'statistics'];
const easeOut = Easing.bezier(0.23, 1, 0.32, 1);

/** Pages follow the tab order: swipe left to advance and right to go back. */
export function useExercisePager(id: string, section: ExerciseSection, onSelect: (value: ExerciseSection) => void) {
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  const origin = -exercisePages.indexOf(section) * width;
  const offset = useRef(new Animated.Value(origin)).current;
  const progress = useMemo(() => offset.interpolate({
    inputRange: [-2 * width, 0], outputRange: [2, 0], extrapolate: 'clamp',
  }), [offset, width]);
  const busy = useRef(false);
  const cancelled = useRef(false);
  const initialDrag = useRef({ dx: 0, dy: 0 });
  const generation = useRef(0);
  const gate = useMemo(createExerciseSwipeGate, []);

  useEffect(() => {
    generation.current += 1;
    offset.stopAnimation();
    offset.setValue(origin);
    busy.current = false;
    return () => { generation.current += 1; offset.stopAnimation(); };
  }, [id, offset, origin, reduced]);
  useFocusEffect(useCallback(() => {
    offset.setValue(origin);
    return () => {
      generation.current += 1;
      offset.stopAnimation();
      busy.current = false;
    };
  }, [offset, origin]));

  const settle = useCallback((target: ExerciseSwipeTarget | null) => {
    busy.current = true;
    if (target === 'exercises') {
      // Let the navigator own the exit animation; do not slide an empty page out twice.
      offset.setValue(origin);
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)/(exercises)');
      return;
    }
    const nextSection = target;
    const token = ++generation.current;
    const destination = nextSection ? -exercisePages.indexOf(nextSection) * width : origin;
    function finish() {
      if (token !== generation.current) return;
      busy.current = false;
      if (nextSection && nextSection !== section) onSelect(nextSection);
    }
    if (reduced) { offset.setValue(destination); finish(); return; }
    Animated.timing(offset, { toValue: destination, duration: target ? 230 : 180,
      easing: easeOut, useNativeDriver: true }).start(({ finished }) => { if (finished) finish(); });
  }, [offset, onSelect, origin, reduced, section, width]);

  const select = useCallback((target: ExerciseSection) => {
    if (!busy.current && target !== section) settle(target);
  }, [section, settle]);
  const excludeTouch = useCallback(() => { gate.exclude(); return false; }, [gate]);
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponderCapture: (event) => { gate.begin(event.nativeEvent.touches.length); return false; },
    onMoveShouldSetPanResponder: (_event, gesture) => {
      if (busy.current || !gate.allowsSwipe() || gesture.numberActiveTouches !== 1
        || !isExerciseSwipe(gesture.dx, gesture.dy) || exerciseSwipeTarget(section, gesture.dx) === null) return false;
      initialDrag.current = { dx: gesture.dx, dy: gesture.dy };
      return true;
    },
    onPanResponderGrant: () => { cancelled.current = false; },
    onPanResponderStart: (_event, gesture) => { if (gesture.numberActiveTouches !== 1) cancelled.current = true; },
    onPanResponderMove: (_event, gesture) => {
      if (gesture.numberActiveTouches !== 1) cancelled.current = true;
      if (cancelled.current || !gate.allowsSwipe() || reduced) return;
      const dx = gesture.dx + initialDrag.current.dx;
      // Limit one drag to one page, with resistance at the final section.
      const movement = section === 'details' && dx > 0 ? 0
        : section === 'statistics' && dx < 0 ? dx * 0.15 : dx;
      offset.setValue(origin + Math.max(-width, Math.min(width, movement)));
    },
    onPanResponderRelease: (_event, gesture) => {
      const target = cancelled.current || !gate.allowsSwipe() ? null
        : completedExerciseSwipe(section, gesture.dx + initialDrag.current.dx, gesture.dy + initialDrag.current.dy, width);
      settle(target);
    },
    onPanResponderTerminate: () => { cancelled.current = true; settle(null); },
  }), [gate, offset, origin, reduced, section, settle, width]);

  return { width, offset, progress, panHandlers: pan.panHandlers, select, excludeTouch };
}
