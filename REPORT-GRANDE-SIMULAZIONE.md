# Grande simulazione: sei mesi, due sedi, 50 clienti

Dal 5 ottobre 2026 al 5 aprile 2027, giorno per giorno, con l'orologio spostato su database e sito.

## Come l'ho fatta

Ogni giorno girano gli stessi lavori automatici della produzione:

- di notte: lezioni, scadenze, crediti, code;
- al mattino e alla sera: avvisi ai clienti;
- alle 20:30: promemoria degli appelli;
- la domenica: invio dei messaggi.

### Chi c'è

- **Staff:** 1 amministratrice (Simona), 1 segretaria (Paola) e 4 insegnanti (Sara, Marta, Giada, Davide). Tutti entrano con il codice di accesso.
- **Palinsesto:** 2 sedi (Vicenza e Schio), 10 corsi e 18 orari. Ci sono corsi per adulti, Kids e Teen.
- **Abbonamenti:**
  - mensile 1 volta e 2 volte;
  - trimestrale;
  - Kids;
  - 10 ingressi;
  - Open mensile e Open trimestrale, cioè l'accesso libero a tutte le lezioni.
- **50 clienti, tutti diversi:**
  - 10 genitori, 4 dei quali con due figli;
  - 2 con abbonamento Open;
  - 6 "rognosi": pagano in ritardo, si lamentano, disdicono tardi;
  - 7 indecisi che cambiano spesso giorno o corso;
  - 4 saltuari e 21 "normali".
- **Come pagano:** carta, rinnovo automatico, bonifico, contanti in segreteria, rate. Alcuni non hanno l'app e fanno tutto la segreteria.
- **Come arrivano:** 30 sono già clienti, gli altri arrivano durante i sei mesi con una prova dal sito o allo sportello.

### Fatti dei sei mesi

| Data | Fatto |
|---|---|
| 19/10 | posti aumentati su alcune lezioni |
| 4/11 | Danza Moderna passa dalle 19 alle 20, con comunicazione. La sala va in conflitto e la segreteria la sposta in Sala Pole |
| 16/11 | Davide malato: sostituzioni |
| 1/12 | Pole a Schio passa dal mercoledì al giovedì; un conflitto viene corretto alle 17:15 |
| 2/12 – 6/1 | chiusure di Natale e festa del patrono |
| 10/12 | saggio |
| 8/1 | nuovo orario Pole il sabato; Hip Hop del venerdì sospeso; i bambini vengono spostati di giorno |
| 15/1 | aumento dei prezzi |
| 1/2 | Flexy si sposta in Sala Aerea |
| 6/2 e 20/2 | stage a pagamento |
| 1/3 | Giada in maternità: le sue lezioni vanno a colleghe, con il controllo dei conflitti |
| 8/3 | Aerea Teen passa a 90 minuti |
| 15/3 | lezioni annullate, alcune con recupero e altre senza |

### Controlli

A fine mese il programma controlla:

- che i compensi corrispondano alle ore confermate;
- che non ci siano abbonamenti doppi;
- che ogni pagamento online abbia la sua ricevuta e il suo abbonamento;
- che nessuno compaia due volte in un appello;
- che non ci siano code aperte su lezioni passate;
- che non ci siano insegnanti o sale in due posti;
- il mese solare (vedi sotto);
- i tempi delle statistiche.

## Risultato finale

- **Grande simulazione:** 198 controlli superati, 0 falliti.
- **15 casi limite** (sotto): tutti superati.
- **Primo scenario rifatto da capo** (8 fasi): 310 su 310.
- **Prova del mese solare:** 22 su 22.
- **Interfaccia:** 62 pagine, da computer e da telefono, con 7 ruoli. Nessun errore e nessuna pagina più larga del telefono.

