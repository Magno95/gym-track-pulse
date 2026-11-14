# GymTrack per iPhone

Client React Native + Expo per iPhone, versione 0.2. Usa il progetto Supabase esistente e gli stessi account della web app. Condivide tipi, calcoli del peso corporeo, validazione e mappatura Strava con il resto del repository; va quindi eseguito da un checkout completo.

Le schermate sono in `src/app/`; componenti, autenticazione e accesso ai dati sono negli altri moduli di `src/`.

Sono disponibili registrazione e login, creazione/modifica/eliminazione di esercizi e sessioni, foto, record personali, superset, storico giornaliero, grafici, statistiche, peso e altezza, sincronizzazione offline, esportazione delle modifiche pendenti e Strava. I dati sono reali. Il client mantiene una cache e una coda SQLite separate per account; al cambio utente elimina la cache in memoria e conserva i salvataggi pendenti sotto il loro proprietario.

Le illustrazioni predefinite sono incluse nell’app. Le foto personalizzate vengono scaricate una volta nell’area documenti persistente (`downloaded-exercise-images`), condivisa da libreria, storico, dettaglio e modifica: dopo il primo download sono disponibili anche offline e dopo la riapertura, senza richieste di riconvalida o scadenza. Quando c’è connessione, l’app precarica anche le foto delle righe non ancora visibili, con al massimo tre download contemporanei. La sostituzione di una foto genera un nuovo URL e quindi un nuovo file; eliminando l’app o i suoi dati si eliminano anche le copie locali. I download incompleti non vengono usati come immagini salvate.

Nelle build di sviluppo anche le illustrazioni servite da Metro vengono conservate nello stesso modo, finché il loro URL non cambia. Le immagini che diventano disponibili al ritorno della connessione aggiornano le righe già aperte.

Il flusso principale è **Inizia allenamento → cronometro ed esercizi → Termina allenamento → Pubblica su Strava**. Il cronometro usa orari persistiti tramite SQLite localStorage, separati per account: continua dopo navigazione, blocco schermo e riapertura. La chiusura congela la durata al secondo, conserva il riepilogo nello storico e lascia facoltativa la pubblicazione. Strava riceve durata, orario e serie dall’app; il client non elenca né importa attività o frequenza cardiaca da Strava e i nuovi collegamenti richiedono solo `activity:write`. Per gli allenamenti precedenti senza cronometro resta l’inserimento manuale della durata.

La barra principale contiene **Sessione · Esercizi · ＋ · Allenamenti · Profilo**. Le icone delle sezioni sono da 21 punti, le etichette da 10 e il pulsante centrale da 36, senza etichetta visiva ma con descrizione VoiceOver. Allenamenti usa un grafico a linee. Le immagini SF Symbols nelle tre densità sono rigenerabili con `scripts/generate-tab-icons.swift`. Il pulsante centrale avvia l’allenamento e porta alla scheda Sessione: il “+” sfuma e la barra si contrae con una molla, avvicinando le quattro sezioni. Alla chiusura la barra si espande e il “+” ricompare con un rimbalzo leggero. La transizione segue lo stato persistito della sessione, anche quando avviata da altri pulsanti, senza ricreare il navigatore. La scheda Sessione mostra il solo riquadro nero “La tua sessione” quando non ci si allena; durante l’allenamento mostra cronometro, recuperi ed esercizi registrati, mantenendo la barra principale visibile. La schermata Esercizi contiene ricerca, filtri e libreria. Dopo la chiusura si possono salvare, pubblicare o eliminare i risultati, quindi si torna al riquadro iniziale. I link della Dynamic Island aprono `/session`; i precedenti link `/workout-session` restano compatibili con lo storico.

Il selettore della barra scorre a molla quando si tocca un’altra sezione. Trascinandolo dalla sezione attiva segue il dito, evidenzia la destinazione e cambia schermata al rilascio; un gesto annullato torna alla sezione iniziale. Il “+” centrale viene saltato e non avvia sessioni durante il trascinamento. La barra si ingrandisce del 6% durante il gesto; il selettore si allunga orizzontalmente in base alla velocità, fino al 18%, comprimendosi leggermente in altezza. Al rilascio entrambi tornano normali con una molla. Scomparsa e ricomparsa del “+” aggiungono un impulso del 4,5% sincronizzato alla contrazione. Con “Riduci movimento” gli effetti di scala e le molle sono disattivati.

