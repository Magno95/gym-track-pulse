# Verifica dei segreti prima della pubblicazione

Data: 14 novembre 2026.

## Esito

Non sono stati rilevati segreti privati nei file candidati alla pubblicazione o nella cronologia Git raggiungibile dai riferimenti disponibili. Gitleaks ha segnalato una chiave Supabase legacy nel file `.env` storico: il payload JWT indica `role: anon`, quindi è una chiave destinata al client pubblico, non una chiave `service_role` o un token utente. Anche la chiave presente nel `.env` locale corrente è pubblicabile.

Il file `.env` era tracciato nonostante la regola di esclusione. È stato rimosso dall’indice Git conservando intatto il file locale; la rimozione entrerà nella nuova revisione quando verranno committate queste modifiche. Le vecchie revisioni continueranno a contenere la configurazione pubblica: non è stata riscritta la cronologia. In base a questi risultati non è emersa una credenziale privata da revocare.

## Ambito e metodo

- Aggiornamento dei riferimenti remoti e dei tag con `git fetch --all --tags`.
- Repository non shallow; 161 commit raggiungibili da `main`, `origin/main` e `origin/HEAD`. Nessun altro ramo o tag presente dopo il fetch.
- Scansione Gitleaks **8.30.1**, scaricato dal repository ufficiale e verificato con il checksum SHA-256 della release. Regole predefinite, nessuna esclusione personalizzata e valori oscurati con `--redact=100`.
- Scansione della cronologia con `gitleaks git . --log-opts=--all --redact=100`: il motore riporta 97 commit analizzati nelle patch, circa 3,62 MB e una segnalazione JWT. Questo conteggio differisce dai 161 commit raggiungibili perché la scansione delle patch non rappresenta ogni commit allo stesso modo.
- Controllo aggiuntivo di tutti i **722 blob unici** raggiungibili: nessuna corrispondenza esatta con le credenziali private attualmente presenti nei file locali `.env.production` e `supabase/functions/.env`, inclusi token Supabase, password database, client secret e token Strava. Il confronto non stampa i valori.
- Scansione di uno snapshot dei file tracciati e non tracciati candidati a Git, rispettando gli ignore ed escludendo cache e dipendenze generate. Prima della rimozione dall’indice, l’unica segnalazione corrente era la chiave pubblicabile del `.env`. La scansione finale dopo le modifiche non rileva segreti.

I report macchina sono stati conservati solo nella directory temporanea dell’audit, con valori oscurati. Nessuna credenziale privata è stata inserita in questo documento o negli esempi.

## Protezioni aggiunte

- `.env.example` documenta solo URL e chiave pubblicabile del frontend.
- `.env.production.example` elenca le variabili richieste dal deploy, con credenziali vuote.
- `.gitignore` permette gli esempi e continua a escludere gli ambienti reali; esclude esplicitamente anche cache npm e backup della migrazione.
- Verificato che `.env.production`, `supabase/functions/.env`, `mobile/.env.local` e la directory dei backup non siano tracciati e siano ignorati.

## Limiti

La scansione riguarda il contenuto locale e la cronologia raggiungibile dai riferimenti recuperati. Non copre commit remoti cancellati o non annunciati dal server, vecchi fork/cloni, allegati di issue, log e artifact CI, variabili di hosting o backup esterni. Nessuno scanner garantisce l’assenza assoluta di segreti, soprattutto con formati non riconosciuti o contenuti cifrati.

Le credenziali private esistono nei file locali ignorati: non pubblicare questi file o i backup. La chiave Supabase pubblicabile è prevista nel client; la protezione dei dati dipende da RLS, privilegi e controlli server. Questo controllo non è una nuova verifica del backend live né una revisione generale delle vulnerabilità dell’app.

Al termine di questo audit non erano stati creati commit o push né era stata modificata la visibilità della repository. La successiva pubblicazione è stata autorizzata separatamente dal proprietario.
