# Migrazione da Lovable Cloud a Supabase personale

## Stato completato il 7 novembre 2026

- Produzione: https://gym-track.davidemagnoni.it, frontend Netlify e backend personale `qmgrcpkpwprwcqljvopo`.
- Sorgente conservata: `gixmjerckbujswifueeb`, progetto Lovable `2575cd2b-6216-4af0-9f5c-714794b02fc8`.
- Applicate e registrate tutte le 14 migrazioni tramite CLI.
- Copiati 2 utenti e identità con gli UUID e gli hash originali, 39 esercizi, 197 sessioni, 1 profilo, 3 misurazioni e i dati Strava.
- Tutte le righe importate sono state confrontate integralmente con il backup prima delle prove di login. Successivamente sono stati aggiornati soltanto gli URL delle immagini e i normali dati di autenticazione/rinnovo Strava.
- Copiate 26 immagini, 13.795.790 byte, con verifica SHA-256 e ripristino della proprietà originale. Aggiornati 25 URL degli esercizi.
- Schema applicativo equivalente alla sorgente, escluso il trigger RLS aggiuntivo gestito da Supabase. Tutti i controlli SQL `verify_*.sql` passati.
- Verificate sessioni temporanee dei due account dopo consenso esplicito: 15 e 24 esercizi, RPC overview funzionante e isolamento tra utenti. Strava configurato e lettura API riuscita; nessuna attività pubblicata. Chiamate anonime rifiutate con 401.
- Prima del passaggio confrontate le impronte del database Lovable live con la destinazione: esercizi, sessioni, profili, pesi, importazioni e pubblicazioni coincidevano.
- Configurati Site URL e redirect Auth, segreti e deploy della funzione Strava.
- Aggiornate variabili pubbliche Netlify di produzione, `.env` e `.env.production` locali. Pubblicato deploy Netlify `6aef4c1b16c1c39331694be0`; verificati HTTP 200 e hash dei bundle con il nuovo backend.
- Test applicativi: 61 superati; lint e build con typecheck superati. Audit npm: 14 segnalazioni sulle altre dipendenze (12 moderate, 2 alte); nessuna sulla CLI aggiunta o tar. La correzione delle dipendenze estranee alla migrazione resta separata.
- Backup, manifesti e log privati sono nella directory ignorata `migration-data.local/`. Contengono dati e segreti: non pubblicarli.

## Aggiornamenti successivi

Con Node 24+, eseguire `npm ci` e compilare le credenziali locali indicate sotto.

```sh
npm run backend:deploy -- --dry-run
npm run backend:deploy
```

Il primo comando controlla le migrazioni pendenti. Il secondo applica quelle nuove e pubblica la funzione Strava. Entrambi verificano che URL e progetto in `supabase/config.toml` coincidano; un errore interrompe il rilascio. Pubblicare il frontend solo dopo il completamento del backend. Non vengono copiati segreti amministrativi su Netlify e questo comando non equivale a una pipeline automatica GitHub.

Dopo il passaggio riaprire l’app e accedere nuovamente. Le vecchie sessioni appartengono al progetto Lovable. Il codice offline mantiene le code per UUID: eventuali operazioni ancora pendenti sui dispositivi vanno controllate prima di eliminarle. Per tornare alla sorgente dopo nuove scritture sul target occorre prima riconciliare i dati.

## Credenziali locali

Il file `.env.production` è escluso da Git. Non stamparne il contenuto, non
caricarlo interamente su Netlify e non usare `set -x` durante le operazioni.
Il file contiene già URL, chiave pubblicabile, chiave segreta API e URL JWKS
della destinazione. La chiave API segreta non è un token personale Supabase
e non sostituisce la password PostgreSQL.

Aggiungere nello stesso file:

```dotenv
SUPABASE_ACCESS_TOKEN=
SUPABASE_DB_PASSWORD=
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
STRAVA_APP_URL=https://gym-track.davidemagnoni.it
```

