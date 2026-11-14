import { useEffect, useState, type PropsWithChildren } from 'react';
import { AccessibilityInfo, View, type ColorValue, type StyleProp, type ViewStyle } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { usePalette } from '../theme';

export function GlassSurface({ children, style, tintColor }: PropsWithChildren<{ style?: StyleProp<ViewStyle>; tintColor?: ColorValue }>) {
  const palette = usePalette();
  // Start opaque until the accessibility preference is known.
  const [reduceTransparency, setReduceTransparency] = useState(true);
  useEffect(() => {
    let active = true;
    const subscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduceTransparency);
    void AccessibilityInfo.isReduceTransparencyEnabled().then((value) => { if (active) setReduceTransparency(value); });
    return () => { active = false; subscription.remove(); };
  }, []);
  if (!reduceTransparency && isLiquidGlassAvailable() && isGlassEffectAPIAvailable()) {
    return <GlassView glassEffectStyle="regular" tintColor={tintColor} style={style}>{children}</GlassView>;
  }
  return <View style={[{ backgroundColor: tintColor ?? palette.surface }, style]}>{children}</View>;
}
