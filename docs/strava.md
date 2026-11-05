# Pubblicazione delle sessioni su Strava

Dal dettaglio di una giornata in **Sessions**, **Pubblica su Strava** permette di
collegare il proprio account, inserire titolo, orario e durata effettivi e caricare
un'attività `WeightTraining`. Il collegamento non pubblica automaticamente.
L'app conserva i nomi originali degli esercizi; la conversione avviene solo
nell'upload e il riepilogo Strava include i nomi GymTrack.

In alternativa ai tempi manuali, **Importa da Strava** elenca le attività della
giornata già sincronizzate dal Garmin. La selezione e **Importa durata e battito**
salvano inizio, durata totale (recuperi inclusi), battito medio/massimo e curva
cardiaca disponibile. Durata e battito compaiono anche nel dettaglio della
sessione. L'importazione da sola non pubblica nulla.

La pubblicazione crea una **nuova attività**, con le serie GymTrack e i campioni
cardiaci importati. L'originale Garmin non viene modificato o eliminato. Se Strava
rifiuta l'upload come duplicato, l'utente può eliminare manualmente l'originale
e riprovare: la copia importata è già salvata nel backend e non viene riletta da
Strava. La compatibilità effettiva del secondo caricamento va verificata su un
account reale; non si alterano gli orari per aggirare il controllo duplicati.

## Ricerca e formato

Verifica della documentazione ufficiale: **5 novembre 2026**.

