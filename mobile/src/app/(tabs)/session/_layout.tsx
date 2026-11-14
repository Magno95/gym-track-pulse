import { Stack } from 'expo-router';
import { usePalette } from '@/theme';

export default function SessionLayout() {
  const p = usePalette();
  return <Stack screenOptions={{ headerTintColor: p.text, contentStyle: { backgroundColor: p.background } }}>
    <Stack.Screen name="index" options={{
      title: 'Sessione',
      headerLargeTitleEnabled: true,
    }} />
  </Stack>;
}
