# Interfacce mobile

La revisione segue `mobile-app-ui-design` mantenendo la palette nero, bianco e arancione di GymTrack. Le azioni principali hanno più risalto; dati, controlli e messaggi secondari usano una gerarchia comune.

## Fondamenti

- `src/design.ts` definisce quattro livelli: didascalia 14/20, testo 16/24, titolo 24/32 e dato principale 36/44. I pesi sono normale e semibold; i valori numerici usano cifre tabulari. Le etichette compatte della navigazione e i controlli di sistema mantengono il trattamento nativo esistente.
- Spaziature su multipli di quattro: margini laterali 20, sezioni e padding delle schede 24, gruppi correlati 8–16.
- Schede con raggio 24, campi e pulsanti con raggio 16. I pulsanti principali hanno altezza minima 56; i controlli compatti almeno 44.
- Pulsanti di avvio e azioni secondarie in arancione pieno con testo e icone bianchi; accenti leggeri per le selezioni. Il rosso indica errori o eliminazioni.
- `inputBorder` distingue i campi anche dentro le schede. Il focus usa l’accento; tutte le etichette restano visibili durante la compilazione.

## Schermate

| Area | Intervento |
| --- | --- |
| Accesso | Gerarchia tipografica comune, campi delimitati, indicatore di focus e comando per mostrare la password. |
| Sessione | Presentazione con azione di avvio in basso nella scheda; cronometro e conteggi raggruppati; messaggio di completamento con conferma del salvataggio. |
| Recupero | Durate rapide e inserimento preciso personalizzato; schermata iOS con timer grande e feedback al termine. Trascinamento verso il basso e pulsante di chiusura interrompono il recupero. |
| Aggiungi esercizio | Lista condivisa con la libreria, con immagini, ricerca e filtri; la selezione apre direttamente il modulo serie nello stesso modale, senza recupero. |
| Libreria | Filtri con sfondo leggero, conteggio dei risultati, creazione e ripristino della ricerca accessibili anche dal contenuto. |
| Esercizio | Tipografia e metriche uniformi; registrazione diretta dal dettaglio e dallo stato senza sessioni. |
| Allenamenti | Riepilogo con giornate, punti e serie; righe leggibili con indicazione di apertura. |
| Giornata | Punteggio principale e metriche di supporto nello stesso riepilogo. |
| Profilo | Peso attuale e registrazione nella stessa scheda; grafico mostrato quando sono presenti misurazioni. |
| Moduli | Salvataggio persistente in basso, fuori dal contenuto scorrevole e dentro il contenitore che gestisce la tastiera. Errori di salvataggio vicini all’azione. |
| Strava | Pubblicazione in basso, conferma visiva di successo e apertura dell’attività. |
| Stati comuni | Caricamento, spiegazione, icona e azione contestuale; ricerca senza risultati con azzeramento dei filtri. |

I componenti condivisi supportano tema chiaro/scuro e testo scalabile. Le animazioni dei pulsanti continuano a rispettare “Riduci movimento”.

## Verifica sul dispositivo

Typecheck, lint, test di dominio ed esportazione iOS verificano la correttezza del codice, ma la resa nativa va controllata su iPhone. In particolare:

- Schermo da 375 punti, tema chiaro e scuro, testo ingrandito e VoiceOver.
- Salvataggio nei moduli con tastiera numerica aperta, ultimo campo visibile e messaggi di errore lunghi.
- Libreria vuota, ricerca senza risultati e ripristino dei filtri.
- Prima registrazione del peso, sessione senza esercizi e riepilogo con molte serie.
- Safe area della barra inferiore e accesso alle ultime azioni durante lo scorrimento.

Il simulatore iOS non è disponibile nell’ambiente della revisione; non è stata eseguita una verifica visiva nativa.
