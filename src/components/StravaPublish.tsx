import { useState, useSyncExternalStore, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { ExternalLink, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { getSyncQueue, subscribeToSync } from "@/lib/localCache";
import { mapStravaExercise, stravaRequest, type StravaStatus, type StravaPublication,
  type ImportedStravaActivity, type StravaActivitySummary } from "@/lib/strava";
import type { ExerciseWithSessions } from "@/lib/supabaseStore";

interface Props { date: string; exercises: ExerciseWithSessions[]; complete: boolean }
const notices: Record<string, string> = {
  connected: "Account Strava collegato. Ora puoi pubblicare la sessione.",
  denied: "Collegamento annullato. Puoi riprovare quando vuoi.",
  missing_scope: "Per pubblicare, concedi a GymTrack il permesso di caricare attività su Strava.",
  invalid_state: "Il collegamento è scaduto o non è valido. Riprova.",
  connection_failed: "Collegamento non riuscito. Riprova con il tuo account Strava.",
};
const durationLabel = (seconds: number) => `${Math.floor(seconds / 60)} min${seconds % 60 ? ` ${seconds % 60} s` : ""}`;
const activityTime = (activity: StravaActivitySummary) => new Date(Date.parse(activity.startTime) + activity.utcOffset * 1000).toISOString().slice(11, 19);

export function StravaPublish(props: Props) {
  const { userId } = useAuth();
  return userId ? <PublishDialog key={`${userId}:${props.date}`} {...props} userId={userId} /> : null;
}

function PublishDialog({ date, exercises, complete, userId }: Props & { userId: string }) {
  const [params, setParams] = useSearchParams();
  const [notice] = useState(() => notices[params.get("strava") ?? ""]);
  const [open, setOpen] = useState(() => !!notice);
  const [name, setName] = useState(`GymTrack · ${date}`);
  const [time, setTime] = useState("");
  const [minutes, setMinutes] = useState("");
  const [activityId, setActivityId] = useState("");
  const [useImported, setUseImported] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const queue = useSyncExternalStore(subscribeToSync, getSyncQueue);
  // Wait for all queued edits: deletions/renames may affect this day's contents too.
  const pendingSync = queue.some((operation) => operation.type !== "delete_image");
  const client = useQueryClient();
  const queryKey = ["strava", userId, date];
  const status = useQuery({ queryKey, retry: false, staleTime: 0,
    queryFn: () => stravaRequest<StravaStatus>(userId, { action: "status", date }),
    refetchInterval: (query) => open && query.state.data?.publication?.status === "uploading" ? 5000 : false,
  });
  const publication = status.data?.publication;
  const busy = publication?.status === "processing" || publication?.status === "uploading";
  const mutation = useMutation({ retry: false,
    mutationFn: (body: Record<string, unknown>) => stravaRequest<{ url?: string; publication?: StravaPublication }>(userId, { ...body, date }),
    onSuccess: (result) => {
      if (result.url) { window.location.assign(result.url); return; }
      if (result.publication) client.setQueryData<StravaStatus>(queryKey, (old) => old ? { ...old, publication: result.publication! } : old);
    },
    onSettled: () => void client.invalidateQueries({ queryKey }),
  });
  const activities = useQuery({ queryKey: ["strava-activities", userId, date], retry: false,
    enabled: open && !!status.data?.canReadActivities && !busy && publication?.status !== "published" && publication?.status !== "uncertain",
    queryFn: () => stravaRequest<{ activities: StravaActivitySummary[] }>(userId, { action: "activities", date }),
    refetchOnWindowFocus: false,
  });
  const importMutation = useMutation({ retry: false,
    mutationFn: () => stravaRequest<{ importedActivity: ImportedStravaActivity }>(userId, { action: "import-activity", date, activityId }),
    onSuccess: (result) => {
      setUseImported(true); setFormError(null);
      client.setQueryData<StravaStatus>(queryKey, (old) => old ? { ...old, importedActivity: result.importedActivity } : old);
    },
  });
  const imported = status.data?.importedActivity;
  const source = useImported ? imported : null;
  const working = mutation.isPending || importMutation.isPending;
  // Poll upload processing via a read-only action. React Query cleans up when closed.
  const uploadStatus = useQuery({ queryKey: ["strava-upload", userId, date], enabled: open && busy && !mutation.isPending,
    queryFn: async () => {
      const result = await stravaRequest<{ publication: StravaPublication }>(userId, { action: "upload-status", date });
      client.setQueryData<StravaStatus>(queryKey, (old) => old ? { ...old, publication: result.publication } : old);
      return result;
    }, retry: false, refetchInterval: 5000,
  });
  const dayExercises = exercises.filter((exercise) => exercise.sessions.some((session) => session.date === date));
  const generic = dayExercises.filter((exercise) => mapStravaExercise(exercise.name, exercise.category).fallback);
  const error = formError ?? (mutation.error instanceof Error ? mutation.error.message : null)
    ?? (importMutation.error instanceof Error ? importMutation.error.message : null);
  const canPublish = status.data?.connected && status.data.configured && !pendingSync && complete && !busy
    && publication?.status !== "published" && publication?.status !== "uncertain";

  function changeOpen(value: boolean) {
    setOpen(value);
    if (!value && params.has("strava")) {
      const next = new URLSearchParams(params); next.delete("strava"); setParams(next, { replace: true });
    }
  }
  function publish(event: FormEvent) {
    event.preventDefault(); setFormError(null);
    if (!canPublish || working) return;
    if (getSyncQueue().some((operation) => operation.type !== "delete_image")) {
      setFormError("Attendi la sincronizzazione delle modifiche prima di pubblicare."); return;
    }
    if (source) {
      mutation.mutate({ action: "publish", name, useImportedActivity: true }); return;
    }
    const local = new Date(`${date}T${time}:00`);
    const elapsed = Number(minutes) * 60;
    if (!time || !Number.isFinite(local.getTime()) || local.getHours() !== Number(time.slice(0, 2))
      || local.getMinutes() !== Number(time.slice(3, 5)) || !Number.isInteger(elapsed) || elapsed < 1 || elapsed > 86400) {
      setFormError("Inserisci un orario valido e una durata tra 1 minuto e 24 ore."); return;
    }
    if (local.getTime() + elapsed * 1000 > Date.now()) { setFormError("La sessione deve essere già terminata."); return; }
    mutation.mutate({ action: "publish", name, startTime: local.toISOString(), utcOffset: -local.getTimezoneOffset() * 60, elapsedTime: elapsed });
  }

  return <>
    {imported && <div className="space-y-2 rounded-lg border border-border p-4" aria-label="Dati della sessione importati da Strava">
      <dl className="grid grid-cols-3 gap-3 text-sm">
        <div><dt className="text-muted-foreground">Durata</dt><dd className="font-semibold">{durationLabel(imported.elapsedTime)}</dd></div>
        <div><dt className="text-muted-foreground">Battito medio</dt><dd className="font-semibold">{imported.averageHeartRate !== null ? `${Math.round(imported.averageHeartRate)} bpm` : "Non disponibile"}</dd></div>
        <div><dt className="text-muted-foreground">Battito massimo</dt><dd className="font-semibold">{imported.maxHeartRate !== null ? `${Math.round(imported.maxHeartRate)} bpm` : "Non disponibile"}</dd></div>
      </dl>
      <p className="text-xs text-muted-foreground">Fonte: Strava · {imported.name}</p>
    </div>}
    <Button variant="outline" className="w-full border-[#FC4C02]/50 text-[#c63b00] dark:text-[#ff8f60]" onClick={() => changeOpen(true)}>
      <Upload className="mr-2 h-4 w-4" />Pubblica su Strava
    </Button>
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="h-auto max-h-[90dvh] pb-6" onOpenAutoFocus={() => document.getElementById("strava-title")?.focus()}>
        <DialogHeader>
          <DialogTitle>Pubblica su Strava</DialogTitle>
          <DialogDescription>Carica l’allenamento del {date} con esercizi, serie e ripetizioni. I nomi in GymTrack restano gli stessi.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 overflow-y-auto px-1">
          {notice && <p role="status" className="text-sm">{notice}</p>}
          {status.isPending && <p role="status" className="text-sm">Verifica del collegamento…</p>}
          {status.isError && <div role="alert" className="space-y-2 text-sm">
            <p>{status.error.message}</p><Button variant="outline" onClick={() => void status.refetch()}>Riprova</Button>
          </div>}
          {status.data && !status.data.configured && <p role="status" className="text-sm">L’integrazione Strava deve ancora essere configurata sul server.</p>}
          {status.data?.configured && !status.data.connected && <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Collega il tuo account per caricare allenamenti e leggere durata e battito dalle attività Garmin sincronizzate su Strava. Potrai rivedere i dettagli prima dell’invio.</p>
            <Button disabled={mutation.isPending} onClick={() => mutation.mutate({ action: "connect" })}>Collega Strava</Button>
          </div>}
          {publication?.status === "published" && publication.activityId && <div className="space-y-3">
            <p role="status" className="text-sm">Sessione pubblicata su Strava.</p>
            <Button asChild><a href={`https://www.strava.com/activities/${encodeURIComponent(publication.activityId)}`} target="_blank" rel="noreferrer">
              Visualizza su Strava<ExternalLink className="ml-2 h-4 w-4" />
            </a></Button>
          </div>}
          {busy && <div role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />Strava sta elaborando la sessione. Puoi chiudere questa finestra.</div>}
          {publication?.status === "uncertain" && <p role="alert" className="text-sm">L’esito dell’invio è incerto. Controlla il tuo profilo Strava: un nuovo invio è bloccato per evitare duplicati.</p>}
          {(publication?.status === "uncertain" || publication?.status === "failed") && publication.canCheck && <Button variant="outline" disabled={working} onClick={() => mutation.mutate({ action: "upload-status" })}>Verifica esito su Strava</Button>}
          {busy && uploadStatus.isError && <p role="alert" className="text-sm">{uploadStatus.error.message}</p>}
          {publication?.error && <p role="alert" className="text-sm text-destructive">{publication.error}</p>}
          {status.data?.connected && !busy && publication?.status !== "published" && publication?.status !== "uncertain" && <form onSubmit={publish} className="space-y-4">
            <p className="text-sm text-muted-foreground">Attività: allenamento con pesi · {dayExercises.length} esercizi. Importa orario, durata e battito dal Garmin oppure inserisci i tempi manualmente. La visibilità segue le impostazioni del tuo account Strava.</p>
            <div className="space-y-3 rounded-lg border border-border p-3">
              <p className="text-sm font-medium">Importa da Strava</p>
              {!status.data.canReadActivities ? <>
                <p className="text-sm text-muted-foreground">Per leggere le attività e il battito serve una nuova autorizzazione.</p>
                <Button type="button" variant="outline" disabled={working} onClick={() => mutation.mutate({ action: "connect" })}>Autorizza la lettura delle attività</Button>
              </> : <>
                <div className="space-y-2">
                  <Label htmlFor="strava-source">Attività del {date}</Label>
                  <select id="strava-source" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={activityId} disabled={working || activities.isFetching} onChange={(event) => setActivityId(event.target.value)}>
                    <option value="">Seleziona l’attività registrata sul Garmin</option>
                    {activities.data?.activities.map((activity) => <option key={activity.id} value={activity.id}>
                      {activityTime(activity)} · {activity.name} · {durationLabel(activity.elapsedTime)}{activity.hasHeartRate ? " · battito disponibile" : " · senza battito"}
                    </option>)}
                  </select>
                </div>
                {activities.isFetching && <p role="status" className="text-sm">Caricamento attività…</p>}
                {activities.isError && <p role="alert" className="text-sm text-destructive">{activities.error.message}</p>}
                {activities.isSuccess && !activities.data.activities.length && <p role="status" className="text-sm text-muted-foreground">Nessuna attività disponibile. Attendi la sincronizzazione Garmin e aggiorna l’elenco.</p>}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" disabled={working || activities.isFetching || !activities.data?.activities.some((activity) => activity.id === activityId)} onClick={() => importMutation.mutate()}>
                    {importMutation.isPending ? "Importazione…" : "Importa durata e battito"}
                  </Button>
                  <Button type="button" variant="ghost" disabled={working || activities.isFetching} onClick={() => void activities.refetch()}>Aggiorna elenco</Button>
                </div>
              </>}
              {imported && <div className="space-y-2 text-sm">
                <p role="status">Importata: {imported.name} · {durationLabel(imported.elapsedTime)} · {imported.sampleCount ? `${imported.sampleCount} campioni cardiaci` : "curva cardiaca non disponibile"}.</p>
                <Label className="flex items-center gap-2" htmlFor="strava-use-imported">
                  <input id="strava-use-imported" type="checkbox" checked={useImported} disabled={working} onChange={(event) => setUseImported(event.target.checked)} />
                  Usa i dati importati nella pubblicazione
                </Label>
              </div>}
            </div>
            <div className="space-y-2"><Label htmlFor="strava-title">Titolo</Label>
              <Input id="strava-title" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} disabled={working} />
            </div>
            {source ? <p className="text-sm">Inizio: {activityTime(source)} · Durata: {durationLabel(source.elapsedTime)} (recuperi inclusi). {source.sampleCount ? "La curva del battito sarà inclusa." : "La pubblicazione non conterrà una curva del battito."}</p> : <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label htmlFor="strava-time">Inizio</Label>
                <Input id="strava-time" type="time" value={time} onChange={(event) => setTime(event.target.value)} required disabled={working} />
              </div>
              <div className="space-y-2"><Label htmlFor="strava-duration">Durata (minuti)</Label>
                <Input id="strava-duration" type="number" inputMode="numeric" min={1} max={1440} step={1} value={minutes} onChange={(event) => setMinutes(event.target.value)} required disabled={working} />
              </div>
            </div>}
            {source && <p className="text-sm text-muted-foreground">Pubblicheremo una nuova attività con le serie GymTrack. Potrai cancellare manualmente l’originale Garmin da Strava. Se Strava segnala un duplicato, i dati importati restano salvati per riprovare dopo la cancellazione.</p>}
            {generic.length > 0 && <p className="text-sm text-muted-foreground">Su Strava questi esercizi useranno un tipo generico: {generic.map((exercise) => exercise.name).join(", ")}. I nomi originali rimarranno nel riepilogo.</p>}
            {(pendingSync || !complete) && <p role="status" className="text-sm">Connettiti e attendi il caricamento e la sincronizzazione della sessione completa prima di pubblicare.</p>}
            <Button type="submit" className="w-full bg-[#c63b00] text-white hover:bg-[#ad3400]" disabled={!canPublish || working}>
              {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Upload className="mr-2 h-4 w-4" />}
              {mutation.isPending ? "Pubblicazione…" : "Pubblica su Strava"}
            </Button>
          </form>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {status.data?.connected && <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" disabled={working || busy} onClick={() => mutation.mutate({ action: "connect" })}>Ricollega Strava</Button>
            <Button variant="ghost" size="sm" disabled={working || busy} onClick={() => mutation.mutate({ action: "disconnect" })}>Scollega Strava</Button>
          </div>}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
