# Migrazione iPhone 0.2

## Funzionalità

| Flusso web | Client iPhone |
| --- | --- |
| Registrazione e accesso email/password | `src/app/sign-in.tsx`, conferma email attraverso il sito Supabase configurato |
| Ricerca, categorie e miglioramento sull’ultima sessione | Scheda Esercizi, ricerca nativa, filtri e variazione percentuale |
| Nuovo esercizio / modifica / eliminazione | `exercise-form.tsx` e dettaglio esercizio; eliminazione con conferma |
| Descrizione, unità, corpo libero e moltiplicatore | Modulo esercizio; le impostazioni nuove non riscrivono le sessioni precedenti |
| Foto e miniature | Libreria nativa, copia locale durevole, WebP 960/240, Storage con percorsi per proprietario |
| Tre record personali | Testo fino a 500 caratteri e data, aggiunta/modifica/eliminazione nel modulo esercizio |
| Serie variabili | Modulo sessione con aggiunta/rimozione di serie e salvataggio durante l’allenamento |
| Tempo, distanza e peso | Unità conservate; secondi nel campo ripetizioni per corpo libero a tempo |
| Peso corporeo | Snapshot storico condiviso con il web; si inserisce solo il carico aggiunto |
| Superset | Due righe con UUID stabili e gruppo persistente, creazione e modifica in una singola richiesta SQL |
| Cronologia e riepilogo giornaliero | Scheda Allenamenti, gruppi superset, serie/ripetizioni/secondi/punteggio |
| Statistiche | Punteggio nel tempo, frequenza su otto settimane, esercizi per giornata; migliore/media/totale per esercizio |
| Grafici esercizi e peso | Fino a 300 punti, selezione con tap/trascinamento e controlli VoiceOver |
| Profilo | Altezza, peso valido a oggi, BMI, variazione, storico e modifica per data |
| Offline e retry | SQLite per cache e outbox, replay ordinato, errori permanenti recuperabili, retry manuale |
| Esportazione delle modifiche pendenti | File JSON del solo account corrente attraverso la condivisione iOS |
| Sessione in corso | Start session, cronometro persistente, esercizi e superset, chiusura e riepilogo; timer recupero con doppia vibrazione in primo piano e notifica locale in background |
| Live Activities | Cronometro e recupero su blocco schermo e Dynamic Island tramite Expo Widgets; apertura diretta della sessione |
| Strava | Collegamento e pubblicazione da orario, durata ed esercizi GymTrack; verifica dell’esito e blocco degli invii incerti |
| Logout | Uscita dal solo dispositivo; i salvataggi pendenti restano associati all’account |

## Moduli di dominio e persistenza

Il tocco su un esercizio apre direttamente la schermata dell’esercizio. La navbar principale Sessione / Esercizi / ＋ / Allenamenti / Profilo rimane presente, con il pulsante di avvio esattamente al centro. Icone delle sezioni da 21 punti ed etichette da 10 alleggeriscono la barra; il ＋ da 36 punti non ha etichetta visiva e conserva quella accessibile. Allenamenti usa `chart.xyaxis.line`. Gli asset SF Symbols sono esportati a 1x/2x/3x con `scripts/generate-tab-icons.swift` per controllare le dimensioni nella barra nativa; le sezioni usano tint di sistema e il ＋ conserva il cerchio arancione #FF5000 con il ＋ nero. La navigazione locale Dettagli / Sessioni / Statistiche, con icone ed etichette, è fissa in alto sotto l’intestazione nativa. La sezione selezionata è nel parametro URL `section`. “Registra sessione” è un pulsante dedicato; la modifica è nell’intestazione. Con testo ingrandito oltre 1,3× le tre sezioni si dispongono su righe distinte per evitare sovrapposizioni. Non vengono usati menu popup o accessory sopra la tab bar.

