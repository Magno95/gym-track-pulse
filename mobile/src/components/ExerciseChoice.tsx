import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import type { ExerciseOverview } from '../data/exercises';
import { usePalette } from '../theme';
import { Action, Field, Caption } from './UI';
import { typography } from '../design';

export function ExerciseChoice({ exercises, value, onChange, label, disabled }: { exercises: ExerciseOverview[]; value: string; onChange: (value: string) => void; label: string; disabled?: boolean }) {
  const p = usePalette(); const [open, setOpen] = useState(!value); const [search, setSearch] = useState('');
  const current = exercises.find((exercise) => exercise.id === value);
  const matches = exercises.filter((exercise) => exercise.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <View style={{ gap: 12 }}><Caption>{label}</Caption>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${current?.name ?? 'Scegli un esercizio'}`}
      accessibilityState={{ disabled, expanded: open && !disabled }} disabled={disabled} onPress={() => setOpen(!open)}
      style={({ pressed }) => ({ backgroundColor: p.surface, borderColor: open && !disabled ? p.accent : p.inputBorder, borderWidth: 1,
        borderRadius: 16, padding: 16, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.65 : 1 })}>
      <Text style={{ ...typography.body, color: p.text, fontWeight: '600', flex: 1 }}>{current?.name ?? 'Scegli un esercizio'}</Text>
      {!disabled && <SymbolView name={open ? 'chevron.up' : 'chevron.down'} tintColor={p.secondary} style={{ width: 16, height: 16 }} />}
    </Pressable>
    {open && !disabled && <><Field label="Cerca esercizio" value={search} onChangeText={setSearch} autoCorrect={false} autoCapitalize="none" placeholder="Nome dell’esercizio" />
      <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 240, borderRadius: 16, backgroundColor: p.surface }}>
        {matches.map((exercise) => <Pressable key={exercise.id} accessibilityRole="button" accessibilityState={{ selected: exercise.id === value }}
          onPress={() => { onChange(exercise.id); setOpen(false); setSearch(''); }}
          style={({ pressed }) => ({ minHeight: 56, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 0.5, borderColor: p.separator, backgroundColor: exercise.id === value ? p.accentSoft : p.surface, opacity: pressed ? 0.65 : 1 })}>
          <Text style={{ ...typography.body, color: exercise.id === value ? p.accent : p.text, flex: 1 }}>{exercise.name}</Text>
          {exercise.id === value && <SymbolView name="checkmark" tintColor={p.accent} style={{ width: 20, height: 20 }} />}
        </Pressable>)}
      </ScrollView>
      {!matches.length && <View style={{ gap: 12 }}><Caption>Nessun esercizio con questo nome. Prova una ricerca diversa.</Caption>
        {!!search && <Action title="Cancella ricerca" variant="secondary" compact onPress={() => setSearch('')} />}</View>}
    </>}
  </View>;
}
