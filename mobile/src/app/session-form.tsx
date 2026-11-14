import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { router, Stack, useLocalSearchParams, useNavigation } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { Alert, AppState, Button, StyleSheet, Switch, Text, View } from 'react-native';
import { useWorkout } from '@/workout';
import { bodyWeightForEdit, findBodyWeight, isBodyweightSession, isTimedBodyweightSession } from '@/domain';
import type { DraftSet } from '@/data/actions';
import { completedDraftSets, draftSets, draftSetSummary, isEmptyDraft, previousExerciseSession, sessionDraftChange, sessionEditorInitial } from '@/data/session-editor';
import type { ExerciseOverview, WorkoutSession } from '@/data/exercises';
import { Action, Caption, Card, DateField, Field, FormPage, FormScrollTarget, SectionTitle } from '@/components/UI';
import { SwipeToDelete } from '@/components/SwipeToDelete';
import { ExerciseChoice } from '@/components/ExerciseChoice';
import { ExerciseList } from '@/components/ExerciseList';
import { ScreenState } from '@/components/ScreenState';
import { usePalette } from '@/theme';
import { useActiveSession } from '@/active-session';
import { typography } from '@/design';
import { createModalDismissGuard } from '@/modal-dismiss-guard';
import { PreviousSetCard, SessionComparisonSummary } from '@/components/SessionComparison';
import { useSessionLayoutTransition } from '@/hooks/useSessionLayoutTransition';

type EditorSet = DraftSet & { key: string };
function editorSets(sets = draftSets()): EditorSet[] {
  return sets.map((set) => ({ ...set, key: randomUUID() }));
}
function AddSetAction({ value, onChange, onAdd, title = 'Aggiungi serie' }: { value: EditorSet[]; onChange: (value: EditorSet[]) => void; onAdd: (key: string) => void; title?: string }) {
  const transition = useSessionLayoutTransition();
  return <Action title={title} icon="plus" variant="secondary" disabled={value.length >= 100}
    onPress={() => {
      transition();
      const key = randomUUID();
      onAdd(key);
      onChange([...value, { ...value[value.length - 1], key }]);
    }} />;
}