Lo storico dentro l’esercizio mostra soltanto data, numero di serie e punteggio. Il tocco apre il modulo della sessione; lo swipe verso sinistra sposta l’intera card e scopre sotto di essa l’azione “Elimina”. Il gesto è riconosciuto in modo nativo (`react-native-gesture-handler`, soglie in `swipe-delete.ts`): un trascinamento orizzontale verso sinistra appartiene alla card, uno verticale allo scorrimento o alla chiusura del modale, senza stati intermedi. Superata la soglia c’è un feedback aptico; rilasciando oltre la soglia la card esce, viene chiesta la conferma e la riga si chiude con un’animazione prima della cancellazione, mentre un rilascio prima della soglia (o tornando indietro) riporta la card al suo posto con una molla leggermente elastica. Non esiste più lo stato con il pulsante “Elimina” fermo a metà; VoiceOver usa l’azione equivalente. Le serie nel modulo sessione usano lo stesso gesto, senza conferma. Il dettaglio della giornata conserva la tabella completa delle serie.

Una nuova sessione parte con una serie vuota, senza recuperare i valori dell’ultima sessione né al cambio esercizio. L’unica conferma del modulo nuovo è “Registra sessione”. Le sessioni esistenti salvano automaticamente dopo 600 ms senza modifiche, su “Chiudi” e quando l’app passa in background. La scrittura locale SQLite precede la conferma; dati incompleti non sostituiscono la versione salvata. I superset vengono validati e accodati insieme con gli ID originali. “Salva e continua” è stato rimosso.

L’avvio dell’allenamento è nel pulsante centrale della barra e nel riquadro nero della scheda Sessione, rimosso dalla libreria Esercizi. `ActiveSessionProvider` conserva i cronometri per account con `WorkoutRunStore`, usando SQLite localStorage; un errore di scrittura non deve far apparire avviato o chiuso il timer. `components/WorkoutSessionScreen.tsx` mostra tempo totale, recupero, esercizi registrati e chiusura nella scheda `/session` e nei riepiloghi storici `/workout-session?date=…`. Il pulsante centrale è implementato come route azione `start-session`, eseguita su focus (non al precaricamento delle tab); avvia o riprende il timer e naviga a Sessione. Senza allenamento attivo la scheda mostra il solo `SessionHero`; dopo la chiusura resta il riepilogo fino a salvataggio o eliminazione. L’inserimento dal flusso usa “Registra esercizio” e la data di inizio fissa, anche oltre mezzanotte. Una sessione per giornata rispetta il modello di pubblicazione del backend; gli orari non vengono sincronizzati tra dispositivi.

Il riepilogo chiuso permette di salvare o eliminare la sessione, oltre alla pubblicazione. La conferma di eliminazione esplicita che verranno rimosse tutte le serie della giornata: `delete_sessions` persiste gli ID nella coda e li elimina in un’unica richiesta soggetta a RLS, mantenendo i superset coerenti. Il cronometro viene rimosso dopo l’accodamento; se la sua scrittura fallisce, il riepilogo rimane eliminabile e la cancellazione delle serie resta accodata. Gli esercizi della libreria e le attività Strava già pubblicate non vengono eliminati.

`session-notifications.ts` programma il recupero nel sistema, gestisce i permessi quando viene avviato e usa due vibrazioni in primo piano. Il recupero viene annullato alla chiusura o al logout, e ripristinato al successivo accesso se ancora futuro. L’avviso in background segue le impostazioni iOS e non garantisce un numero personalizzato di vibrazioni. `widgets/WorkoutActivity.tsx` usa timer SwiftUI nativi per sessione e recupero; `session-activity.ts` serializza gli aggiornamenti, recupera le Live Activities esistenti e le termina alla chiusura/cambio account. Richiede una nuova build con l’estensione configurata da `expo-widgets`; nessuna modifica manuale a `ios/`.

`src/domain.ts` riusa `src/lib/bodyweight.ts`, `src/lib/validation.ts` e la mappatura Strava del backend. `metro.config.cjs` rende visibili questi file al bundler senza importare componenti React web.

`src/data/outbox.ts` accetta un adattatore SQLite: Expo su iPhone e `node:sqlite` nei test. Prima di mostrare il salvataggio, persiste un’intenzione con ID stabile e proprietario. L’interfaccia proietta le intenzioni sullo snapshot server. Dopo il successo remoto aggiorna snapshot e rimuove l’operazione nella stessa transazione locale, così il dato non sparisce nell’intervallo precedente al refresh.

