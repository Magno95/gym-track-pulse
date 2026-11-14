# GymTrack

GymTrack è un diario di allenamento per gestire esercizi, registrare serie e superset, confrontare i progressi e tenere uno storico del peso corporeo. Include un client web e un client iPhone React Native + Expo, collegati allo stesso backend Supabase.

Il progetto nasce con Lovable; il frontend web viene distribuito su Netlify. Ogni installazione può usare un proprio progetto Supabase. Le credenziali e i dati degli utenti non sono necessari per compilare il codice.

## Come usare l’app

### Account e profilo

1. Apri l’app e scegli **Sign Up** per registrarti con email e password, oppure **Sign In** per accedere. Se il backend richiede la conferma email, completa prima la verifica.
2. Apri **Profile** dall’icona utente. Puoi inserire altezza e misurazioni del peso con la data da cui valgono.
3. Per gli esercizi a corpo libero serve una misurazione valida alla data dell’allenamento. Il peso storico viene salvato nelle nuove serie: le modifiche successive al profilo non riscrivono automaticamente gli allenamenti precedenti.

### Esercizi e allenamenti web

1. In **Exercises**, cerca un esercizio o sfoglia le categorie: braccia, petto, schiena, gambe, core e cardio.
2. Premi **+ → New exercise** per aggiungere nome e categoria alla tua libreria. Dal dettaglio puoi gestire le caratteristiche e l’immagine dell’esercizio.
3. Per registrare un allenamento, usa **+ → Log session**, scegli l’esercizio e imposta la data. Inserisci ripetizioni e carico per ciascuna serie; per gli esercizi a tempo usa i secondi. **Add Set** aggiunge una serie e salva la sessione; attendi la conferma nell’interfaccia.
4. Attiva **Super Set** per abbinare un secondo esercizio e compila le relative serie. L’app applica il moltiplicatore mostrato e sincronizza il gruppo con un’operazione atomica.
5. In **Sessions** trovi gli allenamenti raggruppati per giornata. Apri una giornata per consultarne i dettagli; apri un esercizio per vedere storico e grafico dei progressi e modificare le registrazioni.

Il **Session Score** è un indicatore interno: somma i prodotti ripetizioni × carico delle serie, con l’eventuale moltiplicatore. Per il corpo libero il carico include il peso corporeo valido alla data più il carico aggiunto; per il corpo libero a tempo usa secondi × carico. Non rappresenta calorie o una misura clinica e aggrega unità diverse.

### Salvataggi offline

Le modifiche supportate vengono prima salvate nella coda locale e poi sincronizzate con Supabase. Il banner distingue le operazioni pendenti e permette di ritentare o esportare quelle dell’account corrente in caso di errore. Un salvataggio locale non implica che il server abbia già ricevuto i dati.

Serve una connessione per il primo accesso e per le operazioni remote. Le code web sono conservate in IndexedDB nel singolo browser e separate per account; non vengono trasferite al client iPhone. Attendi la sincronizzazione prima di cancellare i dati del browser o cambiare dispositivo. Le vecchie code globali senza proprietario richiedono un recupero separato e non vengono inviate automaticamente.

### Strava

Dal dettaglio di una giornata sincronizzata puoi collegare Strava e pubblicare volontariamente una nuova attività di forza. Il collegamento da solo non pubblica nulla. Puoi indicare orario e durata oppure importare durata e battito da un’attività già presente su Strava, per esempio sincronizzata da Garmin.

L’importazione non modifica l’attività originale: la pubblicazione ne crea una nuova e può essere rifiutata da Strava come duplicato. Controlla riepilogo e visibilità prima dell’invio. La pubblicazione rimane bloccata finché ci sono modifiche locali da sincronizzare. Configurazione, corrispondenze degli esercizi e gestione dei retry sono in [docs/strava.md](docs/strava.md).

### Client iPhone

Il client in [mobile/](mobile/README.md) usa lo stesso account e database. Comprende libreria esercizi, sessione in corso, superset, grafici, misurazioni, sincronizzazione offline SQLite e Strava. Aggiunge cronometro, timer di recupero, notifiche locali e Live Activities sui dispositivi compatibili. Per installazione, build e limiti delle prove su dispositivo consulta il README dedicato. Le estensioni native richiedono una build che le includa.

