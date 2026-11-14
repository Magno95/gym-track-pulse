import { StyleSheet, Text, View } from 'react-native';
import type { WorkoutRun } from '../data/workout-run';
import { useWorkout } from '../workout';
import { usePalette } from '../theme';
import { Card } from './UI';
import { StartSession } from './StartSession';
import { typography } from '../design';

export function SessionHero({ onOpen }: { onOpen: (run: WorkoutRun) => void }) {
  const w = useWorkout(); const p = usePalette();
  return <Card style={{ backgroundColor: p.hero, borderColor: p.hero, minHeight: 320, justifyContent: 'space-between', gap: 32 }}>
    <View style={{ gap: 16 }}>
      <Text style={[s.eyebrow, { color: p.brand }]}>IL TUO ALLENAMENTO</Text>
      <Text accessibilityRole="header" style={[s.title, { color: p.onHero }]}>La tua sessione.</Text>
      <Text style={[s.description, { color: p.heroSecondary }]}>Un esercizio alla volta.{`\n`}Al tempo e ai recuperi pensiamo noi.</Text>
    </View>
    <StartSession disabled={w.loading} onOpen={onOpen} />
  </Card>;
}
const s = StyleSheet.create({
  eyebrow: { ...typography.caption, fontWeight: '600', letterSpacing: 1 },
  title: { ...typography.display },
  description: { ...typography.body },
});
