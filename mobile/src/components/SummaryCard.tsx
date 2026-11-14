import type { PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { usePalette } from '../theme';
import { typography } from '../design';
import { Card } from './UI';

export function SummaryCard({ label, value, unit, message, children }: PropsWithChildren<{
  label: string; value: string; unit?: string; message: string;
}>) {
  const p = usePalette();
  return <Card style={{ gap: 24 }}>
    <View style={{ gap: 8 }}>
      <Text style={[s.label, { color: p.secondary }]}>{label}</Text>
      <Text style={[s.value, { color: p.text }]}>{value}{unit && <Text style={[s.unit, { color: p.secondary }]}> {unit}</Text>}</Text>
      <Text style={[s.message, { color: p.secondary }]}>{message}</Text>
    </View>
    {children}
  </Card>;
}

const s = StyleSheet.create({
  label: { ...typography.caption, fontWeight: '600' },
  value: { ...typography.display }, unit: { ...typography.body, fontWeight: '400', letterSpacing: 0 },
  message: { ...typography.caption },
});
