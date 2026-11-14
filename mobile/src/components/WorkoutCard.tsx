import { Alert, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Caption, Card } from './UI';
import { formatDate, type ExerciseOverview, type WorkoutSession } from '../data/exercises';
import { getSessionSets, isBodyweightSession, isTimedBodyweightSession } from '../domain';
import { useWorkout } from '../workout';
import { usePalette } from '../theme';
import { typography } from '../design';

export function WorkoutCard({ session, exercise, showName = false }: { session: WorkoutSession; exercise: ExerciseOverview; showName?: boolean }) {
  const w = useWorkout(); const p = usePalette(); const { fontScale } = useWindowDimensions();
  const timed = isTimedBodyweightSession(session); const bodyweight = isBodyweightSession(session);
  const unit = bodyweight ? 'kg totali' : exercise.unit === 'time' ? 's' : exercise.unit === 'distance' ? 'm' : 'kg';
  const sets = getSessionSets(session);
  const largeText = fontScale > 1.5;
  function remove() {
    Alert.alert('Eliminare la sessione?', `${exercise.name} · ${formatDate(session.date)}. Questa eliminazione verrà sincronizzata anche sugli altri dispositivi.`, [
      { text: 'Annulla', style: 'cancel' }, { text: 'Elimina', style: 'destructive', onPress: () => {
        try { w.enqueue({ type: 'delete_session', sessionId: session.id }); }
        catch (error) { Alert.alert('Eliminazione non riuscita', error instanceof Error ? error.message : 'Riprova.'); }
      } },
    ]);
  }
  return <Card style={{ gap: 24 }}>
    {showName && <Pressable accessibilityRole="button" accessibilityHint="Apri la schermata dell’esercizio" onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: exercise.id } })}
      style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
      <Text style={{ ...typography.body, fontWeight: '600', color: p.text }}>{exercise.name}</Text>
    </Pressable>}
    <View style={s.heading}>
      <View style={{ gap: 5, flexShrink: 1 }}><Text style={[s.date, { color: p.text }]}>{formatDate(session.date)}</Text><Caption>{sets.length} {sets.length === 1 ? 'serie registrata' : 'serie registrate'}</Caption></View>
      <View style={[s.scoreBadge, { backgroundColor: p.accentSoft }]}>
        <Text style={[s.score, { color: p.accent }]}>{session.value.toLocaleString('it-IT', { maximumFractionDigits: 1 })}<Text style={{ ...typography.caption }}> pt</Text></Text>
      </View>
    </View>
    <View>
      {!largeText && <View style={[s.tableRow, { paddingTop: 0, paddingBottom: 10 }]}>
        <Text style={[s.series, s.columnLabel, { color: p.secondary }]}>Serie</Text>
        <Text style={[s.cell, s.columnLabel, { color: p.secondary }]}>{timed ? 'Secondi' : 'Ripetizioni'}</Text>
        <Text style={[s.cell, s.columnLabel, { color: p.secondary }]}>{unit}</Text>
      </View>}
      {sets.map((set, i) => <View key={i} style={{ borderTopWidth: StyleSheet.hairlineWidth, borderColor: p.separator, paddingVertical: 12, gap: 6 }}>
        {largeText ? <View style={{ gap: 8 }}><Caption>Serie {i + 1}</Caption><Text style={[s.value, { color: p.text }]}>{set.reps} {timed ? 'secondi' : 'ripetizioni'} · {Number(set.weight).toLocaleString('it-IT')} {unit}</Text></View> : <View style={s.tableRow}>
          <View style={s.series}><View style={[s.seriesBadge, { backgroundColor: p.background }]}><Text style={{ color: p.secondary, fontSize: 14, fontWeight: '600' }}>{i + 1}</Text></View></View>
          <Text style={[s.cell, s.value, { color: p.text }]}>{set.reps}</Text>
          <Text style={[s.cell, s.value, { color: p.text }]}>{Number(set.weight).toLocaleString('it-IT')}</Text>
        </View>}
        {set.body_weight !== undefined && <Text style={[s.snapshot, { color: p.secondary }]}>{set.body_weight} kg corporei + {set.additional_weight ?? 0} kg aggiunti</Text>}
      </View>)}
    </View>
    {session.superset_id && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
      <SymbolView name="link" tintColor={p.accent} style={{ width: 16, height: 16 }} />
      <Text style={{ ...typography.caption, color: p.accent, fontWeight: '600', flexShrink: 1 }}>Superset{session.is_superset_secondary ? ` · ${session.value_multiplier.toFixed(2)}×` : ' · principale'}</Text>
    </View>}
    <View style={[s.actions, { borderTopColor: p.separator }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Modifica sessione del ${formatDate(session.date)}`} onPress={() => router.push({ pathname: '/session-form', params: { exerciseId: exercise.id, sessionId: session.id } })}
        style={({ pressed }) => [s.action, { opacity: pressed ? 0.5 : 1 }]}>
        <SymbolView name="pencil" tintColor={p.accent} style={s.actionIcon} /><Text style={[s.actionLabel, { color: p.accent }]}>Modifica</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Elimina sessione del ${formatDate(session.date)}`} onPress={remove}
        style={({ pressed }) => [s.action, { opacity: pressed ? 0.5 : 1 }]}>
        <SymbolView name="trash" tintColor={p.secondary} style={s.actionIcon} /><Text style={[s.actionLabel, { color: p.secondary }]}>Elimina</Text>
      </Pressable>
    </View>
  </Card>;
}
const s = StyleSheet.create({
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  date: { ...typography.body, fontWeight: '600' },
  scoreBadge: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 16 }, score: { ...typography.body, fontWeight: '600', fontVariant: ['tabular-nums'] },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, series: { width: 48 }, cell: { flex: 1, textAlign: 'right' },
  columnLabel: { ...typography.caption }, value: { ...typography.body, fontWeight: '600', fontVariant: ['tabular-nums'] },
  seriesBadge: { width: 32, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, snapshot: { ...typography.caption, textAlign: 'right' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, marginTop: -8, marginBottom: -8 },
  action: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }, actionIcon: { width: 16, height: 16 }, actionLabel: { ...typography.caption },
});
