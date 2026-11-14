import { useState } from 'react';
import { Button as NativeButton, Host } from '@expo/ui/swift-ui';
import { buttonStyle, controlSize, disabled, tint } from '@expo/ui/swift-ui/modifiers';
import { Button, FlatList, Pressable, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { useBottomTabBarHeight } from 'expo-router/js-tabs';
import { useAuth } from '@/auth';
import { useWorkout } from '@/workout';
import { formatDate } from '@/data/exercises';
import { findBodyWeight, todayLocal } from '@/domain';
import { getSupabase } from '@/supabase';
import { usePalette } from '@/theme';
import { Action, Caption, Card, Metric, SectionTitle } from '@/components/UI';
import { SyncBanner } from '@/components/SyncBanner';
import { TrendChart } from '@/components/TrendChart';
import { SummaryCard } from '@/components/SummaryCard';
import { ScreenState } from '@/components/ScreenState';
import { typography } from '@/design';
import { useTabBarScroll } from '@/tab-bar-scroll';

export default function ProfileScreen() {
  const tabBarHeight = useBottomTabBarHeight();
  const onScroll = useTabBarScroll();
  const p = usePalette(); const w = useWorkout(); const { session } = useAuth();
  const [signingOut, setSigningOut] = useState(false); const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(30);
  const weight = findBodyWeight(w.data.measurements, todayLocal());
  const height = w.data.profile?.height_cm;
  const bmi = weight && height ? weight / ((height / 100) ** 2) : null;
  const difference = weight !== null && w.data.measurements.length ? weight - w.data.measurements[0].weight_kg : null;
  async function signOut() {
    if (signingOut) return;
    setSigningOut(true); setError(null);
    try { const { error } = await getSupabase().auth.signOut({ scope: 'local' }); if (error) throw error; }
    catch { setError('Non riusciamo a uscire dal tuo account. Riprova.'); }
    finally { setSigningOut(false); }
  }
  return <><Stack.Screen options={{ headerRight: () => <Button title="Pesati" onPress={() => router.push('/measurement-form')} color={p.accent} /> }} />
    <FlatList data={[...w.data.measurements].reverse().slice(0, visible)} keyExtractor={(item) => item.id} onEndReached={() => setVisible((count) => count + 30)}
      onScroll={onScroll} scrollEventThrottle={16}
      contentInsetAdjustmentBehavior="automatic" style={{ backgroundColor: p.background }} contentContainerStyle={{ paddingBottom: tabBarHeight + 30 }}
      ListHeaderComponent={<><SyncBanner /><View style={{ padding: 20, gap: 24 }}>
        <Caption>{session!.user.email}</Caption>
        <SummaryCard label="Il tuo peso attuale" value={weight === null ? '—' : weight.toLocaleString('it-IT')} unit="kg"
          message={difference !== null ? `${difference >= 0 ? '+' : ''}${difference.toLocaleString('it-IT', { maximumFractionDigits: 2 })} kg dalla prima misurazione` : 'Registra una misurazione per iniziare a seguire il tuo andamento.'}>
          <Action title="Registra il peso" icon="plus" onPress={() => router.push('/measurement-form')} />
        </SummaryCard>
        <Card><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24 }}><Metric value={height ? `${height} cm` : '—'} label="Altezza" /><Metric value={bmi ? bmi.toLocaleString('it-IT', { maximumFractionDigits: 1 }) : '—'} label="Indice di massa corporea" /></View>
          <Action title="Modifica altezza" variant="secondary" compact onPress={() => router.push({ pathname: '/measurement-form', params: { mode: 'height' } })} /></Card>
        {!!w.data.measurements.length && <Card><SectionTitle>Il peso nel tempo</SectionTitle><TrendChart data={w.data.measurements.map((item) => ({ date: item.effective_date, value: Number(item.weight_kg) }))} label="Peso corporeo" unit="kg" /></Card>}
        <SectionTitle>Le tue misurazioni</SectionTitle>
      </View></>}
      renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Modifica peso del ${formatDate(item.effective_date)}`}
        onPress={() => router.push({ pathname: '/measurement-form', params: { date: item.effective_date } })}
        style={({ pressed }) => ({ marginHorizontal: 20, marginBottom: 8, backgroundColor: p.surface, padding: 24, borderRadius: 24, borderWidth: 0.5, borderColor: p.separator, flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', opacity: pressed ? 0.6 : 1 })}>
        <Text style={{ ...typography.body, color: p.secondary }}>{formatDate(item.effective_date)}</Text><Text style={{ ...typography.body, fontVariant: ['tabular-nums'], color: p.text, fontWeight: '600' }}>{Number(item.weight_kg).toLocaleString('it-IT')} kg</Text>
      </Pressable>}
      ListEmptyComponent={<ScreenState title={w.loading ? 'Caricamento misurazioni' : 'Il tuo punto di partenza'} loading={w.loading} icon="scalemass"
        message="Il peso registrato ti aiuta a seguire i progressi e viene usato negli esercizi a corpo libero." />}
      ListFooterComponent={<View style={{ padding: 20, gap: 24 }}><SectionTitle>Il tuo account</SectionTitle><Caption>{w.pending.length ? 'Le modifiche in attesa resteranno su questo iPhone, separate per account, e saranno disponibili al prossimo accesso.' : 'I tuoi progressi ti seguono, anche quando cambi dispositivo.'}</Caption>
        <Host matchContents={{ vertical: true }} style={{ width: '100%' }}><NativeButton label={signingOut ? 'Uscita in corso…' : 'Esci da questo iPhone'} systemImage="rectangle.portrait.and.arrow.right"
          onPress={() => void signOut()} modifiers={[buttonStyle('bordered'), controlSize('large'), tint(p.danger), disabled(signingOut)]} /></Host>
        {error && <Caption danger>{error}</Caption>}
      </View>} />
  </>;
}
