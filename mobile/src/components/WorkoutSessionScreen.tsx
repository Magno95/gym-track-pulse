import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { router, Stack } from 'expo-router';
import { useActiveSession, useNow } from '@/active-session';
import { elapsedSeconds, formatTimer } from '@/data/workout-run';
import { useWorkout } from '@/workout';
import { usePalette } from '@/theme';
import { Action, Caption, Card, ScrollPage, Metric, SectionTitle } from '@/components/UI';
import { TimerControls } from '@/components/TimerControls';
import { WorkoutCard } from '@/components/WorkoutCard';
import { SessionRow } from '@/components/SessionRow';
import { SyncBanner } from '@/components/SyncBanner';
import { SessionHero } from '@/components/SessionHero';
import { layout, typography } from '@/design';

export function WorkoutSessionScreen({ date, onDone, followActive = false }: { date?: string; onDone?: () => void; followActive?: boolean }) {
  const session = useActiveSession(); const w = useWorkout(); const p = usePalette();
  const [completedId, setCompletedId] = useState<string | null>(null);
  const run = followActive && session.active ? session.active
    : date ? session.runs.find((item) => item.date === date)
      : session.active ?? session.runs.find((item) => item.id === completedId);
  const running = !!run && run.endedAt === null;
  const now = useNow(running);
  const entries = w.data.exercises.flatMap((exercise) => exercise.sessions.filter((item) => item.date === run?.date).map((item) => ({ exercise, session: item })));
  const count = new Set(entries.map((entry) => entry.exercise.id)).size;
  const series = entries.reduce((sum, entry) => sum + entry.session.series, 0);
  function done() {
    setCompletedId(null);
    if (onDone) onDone();
    else if (date) router.dismissTo('/session');
  }
  function close() {
    Alert.alert('Chiudere la sessione?', 'Fermiamo il cronometro e salviamo la durata. Poi puoi pubblicare l’allenamento su Strava.', [
      { text: 'Continua allenamento', style: 'cancel' },
      { text: 'Chiudi sessione', onPress: () => {
        try {
          if (!run) return;
          session.close(); setCompletedId(run.id);
        } catch (error) { Alert.alert('Sessione non chiusa', error instanceof Error ? error.message : 'Riprova.'); }
      } },
    ]);
  }
  function remove() {
    if (!run || running) return;
    Alert.alert('Eliminare la sessione?', entries.length
      ? `Elimini la durata e tutte le serie registrate il ${new Date(run.startedAt).toLocaleDateString('it-IT')}. Gli esercizi della libreria restano disponibili. Un’attività già pubblicata su Strava resta su Strava.`
      : 'Elimini il riepilogo e la durata di questa sessione. Potrai avviarne una nuova.', [
      { text: 'Annulla', style: 'cancel' },
      { text: 'Elimina sessione', style: 'destructive', onPress: () => {
        try { session.remove(run.id); done(); }
        catch (error) { Alert.alert('Sessione non eliminata', error instanceof Error ? error.message : 'Riprova.'); }
      } },
    ]);
  }
  return <><Stack.Screen options={{ title: running ? 'In sessione' : run ? 'Riepilogo sessione' : 'Sessione' }} /><ScrollPage key={run?.id ?? 'session-intro'} resetOnReturn={!run}>
    {!run ? <SessionHero onOpen={(selected) => {
      if (selected.endedAt !== null) setCompletedId(selected.id);
    }} /> : <>
      <SyncBanner inset={false} />
      <Card style={{ backgroundColor: p.hero, borderColor: p.hero, gap: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <SymbolView name={running ? 'timer' : 'checkmark.circle.fill'} tintColor={p.brand} style={{ width: 20, height: 20 }} />
          <Text style={{ ...typography.caption, color: p.brand, fontWeight: '600', flexShrink: 1 }}>{running ? 'SESSIONE IN CORSO' : 'ALLENAMENTO COMPLETATO'}</Text>
        </View>
        <Text accessibilityLabel={`Durata sessione ${formatTimer(elapsedSeconds(run, now))}`} style={{ ...typography.display, color: p.onHero }}>{formatTimer(elapsedSeconds(run, now))}</Text>
        <Caption color={p.heroSecondary}>{new Date(run.startedAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })} · Inizio {new Date(run.startedAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}{run.endedAt !== null ? ` · Fine ${new Date(run.endedAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}` : ''}</Caption>
        <View style={{ height: 1, backgroundColor: '#333333' }} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24 }}><Metric inverted value={String(count)} label="Esercizi" /><Metric inverted value={String(series)} label="Serie registrate" /></View>
        {running && <Caption color={p.heroSecondary}>Puoi cambiare schermata o bloccare l’iPhone: il tempo continua.</Caption>}
        {running && <Action title="Termina allenamento" icon="stop.fill" variant="secondary" onPress={close} />}
      </Card>
      {session.error && <Caption danger>{session.error}</Caption>}
      {running ? <>
        <TimerControls />
        {session.notice && <Caption>{session.notice}</Caption>}
      </> : <>
        <SectionTitle>{entries.length ? 'Un altro passo avanti.' : 'Sessione conclusa.'}</SectionTitle>
        <Caption>{entries.length ? 'Allenamento completato. Durata e serie sono salvate: ritroverai i tuoi progressi nello storico.' : 'La durata è salvata. Puoi aggiungere gli esercizi o eliminare questa sessione di prova.'}</Caption>
        <Action title="Fine allenamento" icon="checkmark" onPress={done} />
        <Action title="Pubblica su Strava" variant="secondary" onPress={() => router.push({ pathname: '/strava', params: { date: run.date } })} disabled={!entries.length} />
        {!entries.length && <Caption>Nessun esercizio registrato. Aggiungilo per pubblicare la sessione.</Caption>}
        <Action title="Aggiungi esercizio alla giornata" variant="secondary" onPress={() => router.push({ pathname: '/session-form', params: { date: run.date } })} disabled={!w.data.exercises.length} />
      </>}
      <SectionTitle>{running ? 'Il tuo allenamento' : 'Riepilogo esercizi'}</SectionTitle>
      {entries.map((entry) => running ? <SessionRow key={entry.session.id} {...entry} showExercise collapseGap={layout.section} />
        : <WorkoutCard key={entry.session.id} {...entry} showName />)}
      {!entries.length && <Card><Caption>{running ? 'Scegli un esercizio e registra la prima serie. Ogni salvataggio resta disponibile anche offline.' : 'Non hai registrato esercizi in questa sessione.'}</Caption></Card>}
      {running ? <Action title={w.data.exercises.length ? 'Aggiungi esercizio' : 'Crea il primo esercizio'} icon="plus" onPress={() => router.push(w.data.exercises.length ? { pathname: '/session-form', params: { date: run.date, inSession: '1' } } : '/exercise-form')} disabled={w.loading} />
        : <Action title="Elimina sessione" icon="trash" variant="danger" onPress={remove} />}
    </>}
  </ScrollPage></>;
}
