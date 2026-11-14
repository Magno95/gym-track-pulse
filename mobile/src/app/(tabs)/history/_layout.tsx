import { Stack } from 'expo-router';
import { usePalette } from '@/theme';
export default function HistoryLayout() {
  const p = usePalette();
  return <Stack screenOptions={{ headerTintColor: p.text, contentStyle: { backgroundColor: p.background } }}>
    <Stack.Screen name="index" options={{ title: 'Allenamenti', headerLargeTitle: true }} />
    <Stack.Screen name="[date]" options={{ title: 'Riepilogo', headerBackTitle: 'Allenamenti' }} />
  </Stack>;
}
