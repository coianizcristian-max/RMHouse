# Simulazione di sei mesi — dal 6 ottobre 2026 al 5 aprile 2027

## Come l'ho fatta

Ho spostato l'orologio del database e del sito in avanti un giorno alla volta, per 182 giorni. Ogni giorno girano gli stessi lavori automatici che in produzione fa Supabase:

- di notte: lezioni, scadenze, crediti, messaggi;
- al mattino e alla sera: avvisi ai clienti;
- alle 20:30: promemoria degli appelli;
- la domenica: invio dei messaggi.

Su questo calendario hanno lavorato le persone della simulazione:

- **Clienti** (i 6 rimasti dal primo test, più quelli arrivati dal sito)
  - rinnovano a modo loro: carta, rinnovo automatico, bonifico, in segreteria, pacchetti a ingressi;
  - a volte rinnovano in ritardo o chiudono la cassa senza pagare;
  - alcuni se ne vanno;
  - disdicono, recuperano, caricano il certificato (non sempre in tempo), vengono in più.
- **Nuovi dal sito:** 23 prove prenotate (Pole, Flexy, Kids), quasi tutte pagate; il 50% circa si è iscritto.
- **Insegnanti** (Sara, Marta e poi Giada)
  - fanno gli appelli, con assenze vere;
  - a volte dimenticano l'appello o la conferma, e la segreteria la conferma il giorno dopo.
- **Amministrazione**, con questi fatti:

| Data | Fatto |
|---|---|
| ottobre | nuovo abbonamento Flexy |
| novembre | sala Pole da 4 a 8 posti; arriva Giada, che prende Flexy; Marta malata una settimana |
| dicembre | nuovo corso Yoga "in partenza" con lista "avvisami"; saggio di Natale; chiusura dal 24/12 al 6/1 |
| gennaio | apertura Yoga; aumento prezzi del 10% |
| febbraio | stage a pagamento con posti limitati |
| marzo | Marta in maternità, Kids passa a Giada; Pasquetta |
| ogni mese | compensi calcolati, approvati e pagati |

A fine mese ho fatto controlli automatici di coerenza:

- nessun orario venduto oltre i posti;
- ingressi mai negativi;
- nessun abbonamento doppio;
- ogni pagamento online con la sua ricevuta e il suo abbonamento;
- nessun pagamento online rimasto in sospeso;
- nessun abbonamento scaduto rimasto "attivo";
- lezioni passate tutte confermate;
- recuperi mai persi su lezioni annullate;
- ore dei compensi uguali alle lezioni confermate;
- tempi delle statistiche.

Alla fine ho rifatto il giro di 84 pagine con la data di aprile 2027, da computer e da telefono. Il server era in UTC come su Vercel, il telefono in ora italiana.

## Risultato finale (dopo le correzioni)

- 98 controlli superati, 0 falliti. Il primo scenario (quello del report 114) è stato rifatto: 287 su 287.
- 84 pagine senza errori, a sei mesi di distanza.
- Non è cambiato nulla con il cambio dell'ora legale, né tra server in UTC e telefono in ora italiana.

| Mese | Clienti attivi | Lezioni tenute / annullate | Presenze | Disdette | Prove | Compensi (Sara / Marta / Giada) |
|---|---|---|---|---|---|---|
| ott | 7 | 22 / 1 | 23 | 4 | 2 | 437 / 140 / – |
| nov | 9 | 21 / 0 | 45 | 2 | 5 | 275 / 120 / 132 |
| dic | 11 | 17 / 6 (Natale) | 34 | 4 | 10 | 150 / 140 / 132 |
| gen | 12 | 21 / 4 (Natale) | 53 | 10 | 6 | 275 / 140 / 99 |
| feb | 12 | 24 / 0 | 62 | 10 | – | 300 / 160 / 132 |
| mar | 11 | 26 / 1 (Pasquetta) | 54 | 7 | – | 300 / – / 363 |

## Problemi trovati con il tempo (tutti corretti nell'aggiornamento 115)

