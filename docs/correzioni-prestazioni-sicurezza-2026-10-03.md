# Correzioni GymTrack — 3 ottobre 2026

Le correzioni dei 14 problemi dell'[analisi iniziale](analisi-prestazioni-sicurezza-2026-10-02.md) sono implementate. Frontend, sincronizzazione, query e controlli automatici sono verificati localmente. Entrambe le migrazioni backend sono state applicate e registrate in Lovable Cloud il 3 ottobre 2026; tutti i 13 controlli sul database ospitato sono passati.

Il perimetro comprende l'app React/Vite e il backend Supabase/Lovable Cloud. Le funzionalità locali già presenti di profilo, peso corporeo e navigazione flottante sono mantenute. La rimozione di `frontend-kiosk`, avvenuta esternamente a questi interventi, resta esclusa dalla consegna.

## Interventi e copertura

| Problema iniziale | Correzione implementata | Verifica principale |
| --- | --- | --- |
| 1. Permessi immagini | Sostituzione delle tre policy permissive; scritture con proprietario JWT, nuovi percorsi per utente e limiti MIME/5 MiB | RLS: account diverso, proprietario falsificato, trasferimento del proprietario e cancellazione altrui |
| 2. Dati locali condivisi | Auth centralizzata, annullamento richieste, query/cache/coda separate per account, reset dei form e proprietario esplicito per ogni salvataggio | Cambio A → B → A, logout, risposta iniziale in ritardo, submit del vecchio account, reset di form/cache e replay con coda di un altro account |
| 3. Coda eliminata dopo tre errori | IndexedDB transazionale prima del successo locale; retry progressivi; errori permanenti conservati, retry manuale ed export per account | Cinque errori consecutivi conservano le modifiche; errori di validazione sospendono i retry automatici |
| 4. Concorrenza e risposta persa | Coordinatore condiviso, Web Locks e lease IndexedDB tra schede; UUID persistiti; upsert con conflitti ignorati | Flush concorrenti in due contesti, risposta persa, modifica durante l'invio, retry che conserva modifiche già confermate |
| 5. Superset parziali | Inserimento multiplo atomico con UUID stabili per entrambe le righe e il gruppo | Seconda riga invalida annulla entrambe; retry non aggiunge altre righe |
| 6. Storici troncati | Paginazione stabile fino alla pagina vuota per sessioni, esercizi e pesi, con errore su letture parziali | 1.234 record con limite API di 73 righe; errore su una pagina intermedia |
| 7. ID temporanei incoerenti | UUID definitivi anche offline; overlay della coda e invalidazione di lista/dettaglio/giornate/storico | Sessione figlia ancora visibile dopo conferma dell'esercizio e fallimento del suo invio |
| 8. Cache fresca e giornata separata | Conservazione di `updatedAt`; overview usata come placeholder del dettaglio; cache completa IndexedDB; giornata tramite React Query e overlay | Cache vecchia aggiornata subito; 1.201 sessioni nel dettaglio; nuova sessione offline e cambio data visibili; avviso di dati parziali |
| 9. Download e calcoli ripetuti | RPC con due sessioni recenti per esercizio; richieste mirate per giorno/esercizio; storico leggero caricato solo quando serve; raggruppamento Map; indici composti; visualizzazione progressiva di liste e misurazioni | Overview limitata a due sessioni; filtri proprietario/giorno; test SQL e hook |
| 10. Bundle iniziale | Pagine, grafici e dialog caricati su richiesta; misurazione dell'intero insieme di dipendenze iniziali dal manifest | Build e `npm run bundle:stats` |
| 11. Immagini pesanti e orfani | Logo da 192 px; WebP fino a 1.280 px, miniature 192 px, lazy loading; pulizia durevole prima delle scritture con controllo dei riferimenti e attesa di dieci minuti | Pulizia forzata rispetta l'attesa e non blocca le sessioni; policy/bucket verificati in SQL |
| 12. Validazione solo client | Vincoli SQL, validazione JSON/date/carichi/ripetizioni e snapshot; trigger autorevole per serie, carico e punteggio; moltiplicatore salvato per sessione | Input falsificati respinti, punteggi ricalcolati, snapshot conservati e vecchi client compatibili |
| 13. Advisory e lockfile divergenti | Unico lockfile npm; aggiornamento dipendenze, incluso React Router 7, Vite 8, Recharts 3, ESLint 10 e Tailwind 4; plugin Lovable adattato senza Tailwind 3; dev server su loopback | Installazione e audit; typecheck, lint e build di sviluppo Lovable dopo adeguamento delle API |
| 14. Controlli deboli | TypeScript strict; build con typecheck; lint senza warning; CI Node 24 con installazione, test, build e audit | 38 test, lint e build superati |