| Cosa è stato registrato | Quanti |
|---|---|
| righe nel registro azioni | 6.626 |
| lezioni | 1.691 |
| presenze | 1.180 (il 91% dei presenti attesi) |
| appelli fatti | 397 (30 dimenticati e confermati dalla segreteria) |
| rinnovi | 121 |
| prenotazioni di Open e ingressi | 200 |
| recuperi prenotati | 61 (33 in un'altra sede) |
| messaggi ai clienti | 540 |
| avvisi allo staff | 454 |

### Mese per mese

| Mese | Allievi a fine mese | Incassi | Presenze | Lezioni tenute | Annullate | Messaggi |
|---|---|---|---|---|---|---|
| ottobre | 24 | 5.655 € | 125 | 72 | 0 | 67 |
| novembre | 37 | 1.546 € | 218 | 75 | 0 | 85 |
| dicembre | 36 | 2.302 € | 161 | 58 | 25 (Natale) | 111 |
| gennaio | 35 | 2.434 € | 129 | 62 | 14 | 41 |
| febbraio | 33 | 1.504 € | 150 | 72 | 0 | 34 |
| marzo | 34 | 2.066 € | 152 | 77 | 2 | 82 |

A ottobre gli incassi sono più alti perché ci sono i primi acquisti e le quote annuali.

## Mese solare (la tua indicazione)

Gli abbonamenti scadono il 30 o il 31 del mese. Ecco cosa cambia:

- **Rinnovo automatico con carta:** il primo mese si paga all'acquisto, poi Stripe addebita il 1° di ogni mese. Prima andava dal 12 all'11.
- **Dall'app**, sia con la carta sia con il bonifico, un abbonamento a mese si compra solo dal 1°. Lo shop mostra "Da: maggio 2027" invece della data.
  - Chi vuole partire a metà mese legge: "passa dalla segreteria, ti fa l'importo per i giorni che restano".
  - I pacchetti a ingressi si comprano quando si vuole.
- **In segreteria**, quando un abbonamento parte a metà mese:
  - il modulo chiede l'importo fino a fine mese;
  - propone l'importo in base alle lezioni che restano, per esempio "restano 3 lezioni su 4 → usa 40 €";
  - decide la segreteria.
- **Rinnovi:**
  - Un abbonamento scaduto che ripartirebbe a metà mese non si rinnova "in blocco": il pulsante "Rinnova" chiede l'importo.
  - Lo stesso vale per un abbonamento finito a metà mese dopo una sospensione.
- **Bonifico confermato qualche giorno dopo:** l'abbonamento vale dal 1° del mese pagato e non dal giorno della conferma.
- **Carta rifiutata il 1° e pagata il 4:** il mese resta intero.

Nei sei mesi:

- 25 volte l'app ha detto "dal 1° del mese". In metà dei casi il cliente ha comprato dal mese dopo, negli altri è andato in segreteria.
- 21 partenze a metà mese hanno avuto l'importo deciso dalla segreteria.
- I controlli "scade a fine mese" e "dall'app si parte il 1°" sono stati superati tutti i mesi.

## Problemi trovati e corretti

### Durante la simulazione (query 106, cambi d'orario)

- **Cambio d'ora:** le lezioni con prenotazioni restavano all'ora vecchia. Ora si spostano tutte, con un messaggio per cliente.
- **Comunicazioni mancanti:** cambi d'ora, giorno o durata non mandavano nessun avviso. Ora lo ricevono clienti, insegnante e segreteria.
- **Orario sospeso:**
  - restava una lezione con prenotazione;
  - gli iscritti fissi restavano senza giorno e senza avviso.

  Ora c'è un avviso per ogni cliente, un promemoria "Scegliere un altro giorno" per ogni iscritto, e le lezioni vengono annullate.
- **Insegnante o sala in due posti:** succedeva in 77 lezioni per l'insegnante e 36 per la sala, senza nessun avviso. Ora c'è l'avviso "Orario in conflitto" e "Insegnante in due posti".
- **Sostituzione:** il programma avvisa se la sostituta ha già un'altra lezione alla stessa ora.
- **Bonifico confermato su un orario sospeso:** creava un iscritto senza giorno. Ora è bloccato con "orario_non_attivo".

### Coda delle lezioni piene (query 105, la tua domanda)

- Chi trova una lezione piena tocca "Completa · mettimi in coda".
- Se qualcuno disdice, vengono avvisati solo i primi in coda (tanti quanti i posti liberi) e la segreteria riceve l'elenco con i telefoni.
- Correzione: chi era in coda per il lunedì e intanto prende il giovedì resta in coda per il lunedì. Prima usciva dalla coda.

### Casi limite (query 108)

| Caso | Prima | Ora |
|---|---|---|
| Paga due volte (due schede aperte) | il secondo pagamento restava senza abbonamento | il secondo abbonamento parte dopo il primo e la segreteria riceve "Pagato due volte?" |
| Bambino iscritto a un corso per adulti dall'app | permesso | bloccato: "corso per un'altra età" |
| Ragazzo che compie gli anni a metà stagione | — | rinnova lo stesso corso (Tommaso, 12 anni a febbraio, in Hip Hop Kids 5-11) |
| Open: due lezioni alla stessa ora | prenotate entrambe | bloccato. Nei sei mesi è stato fermato 40 volte |
| Bonifico rifiutato, cliente senza notifiche | non riceveva nulla | riceve l'email |
| Posti ridotti sotto gli iscritti | nessun avviso | "Più persone che posti: 7 persone per 5 posti" |
| Contestazione della carta su Stripe | ignorata | promemoria con la scadenza per rispondere e avviso all'amministrazione |
| Statistiche "riempimento" e appelli rivisti dopo | chi aveva l'abbonamento scaduto spariva dalle lezioni passate (il riempimento risultava 4-5%) | resta: il riempimento (dall'inizio stagione) sale fino al 14% |
| Rimborso totale con carta | l'abbonamento restava attivo senza dirlo | il messaggio ricorda di annullarlo dalla scheda |

Superati senza correzioni:

- password dimenticata con il codice della segreteria, che vale una volta sola;
- persona doppia trovata mentre si scrive e unione delle schede;
- richiesta privacy;
- cedolino contestato;
- un'insegnante disattivata non vede più gli appelli;
- una lezione passata non si prenota.

## Da decidere

1. **Open senza limite di prenotazioni:** un cliente Open può tenersi prenotate tutte le lezioni future e occupare posti. Vuoi un massimo, per esempio 3 prenotazioni aperte alla volta?
2. **Ingressi che scadono non usati:** nei sei mesi 5 clienti hanno perso da 1 a 5 ingressi. Vuoi un avviso "ti restano N ingressi, scadono il …" 7 giorni prima?
3. **Aumento prezzi e rinnovo automatico:** chi ha il rinnovo automatico continua a pagare il prezzo vecchio, perché Stripe tiene quello dell'acquisto. Va bene così, cioè prezzo bloccato per chi resta, oppure vuoi aggiornarlo?
4. **Cambio di sala nella stessa sede** (Flexy in Sala Aerea): i clienti non vengono avvisati. Avvisiamo solo se cambia sede, come ora, oppure sempre?
5. **Certificato scaduto e acquisto dall'app:** si può comprare; poi in appello la persona risulta bloccata e l'app chiede il certificato. Va bene così?
6. **Partenza a metà mese dall'app:** ora l'app la manda sempre in segreteria. Vuoi che nei primi giorni del mese, per esempio fino al 5, si possa comprare il mese intero anche dall'app?