Una sola sincronizzazione per account viene eseguita alla volta. Ogni scrittura verifica l’account attivo e la sessione Supabase; richieste e cache React Query vengono annullate al cambio utente. Gli inserimenti usano UUID persistenti e ignorano conflitti sullo stesso ID; gli aggiornamenti mantengono il record e il gruppo superset. Un aggiornamento non intenzionale di una sessione eliminata viene intercettato prima della scrittura. Le modifiche concorrenti su dispositivi diversi restano soggette alla normale semantica dell’ultimo aggiornamento; la verifica di esistenza e l’aggiornamento di un superset non costituiscono una transazione tra richieste client.

Gli errori di validazione fermano le scritture dipendenti e richiedono un retry esplicito. La pulizia delle vecchie immagini non blocca le altre modifiche; prima di eliminare un file verifica proprietario, riferimenti server e modifiche locali ancora pendenti. Le foto selezionate sono copiate nell’area documenti dell’app prima del salvataggio e non dipendono dalla cache temporanea del picker.

Al riavvio senza rete è possibile accedere ai dati locali dell’ultima sessione persistita anche se il token di accesso è scaduto. Questa identità locale non viene usata come autorizzazione server: il backend richiede comunque una sessione Supabase valida prima di sincronizzare.

## Stile e movimento