Alla chiusura il riepilogo propone **Fine allenamento**, **Pubblica su Strava** ed **Elimina sessione**. L’eliminazione richiede conferma: rimuove la durata locale e tutte le serie della giornata, comprese entrambe le metà dei superset, mantenendo gli esercizi della libreria. La cancellazione delle serie viene accodata come singola operazione anche offline; le attività già pubblicate su Strava restano su Strava. Eliminando una prova vuota si può avviare subito una nuova sessione nello stesso giorno.

La pubblicazione del backend resta giornaliera: una sessione cronometrata per data e tutti gli esercizi registrati in quella giornata. Se l’allenamento supera mezzanotte, gli esercizi inseriti dal flusso in sessione restano sulla data di inizio. Orario e durata del cronometro sono locali a questo iPhone; gli esercizi continuano a sincronizzarsi con Supabase. Prima dell’invio a Strava la coda deve essere sincronizzata.

Il timer si avvia dalla schermata Sessione e si usa sia per i recuperi sia per gli esercizi a tempo: 30/60/90/120 secondi oppure una durata personalizzata da 1 secondo a 60 minuti. Si apre una schermata iOS con il conto alla rovescia grande; trascinarla verso il basso o premere “Interrompi timer” annulla il timer e il promemoria. Con app aperta, due vibrazioni segnalano la fine; con app sospesa, una notifica locale “Timer terminato” programmata dal sistema segnala il termine secondo permessi, modalità silenziosa e Full immersion dell’iPhone. Annullamento, sostituzione, chiusura e logout annullano il promemoria. Non viene riprodotta una vecchia vibrazione alla riapertura tardiva.

Se il timer è ancora in corso, la modale si ripristina alla riapertura dell’app e al ritorno dalla Dynamic Island usando la scadenza salvata. Un link che cambia schermata non annulla il timer; la chiusura volontaria della modale lo interrompe. Il box sottostante mantiene sempre durate e “Avvia timer”. Il formato salvato e la route interna `rest-timer` restano compatibili con i timer avviati nelle versioni precedenti.

“Aggiungi esercizio” apre nello stesso modale la lista della libreria con immagini, ricerca e filtri. Selezionando un esercizio si passa direttamente al modulo per serie, ripetizioni e peso, senza il box timer.

Il plugin `expo-notifications` imposta `enableRemoteNotifications: false`: i timer usano notifiche locali e non richiedono la capability Push Notifications/APNs. Questo evita l’errore di provisioning dei Personal Team per notifiche push non usate. Il team Apple della build locale è conservato in `ios.appleTeamId`; dopo modifiche alle capability rigenerare il progetto con `npx expo prebuild --clean --platform ios` per rimuovere gli entitlement precedenti.

Cronometro e timer sono integrati nella schermata di blocco e nella Dynamic Island con `expo-widgets`. I timer SwiftUI si aggiornano senza mantenere JavaScript in background; il conto alla rovescia si ferma a zero finché l’app non può aggiornare lo stato. Toccando la Live Activity si torna alla sessione. La funzione richiede Live Activities abilitate e un iPhone/iOS compatibile; il timer nell’app funziona anche senza.

Il sincronizzatore ritenta l’attivazione della Live Activity al rientro nell’app. Alla chiusura della sessione la Live Activity viene terminata.

La [mappa della migrazione](docs/migrazione-completa.md) descrive funzionalità, architettura, stile e limiti verificati.

La [revisione delle interfacce](docs/interfacce-mobile.md) documenta gerarchia tipografica, spaziature, stati vuoti, salvataggi persistenti in basso e verifiche visive sul dispositivo.

