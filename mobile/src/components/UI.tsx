import { createContext, useCallback, useContext, useEffect, useRef, useState, type ComponentProps, type PropsWithChildren, type ReactNode, type RefObject } from 'react';
import { useFocusEffect } from 'expo-router';
import { BottomTabBarHeightContext } from 'expo-router/js-tabs';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, Animated, AppState, Easing, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance, type TextInputInstance, type TextInputProps, type StyleProp, type ViewInstance, type ViewStyle } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePalette } from '../theme';
import * as Haptics from 'expo-haptics';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { layout, typography } from '../design';
import { useTabBarScroll } from '../tab-bar-scroll';

export function Action({ title, onPress, variant = 'primary', busy, disabled, compact, icon }: {
  title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger' | 'brand'; busy?: boolean; disabled?: boolean; compact?: boolean; icon?: ComponentProps<typeof SymbolView>['name'];
}) {
  const p = usePalette();
  const scale = useRef(new Animated.Value(1)).current;
  const reduced = useReducedMotion();
  const foreground = variant === 'primary' ? p.onPrimary : variant === 'danger' ? p.danger : p.onBrand;
  function animate(value: number) { Animated.timing(scale, { toValue: value, duration: reduced ? 0 : 110, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(); }
  return <Animated.View style={{ transform: [{ scale }], alignSelf: compact ? 'flex-start' : 'stretch', maxWidth: '100%' }}>
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy}
      onPress={() => { void Haptics.selectionAsync().catch(() => {}); onPress(); }} onPressIn={() => animate(0.97)} onPressOut={() => animate(1)}
      style={[s.action, { backgroundColor: variant === 'primary' ? p.primary : variant === 'danger' ? 'transparent' : p.buttonOrange, opacity: disabled ? 0.45 : busy ? 0.7 : 1 }, compact && s.compact]}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
        {busy ? <ActivityIndicator color={foreground} /> : icon && <SymbolView name={icon} tintColor={foreground} style={{ width: 20, height: 20 }} />}
        <Text style={[s.actionText, { color: foreground, flexShrink: 1 }]}>{title}</Text>
      </View>
    </Pressable>
  </Animated.View>;
}
export function Card({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const p = usePalette(); return <View style={[s.card, { backgroundColor: p.surface, borderColor: p.separator }, style]}>{children}</View>;
}
export function SectionTitle({ children }: PropsWithChildren) {
  const p = usePalette(); return <Text accessibilityRole="header" style={[s.sectionTitle, { color: p.text }]}>{children}</Text>;
}
export function Caption({ children, danger, color }: PropsWithChildren<{ danger?: boolean; color?: string }>) {
  const p = usePalette(); return <Text accessibilityRole={danger ? 'alert' : undefined} style={[s.caption, { color: danger ? p.danger : color ?? p.secondary }]}>{children}</Text>;
}
const FormFocusContext = createContext<((input: TextInputInstance, focused: boolean) => void) | undefined>(undefined);
const FormScrollContext = createContext<((target: RefObject<ViewInstance | null>) => void) | undefined>(undefined);
/** Reveal an added row only after its native layout, including content below it. */
export function FormScrollTarget({ children, active, style }: PropsWithChildren<{ active: boolean; style?: StyleProp<ViewStyle> }>) {
  const target = useRef<ViewInstance>(null);
  const requested = useRef(false);
  const reveal = useContext(FormScrollContext);
  return <View ref={target} collapsable={false} style={style} onLayout={() => {
    if (active && !requested.current) { requested.current = true; reveal?.(target); }
  }}>{children}</View>;
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const p = usePalette(); const [focused, setFocused] = useState(false);
  const input = useRef<TextInputInstance>(null);
  const focusInForm = useContext(FormFocusContext);
  useEffect(() => {
    const node = input.current;
    return () => { if (node) focusInForm?.(node, false); };
  }, [focusInForm]);
  return <View style={s.field}>
    <Text style={[s.label, { color: p.text }]}>{label}</Text>
    <TextInput ref={input} accessibilityLabel={label} placeholderTextColor={p.secondary} selectionColor={p.accent} underlineColorAndroid="transparent" {...props}
      onFocus={(event) => { setFocused(true); if (input.current) focusInForm?.(input.current, true); props.onFocus?.(event); }}
      onBlur={(event) => { setFocused(false); if (input.current) focusInForm?.(input.current, false); props.onBlur?.(event); }}
      style={[s.input, { color: p.text, backgroundColor: p.surface, borderColor: focused ? p.accent : p.inputBorder }, props.multiline && s.multiline, props.style]} />
  </View>;
}
export function FormPage({ children, footer, keyboardClearance = 0 }: PropsWithChildren<{ footer?: ReactNode; keyboardClearance?: number }>) {
  const p = usePalette(); const insets = useSafeAreaInsets();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const scroll = useRef<ScrollViewInstance>(null);
  const focusedInput = useRef<TextInputInstance | null>(null);
  const addedTarget = useRef<RefObject<ViewInstance | null> | null>(null);
  const scrollY = useRef(0);
  const frame = useRef<number | undefined>(undefined);
  const revealInput = useCallback(() => {
    if (!keyboardClearance && !addedTarget.current) return;
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = undefined;
      const added = addedTarget.current;
      const target = added ? added.current : focusedInput.current;
      const keyboard = Keyboard.metrics();
      if (!target) { addedTarget.current = null; return; }
      if (!added && !keyboard) return;
      // Measure the actual viewport: the pinned footer can sit above the keyboard.
      scroll.current?.measureInWindow((_x, top, _width, height) => {
        target.measureInWindow((_targetX, targetTop, _targetWidth, targetHeight) => {
          if (added ? addedTarget.current !== added || added.current !== target : focusedInput.current !== target) return;
          const bottom = Math.min(top + height, keyboard?.screenY ?? Infinity) - keyboardClearance;
          const overlap = targetTop + targetHeight - bottom;
          const movement = added && targetTop < top + 12 ? targetTop - top - 12 : Math.max(0, overlap);
          if (movement) scroll.current?.scrollTo({ y: Math.max(0, scrollY.current + movement), animated: true });
        });
      });
    });
  }, [keyboardClearance]);
  const focusInForm = useCallback((input: TextInputInstance, focused: boolean) => {
    if (focused) { addedTarget.current = null; focusedInput.current = input; revealInput(); }
    else if (focusedInput.current === input) focusedInput.current = null;
  }, [revealInput]);
  const revealAddedTarget = useCallback((target: RefObject<ViewInstance | null>) => { addedTarget.current = target; revealInput(); }, [revealInput]);
  useEffect(() => {
    if (!keyboardClearance) return;
    const shown = Keyboard.addListener('keyboardDidShow', revealInput);
    const resized = Keyboard.addListener('keyboardDidChangeFrame', revealInput);
    return () => {
      shown.remove(); resized.remove();
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    };
  }, [keyboardClearance, revealInput]);
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={insets.top + 44} style={{ flex: 1, backgroundColor: p.background }}>
    <ScrollView ref={scroll} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentInsetAdjustmentBehavior="automatic"
      onLayout={revealInput} onContentSizeChange={revealInput} onScroll={(event) => { scrollY.current = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={16}
      onScrollBeginDrag={() => { addedTarget.current = null; }}
      contentContainerStyle={[s.page, { paddingBottom: (footer ? 24 : Math.max(tabBarHeight, insets.bottom) + 32) + keyboardClearance }]}>
      <FormScrollContext.Provider value={revealAddedTarget}>
        <FormFocusContext.Provider value={keyboardClearance ? focusInForm : undefined}>{children}</FormFocusContext.Provider>
      </FormScrollContext.Provider>
    </ScrollView>
    {footer && <View style={[s.formFooter, { backgroundColor: p.background, borderTopColor: p.separator, paddingBottom: Math.max(insets.bottom, 16) }]}>{footer}</View>}
  </KeyboardAvoidingView>;
}
export function ScrollPage({ children, resetOnReturn = false }: PropsWithChildren<{ resetOnReturn?: boolean }>) {
  const p = usePalette(); const insets = useSafeAreaInsets();
  const onScroll = useTabBarScroll();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const [scrollRevision, setScrollRevision] = useState(0);
  useFocusEffect(useCallback(() => {
    if (!resetOnReturn) return;
    let frame: number | undefined;
    function reset() {
      if (frame !== undefined) cancelAnimationFrame(frame);
      // Recreate only the idle scroll view after the screen is visible. UIKit
      // restores its top inset and large title together, without guessing a Y
      // offset (zero is not the top under an automatically inset iOS header).
      frame = requestAnimationFrame(() => setScrollRevision((value) => value + 1));
    }
    let backgrounded = AppState.currentState === 'background';
    reset();
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'background') backgrounded = true;
      else if (state === 'active' && backgrounded) { backgrounded = false; reset(); }
    });
    return () => {
      listener.remove();
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [resetOnReturn]));
  // Keep the ScrollView at the screen root so UIKit can collapse the large title.
  // Native keyboard insets also cover the optional custom recovery input.
  return <ScrollView key={scrollRevision} style={{ flex: 1, backgroundColor: p.background }}
    onScroll={onScroll} scrollEventThrottle={16}
    keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets
    contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[s.page, { paddingBottom: Math.max(tabBarHeight, insets.bottom) + 36 }]}>{children}</ScrollView>;
}
export function DateField({ value, onChange, label = 'Data', maximumDate }: { value: string; onChange: (value: string) => void; label?: string; maximumDate?: Date }) {
  const p = usePalette();
  return <Card style={s.date}><Text style={[s.label, { color: p.secondary }]}>{label}</Text>
    <DateTimePicker accessibilityLabel={label} accentColor={p.accent} value={new Date(`${value}T12:00:00`)} mode="date" display="compact" locale="it-IT" maximumDate={maximumDate}
      onChange={(_event, date) => { if (date) onChange(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`); }} />
  </Card>;
}
export function Pills({ items, value, onChange }: { items: { id: string; label: string }[]; value: string; onChange: (value: string) => void }) {
  const p = usePalette(); return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pills}>
    {items.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: value === item.id }} onPress={() => onChange(item.id)}
      style={({ pressed }) => [s.pill, { backgroundColor: value === item.id ? p.primary : p.surface, opacity: pressed ? 0.6 : 1 }]}>
      <Text style={{ ...typography.caption, color: value === item.id ? p.onPrimary : p.text, fontWeight: '600' }}>{item.label}</Text>
    </Pressable>)}
  </ScrollView>;
}
export function Metric({ value, label, inverted = false }: { value: string; label: string; inverted?: boolean }) {
  const p = usePalette(); return <View style={{ flex: 1, minWidth: 100, gap: 4 }}><Text style={[s.metric, { color: inverted ? p.onHero : p.text }]}>{value}</Text><Caption color={inverted ? p.heroSecondary : undefined}>{label}</Caption></View>;
}
const s = StyleSheet.create({
  page: { padding: layout.gutter, gap: layout.section }, card: { borderRadius: layout.cardRadius, borderWidth: StyleSheet.hairlineWidth, padding: 24, gap: 16 },
  action: { minHeight: 56, borderRadius: layout.controlRadius, paddingHorizontal: 24, paddingVertical: 16, justifyContent: 'center', alignItems: 'center' }, compact: { minHeight: 44, paddingVertical: 12, paddingHorizontal: 16 },
  actionText: { ...typography.body, fontWeight: '600', textAlign: 'center' }, sectionTitle: { ...typography.title },
  caption: { ...typography.caption }, label: { ...typography.caption, fontWeight: '600' }, field: { gap: 8 },
  input: { ...typography.body, minHeight: 56, padding: 16, borderRadius: layout.controlRadius, borderWidth: 1 }, multiline: { minHeight: 112, textAlignVertical: 'top' },
  date: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  pills: { gap: 8 }, pill: { borderRadius: layout.controlRadius, paddingHorizontal: 16, paddingVertical: 12, minHeight: 44, justifyContent: 'center' },
  metric: { ...typography.title, fontVariant: ['tabular-nums'] },
  formFooter: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: layout.gutter, paddingTop: 16, gap: 12 },
});