1. **Rinnovo automatico fuori fase con Stripe (grave).**
   - Il problema: chi compra il 12 con rinnovo automatico aveva l'abbonamento fino al 31, ma Stripe riaddebita il 12 del mese dopo. Dal 1° all'11 il cliente restava senza abbonamento (fuori dall'appello), e ogni mese pagava un mese intero per circa 20 giorni.
   - Ora: col rinnovo automatico l'abbonamento va di mese in mese dal giorno d'inizio (dal 12 all'11), allineato agli addebiti, senza buchi anche se Stripe riprova qualche giorno dopo.
   - Nell'app c'è scritto "si rinnova ogni mese il giorno 12".
2. **Avvisi di scadenza a chi ha il rinnovo automatico.** Ricevevano ogni mese "il tuo abbonamento scade, rinnovalo" (email e notifica), con il rischio di pagare due volte. Ora non li ricevono più.
3. **Prova prenotata e poi iscrizione prima della prova.** La persona compariva due volte nell'appello, contava due posti e "Tutti presenti" andava in errore. Ora compare una volta sola.
4. **Rinnovo con bonifico chiesto prima della scadenza.** Alla conferma della segreteria dava "iscrizione già attiva". Ora il nuovo abbonamento parte il giorno dopo la fine di quello in corso.
5. **Pacchetto da 10 ingressi finito prima dei 3 mesi.**
   - Il problema: la segreteria non poteva venderne un altro ("iscrizione già attiva"), e "Rinnova" lo faceva partire solo alla scadenza.
   - Ora il vecchio si chiude e il nuovo parte subito.
6. **Lezioni annullate.**
   - Il problema: chi aveva usato un recupero (o un ingresso) su una lezione poi annullata, ad esempio nella chiusura di Natale, lo perdeva.
   - Ora torna disponibile.
   - Le prove su quella lezione finiscono nei "Da fare" come "Prova da spostare".
7. **Chiusure (Palinsesto → Chiusure).**
   - Il problema: un messaggio per ogni lezione (chi ha 2 lezioni a settimana ne riceveva 4 per Natale), e le insegnanti una notifica per lezione.
   - Ora c'è un messaggio solo: "La scuola resta chiusa dal 24/12 al 06/01: 4 tue lezioni non si fanno".
   - Si annullano solo le lezioni non ancora tenute.
8. **Statistica "Prova → iscrizione" sbagliata (usciva 262%).** Contava tutti i nuovi iscritti, anche chi non aveva fatto la prova. Ora conta solo chi si è iscritto dopo una prova (nella simulazione: 52%).
9. **"Rinnova" in segreteria.** Scriveva "Rinnovo automatico" nelle note, come quelli di Stripe. Ora scrive "Rinnovo".

## Cose emerse da sapere (non cambiate)

- **Notifiche sul telefono.** Se il telefono non risponde più (app disinstallata, permesso tolto), dopo qualche tentativo le notifiche si spengono e gli avvisi importanti arrivano per email. Nella simulazione è successo davvero ed è andato bene.
- **"Lezione da confermare".** Arriva ogni sera a ogni insegnante per ogni lezione non confermata. Con molti insegnanti che non usano l'appello sono tante notifiche: conviene che tutti confermino dall'app.
- **Chi lascia la prova.** Riceve 4 email (conferma, promemoria, "com'è andata", sondaggio), anche se poi si iscrive dopo il sondaggio. È così per scelta del modello messaggi.
- **Insegnante che aggiunge in appello una persona senza abbonamento.** Risulta "ingresso" senza pacchetto: la segreteria deve farsi pagare a parte.
- **Aumento prezzi.** Chi ha il rinnovo automatico continua a pagare il prezzo vecchio finché non rifà l'acquisto. Va deciso se va bene così.
- **Restano aperte le decisioni del report 114**, in particolare il recupero automatico quando la scuola annulla una lezione.

## Limiti

- Stripe, le email e le notifiche erano simulati: è verificato che partano, a chi e quando, non la consegna vera.
- Le persone sono finte e i loro comportamenti sono casuali ma ripetibili (stesso seme).
