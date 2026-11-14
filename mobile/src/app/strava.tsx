import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Alert, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { formatDate } from '@/data/exercises';
import { useWorkout } from '@/workout';
import { stravaRequest, connectStrava, type StravaStatus, type StravaPublication } from '@/strava';
import { isCalendarDate, mapStravaExercise } from '@/domain';
import { numberInput } from '@/data/actions';
import { outbox } from '@/data/native-store';
import { Action, Caption, Card, Field, FormPage, SectionTitle, Metric } from '@/components/UI';
import { ScreenState } from '@/components/ScreenState';
import { useActiveSession } from '@/active-session';
import { elapsedSeconds, formatTimer, publicationTiming } from '@/data/workout-run';
import { usePalette } from '@/theme';

const notices: Record<string, string> = { connected: 'Account Strava collegato.', denied: 'Collegamento annullato.', missing_scope: 'Autorizza il caricamento delle attività per proseguire.', invalid_state: 'Collegamento scaduto. Riprova.', connection_failed: 'Collegamento non riuscito. Riprova.' };
export default function StravaScreen() {
  const { date, notice } = useLocalSearchParams<{ date: string; notice?: string }>();
  if (!date || !isCalendarDate(date)) return <ScreenState title="Data non valida" />;
  return <StravaEditor key={date} date={date} initialNotice={notice} />;
}
function StravaEditor({ date, initialNotice }: { date: string; initialNotice?: string }) {
  const w = useWorkout(); const owner = w.data.userId; const client = useQueryClient();
  const p = usePalette();
  const { runs } = useActiveSession();
  const run = runs.find((run) => run.date === date);
  const [name, setName] = useState(`GymTrack · ${date}`);
  const [start, setStart] = useState(new Date(`${date}T18:00:00`)); const [minutes, setMinutes] = useState('60');
  const [message, setMessage] = useState<string | null>(initialNotice ? notices[initialNotice] ?? null : null);
  const [formError, setFormError] = useState<string | null>(null);
  const key = ['strava', owner, date];
  const status = useQuery({ queryKey: key, enabled: w.online, staleTime: 0, retry: false, queryFn: () => stravaRequest<StravaStatus>(owner, { action: 'status', date }) });
  const publication = status.data?.publication;
  const busy = publication?.status === 'uploading' || publication?.status === 'processing';
  const blocked = publication?.status === 'published' || publication?.status === 'uncertain';
  const pending = w.pending.some((operation) => operation.change.type !== 'delete_image');
  const mutation = useMutation({ retry: false, mutationFn: (body: Record<string, unknown>) => stravaRequest<{ publication?: StravaPublication }>(owner, { ...body, date }),
    onSuccess: (result) => { if (result.publication) client.setQueryData<StravaStatus>(key, (old) => old ? { ...old, publication: result.publication! } : old); },
    onSettled: () => { void client.invalidateQueries({ queryKey: key }); },
  });
  const connection = useMutation({ retry: false, mutationFn: () => connectStrava(owner, date), onSuccess: (result) => { setMessage(result ? notices[result.result] ?? result.result : 'Collegamento annullato.'); void status.refetch(); } });
  const poll = useQuery({ queryKey: ['strava-upload', owner, date], enabled: w.online && busy && !mutation.isPending,
    retry: false, refetchInterval: 5000, queryFn: async () => {
      const result = await stravaRequest<{ publication: StravaPublication }>(owner, { action: 'upload-status', date });
      client.setQueryData<StravaStatus>(key, (old) => old ? { ...old, publication: result.publication } : old); return result;
    } });
  const working = mutation.isPending || connection.isPending;
  const dayExercises = w.data.exercises.filter((exercise) => exercise.sessions.some((session) => session.date === date));
  const generic = dayExercises.filter((exercise) => mapStravaExercise(exercise.name, exercise.category).fallback);
  const error = formError ?? mutation.error?.message ?? connection.error?.message ?? status.error?.message ?? poll.error?.message;
  function publish() {
    setFormError(null);
    try {
      if (!w.online || !w.data.updatedAt || outbox.pending(owner).some((op) => op.change.type !== 'delete_image')) throw new Error('Attendi la sincronizzazione completa prima di pubblicare.');
      if (!status.data?.configured || !status.data.connected || busy || blocked || working) return;
      if (!name.trim() || name.trim().length > 100) throw new Error('Inserisci un titolo fino a 100 caratteri.');
      if (run) {
        mutation.mutate({ action: 'publish', name: name.trim(), ...publicationTiming(run) }); return;
      }
      const elapsed = numberInput(minutes) * 60;
      if (!Number.isInteger(elapsed) || elapsed < 60 || elapsed > 86400 || !Number.isInteger(numberInput(minutes))) throw new Error('Inserisci una durata intera tra 1 e 1.440 minuti.');
      if (start.getTime() + elapsed * 1000 > Date.now()) throw new Error('L’allenamento deve essere già terminato.');
      mutation.mutate({ action: 'publish', name: name.trim(), useImportedActivity: false, startTime: start.toISOString(), utcOffset: -start.getTimezoneOffset() * 60, elapsedTime: elapsed });
    } catch (error) { setFormError(error instanceof Error ? error.message : 'Pubblicazione non riuscita.'); }
  }
  function disconnect() { Alert.alert('Scollegare Strava?', 'Potrai ricollegarlo quando vuoi.', [{ text: 'Annulla', style: 'cancel' }, { text: 'Scollega', style: 'destructive', onPress: () => mutation.mutate({ action: 'disconnect' }) }]); }
  return <><Stack.Screen options={{ title: 'Strava' }} /><FormPage footer={status.data?.connected && !busy && !blocked ? <Action title="Pubblica su Strava" icon="arrow.up.right" onPress={publish} busy={mutation.isPending}
    disabled={pending || !w.online || working || !dayExercises.length || !w.data.updatedAt || run?.endedAt === null} /> : undefined}>
    <SectionTitle>Porta con te i tuoi progressi.</SectionTitle><Caption>{formatDate(date)} · {dayExercises.length} esercizi. Pubblica l’allenamento su Strava con la durata e le serie registrate. La visibilità segue le impostazioni del tuo account.</Caption>
    {message && <Caption>{message}</Caption>}
    {!w.online && <Caption danger>Connettiti a internet per utilizzare Strava.</Caption>}
    {status.isPending && w.online && <Caption>Verifica del collegamento…</Caption>}
    {status.data && !status.data.configured && <Caption danger>Strava deve ancora essere configurato sul server.</Caption>}
    {status.data?.configured && !status.data.connected && <Action title="Collega Strava" onPress={() => connection.mutate()} busy={connection.isPending} disabled={!w.online} />}
    {publication?.status === 'published' && publication.activityId && <Card>
      <SymbolView name="checkmark.circle.fill" tintColor={p.positive} style={{ width: 36, height: 36 }} />
      <SectionTitle>Allenamento pubblicato.</SectionTitle><Caption>I tuoi progressi sono anche su Strava. Un’altra sessione da ricordare.</Caption>
      <Action title="Visualizza su Strava" icon="arrow.up.right" onPress={() => void WebBrowser.openBrowserAsync(`https://www.strava.com/activities/${encodeURIComponent(publication.activityId!)}`)} /></Card>}
    {busy && <Caption>Strava sta elaborando la sessione. Puoi chiudere questa schermata: l’esito resta salvato.</Caption>}
    {publication?.status === 'uncertain' && <Caption danger>L’esito dell’invio è incerto. Controlla Strava: un nuovo invio resta bloccato per evitare duplicati.</Caption>}
    {publication?.canCheck && ['uncertain', 'failed'].includes(publication.status) && <Action title="Verifica esito" variant="secondary" onPress={() => mutation.mutate({ action: 'upload-status' })} busy={mutation.isPending} />}
    {publication?.error && <Caption danger>{publication.error}</Caption>}
    {status.data?.connected && !busy && !blocked && <>
      <Field label="Titolo" value={name} onChangeText={setName} maxLength={100} editable={!working} />
      {run ? <Card><SectionTitle>Registrato con GymTrack</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20 }}><Metric value={formatTimer(elapsedSeconds(run))} label="Durata totale" /><Metric value={new Date(run.startedAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })} label="Inizio" /></View>
        <Caption>{run.endedAt === null ? 'Chiudi la sessione prima di pubblicare.' : 'Durata, esercizi, serie, ripetizioni e carichi arrivano dall’app.'}</Caption>
      </Card> : <>
        <Caption>Per questo allenamento non è stato usato il cronometro su questo iPhone. Inserisci orario e durata per pubblicarlo.</Caption>
        <Card><Caption>Orario di inizio</Caption><DateTimePicker accentColor={p.accent} value={start} mode="time" display="compact" locale="it-IT" onChange={(_event, value) => {
          if (value) { const next = new Date(`${date}T12:00:00`); next.setHours(value.getHours(), value.getMinutes(), 0, 0); setStart(next); }
        }} /></Card><Field label="Durata totale · minuti" value={minutes} onChangeText={setMinutes} keyboardType="number-pad" editable={!working} />
      </>}
      {!!generic.length && <Caption>Tipo generico su Strava per: {generic.map((exercise) => exercise.name).join(', ')}. I nomi originali restano nel riepilogo.</Caption>}
      {pending && <Caption>Attendi la sincronizzazione delle modifiche prima di pubblicare.</Caption>}
    </>}
    {error && <><Caption danger>{error}</Caption><Action title="Riprova verifica" variant="secondary" onPress={() => void status.refetch()} disabled={!w.online || working} /></>}
    {status.data?.connected && <Action title="Scollega Strava" variant="danger" onPress={disconnect} disabled={!w.online || working || busy} />}
  </FormPage></>;
}
