import { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { PersistentImage as Image } from './PersistentImage';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { SwipeToDelete } from './SwipeToDelete';
import { formatDate, type ExerciseOverview, type WorkoutSession } from '../data/exercises';
import { exerciseImage } from '../exercise-images';
import { useWorkout } from '../workout';
import { usePalette } from '../theme';
import { typography } from '../design';

export function SessionRow({ session, exercise, showExercise = false, spacing, collapseGap }: { session: WorkoutSession; exercise: ExerciseOverview; showExercise?: boolean; spacing?: number; collapseGap?: number }) {
  const w = useWorkout(); const p = usePalette();
  const swiping = useRef(false);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const pendingImage = showExercise ? [...w.pending].reverse().find((op) => op.change.type === 'save_exercise' && op.change.exercise.id === exercise.id && op.change.image) : undefined;
  const localImage = pendingImage?.change.type === 'save_exercise' ? pendingImage.change.image?.uri : undefined;
  const image = localImage ? { uri: localImage } : exerciseImage(exercise);
  const imageKey = localImage ?? exercise.image_url ?? exercise.name;
  const label = showExercise ? exercise.name : formatDate(session.date);
  const deleteLabel = showExercise ? `Elimina ${exercise.name} dall’allenamento` : `Elimina sessione del ${formatDate(session.date)}`;
  function edit() {
    if (swiping.current) { swiping.current = false; return; }
    router.push({ pathname: '/session-form', params: { exerciseId: exercise.id, sessionId: session.id } });
  }
  function confirmRemoval() {
    return new Promise<boolean>((resolve) => Alert.alert(showExercise ? 'Eliminare l’esercizio dall’allenamento?' : 'Eliminare la sessione?',
      showExercise ? `Elimini le serie di ${exercise.name} da questo allenamento. L’eliminazione verrà sincronizzata anche sugli altri dispositivi.`
        : `${exercise.name} · ${formatDate(session.date)}. L’eliminazione verrà sincronizzata anche sugli altri dispositivi.`, [
      { text: 'Annulla', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Elimina', style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) }));
  }
  function remove() {
    try { w.enqueue({ type: 'delete_session', sessionId: session.id }); return true; }
    catch (error) { Alert.alert('Eliminazione non riuscita', error instanceof Error ? error.message : 'Riprova.'); return false; }
  }
  async function removeAfterConfirmation() { if (await confirmRemoval()) remove(); }
  // The swipe asks for confirmation once the card has left, then closes the row before the session is removed.
  return <SwipeToDelete confirm={confirmRemoval} onDelete={remove} spacing={spacing} collapseGap={collapseGap}
    onSwipeStart={() => { swiping.current = true; }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}, ${session.value.toLocaleString('it-IT')} punti, ${session.series} serie`}
        accessibilityHint={showExercise ? 'Apri e modifica le serie dell’esercizio. Scorri a sinistra per eliminarlo dall’allenamento.' : 'Apri e modifica la sessione. Scorri a sinistra per eliminare.'}
        accessibilityActions={[{ name: 'activate', label: showExercise ? 'Modifica esercizio' : 'Modifica sessione' }, { name: 'delete', label: deleteLabel }]}
        onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'delete') void removeAfterConfirmation(); else if (event.nativeEvent.actionName === 'activate') edit(); }}
        onPressIn={() => { swiping.current = false; }} onPress={edit}
        style={({ pressed }) => [s.row, { backgroundColor: pressed ? p.background : p.surface }]}>
        <View style={showExercise ? s.exerciseInformation : undefined}>
          {showExercise && <View style={[s.image, { backgroundColor: p.accentSoft }]}>
            {image && failedImage !== imageKey ? <Image source={image} style={s.thumbnail} onError={() => setFailedImage(imageKey)} accessibilityIgnoresInvertColors />
              : <SymbolView name="dumbbell.fill" tintColor={p.accent} style={s.placeholder} />}
          </View>}
          <View style={[s.information, showExercise && s.exerciseName]}><Text style={[s.date, { color: p.text }]}>{label}</Text>
            <Text style={[s.series, { color: p.secondary }]}>{session.series} {showExercise ? 'serie totali' : 'serie'}</Text></View>
        </View>
        <Text style={[s.score, { color: p.text }]}>{session.value.toLocaleString('it-IT', { maximumFractionDigits: 1 })}<Text style={[s.points, { color: p.secondary }]}> pt</Text></Text>
      </Pressable>
  </SwipeToDelete>;
}
const s = StyleSheet.create({
  row: { minHeight: 96, padding: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  exerciseInformation: { flexDirection: 'row', alignItems: 'center', gap: 12, flexGrow: 1, flexBasis: 160 },
  exerciseName: { flex: 1 },
  image: { width: 64, height: 80, borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  thumbnail: { width: '100%', height: '100%', resizeMode: 'cover' }, placeholder: { width: 30, height: 30 },
  information: { gap: 8 }, date: { ...typography.body, fontWeight: '600' }, series: { ...typography.caption },
  score: { ...typography.title, fontVariant: ['tabular-nums'], maxWidth: '100%' }, points: { ...typography.caption, fontWeight: '400', letterSpacing: 0 },
});
