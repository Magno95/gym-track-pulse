import { useContext, useMemo, useState } from 'react';
import { useWorkout } from '@/workout';
import { SyncBanner } from '@/components/SyncBanner';
import { router } from 'expo-router';
import { BottomTabBarHeightContext } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { Pressable, ScrollView, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { categories, exerciseSections, type ExerciseOverview } from '@/data/exercises';
import { ExerciseRow } from '@/components/ExerciseRow';
import { ScreenState } from '@/components/ScreenState';
import { usePalette } from '@/theme';
import { Action } from '@/components/UI';
import { typography } from '@/design';
import { useTabBarScroll } from '@/tab-bar-scroll';

export function ExerciseList({ onSelect }: { onSelect?: (exercise: ExerciseOverview) => void }) {
  const palette = usePalette();
  const onScroll = useTabBarScroll();
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const insets = useSafeAreaInsets();
  const workout = useWorkout();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const exercises = workout.data.exercises;
  const sections = useMemo(() => exerciseSections(exercises, search, category), [exercises, search, category]);
  const count = exercises.length;
  return <>
    <SectionList sections={sections} keyExtractor={(item) => item.id} renderItem={({ item }) => <ExerciseRow exercise={item} onPress={onSelect ? () => onSelect(item) : undefined} />}
      onScroll={onScroll} scrollEventThrottle={16}
      style={{ backgroundColor: palette.background }} contentInsetAdjustmentBehavior="automatic" keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets
      contentContainerStyle={{ paddingBottom: Math.max(tabBarHeight, insets.bottom) + 28 }} stickySectionHeadersEnabled={false}
      renderSectionHeader={({ section }) => <Text accessibilityRole="header" style={[styles.section, { color: palette.secondary }]}>{section.title}</Text>}
      ListHeaderComponent={<View>
        <View style={[styles.search, { backgroundColor: palette.surface }]}>
          <SymbolView name="magnifyingglass" tintColor={palette.secondary} style={styles.searchIcon} />
          <TextInput accessibilityLabel="Cerca un esercizio" placeholder="Cerca un esercizio"
            value={search} onChangeText={setSearch} autoCapitalize="none" autoCorrect={false} returnKeyType="search"
            placeholderTextColor={palette.secondary} selectionColor={palette.accent} underlineColorAndroid="transparent"
            style={[styles.searchInput, { color: palette.text }]} />
          {!!search && <Pressable accessibilityRole="button" accessibilityLabel="Cancella ricerca" onPress={() => setSearch('')}
            style={({ pressed }) => [styles.clearSearch, { opacity: pressed ? 0.65 : 1 }]}>
            <SymbolView name="xmark.circle.fill" tintColor={palette.secondary} style={styles.searchIcon} />
          </Pressable>}
        </View>
        <SyncBanner />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {[{ id: null, label: 'Tutti' }, ...categories].map((item) => <Pressable key={item.id ?? 'all'}
            accessibilityRole="button" accessibilityState={{ selected: category === item.id }}
            onPress={() => setCategory(item.id)} style={({ pressed }) => [styles.filter, {
              backgroundColor: category === item.id ? palette.accentSoft : palette.surface,
              borderColor: category === item.id ? palette.accent : palette.separator, opacity: pressed ? 0.65 : 1,
            }]}><Text style={[styles.filterText, { color: category === item.id ? palette.accent : palette.secondary }]}>{item.label}</Text></Pressable>)}
        </ScrollView>
        {!workout.loading && !!count && <Text accessibilityLiveRegion="polite" style={[styles.results, { color: palette.secondary }]}>
          {sections.reduce((sum, section) => sum + section.data.length, 0)} esercizi{search || category ? ' trovati' : ' nella tua libreria'}
        </Text>}
      </View>}
      ListEmptyComponent={workout.loading ? <ScreenState title="Carichiamo i tuoi esercizi" loading />
        : workout.error && !workout.data.updatedAt ? <ScreenState title="Esercizi non disponibili" message="Controlla la connessione e riprova." onRetry={() => void workout.retry()} />
          : <ScreenState title={count ? 'Nessun risultato' : 'Il tuo percorso inizia qui'}
            icon={count ? 'magnifyingglass' : 'dumbbell'}
            message={count ? 'Prova un altro nome o torna a tutti i gruppi muscolari.' : 'Crea la tua libreria: scegli un nome, un gruppo muscolare e come misurare i progressi.'}
            action={count ? { title: 'Mostra tutti gli esercizi', onPress: () => { setSearch(''); setCategory(null); } }
              : { title: 'Crea il primo esercizio', onPress: () => router.push('/exercise-form') }} />}
      ListFooterComponent={sections.length ? <View style={{ padding: 20 }}><Action title="Aggiungi esercizio" icon="plus" variant="secondary" onPress={() => router.push('/exercise-form')} /></View> : undefined}
    />
  </>;
}
const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginTop: 4, marginBottom: 16, paddingLeft: 16, paddingRight: 4, borderRadius: 16, minHeight: 56, gap: 12 },
  searchIcon: { width: 20, height: 20 }, searchInput: { ...typography.body, flex: 1, minWidth: 0, minHeight: 56, paddingVertical: 12 },
  clearSearch: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  filters: { paddingHorizontal: 20, gap: 8, paddingBottom: 8 }, filter: { minHeight: 44, paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'center', borderRadius: 16, borderWidth: 1 },
  filterText: { ...typography.caption, fontWeight: '600' }, section: { ...typography.body, marginHorizontal: 24, marginTop: 24, marginBottom: 12, fontWeight: '600' },
  results: { ...typography.caption, marginHorizontal: 24, marginTop: 8 },
});
