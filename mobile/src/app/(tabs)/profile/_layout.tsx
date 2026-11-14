import { Stack } from 'expo-router';
import { usePalette } from '@/theme';

export default function ProfileLayout() {
  const palette = usePalette();
  return <Stack screenOptions={{ headerTintColor: palette.text, contentStyle: { backgroundColor: palette.background } }}>
    <Stack.Screen name="index" options={{ title: 'Profilo', headerLargeTitle: true }} />
  </Stack>;
}