Il riferimento è la semplicità di navigazione e la gerarchia descritta da [Revolut](https://www.revolut.com/blog/post/revolut-10/). Non viene inclusa una libreria o un font proprietario Revolut: i token sono specifici di GymTrack. La scheda esercizio riprende la separazione tra sezioni, storico e progressi documentata da [Hevy](https://www.hevyapp.com/features/exercise-performance/): immagine compatta, riepilogo, record e serie in tabella. Le azioni non fanno parte del controllo di selezione delle sezioni. Le schede sessione condivise usano una tabella Serie / Ripetizioni o Secondi / Carico, con layout verticale per testo oltre 1,5×.

- Palette nera, bianca e arancione Nike #FF5000; testi piccoli con tonalità di contrasto dedicate. Riquadri sessione neri, numeri bianchi, avvio arancione; tema scuro automatico.
- Componenti condivisi in `components/UI.tsx`: schede da 24 punti di raggio, azioni a pillola, campi coerenti, etichette e metriche.
- Stack di navigazione, presentazione dei moduli, ricerca e selezione delle date nativi iOS. La barra inferiore personalizzata usa Expo Router JavaScript Tabs, immagini SF Symbols e Liquid Glass: si contrae con una molla durante l’allenamento nascondendo il “+”, e si espande alla chiusura. Le schermate restano montate; “Riduci movimento” disattiva la transizione.
- Pressione dei pulsanti con scala `1 → 0.97 → 1` in 110 ms, driver nativo, curva ease-out e feedback aptico. Con “Riduci movimento” la scala viene aggiornata senza animazione.
- Grafici esplorabili senza dipendere da un’animazione per aggiornare lo stato. VoiceOver può incrementare/decrementare il punto selezionato.
- “Riduci trasparenza” mantiene il badge opaco; il materiale delle barre di sistema segue direttamente le impostazioni iOS.

Le righe navigabili usano `Pressable` con `router.push` direttamente. In Expo Router 58, `Link asChild` combina gli stili attraverso Radix Slot: un callback `style={({ pressed }) => ...}` viene trasformato in un oggetto senza proprietà e perde anche i vincoli di layout. La causa è stata riprodotta sullo Slot installato, confrontando la stessa riga con e senza wrapper. Non inserire questi pulsanti dentro `Link asChild` senza verificare come viene passato lo stile.

## Strava e callback

Il client mobile non richiede più `activities` o `import-activity` e invia sempre `useImportedActivity: false`. Il nuovo consenso OAuth richiede solo `activity:write`, coerentemente con la [documentazione Strava sugli scope](https://developers.strava.com/docs/authentication/); le connessioni già presenti restano valide. I cronometri chiusi forniscono automaticamente `startTime`, `utcOffset` salvato all’avvio ed `elapsedTime` in secondi. Gli allenamenti storici senza cronometro conservano i campi manuali. Restano invariati il backend giornaliero, l’attesa della sincronizzazione e le protezioni per pubblicazioni già concluse o con esito incerto.

La funzione esistente verifica proprietario e stato OAuth monouso, conserva i token sul server e mantiene le protezioni contro invii duplicati. La build autonoma modifica soltanto il protocollo del callback per usare `gymtrack` mantenendo il dominio configurato: segue il [flusso mobile documentato da Strava](https://developers.strava.com/docs/authentication/).

Per Expo Go, l’URL web include `native_return`. Il callback web accetta solo `gymtrack`, `exp` ed `exps`, con percorso di ritorno fisso; rifiuta credenziali nell’URL, query preesistenti, frammenti, protocolli web e JavaScript. Trasferisce soltanto codice, stato, scope ed eventuale rifiuto. Il client completa l’autorizzazione con la propria sessione GymTrack, senza trasferire access token o refresh token nel link. Il flusso web ordinario resta protetto dal login.

Pubblicare il frontend aggiornato è necessario per questo solo ritorno da Expo Go. Non serve un nuovo deploy della Edge Function. Un collegamento già presente nell’account è subito condiviso dai due client.

## Verifiche e prova su iPhone

Test automatici: SQLite reale, persistenza, rollback, errore disco pieno, retry, concorrenza, cambio account durante una richiesta, ordinamento, snapshot del peso, corpo libero a tempo, date e settimane attraverso il cambio d’ora, validazione degli URL OAuth. Typecheck, lint, bundle iOS e test/build della web app verificano l’integrazione del codice. L’audit copre anche i nuovi moduli Expo.

La precedente consultazione e Liquid Glass sono stati verificati dall’utente su iPhone. Per la nuova versione, verificare un allenamento reale: inserimento e modifica di una sessione e di un superset, confronto con il web, modalità aereo e riavvio, ritorno online, foto, misurazioni, VoiceOver e Strava. Non sono state eseguite scritture di prova nei dati di produzione.

Il redesign della scheda è stato controllato in un’anteprima temporanea React Native Web che importa gli stessi componenti, con dati fittizi e adattatori per router e API native. Verificati dettagli e sessioni in scuro a 390 punti, statistiche in chiaro a 375 punti, larghezza di 320 punti e caratteri al 200%; quest’ultimo controllo ha rilevato e consentito di correggere una sovrapposizione nella navigazione. L’anteprima non riproduce SF Symbols, safe area e tab bar Liquid Glass native e non aggiunge dipendenze o una piattaforma web all’app.

In questo ambiente mancano Xcode completo, simulatore e CocoaPods: la compilazione nativa firmata e la verifica visiva su simulatore non sono state eseguite. Expo Doctor segnala CocoaPods come unico controllo dell’ambiente non superato. Non è stato pubblicato alcun rilascio su TestFlight o App Store.

La semplificazione dello storico e del modulo sessione è coperta da 27 test mobile, compresi inizializzazione vuota, modifica da entrambe le metà del superset, aggiornamenti successivi senza duplicati, rifiuto dei dati incompleti e delle sessioni eliminate. Il controllo interattivo del nuovo modulo nella precedente anteprima temporanea non è stato completato perché la pagina Chrome rimaneva vuota; swipe e autosalvataggio vanno verificati su iPhone.

Il nuovo flusso aggiunge test del cronometro: ripristino, tempo trascorso in background, chiusura idempotente, isolamento degli account, doppio avvio, cambio giorno, scrittura fallita, dati corrotti e payload Strava senza importazione cardiaca. Live Activities, notifica in background e vibrazioni richiedono ancora una prova su iPhone con una build aggiornata; questo ambiente non dispone di `simctl`.

Lo stato delle Live Activities è distinto dagli avvisi di recupero: Expo Go, modulo mancante, piattaforma non supportata, attività attiva o errore nativo. Non viene caricato codice nativo non supportato in Expo Go. Il sincronizzatore in `data/session-activity.ts` è verificato con un adattatore: avvio, aggiornamento del recupero, chiusura, recupero dopo errore e ordine tra logout e nuovo account. I test di eliminazione verificano anche persistenza, nuovo avvio dopo una prova, protezione delle altre giornate e fallimento delle scritture; la suite mobile comprende 43 test.
