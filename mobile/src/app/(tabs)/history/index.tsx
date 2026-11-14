import { useState } from 'react';
import { router, Stack } from 'expo-router';
import { useBottomTabBarHeight } from 'expo-router/js-tabs';
import { SymbolView } from 'expo-symbols';
import { Button, FlatList, Pressable, Text, View } from 'react-native';
import { useWorkout } from '@/workout';
import { workoutDays, weeklyFrequency } from '@/data/statistics';
import { formatDate } from '@/data/exercises';
import { Action, Caption, Card, Metric, Pills, SectionTitle } from '@/components/UI';
import { TrendChart } from '@/components/TrendChart';
import { SyncBanner } from '@/components/SyncBanner';
import { ScreenState } from '@/components/ScreenState';
import { usePalette } from '@/theme';
import { SummaryCard } from '@/components/SummaryCard';
import { typography } from '@/design';
import { useTabBarScroll } from '@/tab-bar-scroll';

export default function HistoryScreen() {
  const tabBarHeight = useBottomTabBarHeight();
  const onScroll = useTabBarScroll();
  const w = useWorkout(); const p = usePalette();
  const [tab, setTab] = useState('history'); const [visible, setVisible] = useState(30);
  const days = workoutDays(w.data.exercises);
  const score = days.reduce((sum, day) => sum + day.score, 0);
  const last = [...days].reverse().slice(-10);
  return <><Stack.Screen options={{ headerRight: () => <Button title="Registra" onPress={() => router.push('/session-form')} color={p.accent} /> }} />
    <FlatList data={tab === 'history' ? days.slice(0, visible) : []} keyExtractor={(day) => day.date}
      onScroll={onScroll} scrollEventThrottle={16}
      contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: tabBarHeight + 30 }} style={{ backgroundColor: p.background }}
      onEndReached={() => setVisible((count) => count + 30)}
      ListHeaderComponent={<><SyncBanner /><View style={{ padding: 20, gap: 24 }}>
        {!w.loading && <SummaryCard label="Il tuo impegno, nel tempo" value={String(days.length)} unit={days.length === 1 ? 'giornata' : 'giornate'}
          message={days.length ? 'Ogni allenamento aggiunge un passo al tuo percorso.' : 'Il tuo percorso prende forma, una sessione alla volta.'}>
          <View style={{ height: 1, backgroundColor: p.separator }} />
          <View style={{ flexDirection: 'row', gap: 24, flexWrap: 'wrap' }}><Metric value={score.toLocaleString('it-IT')} label="Punti complessivi" /><Metric value={days.reduce((sum, day) => sum + day.sets, 0).toLocaleString('it-IT')} label="Serie totali" /></View>
        </SummaryCard>}
        <Pills value={tab} onChange={setTab} items={[{ id: 'history', label: 'Cronologia' }, { id: 'stats', label: 'Statistiche' }]} />
        {tab === 'history' ? <SectionTitle>Le tue giornate</SectionTitle> : <>
          <Card><SectionTitle>Punteggio nel tempo</SectionTitle><TrendChart data={last.map((day) => ({ date: day.date, value: day.score }))} label="Punteggio" unit="pt" /></Card>
          <Card><SectionTitle>Frequenza settimanale</SectionTitle><TrendChart data={weeklyFrequency(w.data.exercises)} label="Allenamenti nella settimana" bars /></Card>
          <Card><SectionTitle>Esercizi per giornata</SectionTitle><TrendChart data={last.map((day) => ({ date: day.date, value: day.count }))} label="Esercizi registrati" bars /></Card>
        </>}
      </View></>}
      renderItem={({ item }) => <Pressable accessibilityRole="button"
        onPress={() => router.push({ pathname: '/history/[date]', params: { date: item.date } })}
        style={({ pressed }) => ({ marginHorizontal: 20, marginBottom: 12, padding: 24, borderRadius: 24, borderWidth: 0.5, borderColor: p.separator, backgroundColor: p.surface, opacity: pressed ? 0.6 : 1, gap: 12 })}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={{ ...typography.body, color: p.text, fontWeight: '600', flex: 1 }}>{formatDate(item.date)}</Text>
          <SymbolView name="chevron.right" tintColor={p.secondary} style={{ width: 12, height: 16 }} />
        </View>
        <Text style={{ ...typography.title, fontVariant: ['tabular-nums'], color: p.text }}>{item.score.toLocaleString('it-IT')}<Text style={{ ...typography.caption, color: p.secondary }}> pt</Text></Text>
        <Caption>{item.count} esercizi · {item.sets} serie · {item.reps} ripetizioni{item.seconds ? ` · ${item.seconds} s a corpo libero` : ''}</Caption>
      </Pressable>}
      ListEmptyComponent={tab === 'history' ? w.error && !w.data.updatedAt && !w.loading
        ? <ScreenState title="Allenamenti non disponibili" message="Controlla la connessione e riprova." onRetry={() => void w.retry()} />
        : <ScreenState title={w.loading ? 'Caricamento allenamenti' : 'Il primo allenamento ti aspetta'} loading={w.loading} icon="calendar"
          message={w.loading ? undefined : 'Inizia una sessione e registra le tue serie. Qui ritroverai ogni giornata.'}
          action={{ title: 'Vai alla sessione', onPress: () => router.navigate('/session') }} /> : undefined}
      ListFooterComponent={days.length && tab === 'history' ? <View style={{ padding: 20 }}><Action title="Registra un allenamento passato" variant="secondary" icon="calendar.badge.plus" onPress={() => router.push('/session-form')} /></View> : undefined} />
  </>;
}
