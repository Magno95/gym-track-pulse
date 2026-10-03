**Analisi di GymTrack: prestazioni, affidabilità e sicurezza — 2 ottobre 2026**

**Aggiornamento del 3 ottobre:** le correzioni sono implementate nel workspace. Risultati, file SQL da applicare e limiti della verifica sono nel [report delle correzioni](correzioni-prestazioni-sicurezza-2026-10-03.md). Il seguito conserva la diagnosi iniziale: conteggi, riferimenti alle righe e descrizioni del codice rappresentano la situazione prima degli interventi.

L'applicazione ha una base utile: autenticazione Supabase, Row Level Security sulle tabelle applicative, indici sulle relazioni principali e test sul peso corporeo. La chiave client verificata ha ruolo `anon`. Sono però presenti difetti concreti nell'isolamento dei dati locali, nella sincronizzazione e nei permessi delle immagini. Questi problemi hanno precedenza sulle ottimizzazioni del frontend.

L'analisi iniziale riguardava il working tree del 2 ottobre, comprese le modifiche locali già presenti. Il frontend principale è React/Vite; il backend disponibile nel repository consiste nelle migrazioni PostgreSQL e nelle integrazioni Supabase. Il modulo `frontend-kiosk`, successivamente rimosso dal workspace esternamente a questi interventi, è escluso dalla consegna delle correzioni.

Le verifiche di rete della sincronizzazione sono simulazioni locali che eseguono i moduli reali dell'app con storage e risposte del server controllati. Le policy SQL sono state analizzate nel repository; la loro configurazione effettiva in cloud non è stata interrogata. Durante la sola analisi iniziale non erano stati modificati dati remoti o codice applicativo.

Durante questa sessione sono disponibili anche lo [script delle riproduzioni](/tmp/gym-track-audit-repro.mjs) e i [risultati in JSON](/tmp/gym-track-audit-repro-results.json), conservati nella cartella temporanea.

**Verifiche eseguite**

| Controllo | Risultato |
| --- | --- |
| Test esistenti, `npm test` | 10 superati, 0 falliti; copertura concentrata su peso corporeo, snapshot ed elaborazione della coda nel caso positivo |
| Build principale di produzione | Superata; output salvato in una cartella temporanea |
| Typecheck, `tsc -p tsconfig.app.json --noEmit` | Superato con le attuali impostazioni permissive |
| ESLint | 3 errori e 7 warning |
| Riproduzioni dei difetti | 7 scenari confermati sui moduli reali con rete/storage simulati |
| Audit del lockfile npm | 21 pacchetti segnalati: 16 high, 4 moderate, 1 low, 0 critical |
| Audit npm delle dipendenze di produzione | 5 pacchetti segnalati high, anche per propagazione delle stesse advisory |
| Audit del lockfile pnpm | 59 occorrenze: 35 high, 23 moderate, 1 low; 46 advisory distinte su 20 pacchetti |

I conteggi degli audit descrivono dipendenze e advisory, con aggregazioni diverse tra npm e pnpm. La sfruttabilità dipende dalle API utilizzate e dall'ambiente. Le versioni dei due lockfile differiscono: Vite è 5.4.19 nel lockfile npm e 5.4.21 in pnpm/build locale; React Router DOM è rispettivamente 6.30.1 e 6.30.2.

**Priorità degli interventi**

