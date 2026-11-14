import { useState } from 'react';
import { Animated, Pressable, StyleSheet, useWindowDimensions, View, type LayoutRectangle } from 'react-native';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import type { ExerciseSection } from '../exercise-navigation';
import { usePalette } from '../theme';

const sections = [
  { id: 'details', label: 'Dettagli', icon: 'doc.text' },
  { id: 'sessions', label: 'Sessioni', icon: 'calendar' },
  { id: 'statistics', label: 'Statistiche', icon: 'chart.xyaxis.line' },
] as const;

/** Local navigation stays below the native header; actions have their own controls. */
export function ExerciseNavigation({ section, progress, onSelect }: {
  section: ExerciseSection; progress: Animated.AnimatedInterpolation<number>; onSelect: (section: ExerciseSection) => void;
}) {
  const p = usePalette();
  const { fontScale } = useWindowDimensions();
  const largeText = fontScale > 1.3;
  const [layouts, setLayouts] = useState<Partial<Record<ExerciseSection, LayoutRectangle>>>({});
  const frames = sections.map((item) => layouts[item.id]);
  const ready = frames.every((frame) => frame && frame.width > 0 && frame.height > 0);
  const first = frames[0];
  // Share the page animation, so taps, drags and cancelled swipes stay in sync.
  // Only transforms and opacity animate; layout is measured when it changes.
  const indicator = ready && first ? {
    left: first.x, top: first.y, width: first.width, height: first.height,
    transform: [
      { translateX: progress.interpolate({ inputRange: [0, 1, 2], outputRange: frames.map((frame) => frame!.x + (frame!.width - first.width) / 2 - first.x) }) },
      { translateY: progress.interpolate({ inputRange: [0, 1, 2], outputRange: frames.map((frame) => frame!.y + (frame!.height - first.height) / 2 - first.y) }) },
      { scaleX: progress.interpolate({ inputRange: [0, 1, 2], outputRange: frames.map((frame) => frame!.width / first.width) }) },
      { scaleY: progress.interpolate({ inputRange: [0, 1, 2], outputRange: frames.map((frame) => frame!.height / first.height) }) },
    ],
  } : null;
  return <View style={[s.container, { backgroundColor: p.background }]}>
    <View style={[s.track, largeText && { flexDirection: 'column' }, { backgroundColor: p.separator }]} accessibilityRole="tablist" accessibilityLabel="Sezioni dell’esercizio">
      {indicator && <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        style={[s.indicator, { backgroundColor: p.surface }, indicator]} />}
      {sections.map((item, index) => {
        const selected = section === item.id;
        const emphasis = progress.interpolate({ inputRange: [index - 1, index, index + 1], outputRange: [0, 1, 0], extrapolate: 'clamp' });
        return <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected }}
          onLayout={({ nativeEvent: { layout } }) => setLayouts((previous) => {
            const current = previous[item.id];
            return current && current.x === layout.x && current.y === layout.y && current.width === layout.width && current.height === layout.height
              ? previous : { ...previous, [item.id]: layout };
          })}
          onPress={() => { if (!selected) { void Haptics.selectionAsync().catch(() => {}); onSelect(item.id); } }}
          style={({ pressed }) => [s.tab, largeText && s.largeTab,
            !indicator && selected && [s.fallbackSelected, { backgroundColor: p.surface }], { opacity: pressed ? 0.65 : 1 }]}>
          <Animated.View style={[s.content, largeText && s.largeContent, {
            opacity: emphasis.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] }),
          }]}>
            <SymbolView name={item.icon} tintColor={selected ? p.accent : p.secondary} style={s.icon} />
            <Animated.Text style={[s.label, largeText && s.largeLabel, {
              color: emphasis.interpolate({ inputRange: [0, 1], outputRange: [p.secondary, p.text] }),
            }]}>{item.label}</Animated.Text>
          </Animated.View>
        </Pressable>;
      })}
    </View>
  </View>;
}
const s = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  track: { flexDirection: 'row', padding: 4, borderRadius: 22, gap: 4 },
  tab: { flex: 1, minWidth: 0, minHeight: 64, justifyContent: 'center', paddingHorizontal: 4, paddingVertical: 10, borderRadius: 18 },
  indicator: { position: 'absolute', borderRadius: 18, boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.06)' },
  fallbackSelected: { boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.06)' },
  content: { alignItems: 'center', justifyContent: 'center', gap: 7 },
  largeContent: { flexDirection: 'row', justifyContent: 'flex-start', gap: 12 },
  largeLabel: { flexShrink: 1, textAlign: 'left' },
  largeTab: { flex: 0, minHeight: 48, paddingHorizontal: 16 },
  icon: { width: 20, height: 20 },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600', textAlign: 'center' },
});
