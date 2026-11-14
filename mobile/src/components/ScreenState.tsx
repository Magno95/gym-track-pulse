import type { ComponentProps } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { usePalette } from '../theme';
import { typography } from '../design';
import { Action } from './UI';

export function ScreenState({ title, message, loading, onRetry, action, icon = 'dumbbell' }: {
  title: string; message?: string; loading?: boolean; onRetry?: () => void;
  action?: { title: string; onPress: () => void }; icon?: ComponentProps<typeof SymbolView>['name'];
}) {
  const palette = usePalette();
  return <View style={[styles.container, { backgroundColor: palette.background }]}>
    <View style={[styles.icon, { backgroundColor: palette.accentSoft }]}>
      {loading ? <ActivityIndicator size="large" color={palette.accent} accessibilityLabel="Caricamento" />
        : <SymbolView name={onRetry ? 'arrow.clockwise' : icon} tintColor={palette.accent} style={{ width: 28, height: 28 }} />}
    </View>
    <Text accessibilityRole="header" style={[styles.title, { color: palette.text }]}>{title}</Text>
    {message && <Text style={[styles.message, { color: palette.secondary }]}>{message}</Text>}
    {!loading && (onRetry || action) && <View style={{ alignSelf: 'stretch', maxWidth: 340, width: '100%' }}>
      <Action title={onRetry ? 'Riprova' : action!.title} onPress={onRetry ?? action!.onPress} variant="secondary" />
    </View>}
  </View>;
}
const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 280, padding: 24, alignItems: 'center', justifyContent: 'center', gap: 16 },
  icon: { width: 64, height: 64, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  title: { ...typography.title, textAlign: 'center', maxWidth: 340 },
  message: { ...typography.body, textAlign: 'center', maxWidth: 340 },
});