| Priorità | Area | Problema | Intervento principale |
| --- | --- | --- | --- |
| Alta | Storage | Un utente autenticato può modificare o cancellare immagini altrui secondo le policy presenti | Sostituire le policy permissive con controlli sul proprietario |
| Alta | Isolamento account | Cache e coda degli esercizi sono condivise tra account sullo stesso browser | Separare storage e query per `user_id`; sincronizzare solo la coda del relativo utente |
| Alta | Offline | Dopo tre errori le modifiche non salvate vengono eliminate | Conservare operazioni fallite, distinguere errori e consentire il recupero |
| Alta | Sincronizzazione | Esecuzioni concorrenti e retry possono duplicare inserimenti | Coordinamento comune e idempotenza nel database |
| Alta | Superset | Due inserimenti separati possono lasciare sessioni parziali | Salvataggio atomico e idempotente delle due sessioni |
| Media | Dati e database | Storici completi richiesti senza paginazione; possibile troncamento e lavoro ripetuto | Query mirate, paginazione stabile, riepiloghi e aggregazioni |
| Media | Cache e schermate | ID temporanei non riallineati ovunque; cache persistente considerata fresca | Riconciliare ID e query; conservare l'età reale della cache |
| Media | Frontend | Un solo grande bundle, logo e immagini sovradimensionati | Caricamento differito delle pagine e grafici; immagini adeguate alla visualizzazione |
| Media | Integrità dei dati | Parte delle regole è verificata soltanto dal client | Vincoli e validazione nel database |
| Media | Dipendenze | Versioni con advisory e più lockfile divergenti | Aggiornamenti verificati e un gestore di pacchetti di riferimento |
| Bassa | Controlli automatici | Lint fallisce; workflow visibile senza test/build/typecheck | Ripristinare i controlli e inserirli nella CI |

**1. Permessi delle immagini troppo ampi — priorità alta**

La migrazione dello storage permette `UPDATE` e `DELETE` per ogni oggetto di `exercise-images` quando `auth.uid()` non è nullo. Manca un confronto con il proprietario dell'oggetto. Anche `INSERT` ammette qualunque utente autenticato, senza uno spazio riservato al suo account. I commenti delle policy parlano di immagini proprie, ma le condizioni SQL non applicano questa restrizione.

Se queste policy sono quelle attive, un account può sostituire o cancellare immagini di altri utenti. La policy di lettura pubblica consente anche l'accesso ai metadati degli oggetti. La proprietà di un oggetto Supabase non limita automaticamente le operazioni: deve essere controllata nelle policy. [Documentazione Supabase sulla proprietà](https://supabase.com/docs/guides/storage/security/ownership).

Intervento: sostituire le policy esistenti, limitare modifica e cancellazione con `owner_id`, definire controlli coerenti per inserimenti e aggiornamenti, e preferire percorsi organizzati per utente. Aggiungere una policy più restrittiva lasciando quella permissiva non risolve il problema, perché le policy permissive possono combinarsi con OR. Verificare successivamente due utenti distinti e un client anonimo.

Riferimenti: [migrazione storage, riga 6](/Users/magnonid/PersonalProjects/gym-track-pulse/supabase/migrations/20251210213949_6bce465a-bad4-4757-b03a-deb259964f52.sql:6), [upload delle immagini, riga 190](/Users/magnonid/PersonalProjects/gym-track-pulse/src/components/EditExerciseDetailsDialog.tsx:190).

**2. Cache e coda condivise tra account — priorità alta**

Le chiavi `gym-tracker-cache`, `gym-tracker-sync-queue` e `gym-tracker-id-map` sono globali per il browser. Anche le query degli esercizi non includono l'identità dell'utente. Il logout esplicito svuota React Query, ma lascia questi dati in `localStorage`; il gestore della sincronizzazione resta montato anche nella pagina di autenticazione.

Riproduzione: dopo il passaggio dall'account A all'account B, la lettura della cache restituisce ancora esercizi di A. Un esercizio aggiunto offline da A viene salvato sotto B quando la coda viene elaborata dopo il cambio account: `addExercise` ricava l'utente corrente al momento della sincronizzazione. Le sessioni riferite a esercizi di A rimangono protette dalla RLS, ma possono fallire e venire eliminate dalla coda.

