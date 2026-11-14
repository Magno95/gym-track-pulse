import { StyleSheet, Text, View } from 'react-native';
import type { DraftSet } from '@/data/actions';
import type { ExerciseOverview, WorkoutSession } from '@/data/exercises';
import { formatDate } from '@/data/exercises';
import { bodyWeightForEdit, isBodyweightSession, isTimedBodyweightSession } from '@/domain';
import { Card, Caption } from '@/components/UI';
import { typography } from '@/design';
import { usePalette } from '@/theme';

export function SessionComparisonSummary({ current, date, previous, comparing }: {
  current: { series: number; score: number | null }; date: string; previous: WorkoutSession | null; comparing: boolean;
}) {
  const p = usePalette();
  const bodyWeight = previous && isBodyweightSession(previous) ? bodyWeightForEdit(previous, previous.date, []) : null;
  return <Card style={[styles.summary, { backgroundColor: p.hero, borderColor: p.hero }]}>
    <View style={styles.column}>
      {comparing && <View style={styles.sessionHeading}>
        <Text style={[styles.heading, { color: p.onHero }]}>Attuale</Text>
        <Caption color={p.heroSecondary}>{formatDate(date)}</Caption>
      </View>}
      <View style={[styles.metrics, comparing && styles.stackedMetrics]}>
        <View style={styles.metric}>
          <Text style={[comparing ? styles.series : styles.score, { color: comparing ? p.heroSecondary : p.onHero }]}>{current.series}{comparing ? ' serie' : ''}</Text>
          {!comparing && <Caption color={p.heroSecondary}>Serie totali</Caption>}
        </View>
        <View style={styles.metric}>
          <Text style={[styles.score, { color: p.onHero }]}>{current.score === null ? '—' : `${current.score.toLocaleString('it-IT')} pt`}</Text>
          {!comparing && <Caption color={p.heroSecondary}>Punteggio</Caption>}
        </View>
      </View>
    </View>
    {comparing && previous && <View style={[styles.column, styles.previous]}>
      <Text style={[styles.heading, { color: p.onHero }]}>Precedente</Text>
      <Caption color={p.heroSecondary}>{formatDate(previous.date)}</Caption>
      <Text style={[styles.score, styles.previousScore, { color: p.onHero }]}>{previous.value.toLocaleString('it-IT')} pt</Text>
      <Caption color={p.heroSecondary}>{previous.series} serie</Caption>
      {bodyWeight !== null && <Caption color={p.heroSecondary}>{bodyWeight.toLocaleString('it-IT')} kg corporei</Caption>}
    </View>}
  </Card>;
}

export function PreviousSetCard({ set, index, session, unit }: {
  set?: DraftSet; index: number; session: WorkoutSession; unit: ExerciseOverview['unit'];
}) {
  const p = usePalette();
  const bodyweight = isBodyweightSession(session);
  const repsLabel = isTimedBodyweightSession(session) ? 's' : 'Rip.';
  const weightLabel = bodyweight ? '+ kg' : unit === 'time' ? 's' : unit === 'distance' ? 'm' : 'kg';
  return <Card style={[styles.set, { backgroundColor: p.background }]}>
    <Text style={[styles.heading, { color: p.text }]}>SERIE {index + 1}</Text>
    {set ? <View style={styles.values}>
      {[{ label: repsLabel, value: set.reps }, { label: weightLabel, value: set.weight }].map(({ label, value }) =>
        <View key={label} style={styles.value}>
          <Text style={[styles.heading, { color: p.text }]}>{label}</Text>
          <View style={[styles.readOnlyValue, { backgroundColor: p.surface }]}>
            <Text style={[styles.number, { color: p.text }]}>{Number(value).toLocaleString('it-IT')}</Text>
          </View>
        </View>)}
    </View> : <Caption>Nessuna serie</Caption>}
  </Card>;
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', padding: 16, gap: 12 },
  column: { flexGrow: 1, flexShrink: 1, flexBasis: 0, width: 0, minWidth: 0, gap: 4 },
  sessionHeading: { gap: 4 },
  metrics: { flexDirection: 'row', gap: 12 },
  stackedMetrics: { flexDirection: 'column-reverse', marginTop: 8, gap: 4 },
  metric: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, gap: 4 },
  heading: { ...typography.caption, fontWeight: '600' },
  score: { ...typography.title, fontVariant: ['tabular-nums'] },
  series: { ...typography.caption, fontVariant: ['tabular-nums'] },
  previous: { opacity: 0.78 },
  previousScore: { marginTop: 8 },
  set: { flexGrow: 1, minHeight: 124, padding: 12, gap: 8, opacity: 0.78 },
  values: { flexDirection: 'row', gap: 8 },
  value: { flexGrow: 1, flexShrink: 1, flexBasis: 0, width: 0, minWidth: 0, gap: 8 },
  readOnlyValue: { minHeight: 44, borderRadius: 12, padding: 4, justifyContent: 'center', alignItems: 'center' },
  number: { ...typography.body, fontVariant: ['tabular-nums'], textAlign: 'center' },
});
