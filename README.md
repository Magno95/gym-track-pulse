# GymTrack

Applicazione per esercizi, sessioni, superset e misurazioni corporee. Frontend React 18, TypeScript, Vite e Tailwind; autenticazione, PostgreSQL e immagini tramite Lovable Cloud/Supabase.

[Progetto Lovable](https://lovable.dev/projects/2575cd2b-6216-4af0-9f5c-714794b02fc8).

## Sviluppo

Usare Node.js 24 e npm 11. `package-lock.json` è il lockfile di riferimento.

```sh
npm ci
npm run dev
```

Il server ascolta su `127.0.0.1`. Configurare `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` nell'ambiente locale/hosting. La chiave frontend deve essere quella pubblicabile, mai una chiave amministrativa.

## Verifiche

```sh
npm run lint
npm test
npm run build
npm audit --audit-level=moderate
npm run bundle:stats
```

La build include il typecheck strict. I test eseguono la coda reale su IndexedDB simulato, gli hook React Query e tutte le migrazioni su PostgreSQL tramite PGlite. I servizi HTTP e il sistema Storage di produzione non sono emulati integralmente.

`bundle:stats` richiede una build precedente e somma i moduli JavaScript necessari all'avvio di ogni schermata, comprese le dipendenze statiche condivise. Le dipendenze caricate successivamente con import dinamici sono escluse. La CI usa Node 24 e verifica installazione, lint, test, build e audit.

Gli stili usano Tailwind 4 con il plugin Vite. Sono supportati Safari 16.4+, Chrome 111+ e Firefox 128+, secondo i requisiti di Tailwind. Il plugin Lovable è una [versione locale adattata a Tailwind 4](tools/lovable-tagger/README.md), che mantiene l'editor visuale ed elimina la dipendenza vulnerabile da Tailwind 3. `package-lock.json` include questa dipendenza locale: conservare `tools/lovable-tagger` nei checkout e nei deploy.

## Database e rilascio

Applicare le migrazioni prima di pubblicare questo frontend. Il database ospitato si gestisce nel progetto Lovable, **Cloud → SQL editor**. La migrazione profilo/peso `20261002223000` è documentata in [docs/bodyweight.md](docs/bodyweight.md).

Per le correzioni del 3 ottobre 2026, eseguire in ordine:

1. [20261003000000_security_sync_performance.sql](supabase/migrations/20261003000000_security_sync_performance.sql).
2. [20261003001000_overview_rpc_permissions.sql](supabase/migrations/20261003001000_overview_rpc_permissions.sql).
3. [verify_security_sync_performance.sql](supabase/verify_security_sync_performance.sql): tutti i 13 controlli devono essere `true`; controllare anche le policy Storage elencate.
4. Solo per SQL eseguito manualmente, [register_security_sync_performance.sql](supabase/register_security_sync_performance.sql) registra entrambe le versioni nello storico senza applicarle nuovamente. Con `supabase db push` la registrazione è automatica.

Il primo file è transazionale e conserva i valori delle sessioni precedenti. I vincoli `NOT VALID` controllano le nuove scritture senza modificare automaticamente eventuali dati storici irregolari. Non rieseguire il primo file se le modifiche risultano già applicate.

Per gli esercizi a tempo con peso corporeo, come Plank, applicare anche
[20261003002000_timed_bodyweight.sql](supabase/migrations/20261003002000_timed_bodyweight.sql)
prima di pubblicare il frontend e controllare i sei risultati di
[verify_timed_bodyweight.sql](supabase/verify_timed_bodyweight.sql). Il punteggio
delle nuove serie è secondi × (peso corporeo alla data dell'allenamento + carico
aggiunto); le sessioni precedenti conservano valori e modalità.
Per esecuzioni manuali registrare la versione con
[register_timed_bodyweight.sql](supabase/register_timed_bodyweight.sql).

## Dati offline e account

Ogni account ha una coda IndexedDB separata. Le operazioni sono persistite prima di mostrare il salvataggio locale; gli errori restano recuperabili. UUID stabili evitano duplicati nei retry e il coordinamento tra schede evita invii concorrenti. I superset vengono inseriti con una singola richiesta atomica.

Cache e query sono separate per account. Al cambio utente le richieste precedenti vengono annullate, la cache in memoria viene svuotata e lo stato dei form viene azzerato. Ogni salvataggio richiede il proprietario catturato dal form. Le modifiche pendenti rimangono disponibili quando torna il relativo account. Il banner permette retry ed esportazione delle sole operazioni dell'account corrente.

Le vecchie chiavi globali sono conservate ma escluse da lettura, sincronizzazione ed esportazione nell'app: mancava il proprietario, quindi il recupero richiede una verifica separata dell'account di origine. Vedere [il report delle correzioni](docs/correzioni-prestazioni-sicurezza-2026-10-03.md) per dettagli e limiti.

Le immagini degli esercizi mantengono la lettura pubblica. Le scritture sono riservate al proprietario; i nuovi upload usano percorsi per utente, WebP ridimensionati e miniature. Le pulizie pendenti verificano i riferimenti sul server prima di eliminare file.

## Documentazione

- [Analisi iniziale del 2 ottobre](docs/analisi-prestazioni-sicurezza-2026-10-02.md).
- [Correzioni e verifiche del 3 ottobre](docs/correzioni-prestazioni-sicurezza-2026-10-03.md).
- [Profili e sessioni a corpo libero](docs/bodyweight.md).