La palette usa nero, bianco e arancione **#FF5000**, ricavato dal [token ufficiale Nike NCSS](https://www.nike.com/static/ncss/4.3/dotcom/desktop/css/ncss.it-it.min.css). Le azioni di avvio e il pulsante centrale usano arancione con testo nero; i riquadri della sessione hanno fondo nero e numeri bianchi. I testi piccoli usano tonalità arancioni con contrasto adeguato nei temi chiaro e scuro. Anche accesso, navigazione e Live Activity seguono la palette. L’icona in `assets/brand/icon.png` è generata dallo stesso script delle icone della barra; per aggiornare l’icona nella schermata Home serve una nuova build nativa.

## Avvio su iPhone

Usare Node.js 24 o successivo. Dalla radice del repository:

```sh
cd mobile
npm ci
npm run configure
npx expo login
npm start
```

Se Expo era già avviato durante l’aggiornamento, fermarlo con Ctrl+C e avviarlo con `npm start -- --clear`: la migrazione aggiunge una configurazione Metro per i moduli di dominio condivisi.

`configure` copia **solo** URL e chiave pubblicabile/anon dal `.env` della web app in `.env.local`, ignorato da Git. Non copia credenziali di amministrazione. In alternativa, copiare `.env.example` in `.env.local` e compilare i due valori `EXPO_PUBLIC_SUPABASE_*`.