## Architettura tecnica

| Livello | Tecnologie e responsabilità |
| --- | --- |
| Web | React 18, TypeScript strict, Vite, React Router; schermate caricate con import dinamici |
| UI | Tailwind CSS 4, componenti shadcn/ui e Radix, form React Hook Form + Zod, grafici Recharts |
| Dati e sincronizzazione web | TanStack Query per query/cache; IndexedDB tramite `idb` per coda persistente e retry |
| Backend | Supabase Auth, PostgreSQL con Row Level Security, RPC e Storage per immagini |
| Strava | Edge Function Supabase in TypeScript, OAuth, import e upload; token conservati sul backend |
| iPhone | React Native + Expo, Expo Router e coda SQLite; moduli di dominio condivisi con il web |
| Distribuzione | Web statico in `dist/`; backend distribuito separatamente con Supabase CLI |

Il browser comunica con Supabase usando la chiave pubblicabile e il JWT dell’utente. RLS e controlli sul proprietario isolano i dati degli account. Al cambio utente l’app annulla le query precedenti, svuota la cache in memoria e azzera i form; le operazioni pendenti restano associate al loro proprietario.

Gli UUID stabili rendono i retry della coda idempotenti; il coordinamento tra schede limita gli invii concorrenti. Le immagini degli esercizi sono leggibili pubblicamente: non caricare immagini riservate. Le scritture sono riservate al proprietario; i nuovi upload usano percorsi per utente, immagini WebP ridimensionate e miniature.

La funzione Strava verifica l’identità con `auth.getUser`, gestisce stato OAuth monouso e scadenza, rinnovo dei token e stato persistente delle pubblicazioni. Le tabelle dei token sono accessibili solo al backend con ruolo `service_role`.

### Struttura della repository

```text
src/pages/                 Schermate web e callback OAuth
src/components/            Componenti, form e UI
src/hooks/                 Query e sincronizzazione
src/lib/                   Dominio, validazione, cache e coda offline
src/integrations/supabase/ Client e tipi del database
supabase/migrations/       Schema, policy RLS, funzioni SQL e indici
supabase/functions/        Edge Function Strava e moduli condivisi
supabase/verify_*.sql       Verifiche SQL da eseguire sul proprio backend
mobile/                    Client iPhone, istruzioni e verifiche separate
scripts/                   Deploy backend e statistiche bundle
tests/                    Test web, dominio, coda, query e database
tools/lovable-tagger/      Adattamento locale del plugin Lovable per Tailwind 4
```

## Avvio locale web

Requisiti: **Node.js 24+**, **npm 11** e un progetto Supabase. `package-lock.json` è il lockfile di riferimento; conserva anche `tools/lovable-tagger`, dipendenza locale richiesta dall’installazione.

```sh
npm ci
cp .env.example .env
# Compila URL e chiave pubblicabile del TUO progetto Supabase in .env.
npm run dev
```

Il server configurato in `vite.config.ts` usa la porta **5174** e ascolta su `0.0.0.0`, quindi può essere raggiungibile dalla rete locale. Apri `http://localhost:5174`. La porta è fissa: se occupata, Vite termina con errore.

| Variabile frontend | Valore |
| --- | --- |
| `VITE_SUPABASE_URL` | URL del proprio progetto Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Chiave pubblicabile, oppure chiave legacy `anon` del progetto |

Tutte le variabili `VITE_*` finiscono nel client: non usarle per password, token personali, chiavi segrete o `service_role`. URL e chiavi pubblicabili non sostituiscono le policy RLS. Per il client iPhone usa [mobile/.env.example](mobile/.env.example) e le variabili `EXPO_PUBLIC_SUPABASE_*` descritte nella guida mobile.

### Preparazione del backend

1. Crea il tuo progetto Supabase e sostituisci `project_id` in `supabase/config.toml` con il relativo riferimento.
2. Configura Supabase Auth: Site URL e redirect consentiti devono corrispondere all’origine usata dal frontend. Per lo sviluppo web corrente usa `http://localhost:5174`, oppure `http://127.0.0.1:5174` se apri quell’indirizzo.
3. Applica le migrazioni in ordine tramite la CLI inclusa nel progetto:

   ```sh
   npx supabase login
   npx supabase link --project-ref <tuo-project-ref>
   npx supabase db push --linked --dry-run
   npx supabase db push --linked
   ```