- `SUPABASE_ACCESS_TOKEN`: token personale da https://supabase.com/dashboard/account/tokens, per CLI, migrazioni e deploy della funzione.
- `SUPABASE_DB_PASSWORD`: password del database del nuovo progetto.
- `STRAVA_CLIENT_ID` e `STRAVA_CLIENT_SECRET`: credenziali dell'app esistente da https://www.strava.com/settings/api.
- `STRAVA_APP_URL`: origine del frontend; non è un segreto.

La funzione riceve dal runtime Supabase le proprie variabili `SUPABASE_*`.
Pubblicare nei suoi segreti soltanto i tre valori `STRAVA_*`, tramite un file
temporaneo privato; non inviare l'intero `.env.production` con `secrets set`.
In Netlify serviranno solo `VITE_SUPABASE_URL` e
`VITE_SUPABASE_PUBLISHABLE_KEY`, valorizzati dalla destinazione al momento
del passaggio. Gli attuali nomi senza `VITE_` non cambiano il backend del client.

## Ripristino e verifiche

1. Scaricare l'export Lovable dallo Storage in una directory locale ignorata,
   ad esempio `migration-data.local/`, con permessi riservati. Contiene anche
   dati personali, hash delle password e token Strava: non versionarlo.
2. Usare strumenti PostgreSQL compatibili con la versione dell'archivio e con
   compressione zstd. Gli strumenti compatibili sono installati in `/opt/homebrew/opt/postgresql@17/bin/`.
   Leggere l'indice dell'archivio prima di scegliere cosa ripristinare.
3. Confrontare lo schema esportato con le 14 migrazioni locali. Creare lo schema
   della destinazione con la CLI e importare selettivamente i dati, tenendo conto
   degli schemi gestiti già presenti. Evitare il ripristino completo alla cieca,
   `--clean` e duplicazioni dei record iniziali dei bucket.
4. Conservare gli UUID degli utenti e tutte le relazioni. Verificare quali dati
   `auth` possono essere ripristinati; non ricreare account con nuovi UUID.
   Le sessioni dovranno essere rinnovate sul nuovo progetto. Configurare il
   provider email e Site URL/redirect dell'app.
5. Copiare file e miniature di `exercise-images`, mantenendo i percorsi. Il
   database non contiene i byte dei file. Verificare numero, dimensioni e hash;
   aggiornare gli URL assoluti delle immagini soltanto nella destinazione.
6. Confrontare conteggi e contenuti di `exercises`, `sessions`, `profiles`,
   `body_weight_history`, `strava_connections`, `strava_imports`,
   `strava_publications`, `strava_oauth_states` e `strava_locks`. Controllare
   scadenza degli stati OAuth e dei lock; non riutilizzare sessioni pendenti.
7. Eseguire gli script `supabase/verify_*.sql` applicabili, verificare storico
   migrazioni, RLS e privilegi, e provare login, lettura e salvataggio.
8. Configurare i segreti e distribuire `strava`; verificare compatibilità delle
   chiavi e del controllo JWT con il nuovo progetto, CORS e rifiuto delle chiamate
   anonime. Provare importazione senza pubblicare attività reali su Strava.
9. Prima del passaggio, svuotare le code offline di tutti i dispositivi e
   interrompere temporaneamente le scritture sulla sorgente. L'export iniziale
   non include modifiche successive: riconciliarle prima di cambiare backend.
   Lovable permette un export ogni 24 ore.
10. Aggiornare configurazione locale, `supabase/config.toml` e variabili pubbliche
    Netlify; pubblicare e verificare l'app sul dominio effettivo. Conservare la
    sorgente per il recupero. Dopo nuove scritture sul target, il ritorno alla
    sorgente richiede prima la riconciliazione di tali dati.
11. Configurare il rilascio delle future migrazioni tramite CLI/GitHub Actions,
    prima del deploy frontend dipendente dal nuovo schema.

## Riferimenti

- [Migrazione ufficiale Lovable](https://docs.lovable.dev/tips-tricks/external-deployment-hosting).
- [Esportazione database Lovable](https://docs.lovable.dev/features/database-backups).
- [Backup e ripristino Supabase](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).
- [Migrazioni automatizzate Supabase](https://supabase.com/docs/guides/deployment/managing-environments).