Installare Expo Go su iPhone, accedere con lo stesso account Expo usato nel terminale e inquadrare il QR con Fotocamera. [Expo Go su iPhone richiede che i due account Expo coincidano](https://docs.expo.dev/get-started/start-developing/). Mac e iPhone devono potersi raggiungere sulla rete locale. Per provare Liquid Glass serve iOS 26 o successivo e una versione di Expo Go compatibile con SDK 58. All’interno di GymTrack, accedere con l’account già usato nella web app.

Eseguire i comandi dalla cartella `mobile`. Il suo `.npmrc` usa la cache locale `.npm-cache/`, ignorata da Git: questo evita gli errori `EACCES` causati dai file appartenenti a root nella cache globale `~/.npm`, senza richiedere `sudo`.

Con Xcode completo e un simulatore iOS installati:

```sh
npm run ios
```

Per generare ed eseguire una build nativa locale:

```sh
npm run ios:build
```

Dopo l’aggiunta di `expo-widgets` e `expo-notifications` serve rigenerare la build nativa: Expo Go e una vecchia build non includono l’estensione Live Activity. `npx expo prebuild --platform ios` applica i config plugin senza modificare a mano i file generati, poi `npm run ios:build` compila l’app con l’estensione. Su un dispositivo fisico occorrono la firma dell’app e dell’estensione `it.gymtrack.pulse.ExpoWidgetsTarget` e l’App Group `group.it.gymtrack.pulse`.

Il progetto nativo `ios/` viene generato da Expo e non è versionato. `it.gymtrack.pulse` è l’identificatore iniziale del bundle: assegnarlo al proprio team Apple prima di firmare una build destinata a dispositivi o TestFlight. Non sono ancora configurati account EAS, firma e pubblicazione.

## Elementi Apple

- La barra inferiore usa [Expo Router JavaScript Tabs](https://docs.expo.dev/router/advanced/tabs/) con una barra personalizzata, immagini SF Symbols e `GlassSurface`. La contrazione usa `Animated.spring` con driver nativo: superficie, icone e “+” condividono la stessa progressione, senza aggiornare il layout a ogni fotogramma.
- Titoli, ricerca e navigazione indietro usano lo stack nativo iOS; le barre seguono l’aspetto del sistema, incluso Liquid Glass sui sistemi compatibili.
- Il pulsante di uscita è un componente SwiftUI tramite [Expo UI](https://docs.expo.dev/versions/latest/sdk/ui/).
- La barra rispetta “Riduci movimento” e “Riduci trasparenza”, mantiene touch target di almeno 44 punti e rimuove il “+” da VoiceOver e dai tocchi durante l’allenamento. Il riquadro iniziale della sezione Sessione contiene soltanto presentazione e avvio: il totale degli esercizi della libreria non viene mostrato come conteggio della sessione.
- Tema chiaro/scuro automatico, testi scalabili, controlli principali di almeno 44 punti, illustrazioni degli esercizi incluse nel bundle.

## Verifiche

```sh
npm run typecheck
npm test
npm run bundle:ios
npx expo-doctor
npm audit --audit-level=moderate
```

Il lint si esegue dalla radice del repository con `npm run lint`. I test coprono paginazione con limiti server, errori delle pagine successive, isolamento dei proprietari, ricerca, ordine degli allenamenti, date locali e riepiloghi degli esercizi a tempo con peso corporeo.

I test della nuova coda usano SQLite reale tramite `node:sqlite`: verificano persistenza, scritture fallite, rollback, account cambiato durante una richiesta, retry con ID stabili, operazioni concorrenti e proiezione dei superset. Altri test coprono snapshot storici del peso, settimane attraverso il cambio d’ora e URL di ritorno OAuth.

Il workflow `.github/workflows/mobile.yml` esegue questi controlli sulle modifiche al client iPhone e ai tipi condivisi. Usa valori pubblici fittizi per il bundle e non accede ai dati di produzione.

Gli override di `glob` e `minimatch` aggiornano le dipendenze degli strumenti Expo alle versioni corrette per GHSA-3g3m-2fjr-6pw4 e GHSA-g3hv-75wg-m249. Verificare Expo Doctor e l’esportazione iOS quando si aggiornano gli override o Expo.

## Prova sul dispositivo

Prima di considerare pronta questa versione, verificare su iPhone:

1. Accesso con credenziali corrette/errate, riapertura dell’app e ripresa dal background.
2. Ricerca, filtri, immagini e confronto degli allenamenti con la web app, anche per corpo libero, tempo e superset.
3. Cambio account: nessun esercizio o dettaglio del primo account deve rimanere visibile.
4. Connessione assente: errore e retry; ripristino della rete e sincronizzazione automatica, senza spinner di aggiornamento né spostamenti del contenuto. Le liste non prevedono il gesto di trascinamento per aggiornare.
5. Tema scuro, testo ingrandito, VoiceOver e “Riduci trasparenza”. Su iOS precedente a 26 controllare la superficie alternativa al glass.
6. Start session, inserimento di più esercizi/superset, riavvio in modalità aereo, timer per recuperi ed esercizi a tempo in primo piano e a schermo bloccato; negare il permesso notifiche e controllare il messaggio alternativo.
7. Live Activity con cronometro crescente e timer decrescente, apertura dall’Island, chiusura e cambio account; il timer deve sparire dopo la chiusura o il logout.
8. Chiusura, durata ferma al secondo e invio volontario a Strava dopo la sincronizzazione, senza selezione di un’attività sorgente; gli esiti incerti continuano a bloccare invii duplicati.

L’esportazione JavaScript e il typecheck non sostituiscono questa prova: non verificano il rendering nativo né una build firmata.

Nel primo ambiente di sviluppo la generazione del progetto iOS è riuscita, mentre Expo Doctor segnala la mancanza di CocoaPods per le build native locali. Mancano anche Xcode completo e il simulatore. La prova tramite Expo Go su un iPhone compatibile non richiede questi strumenti sul Mac.

## Rilascio e verifiche rimanenti

Le funzionalità presenti nella web app sono state portate nel client. Restano da verificare sul dispositivo i flussi di scrittura, libreria foto, condivisione, accessibilità e OAuth introdotti in questa versione; la precedente versione di consultazione e il Liquid Glass erano già stati confermati dall’utente su iPhone.

Gli account Strava già collegati possono essere usati subito. Un nuovo collegamento da una build iPhone autonoma usa lo schema `gymtrack` con il dominio di callback già configurato in Strava; Expo Go usa il ponte della pagina web `/strava/callback`, che deve essere pubblicato con questo aggiornamento del frontend. Non sono richieste nuove migrazioni o modifiche ai segreti del backend. Non abbiamo pubblicato il sito, creato attività Strava o eseguito scritture di prova nei dati reali.

Le scritture offline esistenti nella web app restano sul browser in cui sono state create: sincronizzarle prima di passare al client iPhone. Il recupero password non era presente nella web app ed è fuori da questa migrazione. Firma, TestFlight e App Store richiedono un rilascio separato.
