import { Button } from 'react-native';
import { router, Stack } from 'expo-router';
import { ExerciseList } from '@/components/ExerciseList';
import { usePalette } from '@/theme';

export default function ExercisesScreen() {
  const palette = usePalette();
  return <>
    <Stack.Screen options={{ headerRight: () => <Button title="Aggiungi" onPress={() => router.push('/exercise-form')} color={palette.accent} /> }} />
    <ExerciseList />
  </>;
}
