import { Pressable, Text, View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { useWorkout } from '../workout';
import { usePalette } from '../theme';
import { Caption } from './UI';
import { typography } from '../design';

export function SyncBanner({ inset = true }: { inset?: boolean }) {
  const state = useWorkout(); const p = usePalette();
  const [exportError, setExportError] = useState<string | null>(null);
  async function exportPending() {
    try {
      const file = new File(Paths.cache, `gymtrack-modifiche-${Date.now()}.json`);
      file.write(JSON.stringify({ userId: state.data.userId, exportedAt: new Date().toISOString(), operations: state.pending }, null, 2));
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Salva le modifiche in attesa' });
      setExportError(null);
    } catch { setExportError('Esportazione non riuscita. Riprova.'); }
  }
  if (state.online && !state.pending.length && !state.error && !exportError) return null;
  return <View style={{ marginHorizontal: inset ? 20 : 0, marginVertical: inset ? 12 : 0, backgroundColor: p.surface, borderRadius: 24, borderWidth: 0.5, borderColor: p.separator, padding: 16, gap: 8 }}>
    <Text accessibilityLiveRegion="polite" style={{ ...typography.body, color: p.text, fontWeight: '600' }}>{!state.online ? 'Sei offline' : state.syncing ? 'Sincronizzazione in corso' : state.pending.length ? `${state.pending.length} ${state.pending.length === 1 ? 'modifica' : 'modifiche'} in attesa` : 'Aggiornamento non riuscito'}</Text>
    <Caption>{state.error ?? (!state.online ? 'Puoi continuare ad allenarti. Le modifiche restano su questo iPhone.' : 'I dati sono salvati su questo iPhone e saranno sincronizzati.')}</Caption>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 24, rowGap: 8 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: !state.online || state.syncing }} disabled={!state.online || state.syncing} onPress={() => void state.retry()} style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', opacity: !state.online || state.syncing ? 0.45 : pressed ? 0.6 : 1 })}><Text style={{ ...typography.caption, color: p.accent }}>Riprova</Text></Pressable>
      {!!state.pending.length && <Pressable accessibilityRole="button" onPress={() => void exportPending()} style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}><Text style={{ ...typography.caption, color: p.accent }}>Esporta modifiche</Text></Pressable>}
    </View>
    {exportError && <Caption danger>{exportError}</Caption>}
  </View>;
}
