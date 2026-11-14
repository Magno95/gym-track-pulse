import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Image, PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { BottomTabBarHeightCallbackContext, type BottomTabBarProps } from 'expo-router/js-tabs';
import * as Haptics from 'expo-haptics';
import { useActiveSession } from '@/active-session';
import { useWorkout } from '@/workout';
import { usePalette } from '@/theme';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTabBarScrollState } from '@/tab-bar-scroll';
import { GlassSurface } from './GlassSurface';
import { tabIndexAt, tabOffset } from '@/data/tab-selector';
import sessionIcon from '../../assets/navigation/session.png';
import exercisesIcon from '../../assets/navigation/exercises.png';
import newSessionIcon from '../../assets/navigation/new-session.png';
import historyIcon from '../../assets/navigation/history.png';
import profileIcon from '../../assets/navigation/profile.png';

const tabs = [
  { name: 'session', label: 'Sessione', icon: sessionIcon },
  { name: '(exercises)', label: 'Esercizi', icon: exercisesIcon },
  { name: 'history', label: 'Allenamenti', icon: historyIcon },
  { name: 'profile', label: 'Profilo', icon: profileIcon },
];
const ACTION_WIDTH = 52;
const BAR_HEIGHT = 64;
const SESSION_TINT = '#FF7433';
const PADDING = 6;
const DRAG_SCALE = 1.06;
const SPRING = { stiffness: 420, damping: 24, mass: 0.8, useNativeDriver: true, isInteraction: false };
const STRETCH_SPRING = { ...SPRING, stiffness: 340, damping: 17, mass: 0.65 };

