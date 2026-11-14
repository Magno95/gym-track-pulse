import { useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { Easing, Extrapolation, interpolate, interpolateColor, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { usePalette } from '@/theme';
import { layout, typography } from '@/design';
import { deleteActionShift, deleteActionWidth, deleteRevealWidth, deleteSwipeArmed, deleteSwipeRelease, swipeActivation, swipeOffset } from '@/swipe-delete';

const idle = 0, dragging = 1, leaving = 2;
/** Slightly underdamped: the card overshoots its resting place by a few points. */
const bounce = { stiffness: 320, damping: 24, mass: 1 };
const exitTiming = { duration: 240, easing: Easing.out(Easing.quad) };
const collapseTiming = { duration: 260, easing: Easing.bezier(0.3, 0, 0.2, 1) };

function deletionHaptic() {
  void (Platform.OS === 'android'
    ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Gesture_End)
    : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)).catch(() => {});
}

/**
 * The whole card follows the finger and uncovers the delete action beneath it.
 * Crossing the threshold gives one haptic; releasing there sends the card away
 * and closes the row up, releasing earlier springs it back.
 */
export function SwipeToDelete({ children, disabled, confirm, onDelete, onSwipeStart, onSwipeChange, spacing = 0, collapseGap = 0 }: PropsWithChildren<{
  disabled?: boolean;
  /** Asked once the card has left; resolve false to bring it back. */
  confirm?: () => Promise<boolean>;
  /** Runs after the row has closed up. Return false when nothing was deleted, to restore the row. */
  onDelete: () => boolean | void;
  onSwipeStart?: () => void;
  /** Reports the horizontal drag only: vertical drags stay with scrolling and modal dismissal. */
  onSwipeChange?: (id: symbol, active: boolean) => void;
  /** Bottom margin owned by the row, closed together with it. */
  spacing?: number;
  /** Gap of the parent container, absorbed while the row closes. */
  collapseGap?: number;
}>) {
  const p = usePalette();
  const { width: windowWidth } = useWindowDimensions();
  const [swipeId] = useState(() => Symbol('swipe-card'));
  // A row restored after closing is remounted, so no collapsed layout value survives.
  const [revision, setRevision] = useState(0);
  const latest = useRef({ confirm, onDelete, onSwipeStart, onSwipeChange });
  useEffect(() => { latest.current = { confirm, onDelete, onSwipeStart, onSwipeChange }; });
  useEffect(() => () => latest.current.onSwipeChange?.(swipeId, false), [swipeId]);

  const offset = useSharedValue(0);
  const origin = useSharedValue(0);
  const width = useSharedValue(0);
  const height = useSharedValue(0);
  const phase = useSharedValue(idle);
  const armed = useSharedValue(false);
  const cancelled = useSharedValue(false);
  const follow = useSharedValue(0);
  const open = useSharedValue(1);
  const closed = useRef(false);

  const restore = useCallback(() => {
    if (closed.current) { closed.current = false; setRevision((value) => value + 1); }
    open.value = 1;
    armed.value = false;
    phase.value = idle;
    follow.value = withSpring(0, bounce);
    offset.value = withSpring(0, bounce);
  }, [armed, follow, offset, open, phase]);
  const remove = useCallback(() => {
    if (latest.current.onDelete() === false) restore();
  }, [restore]);
  const leave = useCallback(async () => {
    const ask = latest.current.confirm;
    if (ask && !(await ask().catch(() => false))) { restore(); return; }
    closed.current = true;
    open.value = withTiming(0, collapseTiming, (finished) => { 'worklet'; if (finished) scheduleOnRN(remove); });
  }, [open, remove, restore]);
  const swipeStarted = useCallback(() => {
    latest.current.onSwipeStart?.();
    latest.current.onSwipeChange?.(swipeId, true);
  }, [swipeId]);
  const swipeEnded = useCallback(() => { latest.current.onSwipeChange?.(swipeId, false); }, [swipeId]);

  useEffect(() => {
    if (!disabled) return;
    // The last remaining row cannot leave, even when its swipe was already under way.
    if (closed.current) { closed.current = false; setRevision((value) => value + 1); }
    offset.value = 0; follow.value = 0; open.value = 1; armed.value = false; phase.value = idle;
  }, [armed, disabled, follow, offset, open, phase]);

  const pan = usePanGesture({
    // Listed one by one: the worklets Babel plugin rejects a spread in this config.
    activeOffsetX: swipeActivation.activeOffsetX, failOffsetX: swipeActivation.failOffsetX, failOffsetY: swipeActivation.failOffsetY,
    maxPointers: 1, enabled: !disabled,
    onActivate: (event) => {
      'worklet';
      if (phase.value !== idle) return;
      phase.value = dragging;
      // Catching a card that is still springing back continues from where it is.
      origin.value = event.translationX - offset.value;
      armed.value = false;
      cancelled.value = false;
      scheduleOnRN(swipeStarted);
    },
    onUpdate: (event) => {
      'worklet';
      if (phase.value !== dragging) return;
      if (event.numberOfPointers > 1) cancelled.value = true;
      offset.value = swipeOffset(event.translationX - origin.value, width.value);
      const next = !cancelled.value && deleteSwipeArmed(offset.value, width.value, armed.value);
      if (next === armed.value) return;
      armed.value = next;
      follow.value = withSpring(next ? 1 : 0, bounce);
      if (next) scheduleOnRN(deletionHaptic);
    },
    onDeactivate: (event) => {
      'worklet';
      if (phase.value !== dragging) return;
      // A system interruption must never delete, even after the haptic.
      const result = deleteSwipeRelease(offset.value, width.value, event.velocityX, armed.value, cancelled.value || event.canceled);
      if (result === 'close') {
        phase.value = idle;
        armed.value = false;
        follow.value = withSpring(0, bounce);
        offset.value = withSpring(0, { ...bounce, velocity: event.velocityX });
        return;
      }
      if (!armed.value) scheduleOnRN(deletionHaptic);
      phase.value = leaving;
      follow.value = withTiming(0.5, { duration: 220 });
      offset.value = withTiming(-windowWidth, exitTiming, (finished) => { 'worklet'; if (finished) scheduleOnRN(leave); });
    },
    onFinalize: () => { 'worklet'; scheduleOnRN(swipeEnded); },
  });

  const rowStyle = useAnimatedStyle(() => open.value === 1 ? {} : {
    height: height.value * open.value,
    marginBottom: spacing * open.value - collapseGap * (1 - open.value),
    opacity: open.value,
  });
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  const actionStyle = useAnimatedStyle(() => ({
    width: deleteRevealWidth(offset.value, width.value),
    backgroundColor: interpolateColor(Math.min(1, Math.max(0, follow.value)), [0, 1], ['#C72C3C', '#A91E30']),
  }));
  const iconStyle = useAnimatedStyle(() => {
    const reveal = deleteRevealWidth(offset.value, width.value);
    return {
      opacity: interpolate(reveal, [16, 64], [0, 1], Extrapolation.CLAMP),
      transform: [
        { translateX: deleteActionShift(reveal, follow.value) },
        { scale: interpolate(reveal, [16, 72], [0.5, 1], Extrapolation.CLAMP) * (1 + 0.15 * follow.value) },
      ],
    };
  });

  return <Animated.View key={revision} style={[{ marginBottom: spacing }, rowStyle]}
    onLayout={(event) => {
      if (closed.current) return;
      width.value = event.nativeEvent.layout.width;
      height.value = event.nativeEvent.layout.height;
    }}>
    {!disabled && <Animated.View style={[styles.action, actionStyle]} pointerEvents="none"
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[styles.actionContent, iconStyle]}>
        <SymbolView name="trash" tintColor="#FFFFFF" style={styles.icon} />
        <Text numberOfLines={1} style={styles.actionLabel}>Elimina</Text>
      </Animated.View>
    </Animated.View>}
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.card, { backgroundColor: p.surface }, cardStyle]}>{children}</Animated.View>
    </GestureDetector>
  </Animated.View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: layout.cardRadius, overflow: 'hidden' },
  action: { position: 'absolute', top: 0, bottom: 0, right: 0, borderRadius: layout.cardRadius, overflow: 'hidden' },
  actionContent: { position: 'absolute', top: 0, bottom: 0, right: 0, width: deleteActionWidth, alignItems: 'center', justifyContent: 'center', gap: 8 },
  icon: { width: 22, height: 22 },
  actionLabel: { ...typography.caption, color: '#FFFFFF', fontWeight: '600' },
});