export default function SessionForm() {
  const params = useLocalSearchParams<{ exerciseId?: string; sessionId?: string; date?: string; inSession?: string }>();
  const w = useWorkout(); const p = usePalette();
  if (w.loading) return <ScreenState title="Caricamento" loading />;
  if (!w.data.exercises.length) return <ScreenState title="Prima aggiungi un esercizio" message="Crea un esercizio nella tua libreria, poi torna qui per registrare le serie."
    action={{ title: 'Crea esercizio', onPress: () => router.push('/exercise-form') }} />;
  if (!params.exerciseId && !params.sessionId) return <>
    <Stack.Screen options={{ title: 'Scegli esercizio', headerLeft: () => <Button title="Chiudi" onPress={() => router.back()} color={p.accent} /> }} />
    <ExerciseList onSelect={(exercise) => router.setParams({ exerciseId: exercise.id })} />
  </>;
  return <SessionEditor key={`${params.sessionId ?? 'new'}:${params.exerciseId ?? ''}`} {...params} />;
}
function SessionEditor({ exerciseId, sessionId, date: selectedDate, inSession }: { exerciseId?: string; sessionId?: string; date?: string; inSession?: string }) {
  const w = useWorkout(); const p = usePalette();
  const transition = useSessionLayoutTransition();
  const navigation = useNavigation();
  const [dismissGuard] = useState(() => createModalDismissGuard((gestureEnabled) => navigation.setOptions({ gestureEnabled })));
  const { active } = useActiveSession();
  const duringSession = !sessionId && inSession === '1' && active?.date === selectedDate;
  const [initial] = useState(() => sessionEditorInitial(w.data, { exerciseId, sessionId, date: selectedDate }));
  const [primaryId, setPrimaryId] = useState(initial.primaryExercise?.id ?? '');
  const [secondaryId, setSecondaryId] = useState(initial.secondary?.exercise.id ?? '');
  const [superset, setSuperset] = useState(!!initial.secondary);
  const [date, setDate] = useState(initial.date);
  const [sets, setSets] = useState(() => editorSets(initial.sets));
  const [secondarySets, setSecondarySets] = useState(() => editorSets(initial.secondarySets));
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);
  const [comparison, setComparison] = useState({ primary: false, secondary: false });
  const [multiplier, setMultiplier] = useState(String(initial.secondary?.session.value_multiplier ?? initial.primaryExercise?.superset_multiplier ?? 1.2));
  const [ids, setIds] = useState(() => ({ primary: initial.primary?.session.id ?? randomUUID(), secondary: initial.secondary?.session.id ?? randomUUID(), group: initial.primary?.session.superset_id ?? randomUUID() }));
  const [dirty, setDirty] = useState(false);
  const [creating, setCreating] = useState(false);
  const registering = useRef(false);
  const savedIds = useRef<string[]>([]);
  const savedSets = useRef<{ primary: EditorSet[]; secondary: EditorSet[] }>({ primary: [], secondary: [] });
  const savedSignature = useRef('');
  const [error, setError] = useState<string | null>(null);
  const primary = w.data.exercises.find((exercise) => exercise.id === primaryId);
  const secondary = w.data.exercises.find((exercise) => exercise.id === secondaryId);
  const previousPrimary = primary ? previousExerciseSession(primary, date) : null;
  const previousSecondary = secondary ? previousExerciseSession(secondary, date) : null;
  const persist = useCallback(() => {
    try {
      const mainSets = duringSession ? completedDraftSets(sets, savedSets.current.primary) : sets;
      const otherSets = duringSession ? completedDraftSets(secondarySets, savedSets.current.secondary) : secondarySets;
      if (duringSession && (!mainSets.length || (superset && !otherSets.length))) return false;
      const change = sessionDraftChange(w.data, { primary, secondary, date, sets: mainSets, secondarySets: otherSets, superset, multiplier, ids, sessionId, savedIds: savedIds.current });
      if (change.type === 'save_sessions') {
        const signature = JSON.stringify(change.sessions);
        if (signature !== savedSignature.current) {
          w.enqueue(change); // SQLite persists synchronously before the draft is marked saved.
          savedSignature.current = signature;
          savedIds.current = change.sessions.map((session) => session.id);
        }
      }
      savedSets.current = { primary: mainSets, secondary: superset ? otherSets : [] };
      setDirty(false); setError(null);
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : 'Salvataggio non riuscito.'); return false; }
  }, [w, primary, secondary, date, sets, secondarySets, superset, multiplier, ids, sessionId, duringSession]);

  // Persist before enabling the native dismiss gesture, without a debounce window.
  useLayoutEffect(() => {
    if (duringSession && dirty) persist();
  }, [duringSession, dirty, persist]);

  useEffect(() => {
    if (!sessionId || !dirty) return;
    const timer = setTimeout(persist, 600);
    return () => clearTimeout(timer);
  }, [sessionId, dirty, persist]);
  useEffect(() => {
    if ((!sessionId && !duringSession) || !dirty) return;
    const listener = AppState.addEventListener('change', (state) => { if (state !== 'active') persist(); });
    return () => listener.remove();
  }, [sessionId, duringSession, dirty, persist]);

  function changed() { setDirty(true); setError(null); }
  function changeSets(update: (value: EditorSet[]) => void) { return (value: EditorSet[]) => { update(value); changed(); }; }
  const empty = duringSession && !savedIds.current.length && isEmptyDraft(sets, primary?.is_bodyweight)
    && (!superset || isEmptyDraft(secondarySets, secondary?.is_bodyweight));
  // Only this guard owns gestureEnabled: autosave must not unlock a card being swiped.
  useLayoutEffect(() => { dismissGuard.setDirty(dirty && !empty); }, [dismissGuard, dirty, empty]);
  function close() {
    if (!dirty || empty || ((sessionId || duringSession) && persist())) { router.back(); return; }
    Alert.alert(sessionId || savedIds.current.length ? 'Modifiche incomplete' : 'Scartare la nuova sessione?',
      sessionId || duringSession ? 'Completa i campi per salvare automaticamente, oppure scarta le modifiche non salvate.' : 'La sessione non è stata registrata.', [
        { text: 'Continua', style: 'cancel' }, { text: 'Scarta', style: 'destructive', onPress: () => router.back() },
      ]);
  }
  function register() {
    if (registering.current) return;
    registering.current = true; setCreating(true);
    if (persist()) router.back();
    else { registering.current = false; setCreating(false); }
  }
  const floatingPrimary = !!primary && Math.max(sets.length, comparison.primary && previousPrimary ? draftSets(previousPrimary).length : 0) > 4;
  const floatingSecondary = superset && !!secondary && Math.max(secondarySets.length, comparison.secondary && previousSecondary ? draftSets(previousSecondary).length : 0) > 4;
  const footer = <>
    {error && <Caption danger>{error}</Caption>}
    {floatingPrimary && <AddSetAction value={sets} onChange={changeSets(setSets)} onAdd={setScrollTarget} title={superset ? `Aggiungi serie · ${primary.name}` : undefined} />}
    {floatingSecondary && <AddSetAction value={secondarySets} onChange={changeSets(setSecondarySets)} onAdd={setScrollTarget} title={`Aggiungi serie · ${secondary.name}`} />}
    {!sessionId && !duringSession && <Action title="Registra sessione" icon="checkmark" busy={creating} onPress={register} />}
  </>;
  return <><Stack.Screen options={{ title: primary?.name ?? 'Nuova sessione',
    headerLeft: () => <Button title="Chiudi" onPress={close} color={p.accent} /> }} />
    <FormPage keyboardClearance={32} footer={error || floatingPrimary || floatingSecondary || (!sessionId && !duringSession) ? footer : undefined}>
      {!sessionId && (duringSession ? <Caption>Le serie complete si salvano automaticamente. Puoi chiudere scorrendo verso il basso o con Chiudi.</Caption> : <DateField value={date} onChange={(value) => { setDate(value); changed(); }} />)}
      {!sessionId && !duringSession && <ExerciseChoice label="Esercizio principale" exercises={w.data.exercises} value={primaryId} onChange={(id) => {
        setPrimaryId(id); const exercise = w.data.exercises.find((item) => item.id === id);
        setComparison((value) => ({ primary: false, secondary: id === secondaryId ? false : value.secondary }));
        setSets(editorSets(draftSets(undefined, exercise?.is_bodyweight))); setMultiplier(String(exercise?.superset_multiplier ?? 1.2));
        if (id === secondaryId) { setSecondaryId(''); setSecondarySets(editorSets()); }
        changed();
      }} />}
      {primary && <SetsEditor key={primary.id} exercise={primary} original={primary.sessions.find((session) => session.id === ids.primary)} date={date} value={sets}
        summarySets={duringSession ? completedDraftSets(sets, savedSets.current.primary) : undefined} onChange={changeSets(setSets)} onSwipeChange={dismissGuard.setSwipe} scrollTarget={scrollTarget} onAdd={setScrollTarget}
        previous={previousPrimary} compare={comparison.primary} onCompare={(primary) => setComparison((value) => ({ ...value, primary }))} />}
      {!sessionId && <Card><View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}><Text style={{ ...typography.body, color: p.text, fontWeight: '600', flexShrink: 1 }}>Superset</Text>
        <Switch accessibilityLabel="Superset" value={superset} disabled={!!sessionId} trackColor={{ true: p.accent }} onValueChange={(value) => { transition(); setSuperset(value); changed(); }} /></View>
        <Caption>Due esercizi in sequenza, salvati insieme.</Caption></Card>}
      {superset && <>
        {!sessionId && <ExerciseChoice label="Secondo esercizio" exercises={w.data.exercises.filter((exercise) => exercise.id !== primaryId)} value={secondaryId}
          onChange={(id) => {
            if (id === secondaryId) return;
            const exercise = w.data.exercises.find((item) => item.id === id);
            setComparison((value) => ({ ...value, secondary: false }));
            setSecondaryId(id); setSecondarySets(editorSets(draftSets(undefined, exercise?.is_bodyweight)));
            setIds((value) => ({ ...value, secondary: randomUUID() }));
            savedSets.current.secondary = [];
            changed();
          }} />}
        {secondary && <SetsEditor key={secondary.id} exercise={secondary} original={secondary.sessions.find((session) => session.id === ids.secondary)} date={date} value={secondarySets}
          summarySets={duringSession ? completedDraftSets(secondarySets, savedSets.current.secondary) : undefined} multiplier={Number(multiplier.replace(',', '.'))} showTitle onChange={changeSets(setSecondarySets)} onSwipeChange={dismissGuard.setSwipe} scrollTarget={scrollTarget} onAdd={setScrollTarget}
          previous={previousSecondary} compare={comparison.secondary} onCompare={(secondary) => setComparison((value) => ({ ...value, secondary }))} />}
        <Field label="Moltiplicatore secondo esercizio · da 1 a 5" keyboardType="decimal-pad" value={multiplier} onChangeText={(value) => { setMultiplier(value); changed(); }} />
      </>}
    </FormPage>
  </>;
}
function SetsEditor({ exercise, original, date, value, summarySets, multiplier, showTitle = false, onChange, onSwipeChange, scrollTarget, onAdd, previous, compare, onCompare }: { exercise: ExerciseOverview; original?: WorkoutSession; date: string; value: EditorSet[]; summarySets?: EditorSet[]; multiplier?: number; showTitle?: boolean; onChange: (value: EditorSet[]) => void; onSwipeChange: (id: symbol, active: boolean) => void; scrollTarget: string | null; onAdd: (key: string) => void; previous: WorkoutSession | null; compare: boolean; onCompare: (value: boolean) => void }) {
  const w = useWorkout(); const p = usePalette();
  const transition = useSessionLayoutTransition();
  const comparing = compare && !!previous;
  const previousSets = previous ? draftSets(previous) : [];
  const rows = Array.from({ length: comparing ? Math.max(value.length, previousSets.length) : value.length }, (_, index) => value[index]);
  const bodyweight = original ? isBodyweightSession(original) : exercise.is_bodyweight;
  const timed = original ? isTimedBodyweightSession(original) : bodyweight && exercise.unit === 'time';
  const weight = original ? bodyWeightForEdit(original, date, w.data.measurements) : findBodyWeight(w.data.measurements, date);
  const unit = bodyweight ? 'Carico aggiunto · kg' : exercise.unit === 'time' ? 'Durata · s' : exercise.unit === 'distance' ? 'Distanza · m' : 'Peso · kg';
  const compactUnit = bodyweight ? '+ kg' : exercise.unit === 'time' ? 's' : exercise.unit === 'distance' ? 'm' : 'kg';
  const summary = draftSetSummary(w.data, exercise, date, summarySets ?? value, original?.id ?? '', multiplier ?? original?.value_multiplier ?? 1);
  return <View style={{ gap: 12 }}>{showTitle && <SectionTitle>{exercise.name}</SectionTitle>}
    {previous && <View style={styles.comparisonToggle}>
      <Text style={{ ...typography.body, color: p.text, flex: 1 }}>Confronta con la precedente</Text>
      <Switch accessibilityLabel={`Confronta ${exercise.name} con la sessione precedente`} value={comparing} trackColor={{ true: p.accent }} onValueChange={(value) => { transition(); onCompare(value); }} />
    </View>}
    <SessionComparisonSummary current={summary} date={date} previous={previous} comparing={comparing} />
    {bodyweight && <Card style={styles.bodyweightNotice}><Caption>{weight === null ? 'Manca un peso valido per questa data.' : `Peso corporeo utilizzato: ${weight} kg. Carico aggiunto: 0 kg se non usi pesi.`}</Caption>
      {weight === null && <Action title="Aggiungi una misurazione" variant="secondary" compact onPress={() => router.push('/measurement-form')} />}</Card>}
    {rows.map((set, index) => <FormScrollTarget key={set?.key ?? `previous-${previous?.id}-${index}`} active={!!set && set.key === scrollTarget}
      style={comparing ? undefined : styles.closingRow}>
      <View style={styles.comparisonRow}>
      <View style={styles.comparisonColumn}>
      {set ? <SwipeToDelete disabled={value.length <= 1} spacing={comparing ? 0 : 12} onSwipeChange={onSwipeChange}
      onDelete={() => { if (value.length > 1) onChange(value.filter((item) => item.key !== set.key)); }}>
      <Card style={styles.setCard}>
      <Text accessibilityActions={value.length > 1 ? [{ name: 'delete', label: `Elimina serie ${index + 1}` }] : []}
        onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'delete' && value.length > 1) { transition(); onChange(value.filter((item) => item.key !== set.key)); } }}
        style={{ ...typography.caption, color: p.secondary, fontWeight: '600' }}>SERIE {index + 1}</Text>
      <View style={{ flexDirection: 'row', gap: comparing ? 8 : 12 }}><View style={styles.comparisonColumn}><Field label={comparing ? (timed ? 's' : 'Rip.') : timed ? 'Secondi' : 'Ripetizioni'} accessibilityLabel={timed ? 'Secondi' : 'Ripetizioni'} value={set.reps} keyboardType="number-pad" style={[styles.setInput, comparing && styles.compactSetInput]}
        onChangeText={(reps) => onChange(value.map((item, i) => i === index ? { ...item, reps } : item))} /></View>
        <View style={styles.comparisonColumn}><Field label={comparing ? compactUnit : unit} accessibilityLabel={unit} value={set.weight} keyboardType="decimal-pad" style={[styles.setInput, comparing && styles.compactSetInput]} onChangeText={(weight) => onChange(value.map((item, i) => i === index ? { ...item, weight } : item))} /></View></View>
      </Card>
      </SwipeToDelete> : <Card style={[styles.setCard, styles.missingSet]}><Text style={{ ...typography.caption, color: p.secondary, fontWeight: '600' }}>SERIE {index + 1}</Text><Caption>Nessuna serie</Caption></Card>}
      </View>
      {comparing && <View style={styles.comparisonColumn}><PreviousSetCard set={previousSets[index]} index={index} session={previous} unit={exercise.unit} /></View>}
      </View>
    </FormScrollTarget>)}
    {Math.max(value.length, comparing ? previousSets.length : 0) <= 4 && <AddSetAction value={value} onChange={onChange} onAdd={onAdd} />}
  </View>;
}

const styles = StyleSheet.create({
  bodyweightNotice: { padding: 16, gap: 8 },
  setCard: { padding: 12, gap: 8 },
  // A lone set row owns its 12pt spacing (SwipeToDelete) so it closes with the row; this cancels the list gap.
  closingRow: { marginBottom: -12 },
  setInput: { ...typography.title, minWidth: 0, width: '100%', minHeight: 44, paddingHorizontal: 8, paddingVertical: 4, textAlign: 'center', fontVariant: ['tabular-nums'] },
  compactSetInput: { ...typography.body, paddingHorizontal: 4 },
  comparisonToggle: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4, minHeight: 44 },
  comparisonRow: { width: '100%', flexDirection: 'row', alignItems: 'stretch', gap: 12 },
  comparisonColumn: { flexGrow: 1, flexShrink: 1, flexBasis: 0, width: 0, minWidth: 0 },
  missingSet: { flexGrow: 1, minHeight: 124 },
});