4. Esegui gli script `supabase/verify_*.sql` pertinenti per controllare schema, policy e funzioni. Le migrazioni non importano dati personali o backup della produzione. Non eseguire nuovamente a mano migrazioni già applicate; gli script `register_*.sql` servono solo per registrare applicazioni SQL manuali.
5. Se vuoi usare Strava, configura `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` e `STRAVA_APP_URL` nei segreti della funzione, poi distribuiscila come descritto in [docs/strava.md](docs/strava.md). Usa il tuo dominio e il callback `/strava/callback`; in locale adatta anche `STRAVA_APP_URL` all’origine e alla porta effettive. Le variabili Supabase necessarie alla funzione sono fornite dal runtime.

In alternativa, lo script `npm run backend:deploy` usa le credenziali del file locale `.env.production`: parti da [.env.production.example](.env.production.example), configura il tuo progetto e prova prima `npm run backend:deploy -- --dry-run`. Lo script verifica che `SUPABASE_URL` corrisponda al `project_id`, applica le nuove migrazioni e distribuisce la funzione Strava. Non configura i segreti Strava e non pubblica il frontend. La [procedura di migrazione dell’installazione originale](docs/migrazione-supabase-personale.md) documenta le operazioni specifiche di quell’ambiente.

### Build e hosting

```sh
npm run build
npm run preview
```

La build esegue il typecheck e genera `dist/`. Su Netlify configura `npm run build` come comando e `dist` come directory pubblicata; fornisci solo le variabili frontend pubbliche. [public/_redirects](public/_redirects) contiene la riscrittura SPA necessaria per aprire direttamente le pagine e `/strava/callback`. Su altri hosting configura una riscrittura equivalente verso `index.html`.

Applica prima le migrazioni richieste dalla versione che stai distribuendo. `npm run build` non modifica il database e non distribuisce le Edge Function.

## Verifiche di sviluppo

```sh
npm run lint
npm test
npm run build
npm audit --audit-level=moderate
npm run bundle:stats
```

I test coprono la coda su IndexedDB simulato, hook/query, isolamento degli account, logica degli allenamenti e integrazione Strava; le migrazioni vengono eseguite su PostgreSQL tramite PGlite. Non emulano integralmente HTTP, Storage o servizi esterni di produzione. Il client mobile ha comandi e controlli separati nel proprio README.

`bundle:stats` richiede una build precedente e somma i moduli JavaScript necessari all’avvio delle schermate, comprese le dipendenze statiche condivise; esclude i successivi import dinamici. La CI web esegue installazione, lint, test, build e audit su Node 24. Un workflow separato incrementa la versione patch sui push a `main` salvo il marcatore `[skip version bump]`.

## Configurazione e pubblicazione dei sorgenti

I file `.env`, `.env.production`, `supabase/functions/.env`, gli ambienti mobile e i backup locali devono restare esclusi da Git. Versiona solo gli esempi senza credenziali. Non caricare `.env.production` nell’hosting frontend o come insieme di segreti della funzione.

L’esito della verifica dei segreti, con ambito e limiti della scansione, è in [docs/verifica-segreti-2026-11-14.md](docs/verifica-segreti-2026-11-14.md). La presenza in cronologia di una vecchia chiave Supabase `anon` è documentata nel report. La verifica riguarda i sorgenti e non sostituisce il controllo delle policy del proprio backend.

## Documentazione di approfondimento

- [Profili, peso corporeo e snapshot delle serie](docs/bodyweight.md).
- [Configurazione, importazione e pubblicazione Strava](docs/strava.md).
- [Guida e architettura del client iPhone](mobile/README.md).
- [Analisi prestazioni e sicurezza del 2 ottobre 2026](docs/analisi-prestazioni-sicurezza-2026-10-02.md).
- [Correzioni, isolamento account e verifiche del 3 ottobre 2026](docs/correzioni-prestazioni-sicurezza-2026-10-03.md).
- [Migrazione del backend originale](docs/migrazione-supabase-personale.md).
