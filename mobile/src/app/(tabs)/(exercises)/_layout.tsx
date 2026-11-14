import { Stack } from 'expo-router';
import { usePalette } from '@/theme';

export default function ExercisesLayout() {
  const palette = usePalette();
  return <Stack screenOptions={{ headerTintColor: palette.text, contentStyle: { backgroundColor: palette.background } }}>
    <Stack.Screen name="index" options={{ title: 'Esercizi', headerLargeTitle: true }} />
    <Stack.Screen name="exercise/[id]" options={{ title: 'Esercizio', headerBackTitle: 'Esercizi' }} />
  </Stack>;
}