Le operazioni che hanno ricevuto un errore di autenticazione restano associate all'account originale. Le operazioni di pulizia immagini sono indipendenti dalle scritture degli allenamenti. Le letture complete vengono persistite separatamente dall'overview; un riepilogo di due sessioni non viene presentato come storico completo. La proiezione delle modifiche conserva il moltiplicatore e l'identità del superset anche se la sessione viene spostata in una giornata che il server non contiene ancora.

## Misure della build

Dimensioni in kB decimali, gzip stimato sui singoli file. La base iniziale è il bundle unico misurato nell'analisi del 2 ottobre.

| Risorsa / schermata | Prima | Dopo |
| --- | --- | --- |
| JavaScript necessario all'autenticazione | 1.161,88 kB / gzip 332,90 kB | 653,39 kB / gzip 192,96 kB |
| JavaScript necessario alla home | 1.161,88 kB / gzip 332,90 kB | 664,50 kB / gzip 202,85 kB |
| Avvio comune, senza pagina | Bundle unico | 582,26 kB / gzip 173,93 kB |
| Logo | 470,80 kB, 1.024 px | 8,27 kB, 192 px |
| CSS | 69,01 kB / gzip 12,17 kB | 86,80 kB / gzip 14,54 kB |

Il JavaScript compresso iniziale diminuisce di circa il 42% per l'autenticazione e del 39% per la home. Il logo diminuisce di circa il 98%. Il chunk dei grafici, 353,63 kB / gzip 102,79 kB, viene scaricato al suo utilizzo. L'aggiornamento di sicurezza a Tailwind 4 aumenta il CSS compresso di 2,40 kB rispetto alla prima build corretta, che usava ancora Tailwind 3.

I totali includono ricorsivamente le dipendenze statiche condivise della pagina e dell'entry point, contando ciascun file una sola volta; non confrontano soltanto il chunk principale. Le dipendenze degli import dinamici successivi sono escluse. Lo script riproducibile è [scripts/bundle-stats.mjs](../scripts/bundle-stats.mjs). Questi valori descrivono i byte della build: LCP, INP e tempi delle query sul database ospitato richiedono misure nell'ambiente reale.

## Verifiche locali

- `npm ci`: installazione dal lockfile verificata.
- `npm run lint`: 0 errori, 0 warning.
- `npm test`: 38 test superati, 0 falliti.
- `npm run build`: typecheck strict e produzione superati, senza avvisi sulle dimensioni dei chunk.
- `npm audit --audit-level=moderate`: 0 vulnerabilità segnalate nel lockfile aggiornato.
- `npm run bundle:stats`: misure riportate sopra.
- `LOVABLE_DEV_SERVER=true npm run build:dev`: compilazione con tracciamento JSX e generazione della configurazione per l'editor Lovable superata.

Il test SQL esegue tutti i file di migrazione e riproduce anche i privilegi predefiniti che possono concedere `EXECUTE` direttamente a `anon`. La seconda migrazione revoca quel permesso esplicito sulla RPC, oltre al permesso di `PUBLIC`. Il checksum dei campi preesistenti delle sessioni, inclusi valori e JSON dei set, rimane identico prima e dopo la prima migrazione. Il test comprende record storici irregolari e inserimenti da client che omettono il nuovo moltiplicatore.