export function SessionTabBar({ state, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const p = usePalette();
  const session = useActiveSession();
  const { loading } = useWorkout();
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  const scroll = useTabBarScrollState();
  const scrollProgress = scroll?.progress;
  const scrollTarget = useMemo(() => scrollProgress?.interpolate({
    inputRange: [0, 1], outputRange: [1, 0.92], extrapolate: 'clamp',
  }), [scrollProgress]);
  const expandOnInteraction = scroll?.expand;
  const running = !!session.active;
  const selectedIndex = tabs.findIndex((tab) => tab.name === state.routes[state.index].name);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const expanded = useRef(new Animated.Value(running ? 0 : 1)).current;
  const pressScale = useRef(new Animated.Value(1)).current;
  const selector = useRef(new Animated.Value(Math.max(0, selectedIndex))).current;
  const dragScale = useRef(new Animated.Value(1)).current;
  const selectorStretch = useRef(new Animated.Value(0)).current;
  const dragging = useRef(false);
  const dragPosition = useRef(Math.max(0, selectedIndex));
  const dragStart = useRef(0);
  const onHeightChange = useContext(BottomTabBarHeightCallbackContext);
  const barWidth = Math.min(400, width - insets.left - insets.right - 32);
  const tabWidth = (barWidth - ACTION_WIDTH - PADDING * 2) / tabs.length;
  const disabled = running || loading || !!session.error;

  const moveSelector = useCallback((index: number) => {
    if (reduced) selector.setValue(index);
    else Animated.spring(selector, { ...SPRING, toValue: index }).start();
  }, [reduced, selector]);
  const scaleBar = useCallback((value: number) => {
    if (reduced) dragScale.setValue(1);
    else Animated.spring(dragScale, { ...SPRING, toValue: value }).start();
  }, [dragScale, reduced]);
  const stretchSelector = useCallback((value: number) => {
    if (reduced) selectorStretch.setValue(0);
    else Animated.spring(selectorStretch, { ...STRETCH_SPRING, toValue: value }).start();
  }, [reduced, selectorStretch]);
  const selectTab = useCallback((index: number) => {
    expandOnInteraction?.();
    const route = state.routes.find((item) => item.name === tabs[index].name);
    if (!route) return;
    const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!event.defaultPrevented) {
      moveSelector(index);
      if (index !== selectedIndex) {
        void Haptics.selectionAsync().catch(() => {});
        navigateToTab(route.key);
      }
    } else moveSelector(Math.max(0, selectedIndex));
  }, [emitter, expandOnInteraction, moveSelector, navigateToTab, selectedIndex, state.routes]);

  useEffect(() => {
    // Route changes, rotation and session transitions cancel an unfinished drag.
    dragging.current = false;
    setPreviewIndex(null);
    scaleBar(1);
    stretchSelector(0);
    moveSelector(Math.max(0, selectedIndex));
  }, [selectedIndex, running, tabWidth, scaleBar, stretchSelector, moveSelector]);

  const pan = useMemo(() => {
    const gap = running ? 0 : ACTION_WIDTH;
    function finish(commit: boolean) {
      if (!dragging.current) return;
      dragging.current = false;
      setPreviewIndex(null);
      scaleBar(1);
      stretchSelector(0);
      if (commit) selectTab(Math.round(dragPosition.current));
      else moveSelector(Math.max(0, selectedIndex));
    }
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_event, gesture) => gesture.numberActiveTouches === 1
        && Math.abs(gesture.dx) > 6 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2,
      onPanResponderGrant: () => {
        dragging.current = true;
        dragPosition.current = Math.max(0, selectedIndex);
        dragStart.current = tabOffset(dragPosition.current, tabWidth, gap);
        selector.stopAnimation((value) => {
          if (dragging.current) {
            dragPosition.current = value;
            dragStart.current = tabOffset(value, tabWidth, gap);
          }
        });
        scaleBar(DRAG_SCALE);
        stretchSelector(0.25);
      },
      onPanResponderMove: (_event, gesture) => {
        if (!dragging.current || gesture.numberActiveTouches !== 1) return;
        const index = tabIndexAt(dragStart.current + gesture.dx / (reduced ? 1 : DRAG_SCALE), tabWidth, gap);
        dragPosition.current = index;
        selector.setValue(index);
        // Faster movement stretches the pill more; a separate spring softens
        // changes of speed and lets it recoil naturally when released.
        stretchSelector(Math.min(1, Math.abs(gesture.vx) * 0.55 + Math.min(1, Math.abs(gesture.dx) / tabWidth) * 0.2));
        setPreviewIndex((previous) => previous === Math.round(index) ? previous : Math.round(index));
      },
      onPanResponderRelease: () => finish(true),
      onPanResponderTerminate: () => finish(false),
      onPanResponderTerminationRequest: () => false,
    });
  }, [running, selectedIndex, tabWidth, selector, scaleBar, selectTab, moveSelector, stretchSelector, reduced]);

  useEffect(() => {
    const toValue = running ? 0 : 1;
    if (reduced) expanded.setValue(toValue);
    else Animated.spring(expanded, { ...SPRING, toValue }).start();
    // A new spring inherits the previous spring's velocity when direction changes.
  }, [expanded, reduced, running]);
  useEffect(() => () => {
    expanded.stopAnimation(); pressScale.stopAnimation(); selector.stopAnimation(); dragScale.stopAnimation(); selectorStretch.stopAnimation();
  }, [expanded, pressScale, selector, dragScale, selectorStretch]);

  function animatePress(toValue: number) {
    if (reduced) pressScale.setValue(1);
    else Animated.spring(pressScale, { ...SPRING, toValue }).start();
  }
  function start() {
    if (disabled) return;
    try {
      const run = session.start();
      void Haptics.selectionAsync().catch(() => {});
      router.navigate({ pathname: '/session', params: { date: run.date } });
    } catch (error) {
      Alert.alert('Sessione non avviata', error instanceof Error ? error.message : 'Riprova.');
    }
  }
  function renderTab(index: number) {
    const tab = tabs[index];
    const route = state.routes.find((item) => item.name === tab.name);
    if (!route) return null;
    const selected = state.routes[state.index].key === route.key;
    const leftSide = index < 2;
    const highlighted = (previewIndex ?? selectedIndex) === index;
    const color = running
      ? (highlighted ? p.onHero : p.hero)
      : (highlighted ? p.accent : p.secondary);
    return <Animated.View key={tab.name} {...(selected ? pan.panHandlers : {})} style={[s.tab, {
      width: tabWidth,
      left: PADDING + tabWidth * index + (leftSide ? 0 : ACTION_WIDTH),
      transform: [{ translateX: expanded.interpolate({ inputRange: [0, 1], outputRange: [leftSide ? ACTION_WIDTH / 2 : -ACTION_WIDTH / 2, 0] }) }],
    }]}>
      <Pressable accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected }}
        accessibilityHint={selected ? 'Trascina a destra o a sinistra per cambiare sezione.' : undefined}
        testID={`tab-${tab.name}`} onPress={() => selectTab(index)} onFocus={expandOnInteraction}
        onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })}
        style={({ pressed }) => [s.tabButton, { opacity: pressed && !dragging.current ? 0.65 : 1 }]}>
        <Image source={tab.icon} accessible={false} resizeMode="contain" style={[s.icon, { tintColor: color }]} />
        <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={[s.label, { color, fontWeight: highlighted ? '600' : '500' }]}>{tab.label}</Text>
      </Pressable>
    </Animated.View>;
  }

  return <View pointerEvents="box-none" onLayout={(event) => onHeightChange?.(event.nativeEvent.layout.height)}
    onTouchStart={scroll?.beginInteraction} onTouchEnd={scroll?.endInteraction} onTouchCancel={scroll?.endInteraction}
    style={[s.container, { paddingBottom: Math.max(insets.bottom, 12), paddingLeft: insets.left, paddingRight: insets.right }]}>
    <Animated.View style={{ width: barWidth, height: BAR_HEIGHT, transform: [{ scale: Animated.multiply(Animated.multiply(dragScale, scrollTarget ?? 1),
      reduced ? 1 : expanded.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.045, 1], extrapolate: 'clamp' })) }] }}>
      {/* Contraction and stretch only affect the surfaces. The whole bar lifts
          during a drag; transforms run natively without per-frame layout. */}
      <Animated.View pointerEvents="none" style={[s.surface, {
        transform: [{ scaleX: expanded.interpolate({ inputRange: [0, 1], outputRange: [(barWidth - ACTION_WIDTH) / barWidth, 1] }) }],
      }]}>
        <GlassSurface style={s.glass} tintColor={running ? SESSION_TINT : undefined} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[s.selector, {
        backgroundColor: running ? p.hero : p.accentSoft,
        width: tabWidth - 2,
        left: PADDING + ACTION_WIDTH / 2 + 1,
        opacity: selectedIndex < 0 ? 0 : 1,
        transform: [
          { translateX: Animated.add(Animated.multiply(selector, tabWidth), Animated.multiply(expanded,
            selector.interpolate({ inputRange: [0, 1, 2, 3], outputRange: [-ACTION_WIDTH / 2, -ACTION_WIDTH / 2, ACTION_WIDTH / 2, ACTION_WIDTH / 2], extrapolate: 'clamp' }))) },
          { scaleX: selectorStretch.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) },
          { scaleY: selectorStretch.interpolate({ inputRange: [0, 1], outputRange: [1, 0.95] }) },
        ],
      }]} />
      {renderTab(0)}
      {renderTab(1)}
      <Animated.View pointerEvents={running ? 'none' : 'auto'} accessibilityElementsHidden={running}
        importantForAccessibility={running ? 'no-hide-descendants' : 'auto'} style={[s.newSession, {
          left: (barWidth - ACTION_WIDTH) / 2,
          opacity: expanded.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 0, 1], extrapolate: 'clamp' }),
          transform: [
            { translateY: expanded.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
            { scale: Animated.multiply(pressScale, expanded.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] })) },
            { rotate: expanded.interpolate({ inputRange: [0, 1], outputRange: ['-15deg', '0deg'] }) },
          ],
        }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Nuova sessione" accessibilityState={{ disabled }}
          testID="start-session" disabled={disabled} onPress={start} onFocus={expandOnInteraction} onPressIn={() => animatePress(0.94)} onPressOut={() => animatePress(1)}
          style={[s.startButton, { opacity: loading || session.error ? 0.45 : 1 }]}>
          <Image source={newSessionIcon} accessible={false} style={s.startIcon} />
        </Pressable>
      </Animated.View>
      {renderTab(2)}
      {renderTab(3)}
    </Animated.View>
  </View>;
}

const s = StyleSheet.create({
  container: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingTop: 8 },
  surface: { ...StyleSheet.absoluteFill, borderRadius: BAR_HEIGHT / 2, shadowColor: '#000000', shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  glass: { flex: 1, borderRadius: BAR_HEIGHT / 2, borderCurve: 'continuous' },
  tab: { position: 'absolute', top: PADDING, height: BAR_HEIGHT - PADDING * 2 },
  selector: { position: 'absolute', top: PADDING, height: BAR_HEIGHT - PADDING * 2, borderRadius: 25, borderCurve: 'continuous' },
  tabButton: { flex: 1, marginHorizontal: 1, borderRadius: 25, alignItems: 'center', justifyContent: 'center', gap: 4 },
  icon: { width: 21, height: 21 },
  label: { fontSize: 10 },
  newSession: { position: 'absolute', top: PADDING, width: ACTION_WIDTH, height: BAR_HEIGHT - PADDING * 2 },
  startButton: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  startIcon: { width: 36, height: 36 },
});
