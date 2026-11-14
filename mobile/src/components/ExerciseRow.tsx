import { useState } from 'react';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PersistentImage as Image } from './PersistentImage';
import { type ExerciseOverview, latestSession, sessionSummary, formatDate } from '../data/exercises';
import { exerciseImage } from '../exercise-images';
import { usePalette } from '../theme';
import { useWorkout } from '../workout';
import { typography } from '../design';

export function ExerciseRow({ exercise, onPress }: { exercise: ExerciseOverview; onPress?: () => void }) {
  const palette = usePalette();
  const session = latestSession(exercise.sessions);
  const previous = session ? latestSession(exercise.sessions.filter((item) => item.id !== session.id)) : null;
  const improvement = session && previous?.value ? (session.value - previous.value) / previous.value * 100 : null;
  const workout = useWorkout();
  const pendingImage = [...workout.pending].reverse().find((op) => op.change.type === 'save_exercise' && op.change.exercise.id === exercise.id && op.change.image);
  const localImage = pendingImage?.change.type === 'save_exercise' ? pendingImage.change.image?.uri : undefined;
  const image = localImage ? { uri: localImage } : exerciseImage(exercise);
  const imageKey = localImage ?? exercise.image_url ?? exercise.name;
  const [failedImage, setFailedImage] = useState<string | null>(null);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${exercise.name}${session ? `, ${sessionSummary(session, exercise)}` : ', nessun allenamento'}`}
      accessibilityHint={onPress ? 'Registra serie, ripetizioni e peso' : 'Apri la schermata dell’esercizio'}
      onPress={onPress ?? (() => router.push({ pathname: '/exercise/[id]', params: { id: exercise.id } }))}
      style={({ pressed }) => [styles.row, { backgroundColor: palette.surface, opacity: pressed ? 0.65 : 1 }]}>
      <View style={[styles.image, { backgroundColor: palette.accentSoft }]}>
        {image && failedImage !== imageKey ? <Image source={image} onError={() => setFailedImage(imageKey)} style={styles.thumbnail} accessibilityIgnoresInvertColors />
          : <SymbolView name="dumbbell.fill" tintColor={palette.accent} style={styles.symbol} />}
      </View>
      <View style={styles.content}>
        <Text style={[styles.name, { color: palette.text }]}>{exercise.name}</Text>
        {exercise.is_bodyweight && <Text style={[styles.bodyweight, { color: palette.accent }]}>Corpo libero{exercise.unit === 'time' ? ' · a tempo' : ''}</Text>}
        <Text style={[styles.summary, { color: palette.secondary }]}>{session ? sessionSummary(session, exercise) : 'Il primo allenamento ti aspetta'}</Text>
        {session && <Text style={[styles.date, { color: palette.secondary }]}>{formatDate(session.date)}</Text>}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 12, maxWidth: 64 }}>
        <SymbolView name="chevron.right" tintColor={palette.secondary} style={styles.chevron} />
        {improvement !== null && <Text style={{ ...typography.caption, color: improvement >= 0 ? palette.positive : palette.secondary, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{improvement > 0 ? '+' : ''}{improvement.toLocaleString('it-IT', { maximumFractionDigits: 1 })}%</Text>}
      </View>
    </Pressable>;
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 24, marginHorizontal: 20, marginBottom: 12, minHeight: 112 },
  image: { width: 64, height: 80, borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  thumbnail: { width: '100%', height: '100%', resizeMode: 'cover' }, symbol: { width: 30, height: 30 },
  content: { flex: 1, gap: 4 }, name: { ...typography.body, fontWeight: '600' },
  bodyweight: { ...typography.caption }, summary: { ...typography.caption }, date: { ...typography.caption },
  chevron: { width: 10, height: 14 },
});