- [Upload Strava](https://developers.strava.com/docs/uploads/): la sezione
  **JSON – Strength Training (Limited)** documenta `data_type=json`,
  `sport_type=WeightTraining`, `version=1.0`, tempi e array `sets`. Questo formato
  supporta `exercise_type`, `repetitions`, `weight` in kg e `duration` in secondi.
  Supporta anche `streams.time` (secondi dall'inizio) e `streams.heartrate` (bpm),
  con array della stessa lunghezza. I tempi originali, compresi i secondi e le
  pause, vengono preservati. I campioni a zero sono omessi come letture mancanti;
  non vengono interpolati o inventati valori.
  L'elenco nella pagina contiene 656 identificatori, conservati in
  [stravaExercises.ts](../supabase/functions/_shared/stravaExercises.ts).
- [OAuth Strava](https://developers.strava.com/docs/authentication/): vengono
  richiesti `activity:read_all` (incluse attività Solo io) e `activity:write`.
  I collegamenti precedenti con sola scrittura continuano a pubblicare i tempi
  manuali; **Autorizza la lettura delle attività** richiede un nuovo consenso.
  Se la lettura viene negata, la pubblicazione manuale rimane disponibile.
  Il backend scambia il codice, conserva entrambi
  i token e persiste ogni nuovo refresh token dopo la rotazione.
- [Riferimento upload](https://developers.strava.com/docs/reference/#api-Uploads-getUploadById):
  l'elaborazione è asincrona. L'interfaccia verifica lo stato ogni cinque secondi
  mentre la finestra è aperta e conserva l'ID dell'upload nel database.

La pagina di riferimento generata elenca ancora solo FIT/TCX/GPX tra i valori
`data_type`; la guida dedicata agli upload include esplicitamente JSON e il suo
schema. Questa integrazione segue la guida dedicata. La prima pubblicazione su
un account reale resta necessaria per validare il comportamento del servizio.

## Corrispondenze degli esercizi nel progetto

| Nome GymTrack | `exercise_type` Strava | Corrispondenza |
| --- | --- | --- |
| Farmer Carry | `FARMERS_CARRY` | Carry con carico |
| Alzate manubri | `LATERAL_RAISE_GENERIC` | Alzate laterali generiche |
| Pectoral Machine | `PEC_DECK_BUTTERFLY` | Pec deck |
| Panca Inclinata Manubri | `INCLINE_DUMBBELL_BENCH_PRESS` | Specifica |
| Pulley | `SEATED_CABLE_ROW` | Rematore da seduti al cavo |
| Squat | `SQUAT_GENERIC` | Nessuna attrezzatura presunta |
| Polpacci | `CALF_RAISE_GENERIC` | Generica |
| Affondi Bulgari con rialzo | `REAR_LEG_RAISED_LUNGE` | Gamba posteriore rialzata |
| Seated leg lift | `LEG_RAISE_GENERIC` | Variante seduta non disponibile |
| Polpacci Isometrics | `CALF_RAISE_GENERIC` | Variante isometrica non disponibile |
| Wall Ball | `WALL_BALL` | Specifica |
| Jump Squat | `BODY_WEIGHT_JUMP_SQUAT` | Specifica |
| Air bike | `ASSAULT_BIKE` | Bicicletta con ventola |
| Navy Seal Burpees | `BURPEE` | Variante Navy Seal non disponibile |

Gli alias includono anche gli esercizi dei dati dimostrativi e diversi nomi
italiani comuni. I nomi ufficiali vengono riconosciuti automaticamente; un
identificatore ufficiale esatto ha precedenza sugli alias. Esercizi sconosciuti
usano `CORE_GENERIC` per la categoria core o `TOTAL_BODY_GENERIC` negli altri
casi e sono segnalati prima della pubblicazione. Per aggiungere corrispondenze
modificare gli alias in
[stravaWorkout.ts](../supabase/functions/_shared/stravaWorkout.ts), senza
rinominare i record nella tabella `exercises`.

Ogni serie mantiene ripetizioni e carico propri, con ricostruzione delle serie
storiche che non hanno un array `sets`. Le serie a corpo libero inviano solo il
carico aggiunto; il peso corporeo usato nel punteggio GymTrack non diventa carico
esterno. Per gli esercizi a tempo si invia la durata, mentre le distanze restano
nel riepilogo perché lo schema delle serie Strava non contiene un campo distanza.
I superset sono indicati nel riepilogo; il formato JSON non espone gruppi superset.
Il punteggio GymTrack non viene inviato come volume o calorie.

## Configurazione e rilascio

1. Registrare un'applicazione in [Strava API settings](https://www.strava.com/settings/api).
   Impostare **Authorization Callback Domain** a `gym-track.davidemagnoni.it`,
   senza protocollo o percorso. La URL completa di ritorno è
   `https://gym-track.davidemagnoni.it/strava/callback`.
2. Applicare
   [20261105000000_strava.sql](../supabase/migrations/20261105000000_strava.sql)
   e poi [20261105001000_strava_imports.sql](../supabase/migrations/20261105001000_strava_imports.sql)
   nel SQL editor Lovable oppure con `supabase db push` nel progetto corretto.
3. Configurare i segreti della Edge Function: `STRAVA_CLIENT_ID`,
   `STRAVA_CLIENT_SECRET`, `STRAVA_APP_URL=https://gym-track.davidemagnoni.it`.
   Non usare variabili `VITE_` per
   il client secret o i token. I valori Supabase sono iniettati dal runtime.
4. Pubblicare la funzione con `supabase functions deploy strava --project-ref <ref>`
   oppure tramite la gestione Edge Functions del progetto. Pubblicare anche il
   frontend aggiornato, incluso il percorso `/strava/callback`. L'hosting deve
   riscrivere questo percorso a `index.html`, come gli altri percorsi React.
   Per Netlify la regola è già in [public/_redirects](../public/_redirects)
   e Vite la copia in `dist/_redirects` durante la build, secondo la
   [configurazione SPA documentata da Netlify](https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/).
5. Aprire una sessione sincronizzata, collegare o ricollegare Strava concedendo
   anche la lettura. Dopo che Garmin ha sincronizzato l'allenamento, selezionarlo
   e importarlo. Se l'elenco è vuoto, usare **Aggiorna elenco** dopo il sync.
   Controllare durata e battito prima di pubblicare. Controllare
   titolo, data locale, durata, serie, carichi, tipo di attività e visibilità
   nell'account Strava. La visibilità segue le impostazioni Strava dell'atleta.

Per i segreti tramite CLI preferire un file locale ignorato da Git:

```sh
cp -n supabase/functions/.env.example supabase/functions/.env
# Compilare i tre valori nel file locale, poi:
supabase secrets set --env-file supabase/functions/.env --project-ref <ref>
```

Per sviluppo locale usare l'origine effettiva del frontend in `STRAVA_APP_URL`;
Strava ammette `localhost` e `127.0.0.1` nei callback. Per il server Vite locale
impostare `STRAVA_APP_URL=http://127.0.0.1:8080` nell'ambiente locale della funzione.
Le migrazioni e il deploy non vengono applicati da
`npm run build`.

## Sicurezza e tentativi ripetuti

Tutte le azioni della funzione verificano il JWT con `auth.getUser`; anche il
completamento OAuth richiede l'account GymTrack che ha avviato il collegamento.
Lo stato OAuth casuale è salvato come SHA-256, scade in dieci minuti ed è consumato
atomicamente. Il callback frontend invia codice e stato al backend autenticato
e poi sostituisce la URL. Codici e token non vengono scritti nei log applicativi.

Le cinque tabelle Strava hanno RLS abilitata e nessun privilegio per `anon` o
`authenticated`. Solo `service_role` accede a token e stato; il browser riceve
solo lo stato del collegamento, della pubblicazione e il riepilogo importato.
I campioni cardiaci restano nella tabella `strava_imports` accessibile al solo
backend. Il backend rilegge le serie
con il JWT dell'utente, RLS e filtro sul proprietario; non accetta esercizi o
identità dell'atleta dal client. Le modifiche offline bloccano la pubblicazione
finché la sincronizzazione non è completa.

Una lease PostgreSQL serializza le operazioni per account, compresi rinnovo token
e upload. La chiave `(user_id, session_date)` e gli stati persistiti impediscono
invii ripetuti della stessa giornata. Solo dopo un rifiuto definitivo (`failed`),
un nuovo tentativo usa un identificativo file e `external_id` nuovi; i contenuti,
gli orari e i campioni restano identici. Uno stato incerto continua a bloccare
qualsiasi nuovo upload. **Verifica esito su Strava** è disponibile anche per un
upload fallito con ID noto e riconcilia lo stato senza ripubblicare. Quando Strava
indica un'attività o un upload duplicato, il messaggio include il relativo ID.
Il modello Sessions raggruppa gli esercizi
per data: viene quindi creata una sola attività Strava per giornata, senza
aggiornamenti automatici dopo successive modifiche in GymTrack.

Dopo un timeout con esito sconosciuto la pubblicazione è bloccata. Se un upload ID
è già disponibile, **Verifica esito su Strava** ne recupera lo stato. Se manca,
verificare manualmente l'account Strava prima di riconciliare il record dal SQL
editor amministrativo: se l'attività esiste, impostare `activity_id` e stato
`published`; solo se sicuramente assente, impostare stato `failed` per consentire
un nuovo tentativo. Filtrare sempre per `user_id` **e** `session_date`.

**Scollega Strava** revoca l'autorizzazione e rimuove le credenziali locali; le
attività già pubblicate e i riferimenti necessari a evitare duplicati rimangono.
Rimuove anche tutte le copie importate dell'utente, inclusi i campioni cardiaci.
**Ricollega Strava** consente di recuperare un'autorizzazione revocata o scaduta.

Ogni importazione controlla che l'attività appartenga all'atleta collegato e che
l'inizio cada nella data locale della sessione; le attività GymTrack sono escluse.
L'elenco usa paginazione e un intervallo UTC che copre tutti i fusi, filtrando poi
la data locale di ogni attività, senza dipendere dal fuso del browser. Gli errori
di rete o una curva non valida non sovrascrivono l'importazione precedente.
Se il battito non è disponibile, si importano i tempi e viene indicata l'assenza
della curva. Le attività senza battito e i tempi manuali restano pubblicabili.
Per usare tempi manuali dopo un'importazione, disattivare **Usa i dati importati
nella pubblicazione**: il nuovo upload non includerà la curva salvata.

## Verifiche automatiche

`npm run typecheck` controlla frontend e funzione server. `npm test` verifica il
catalogo, le corrispondenze, le unità, le serie a tempo, l'isolamento degli account,
OAuth monouso, rinnovo dei token, upload JSON e polling, concorrenza, timeout e
privilegi PostgreSQL. Copre anche importazione e selezione esplicita, fusi orari e
paginazione, precisione al secondo, campioni mancanti/non validi, permessi di
lettura, isolamento degli account e ritentativo dei duplicati usando la copia
salvata. HTTP Strava è simulato; non sono pubblicate attività reali durante i test.

Prova HTTP in sola lettura del 5 novembre 2026: il token locale esistente risponde
`401`, `AccessToken / activity:read_permission / missing`. La prova reale di
importazione e upload richiede quindi un nuovo consenso OAuth di lettura.
Nello stesso ambiente la CLI Supabase risponde `403` alla lettura delle Edge
Functions del progetto per privilegi insufficienti: migrazione e deploy devono
essere eseguiti con un account autorizzato o dagli strumenti del progetto Lovable.

Le due migrazioni sono state successivamente applicate dal SQL editor Lovable
del progetto `2575cd2b-6216-4af0-9f5c-714794b02fc8` e registrate nello storico
come `20261105000000` e `20261105001000`. Verifica sul database ospitato:
cinque tabelle presenti, RLS attiva, ruoli browser senza privilegi, accesso
`service_role` e RPC di lock privata, tutti confermati. Le query ripetibili sono
in [verify_strava.sql](../supabase/verify_strava.sql).

Il frontend è stato sincronizzato su GitHub e pubblicato da Netlify; la funzione
Cloud risponde con CORS limitato al dominio dell'app e rifiuta le richieste
anonime. Dopo l'inserimento dei segreti dal modulo protetto Lovable, il consenso
OAuth e l'importazione reale del 5 novembre 2026 sono riusciti: durata 3736
secondi e curva cardiaca disponibili. Il primo upload è stato rifiutato come duplicato
del Garmin; l'utente ha eliminato manualmente l'originale da Strava. La copia
importata rimane disponibile per i tentativi successivi.

La prova finale è riuscita dopo il redeploy della correzione dei ritentativi.
Verifica sulla pagina Strava: durata totale e in movimento corrispondenti alla
registrazione originale, curva cardiaca con media e massimo e riepilogo degli
esercizi con le rispettive serie. Il nuovo upload ha usato la copia salvata in
GymTrack, senza rileggere l'attività Garmin che l'utente aveva eliminato.

La CI GitHub ha superato lint, test e build. Il controllo `npm audit` segnala
vulnerabilità nelle dipendenze preesistenti (minimatch, postcss-selector-parser,
Vite e Zod); non viene disabilitato e gli aggiornamenti di quelle dipendenze
restano separati dall'integrazione Strava.

### Prova reale dopo il rilascio

1. Applicare le migrazioni prima di pubblicare la funzione e il frontend.
2. Ricollegare Strava dal dettaglio di una sessione e concedere la lettura,
   incluse le attività Solo io. Non è sufficiente rinnovare il vecchio token.
3. Selezionare l'attività Garmin corretta del giorno e importarla. Verificare
   durata esatta, medie/massimi e presenza dei campioni cardiaci.
4. Pubblicare e attendere l'esito. Verificare serie e curva del battito nella
   nuova attività Strava; non eliminare nulla automaticamente.
5. Solo se l'esito è `failed` per duplicato, eliminare manualmente l'originale
   Garmin da Strava e riprovare mantenendo selezionati i dati già importati.
   Un esito incerto non va ritentato senza prima verificarlo sul profilo.
