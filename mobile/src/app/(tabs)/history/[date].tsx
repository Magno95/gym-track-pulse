import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useBottomTabBarHeight } from 'expo-router/js-tabs';
import { ScrollView, View } from 'react-native';
import { useWorkout } from '@/workout';
import { workoutDays } from '@/data/statistics';
import { formatDate } from '@/data/exercises';
import { isCalendarDate } from '@/domain';
import { Action, Caption, Metric, SectionTitle } from '@/components/UI';
import { WorkoutCard } from '@/components/WorkoutCard';
import { SyncBanner } from '@/components/SyncBanner';
import { ScreenState } from '@/components/ScreenState';
import { usePalette } from '@/theme';
import { useActiveSession } from '@/active-session';
import { elapsedSeconds, formatTimer } from '@/data/workout-run';
import { SummaryCard } from '@/components/SummaryCard';
import { useTabBarScroll } from '@/tab-bar-scroll';

export default function DayDetail() {
  const tabBarHeight = useBottomTabBarHeight();
  const onScroll = useTabBarScroll();
  const { date } = useLocalSearchParams<{ date: string }>();
  const w = useWorkout(); const p = usePalette();
  const { runs } = useActiveSession();
  if (!isCalendarDate(date)) return <ScreenState title="Data non valida" />;
  const day = workoutDays(w.data.exercises).find((day) => day.date === date);
  const run = runs.find((run) => run.date === date);
  const entries = w.data.exercises.flatMap((exercise) => exercise.sessions.filter((session) => session.date === date).map((session) => ({ exercise, session })));
  const grouped = [...new Set(entries.filter((entry) => entry.session.superset_id).map((entry) => entry.session.superset_id!))];
  return <><Stack.Screen options={{ title: formatDate(date) }} />
    <ScrollView onScroll={onScroll} scrollEventThrottle={16} style={{ backgroundColor: p.background }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: tabBarHeight + 30 }}>
      <SyncBanner /><View style={{ padding: 20, gap: 24 }}>
        <SummaryCard label="Il tuo allenamento" value={(day?.score ?? 0).toLocaleString('it-IT')} unit="pt" message={`${day?.count ?? 0} esercizi registrati in questa giornata`}>
          <View style={{ height: 1, backgroundColor: p.separator }} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24 }}><Metric value={String(day?.sets ?? 0)} label="Serie" /><Metric value={String(day?.reps ?? 0)} label="Ripetizioni" /></View>
          {!!day?.seconds && <Caption>{day.seconds} secondi a corpo libero</Caption>}
        </SummaryCard>
        <Action title="Aggiungi esercizio alla giornata" icon="plus" onPress={() => router.push({ pathname: '/session-form', params: { date } })} />
        {run && <Action title={run.endedAt === null ? 'Torna alla sessione in corso' : `Riepilogo sessione · ${formatTimer(elapsedSeconds(run))}`} variant="secondary" onPress={() => router.push({ pathname: '/workout-session', params: { date } })} />}
        {!!entries.length && run?.endedAt !== null && <Action title="Pubblica su Strava" variant="secondary" onPress={() => router.push({ pathname: '/strava', params: { date } })} />}
        {entries.filter((entry) => !entry.session.superset_id).map((entry) => <WorkoutCard key={entry.session.id} {...entry} showName />)}
        {grouped.map((id, i) => <View key={id} style={{ gap: 16 }}><SectionTitle>Superset {i + 1}</SectionTitle>
          {entries.filter((entry) => entry.session.superset_id === id).sort((a, b) => Number(a.session.is_superset_secondary) - Number(b.session.is_superset_secondary))
            .map((entry) => <WorkoutCard key={entry.session.id} {...entry} showName />)}
        </View>)}
        {!entries.length && <Caption>Nessun esercizio in questa giornata.</Caption>}
      </View>
    </ScrollView>
  </>;
}
