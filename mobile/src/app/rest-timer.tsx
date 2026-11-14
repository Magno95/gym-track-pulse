import { useEffect } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useActiveSession, useNow } from '@/active-session';
import { Action, Caption } from '@/components/UI';
import { formatTimer } from '@/data/workout-run';
import { isRestTimerDismissal } from '@/data/rest-timer-navigation';
import { layout, typography } from '@/design';
import { usePalette } from '@/theme';

export default function TimerScreen() {
  const { notificationId } = useLocalSearchParams<{ notificationId: string }>();
  const navigation = useNavigation();
  const session = useActiveSession(); const p = usePalette(); const insets = useSafeAreaInsets();
  const cancelRest = session.cancelRest;
  const rest = session.active?.rest?.notificationId === notificationId ? session.active.rest : null;
  const now = useNow(!!rest);
  const remaining = rest ? Math.max(0, Math.ceil((rest.endsAt - now) / 1000)) : 0;

  useEffect(() => {
    if (!notificationId) return;
    // Observe completed removal without intercepting the native swipe gesture.
    const unsubscribe = navigation.addListener('removed', (event) => {
      if (!isRestTimerDismissal(event.data.action)) return;
      try { cancelRest(notificationId); }
      catch (error) { Alert.alert('Timer non annullato', error instanceof Error ? error.message : 'Riprova.'); }
    });
    // Expo Router emits `removed` after unmount, so keep listening through cleanup.
    return () => queueMicrotask(unsubscribe);
  }, [navigation, notificationId, cancelRest]);

  return <ScrollView style={{ flex: 1, backgroundColor: p.background }}
    contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) }]}>
    <View style={styles.timer}>
      <Text accessibilityRole="header" style={{ ...typography.title, color: p.text }}>Timer</Text>
      <Text accessibilityLabel={`${remaining} secondi rimanenti`} adjustsFontSizeToFit numberOfLines={1}
        style={[styles.digits, { color: remaining ? p.accent : p.positive }]}>{formatTimer(remaining)}</Text>
      <Text accessibilityLiveRegion="polite" style={{ ...typography.body, color: p.secondary, textAlign: 'center' }}>
        {remaining ? 'Timer in corso.' : 'Tempo scaduto.'}
      </Text>
    </View>
    <View style={{ gap: 16 }}>
      {session.notice && <Caption>{session.notice}</Caption>}
      <Caption>Abbassa la schermata per interrompere il timer.</Caption>
      <Action title={remaining ? 'Interrompi timer' : 'Torna alla sessione'} variant="secondary" onPress={() => router.back()} />
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, padding: layout.gutter, paddingTop: 32, gap: 32 },
  timer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 24, paddingVertical: 24 },
  digits: { ...typography.display, fontSize: 88, lineHeight: 104, width: '100%', textAlign: 'center' },
});