PGlite esegue PostgreSQL con schemi Auth e Storage minimali di test. Le richieste HTTP sono controllate dal test harness e IndexedDB usa `fake-indexeddb`. Dopo l'applicazione delle migrazioni in Cloud sono stati verificati anche il caricamento reale di esercizi, storico e grafici nell'anteprima Lovable e i permessi dell'API. Questi controlli non sostituiscono una prova completa del servizio Storage o dei flussi OAuth.

## Applicazione in Lovable Cloud

Il primo deploy del frontend ha preceduto l'applicazione delle migrazioni: il caricamento falliva con `PGRST202` sulla RPC `get_exercise_overview` e `42703` sulla colonna `sessions.value_multiplier`. Una verifica diretta in Cloud ha confermato che entrambi mancavano e che i dati erano presenti. Le due migrazioni sono state quindi applicate, verificate e registrate tramite l'editor SQL; i conteggi sono rimasti invariati: 39 esercizi e 189 sessioni. Le sole tre policy Storage di scrittura presenti sono quelle del proprietario, e la RPC rifiuta l'accesso anonimo con `42501`.

Per un nuovo ambiente, completare in **Cloud → SQL editor** prima di pubblicare il frontend:

1. [20261003000000_security_sync_performance.sql](../supabase/migrations/20261003000000_security_sync_performance.sql).
2. [20261003001000_overview_rpc_permissions.sql](../supabase/migrations/20261003001000_overview_rpc_permissions.sql).
3. [verify_security_sync_performance.sql](../supabase/verify_security_sync_performance.sql): i 13 controlli devono avere `ok = true`. Il secondo risultato elenca tutte le policy Storage di scrittura: verificare che non esistano ulteriori policy permissive per `exercise-images`.
4. Per esecuzioni manuali, [register_security_sync_performance.sql](../supabase/register_security_sync_performance.sql) registra entrambe le versioni, con controlli preliminari e senza duplicarle. `db push` le registra automaticamente. La distinzione tra applicazione SQL e storico è descritta nella [documentazione Supabase](https://supabase.com/docs/guides/deployment/database-migrations).

Il primo file usa `BEGIN`/`COMMIT`. I nuovi vincoli `NOT VALID` preservano gli eventuali record storici irregolari e si applicano alle nuove scritture. Il backfill aggiunge il moltiplicatore senza riscrivere i punteggi salvati. Le policy owner mantengono la possibilità di eliminare immagini di proprietà con percorsi legacy; i nuovi inserimenti richiedono il prefisso dell'utente. Il bucket mantiene la lettura pubblica già prevista dall'app.

Per le vecchie sessioni secondarie il moltiplicatore viene inferito dal rapporto tra punteggio e volume, quando disponibile: gli arrotondamenti storici possono renderlo una stima. Le nuove sessioni salvano direttamente il moltiplicatore utilizzato.

### Plank e peso corporeo negli esercizi a tempo

Il selettore del peso corporeo e il vincolo SQL iniziale ammettevano soltanto l'unità `weight`, impedendo di configurare Plank con l'unità `time`. Il supporto ora comprende peso e tempo. Le nuove serie a tempo conservano i secondi in `duration_seconds` e nella quantità `reps`, il carico effettivo in kg e lo snapshot del peso corporeo; il punteggio è secondi × (peso corporeo + carico aggiunto). Form, modifica e riepiloghi distinguono secondi e kg senza trasformare gli allenamenti precedenti.

La migrazione [20261003002000_timed_bodyweight.sql](../supabase/migrations/20261003002000_timed_bodyweight.sql) è stata applicata e registrata in Cloud. Tutti i sei controlli di [verify_timed_bodyweight.sql](../supabase/verify_timed_bodyweight.sql) sono passati; i conteggi restano 39 esercizi e 189 sessioni. I test coprono anche serie oltre 100 secondi, snapshot dopo correzioni del profilo o cambi di data, validazione dei secondi e sincronizzazione offline. Lint e build strict sono passati.

### Audit CI e migrazione a Tailwind 4

La CI ha successivamente segnalato sei vulnerabilità alte della catena `Tailwind 3 → chokidar / fast-glob / micromatch → braces`, in seguito a [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). Il registro npm non offre ancora una versione corretta di `braces`. Tailwind è stato aggiornato alla 4.3.3 con il plugin Vite, e `tailwind-merge` alla versione 3. Le utility rinominate sono state convertite preservando ombre, contorni di focus e raggi; il tema HSL, il font e la spaziatura del container sono mantenuti.

`lovable-tagger` 1.3.5 supporta già Tailwind 4, ma importa ancora Tailwind 3 per la vecchia configurazione. La [versione locale documentata](../tools/lovable-tagger/README.md) elimina esclusivamente quel percorso e le sue dipendenze. I test verificano l'estrazione del tema reale e il tracciamento della sorgente JSX; l'editor visuale resta disponibile. Installazione pulita e audit passano senza esclusioni o riduzioni della soglia della CI. Tailwind 4 richiede Safari 16.4+, Chrome 111+ o Firefox 128+.

## Recupero delle modifiche precedenti

Le nuove operazioni hanno sempre `userId`, UUID persistiti e una versione della modifica. Il banner mostra il salvataggio locale, conserva gli errori e permette un export JSON delle sole operazioni del relativo account. La conferma del server elimina dalla coda soltanto la versione effettivamente inviata.

Le tre vecchie chiavi globali `gym-tracker-cache`, `gym-tracker-sync-queue` e `gym-tracker-id-map` rimangono conservate. Il vecchio formato non identifica il proprietario: copiarlo nella coda dell'utente corrente riprodurrebbe il difetto di isolamento. L'app segnala la presenza di vecchie modifiche pendenti, senza mostrarne o esportarne il contenuto. Il recupero di quei dati richiede la verifica dell'account di origine in una procedura separata sul dispositivo; non è implementata un'importazione automatica. Per operazioni riferite a record esistenti, il proprietario può essere verificato sul server; per esercizi aggiunti solo offline occorre un'identificazione esplicita della provenienza.

La migrazione conserva lo storico. L'eventuale revisione di duplicati, superset parziali e immagini orfane già creati da vecchie versioni richiede dati reali e verifica dei riferimenti; il test non dimostra che tali anomalie siano presenti nel progetto ospitato. Le pulizie durevoli introdotte qui coprono i nuovi upload, le sostituzioni, le rimozioni e le cancellazioni di esercizi.

## Prevenzione delle regressioni

Prima di ogni rilascio che cambia il contratto delle query, applicare e verificare le migrazioni nel database usato dall'hosting: il push del repository e il deploy del frontend non aggiornano da soli Lovable Cloud. La build e i test locali non certificano la versione del database remoto.

Per nuove scritture usare la coda per account o una conferma del server prima del successo UI. Passare alla coda il proprietario catturato dal form, senza ricavarlo dal solo account attivo al momento dell'invio. Conservare gli UUID prima del primo invio, mantenere i controlli proprietario nelle query e usare la RLS come autorità. Evitare di usare overview come dati iniziali di query che promettono storici completi. Gli aggiornamenti delle dipendenze devono passare lint, test, typecheck/build e audit nella [CI](../.github/workflows/ci.yml).

I tooltip e le legende sono stati adeguati alle API Recharts 3, mantenendo React 18. Le modifiche seguono la [guida di migrazione ufficiale](https://github.com/recharts/recharts/wiki/3.0-migration-guide). Le sessioni a corpo libero continuano a usare il peso valido alla data dell'allenamento e a conservare lo snapshot originario; i cambiamenti successivi del profilo non ricalcolano gli allenamenti salvati.
