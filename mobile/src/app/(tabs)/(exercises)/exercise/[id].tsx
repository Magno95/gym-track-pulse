import { useCallback, useState } from 'react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useBottomTabBarHeight } from 'expo-router/js-tabs';
import { Alert, Animated, FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { PersistentImage as Image } from '@/components/PersistentImage';
import { SymbolView } from 'expo-symbols';
import { useWorkout } from '@/workout';
import { categoryLabel, formatDate, latestSession, sessionSummary } from '@/data/exercises';
import { personalRecords } from '@/data/model';
import { Action, Caption, Card, Pills, SectionTitle } from '@/components/UI';
import { SessionRow } from '@/components/SessionRow';
import { TrendChart } from '@/components/TrendChart';
import { SyncBanner } from '@/components/SyncBanner';
import { ScreenState } from '@/components/ScreenState';
import { usePalette } from '@/theme';
import { exerciseImage } from '@/exercise-images';
import { ExerciseNavigation } from '@/components/ExerciseNavigation';
import { exerciseSection, type ExerciseSection } from '@/exercise-navigation';
import { exercisePages, useExercisePager } from '@/hooks/useExercisePager';
import { typography } from '@/design';
import { useTabBarScroll } from '@/tab-bar-scroll';

const periods = [{ id: '30', label: '30 giorni' }, { id: '90', label: '90 giorni' }, { id: 'all', label: 'Tutto' }];
const number = (value: number) => value.toLocaleString('it-IT', { maximumFractionDigits: 1 });

export default function ExerciseDetail() {
  const { id, section: requestedSection } = useLocalSearchParams<{ id: string; section?: string }>();
  const activeSection = exerciseSection(requestedSection);
  const w = useWorkout(); const p = usePalette();
  const tabBarHeight = useBottomTabBarHeight();
  const onScroll = useTabBarScroll(`${id}:${activeSection}`);
  const { fontScale } = useWindowDimensions();
  const [period, setPeriod] = useState('all'); const [visible, setVisible] = useState(30);
  const commitSection = useCallback((value: ExerciseSection) => { router.setParams({ section: value }); }, []);
  const pager = useExercisePager(id, activeSection, commitSection);
  const select = pager.select;
  const exercise = w.data.exercises.find((item) => item.id === id);
  if (w.loading) return <ScreenState title="Carichiamo i tuoi allenamenti" loading />;
  if (!exercise) return <ScreenState title="Esercizio non disponibile" message="Potrebbe essere stato eliminato da un altro dispositivo." />;
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - Number(period));
  const sessions = exercise.sessions.filter((session) => period === 'all' || new Date(`${session.date}T12:00:00`) >= cutoff);
  const newestFirst = [...sessions].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const total = sessions.reduce((sum, session) => sum + session.value, 0);
  const best = Math.max(0, ...sessions.map((session) => session.value));
  const records = personalRecords(exercise.personal_records);
  const latest = latestSession(exercise.sessions);
  const index = w.data.exercises.findIndex((item) => item.id === id);
  const image = exerciseImage(exercise);
  const unit = exercise.unit === 'time' ? 'Tempo · secondi' : exercise.unit === 'distance' ? 'Distanza · metri' : 'Peso · kg';
  const edit = () => router.push({ pathname: '/exercise-form', params: { id } });
  function remove() {
    Alert.alert('Eliminare l’esercizio?', `${exercise!.name} e tutti i suoi allenamenti saranno eliminati anche sugli altri dispositivi.`, [
      { text: 'Annulla', style: 'cancel' }, { text: 'Elimina', style: 'destructive', onPress: () => {
        try { w.enqueue({ type: 'delete_exercise', exerciseId: id, imageUrl: exercise!.image_url }); router.back(); }
        catch (error) { Alert.alert('Eliminazione non riuscita', error instanceof Error ? error.message : 'Riprova.'); }
      } },
    ]);
  }
  return <>
    <Stack.Screen options={{ title: 'Esercizio', headerLargeTitle: false, headerTransparent: false, headerShadowVisible: false,
      // All horizontal gestures follow the local direction, including Details -> list.
      fullScreenGestureEnabled: false, gestureEnabled: false,
      headerStyle: { backgroundColor: p.background }, headerTitleStyle: { color: p.text },
      headerRight: () => <Pressable accessibilityRole="button" accessibilityLabel="Modifica esercizio" onPress={edit}
        style={({ pressed }) => ({ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}>
        <SymbolView name="square.and.pencil" tintColor={p.accent} style={{ width: 22, height: 22 }} />
      </Pressable> }} />
    <View {...pager.panHandlers} style={[s.screen, { backgroundColor: p.background }]}>
      <ExerciseNavigation section={activeSection} progress={pager.progress} onSelect={select} />
      <View style={s.viewport}>
      <Animated.View style={[s.track, { width: pager.width * 3, transform: [{ translateX: pager.offset }] }]}>
      {exercisePages.map((section) => <View key={`${id}:${section}`} style={{ width: pager.width, height: '100%' }}
        pointerEvents={section === activeSection ? 'auto' : 'none'} accessibilityElementsHidden={section !== activeSection}
        importantForAccessibility={section === activeSection ? 'auto' : 'no-hide-descendants'}>
      <FlatList key={`${id}:${section}`} data={section === 'sessions' ? newestFirst.slice(0, visible) : []} keyExtractor={(session) => session.id}
        onScroll={section === activeSection ? onScroll : undefined} scrollEventThrottle={16}
        renderItem={({ item }) => <View style={s.session}
          onStartShouldSetResponderCapture={pager.excludeTouch}>
          <SessionRow session={item} exercise={exercise} spacing={16} />
        </View>}
        onEndReached={() => { if (section === 'sessions' && section === activeSection) setVisible((count) => count + 30); }} onEndReachedThreshold={0.3}
        style={s.screen} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: tabBarHeight + 32 }}
        ListHeaderComponent={<>
          <SyncBanner />
          <View style={s.content}>
            <View style={[s.hero, fontScale > 1.5 && { flexDirection: 'column', alignItems: 'flex-start' }]}>
              {image && <View style={[s.imageFrame, { backgroundColor: p.surface }]}>
                <Image source={image} resizeMode="contain" accessibilityLabel={`Immagine di ${exercise.name}`} style={s.image} />
              </View>}
              <View style={[s.identity, fontScale > 1.5 && { flex: 0, alignSelf: 'stretch' }]}>
                <Text style={[s.eyebrow, { color: p.accent }]}>{categoryLabel(exercise.category)}</Text>
                <Text accessibilityRole="header" style={[s.title, { color: p.text }]}>{exercise.name}</Text>
                <Text style={[s.meta, { color: p.secondary }]}>{exercise.is_bodyweight ? 'Corpo libero · ' : ''}{unit}</Text>
              </View>
            </View>
            {section === 'details' && <>
              <View style={s.block}>
                <SectionTitle>Il tuo percorso</SectionTitle>
                <View style={[s.row, fontScale > 1.5 && { flexDirection: 'column' }]}>
                  <Card style={[s.tile, fontScale > 1.5 && { flex: 0 }]}>
                    <SymbolView name="calendar" tintColor={p.accent} style={s.smallIcon} />
                    <Text style={[s.tileValue, { color: p.text }]}>{exercise.sessions.length}</Text>
                    <Caption>Sessioni registrate</Caption>
                  </Card>
                  <Card style={[s.tile, fontScale > 1.5 && { flex: 0 }]}>
                    <SymbolView name="trophy" tintColor={p.accent} style={s.smallIcon} />
                    <Text style={[s.tileValue, { color: p.text }]}>{number(Math.max(0, ...exercise.sessions.map((session) => session.value)))}</Text>
                    <Caption>Miglior punteggio · pt</Caption>
                  </Card>
                </View>
                {latest && <Pressable accessibilityRole="button" accessibilityLabel="Vedi tutte le sessioni" onPress={() => select('sessions')}
                  style={({ pressed }) => [s.latest, { backgroundColor: p.surface, opacity: pressed ? 0.65 : 1 }]}>
                  <View style={{ flex: 1, gap: 5 }}><Caption>Ultima sessione · {formatDate(latest.date)}</Caption>
                    <Text style={[s.body, { color: p.text, fontWeight: '600' }]}>{sessionSummary(latest, exercise)}</Text></View>
                  <SymbolView name="chevron.right" tintColor={p.secondary} style={{ width: 14, height: 18 }} />
                </Pressable>}
              </View>
              <View style={s.block}>
                <SectionTitle>Informazioni</SectionTitle>
                <Card style={{ gap: 20 }}>
                  <Text style={[s.body, { color: exercise.description ? p.text : p.secondary }]}>{exercise.description || 'Aggiungi una descrizione per ritrovare qui tecnica e indicazioni utili.'}</Text>
                  <View style={[s.divider, { backgroundColor: p.separator }]} />
                  <View style={s.infoRow}><Caption>Misurazione</Caption><Text style={[s.infoValue, { color: p.text }]}>{unit}</Text></View>
                  <View style={s.infoRow}><Caption>Bonus superset</Caption><Text style={[s.infoValue, { color: p.text }]}>{number(Number(exercise.superset_multiplier ?? 1.2))}×</Text></View>
                  {exercise.is_bodyweight && <Caption>Il carico comprende il peso corporeo alla data della sessione e l’eventuale peso aggiunto.</Caption>}
                </Card>
              </View>
              <View style={s.block}>
                <SectionTitle>Record personali</SectionTitle>
                <Card style={{ gap: 0 }}>
                  {records.length ? records.map((record, i) => <View key={i} style={[s.record, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.separator }]}>
                    <View style={[s.recordIcon, { backgroundColor: p.accentSoft }]}><SymbolView name="trophy.fill" tintColor={p.accent} style={s.smallIcon} /></View>
                    <View style={{ flex: 1, gap: 4 }}><Text style={[s.body, { color: p.text, fontWeight: '600' }]}>{record.text}</Text><Caption>{formatDate(record.date)}</Caption></View>
                  </View>) : <View style={{ gap: 16 }}><Caption>Nessun record personale. Aggiungi un risultato da ricordare.</Caption><Action title="Aggiungi record" variant="secondary" compact icon="trophy" onPress={edit} /></View>}
                </Card>
              </View>
            </>}
            {section !== 'details' && <View style={s.block}>
              <View style={s.sectionHeading}><SectionTitle>{section === 'sessions' ? 'Sessioni passate' : 'I tuoi progressi'}</SectionTitle>
                <Text style={[s.count, { color: p.secondary }]}>{sessions.length} sessioni</Text></View>
              <Pills value={period} onChange={(value) => { setPeriod(value); setVisible(30); }} items={periods} />
            </View>}
            {section === 'statistics' && <>
              <Card style={{ gap: 20 }}>
                <View style={s.sectionHeading}><Caption>Miglior punteggio</Caption><SymbolView name="trophy" tintColor={p.accent} style={s.smallIcon} /></View>
                <Text style={[s.score, { color: p.text }]}>{number(best)}<Text style={[s.scoreUnit, { color: p.secondary }]}> pt</Text></Text>
                <View style={[s.divider, { backgroundColor: p.separator }]} />
                <View style={[s.row, fontScale > 1.5 && { flexDirection: 'column' }]}>
                  <View style={{ flex: fontScale > 1.5 ? 0 : 1, gap: 6 }}><Text style={[s.statValue, { color: p.text }]}>{number(total)}</Text><Caption>Punti totali</Caption></View>
                  <View style={{ flex: fontScale > 1.5 ? 0 : 1, gap: 6 }}><Text style={[s.statValue, { color: p.text }]}>{number(sessions.length ? Math.round(total / sessions.length) : 0)}</Text><Caption>Media per sessione</Caption></View>
                </View>
              </Card>
              <Card style={{ gap: 20 }}><Text accessibilityRole="header" style={[s.cardTitle, { color: p.text }]}>Andamento nel tempo</Text>
                <View onStartShouldSetResponderCapture={pager.excludeTouch}>
                <TrendChart data={[...sessions].sort((a, b) => a.date.localeCompare(b.date)).map((session) => ({ date: session.date, value: session.value }))} label="Punteggio sessione" unit="pt" />
                </View>
              </Card>
              <Caption>Il punteggio considera serie, ripetizioni, carico e l’eventuale bonus superset. I dati si riferiscono al periodo selezionato.</Caption>
            </>}
          </View>
        </>}
        ListEmptyComponent={section === 'sessions' ? <View style={s.empty}><Card><SymbolView name="calendar.badge.plus" tintColor={p.accent} style={{ width: 32, height: 32 }} />
          <Text style={[s.cardTitle, { color: p.text }]}>Nessuna sessione</Text><Caption>Nessuna sessione in questo periodo. Registra un allenamento o scegli un altro intervallo.</Caption>
          <Action title="Registra una sessione" variant="secondary" icon="plus" onPress={() => router.push({ pathname: '/session-form', params: { exerciseId: id } })} /></Card></View> : undefined}
        ListFooterComponent={<View style={s.footer}>
          {section === 'details' && <Action title="Registra una sessione" icon="plus" onPress={() => router.push({ pathname: '/session-form', params: { exerciseId: id } })} />}
          <View style={[s.row, { flexWrap: 'wrap', justifyContent: 'space-between' }]}>
            {index > 0 && <Action title="Precedente" icon="chevron.left" variant="secondary" compact onPress={() => router.replace({ pathname: '/exercise/[id]', params: { id: w.data.exercises[index - 1].id, section } })} />}
            {index < w.data.exercises.length - 1 && <Action title="Successivo" icon="chevron.right" variant="secondary" compact onPress={() => router.replace({ pathname: '/exercise/[id]', params: { id: w.data.exercises[index + 1].id, section } })} />}
          </View>
          {section === 'details' && <Pressable accessibilityRole="button" onPress={remove} style={({ pressed }) => ({ minHeight: 48, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}>
            <Text style={{ ...typography.caption, color: p.danger }}>Elimina esercizio</Text>
          </Pressable>}
        </View>} />
      </View>)}
      </Animated.View>
      </View>
    </View>
  </>;
}

const s = StyleSheet.create({
  screen: { flex: 1 }, viewport: { flex: 1, overflow: 'hidden' }, track: { flex: 1, flexDirection: 'row' },
  content: { padding: 20, paddingTop: 12, gap: 24 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  imageFrame: { width: 80, height: 96, borderRadius: 24, padding: 8, overflow: 'hidden' }, image: { width: '100%', height: '100%' },
  identity: { flex: 1, gap: 8 }, eyebrow: { ...typography.caption, fontWeight: '600' },
  title: { ...typography.title }, meta: { ...typography.caption },
  block: { gap: 16 }, row: { flexDirection: 'row', gap: 12 }, tile: { flex: 1, gap: 12, padding: 16, minWidth: 0 },
  tileValue: { ...typography.title, fontVariant: ['tabular-nums'] },
  smallIcon: { width: 20, height: 20 }, latest: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 24, borderRadius: 24 },
  body: { ...typography.body }, divider: { height: StyleSheet.hairlineWidth },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }, infoValue: { ...typography.body, flexShrink: 1 },
  record: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 16 }, recordIcon: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }, count: { ...typography.caption },
  score: { ...typography.display }, scoreUnit: { ...typography.body, fontWeight: '400', letterSpacing: 0 },
  statValue: { ...typography.title, fontVariant: ['tabular-nums'] }, cardTitle: { ...typography.body, fontWeight: '600' },
  session: { marginHorizontal: 20 }, empty: { marginHorizontal: 20 }, footer: { padding: 20, paddingTop: 32, gap: 24 },
});