Intervento: associare cache, coda, mappa degli ID e query all'utente; verificare l'identità prima del flush; sospendere la coda quando manca la relativa sessione. Gestire il logout e i cambi di autenticazione in un punto comune. Per profilo e storico del peso, `useProfile` applica già la separazione per utente e offre un riferimento interno utile.

Riferimenti: [chiavi dello storage locale, riga 27](/Users/magnonid/PersonalProjects/gym-track-pulse/src/lib/localCache.ts:27), [query degli esercizi, riga 5](/Users/magnonid/PersonalProjects/gym-track-pulse/src/hooks/useExercises.ts:5), [logout, riga 37](/Users/magnonid/PersonalProjects/gym-track-pulse/src/pages/Profile.tsx:37), [utente utilizzato per l'inserimento, riga 80](/Users/magnonid/PersonalProjects/gym-track-pulse/src/lib/supabaseStore.ts:80).

**3. Perdita delle modifiche dopo tre errori — priorità alta**

`processQueue` incrementa i retry per qualunque errore ed elimina l'operazione al terzo fallimento. Questo include rete assente, autenticazione scaduta ed errori temporanei. Il toast segnala il problema, ma l'operazione necessaria al recupero è stata rimossa. Quando la coda si svuota, il successivo caricamento dal database può sostituire la modifica locale con dati precedenti.

Riproduzione: una sessione accodata, tre risposte di rete fallite, zero operazioni rimaste e nessun salvataggio sul server.

Intervento: conservare le operazioni fallite, applicare attese progressive per errori temporanei e mantenere recuperabili gli errori permanenti. Sincronizzare al ritorno della connessione e mostrare uno stato che distingua salvataggio locale e conferma del server. Rendere durevole la coda prima di comunicare il successo; considerare IndexedDB per transazioni locali e gestione degli errori di spazio.

Riferimenti: [gestione dei retry, riga 337](/Users/magnonid/PersonalProjects/gym-track-pulse/src/lib/localCache.ts:337), [aggiornamento locale prima della scrittura in coda, riga 82](/Users/magnonid/PersonalProjects/gym-track-pulse/src/hooks/useSessionMutations.ts:82).

**4. Inserimenti duplicati per concorrenza o risposta persa — priorità alta**

Il blocco `syncingRef` protegge soltanto il flush di una singola istanza di `useSyncManager`. `processQueue` è pubblico e viene chiamato anche direttamente dal pulsante di ritorno del dettaglio esercizio. Più tab hanno inoltre blocchi indipendenti. Due elaborazioni possono leggere la stessa operazione prima che venga rimossa.

Gli inserimenti non hanno una chiave idempotente conservata sul server. Se il database salva una sessione e la risposta si perde, il retry inserisce un nuovo record.

Riproduzioni: una sola operazione elaborata da due `processQueue` concorrenti produce due inserimenti; una risposta persa dopo un commit produce due inserimenti al retry.

Intervento: convogliare tutte le chiamate in un coordinatore comune, coordinare anche le tab e rendere gli inserimenti idempotenti con UUID stabili o una chiave operazione soggetta a unicità nel database. Il coordinamento nel browser protegge la concorrenza; l'idempotenza sul server protegge anche le risposte perse.

Riferimenti: [protezione del flush, riga 12](/Users/magnonid/PersonalProjects/gym-track-pulse/src/hooks/useSyncManager.ts:12), [chiamata diretta, riga 87](/Users/magnonid/PersonalProjects/gym-track-pulse/src/pages/ExerciseDetail.tsx:87), [inserimento delle sessioni, riga 96](/Users/magnonid/PersonalProjects/gym-track-pulse/src/lib/supabaseStore.ts:96).

**5. Superset non atomici — priorità alta**

`addSupersetSession` salva prima la sessione primaria e poi quella secondaria in due richieste. Il fallimento della seconda lascia la prima nel database. Il retry genera un nuovo `superset_id` e reinserisce la primaria.

Riproduzione sui moduli reali: il secondo inserimento fallisce per tre tentativi; rimangono tre sessioni primarie con tre diversi `superset_id`, zero secondarie e zero operazioni recuperabili in coda.

Intervento: salvare entrambe le righe in una singola operazione atomica, mediante inserimento multiplo o funzione transazionale che rispetti la RLS, e utilizzare identificativi stabili per i retry. Verificare il comportamento delle modifiche e cancellazioni della coppia.

Riferimento: [salvataggio del superset, riga 119](/Users/magnonid/PersonalProjects/gym-track-pulse/src/lib/supabaseStore.ts:119).

**6. Storici senza paginazione e rischio di dati incompleti — priorità media**

`getAll`, `getById` e la lettura di `body_weight_history` richiedono tutti i record senza paginazione. Le sessioni e i pesi sono ordinati in senso crescente: quando viene raggiunto il limite della Data API, si conservano i record più vecchi e possono mancare quelli recenti. Totali, grafici, ultima sessione e peso applicabile alla data possono quindi usare uno storico incompleto.

Il limite predefinito dei progetti Supabase è 1.000 righe ed è configurabile; il limite effettivo del progetto ospitato deve essere verificato. Il difetto nel codice è l'assenza di una strategia per attraversare o rilevare il limite. [Documentazione Supabase sul limite e sulla paginazione](https://supabase.com/docs/reference/python/select).

Intervento: paginare con ordinamento stabile, includendo l'ID in caso di date uguali; richiedere intervalli recenti per le schermate e usare aggregazioni per i totali storici. Per risolvere il peso valido a una data, una query filtrata per utente/data in ordine decrescente con limite uno può evitare il download dell'intero storico. La sola crescita del limite API aumenta il carico e rinvia il problema.

Riferimenti: [lettura delle sessioni, riga 43](/Users/magnonid/PersonalProjects/gym-track-pulse/src/lib/supabaseStore.ts:43), [lettura dello storico del peso, riga 63](/Users/magnonid/PersonalProjects/gym-track-pulse/src/hooks/useProfile.ts:63).

**7. Riconciliazione incompleta degli ID temporanei — priorità media**

L'elaborazione della coda risolve gli ID temporanei prima di chiamare il server, ma alcuni casi di `applyPendingOperations` cercano ancora l'ID originale. Quando viene salvato un nuovo esercizio e una sua sessione resta in coda, il successivo caricamento dell'esercizio con ID definitivo può nascondere quella sessione. Inoltre il flush invalida la lista degli esercizi, senza invalidare o riallineare tutte le query dei dettagli e gli URL temporanei.

Riproduzione: l'esercizio viene salvato correttamente, il primo invio della sessione fallisce, rimane una sessione in coda ma il replay sul record con ID definitivo mostra zero sessioni pendenti.

Intervento: risolvere gli ID anche nel replay, aggiornare coerentemente query e URL e gestire gli esercizi ancora locali nelle operazioni che oggi chiamano direttamente Supabase. UUID definitivi generati dal client possono ridurre la necessità della mappa temporanea.

Riferimenti: [replay delle aggiunte, riga 129](/Users/magnonid/PersonalProjects/gym-track-pulse/src/lib/localCache.ts:129), [invalidazione dopo il flush, riga 16](/Users/magnonid/PersonalProjects/gym-track-pulse/src/hooks/useSyncManager.ts:16).

**8. Cache considerata fresca e dettaglio giornaliero incoerente — priorità media**

`useExercises` e `useExercise` usano `initialData` da storage con `staleTime` di cinque minuti, senza l'ora di aggiornamento originale. TanStack Query considera quei dati appena aggiornati. La riproduzione con la versione installata mostra zero richieste iniziali e `isStale: false` anche per una cache preesistente. Il refetch avviene al successivo evento previsto dopo la scadenza, quindi la sola scadenza dei cinque minuti non assicura un aggiornamento immediato. [Documentazione TanStack Query](https://tanstack.com/query/v5/docs/framework/react/guides/initial-query-data).

Il dettaglio della giornata usa invece `supabaseStore.getAll()` direttamente: ignora la cache, le operazioni pendenti e le invalidazioni di React Query. Una sessione appena registrata può comparire nella home e mancare nel dettaglio prima della sincronizzazione. In assenza di rete questa schermata non utilizza i dati locali disponibili. Nella home e nel dettaglio esercizio gli errori di query non hanno una gestione distinta equivalente a quella del profilo.

Intervento: conservare `updatedAt` nella cache o marcarla inizialmente obsoleta, condividere la stessa sorgente dati nelle schermate e presentare errori/riprova in modo distinto dagli stati vuoti.

Riferimenti: [inizializzazione della cache, riga 7](/Users/magnonid/PersonalProjects/gym-track-pulse/src/hooks/useExercises.ts:7), [dettaglio giornaliero, riga 49](/Users/magnonid/PersonalProjects/gym-track-pulse/src/pages/SessionDetail.tsx:49).

**9. Accesso ai dati e lavoro nel browser migliorabili — priorità media**

`getAll` esegue due richieste consecutive, scarica tutte le colonne e raggruppa le sessioni con un `filter` completo per ogni esercizio: costo O(esercizi × sessioni). Il dettaglio di un solo giorno ripete il download dell'intero storico. Ogni modifica locale può rileggere, serializzare e riscrivere il dataset completo in `localStorage`; per un superset succede per entrambi gli esercizi. Queste operazioni sono sincrone sul thread della UI.

Intervento: ottenere riepiloghi leggeri per la home e sessioni filtrate per esercizio o giorno, selezionare le colonne necessarie e raggruppare le sessioni in una sola passata con una `Map`. Ridurre le invalidazioni complete e separare i record locali invece di riscrivere un unico oggetto crescente. Paginare anche la lista visualizzata quando lo storico diventa lungo.

Sul database sono già presenti gli indici di `exercises.user_id`, `sessions.exercise_id`, `sessions.date` e `sessions.superset_id`. Il vincolo unico dello storico del peso copre già `(user_id, effective_date)`. Valutare con `EXPLAIN ANALYZE` indici composti per le query reali, ad esempio `(exercise_id, date, id)` e `(user_id, created_at, id)` sugli esercizi. Le vecchie policy possono essere ottimizzate usando ruoli espliciti e funzioni di identità valutate una volta per query; includere filtri utente nelle query può aiutare il piano senza sostituire la RLS. [Raccomandazioni Supabase sulle prestazioni RLS](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv).

Riferimenti: [caricamento e raggruppamento, riga 33](/Users/magnonid/PersonalProjects/gym-track-pulse/src/lib/supabaseStore.ts:33), [aggiornamento delle cache, riga 45](/Users/magnonid/PersonalProjects/gym-track-pulse/src/hooks/useSessionMutations.ts:45), [lista delle giornate, riga 123](/Users/magnonid/PersonalProjects/gym-track-pulse/src/pages/Index.tsx:123).

**10. Bundle iniziale molto grande — priorità media**

| Asset prodotto dalla build | Dimensione | Gzip stimato da Vite |
| --- | --- | --- |
| JavaScript principale, unico chunk | 1.161,88 kB | 332,90 kB |
| CSS | 69,01 kB | 12,17 kB |
| Logo JPEG, 1.024 × 1.024 px | 470,80 kB | — |

Tutte le pagine sono importate staticamente in `App.tsx`. Anche grafici e moduli di modifica sono raggiungibili dagli import iniziali, quindi vengono scaricati anche per entrare nella pagina di autenticazione. Vite segnala il superamento della soglia di 500 kB per il chunk.

Intervento: caricare le pagine con `React.lazy`/import dinamici e differire grafici e dialog pesanti fino al loro utilizzo. Misurare il bundle iniziale dopo la separazione; la sola divisione dei vendor in altri file, mantenendo tutti i moduli necessari all'avvio, riduce poco i byte iniziali.

Queste sono dimensioni reali della build e stime di compressione. I tempi di download, parsing, LCP e INP dipendono da dispositivo, rete e hosting e non sono stati misurati in produzione.

Riferimento: [import delle pagine, riga 8](/Users/magnonid/PersonalProjects/gym-track-pulse/src/App.tsx:8).

**11. Immagini e upload da ottimizzare — priorità media**

La home mostra il logo da 470,80 kB a 40 × 40 px. Le card mostrano immagini originali in una colonna di 80 px senza caricamento differito per quelle fuori schermo. L'upload ammette immagini fino a 5 MB controllando dimensione e tipo soltanto nel browser; la migrazione del bucket non specifica limiti di dimensione o MIME. Rimangono applicabili gli eventuali limiti configurati nella piattaforma, che non sono stati verificati.

Ogni sostituzione genera un nuovo nome con timestamp. La rimozione aggiorna il riferimento nell'esercizio, senza cancellare il file precedente: gli oggetti possono accumularsi nello storage.

Intervento: produrre un logo piccolo adatto ai pixel effettivi, miniature compresse per le card e `loading="lazy"` per immagini fuori viewport. Applicare nel bucket i limiti di dimensione e i MIME consentiti; definire una pulizia degli oggetti orfani dopo il salvataggio riuscito. Stabilire se le immagini debbano essere pubbliche o riservate agli utenti, considerando che oggi il bucket è pubblico.

Riferimenti: [logo nella home, riga 68](/Users/magnonid/PersonalProjects/gym-track-pulse/src/pages/Index.tsx:68), [immagini delle card, riga 80](/Users/magnonid/PersonalProjects/gym-track-pulse/src/components/ExerciseCard.tsx:80), [validazione e upload, riga 162](/Users/magnonid/PersonalProjects/gym-track-pulse/src/components/EditExerciseDetailsDialog.tsx:162).

**12. Validazione applicativa incompleta nel database — priorità media**

Le migrazioni iniziali richiedono valori non nulli, ma non impongono limiti positivi a serie/ripetizioni, limiti non negativi al carico, struttura degli elementi di `sets` o coerenza tra `sets` e `value`. Categoria, dimensione delle descrizioni, contenuto dei record personali e moltiplicatore sono vincolati soprattutto dai form. Un client autenticato può inviare direttamente dati alle tabelle del proprio account bypassando i form.

Il problema riguarda l'integrità dei dati di quell'utente e la robustezza delle schermate; le policy delle tabelle continuano a limitarne la proprietà. Le nuove tabelle del profilo hanno già vincoli per altezza/peso e RLS esplicita per utente, una scelta positiva.

Intervento: usare vincoli, trigger o scritture validate lato server per intervalli e struttura dei dati; calcolare i valori derivati in un punto autorevole. Una RPC di validazione deve essere accompagnata da permessi coerenti sulle scritture dirette, altrimenti il client può aggirarla.

Riferimenti: [schema iniziale delle sessioni, riga 11](/Users/magnonid/PersonalProjects/gym-track-pulse/supabase/migrations/20251127080809_a247a712-940f-41e5-bce2-e71b886a73f0.sql:11), [vincoli dei profili, riga 1](/Users/magnonid/PersonalProjects/gym-track-pulse/supabase/migrations/20261002223000_profile_bodyweight.sql:1).

**13. Dipendenze con advisory e installazioni divergenti — priorità media**

Gli audit sono stati effettuati sui lockfile, senza aggiornare le dipendenze. Tra i pacchetti segnalati figurano React Router e sue dipendenze, Lodash, `ws`, Vite e PostCSS. La presenza di tre lockfile (`package-lock.json`, `pnpm-lock.yaml`, `bun.lockb`) senza un gestore di riferimento consente installazioni differenti. L'audit pnpm corrisponde alle versioni osservate durante la build locale.

La valutazione delle advisory deve tener conto del codice:

- La GHSA-2w69-qvjg-hvjx di React Router riguarda redirect da loader/action nelle modalità Data e Framework. L'app usa `BrowserRouter`, modalità dichiarativa, esclusa da quel vettore. [Advisory del progetto](https://github.com/remix-run/react-router/security/advisories/GHSA-2w69-qvjg-hvjx).
- La GHSA-jjmj-jmhj-qwj2 comprende React Router DOM 6.30.2, ma richiede un flusso di open redirect. Nei percorsi analizzati non è stato identificato un redirect costruito da una destinazione esterna non fidata. [Advisory del progetto](https://github.com/remix-run/react-router/security/advisories/GHSA-jjmj-jmhj-qwj2).
- La GHSA-r5fr-rjxr-66jc di Lodash richiede un uso di `template` con chiavi di import non fidate. Questo uso non è stato individuato nel codice applicativo principale. [Advisory del progetto](https://github.com/lodash/lodash/security/advisories/GHSA-r5fr-rjxr-66jc).
- Alcune advisory Vite riguardano il server di sviluppo esposto in rete. La configurazione usa `host: "::"`, quindi il contesto è pertinente quando viene avviato il dev server; per la GHSA-4w7w-66w2-5vf9 è richiesta anche la presenza di file `.map` sensibili accessibili con un percorso prevedibile. [Advisory Vite](https://github.com/vitejs/vite/security/advisories/GHSA-4w7w-66w2-5vf9).

Intervento: scegliere un gestore di riferimento, rigenerare il relativo lockfile con versioni corrette per le advisory pertinenti e verificare build, navigazione e test. Dare priorità agli aggiornamenti compatibili, valutando separatamente eventuali migrazioni di major version.

**14. Controlli automatici da rafforzare — priorità bassa**

Il lint fallisce per interfacce vuote in `command.tsx` e `textarea.tsx` e un `require` in `tailwind.config.ts`; i sette warning riguardano Fast Refresh. Questi risultati indicano un controllo di qualità non pulito, senza dimostrare da soli difetti runtime.

Il typecheck applicativo disabilita `strict` e `noImplicitAny`; la build Vite non esegue il typecheck. Il solo workflow visibile incrementa la versione dopo un push su `main`: non verifica test, build, typecheck o policy SQL.

Intervento: ripristinare lint e controlli nella CI, aumentare gradualmente la severità TypeScript e aggiungere regressioni per cambio account, rete assente, risposta persa, flush concorrenti, superset e paginazione oltre il limite API. Validare le policy con due utenti distinti, compreso il tentativo di modificare l'immagine dell'altro.

Riferimenti: [impostazioni TypeScript, riga 18](/Users/magnonid/PersonalProjects/gym-track-pulse/tsconfig.app.json:18), [workflow esistente, riga 1](/Users/magnonid/PersonalProjects/gym-track-pulse/.github/workflows/bump-version.yml:1).

**Ordine di lavoro consigliato**

1. Correggere i permessi delle immagini e l'isolamento di cache/coda per utente.
2. Rendere la coda durevole, coordinare la sincronizzazione, introdurre idempotenza e salvataggi atomici dei superset.
3. Riallineare ID e schermate, introdurre query mirate/paginate e validazione nel database.
4. Ridurre bundle e immagini, aggiornare le dipendenze e rendere obbligatori i controlli nella CI.

Per quantificare i risultati servono misure con una storia di allenamenti rappresentativa, un telefono reale o un'emulazione adeguata, e piani delle query nel database ospitato. Policy effettive in cloud, limite righe, configurazione di autenticazione, header HTTP/cache dell'hosting, backup e recupero del database restano verifiche operative esterne al materiale disponibile.
