# RMHouse — Test di una stagione intera (beta test massivo V2)

## In due parole

Ho fatto vivere al gestionale una stagione completa, dal 1° settembre 2026 al 30 giugno 2027, e poi l'inizio della stagione dopo fino al 21 settembre 2027: 500 famiglie con caratteri diversi (precisi, disordinati, rognosi, quelli che fanno doppio clic, genitori con più figli, chi abbandona, chi torna), 20 insegnanti, 60 corsi in 3 sedi e 8 sale, segreteria che sbaglia, telefonate, eventi, affitti, Stripe che cade, messaggi di Stripe in ritardo o doppi, due segretarie che premono lo stesso pulsante nello stesso istante. In tutto, nell'ultima esecuzione: **13.400 presenze in 4.000 appelli, 4.200 prenotazioni libere, 1.450 disdette, 690 recuperi, 1.526 rinnovi, 704 acquisti con carta, 1.300 incassi in segreteria, 185.000 € incassati, 9.800 notifiche sul telefono, 4.300 email**. La stagione è stata rifatta da capo sei volte, ogni volta correggendo quello che usciva: l'ultima esecuzione chiude con 884 controlli superati e 3 non superati, tutti e tre spiegati sotto (nessuno è un difetto nuovo).

Risultato: **7 difetti veri**, nessuno dei quali era mai emerso nei test precedenti perché nascono solo dal volume, dalla concorrenza o dal passare dei mesi. Sono tutti corretti nella query 114 e nei due file dell'app di questo aggiornamento, con una prova di regressione che prima li riproduceva e ora passa. Le prove di sicurezza (~60, ripetute tre volte nella stagione) non hanno trovato falle. Il database, mese dopo mese, non rallenta: le ottimizzazioni dell'aggiornamento 119 reggono.

**Verdetto: 🟡 PRONTO CON RISERVE.** Il programma è solido per iniziare la stagione. Le riserve non sono bug ma cose da decidere o da fare fuori dal codice: tre scelte di regolamento (sotto, "Da decidere"), Stripe da configurare sul vero account quando si accenderanno i pagamenti online, e il piano Supabase.

| Area | Punteggio | Perché |
|---|---|---|
| Integrità dei dati | 88 | 46 invarianti verificate ogni mese, contabilità indipendente al centesimo, ore insegnanti uguali a un modello esterno. Tolti i 4 difetti trovati (rinnovo doppio, rimborsi che si pestavano i piedi, sospensioni, arretrati), resta una debolezza strutturale: chi cambia giorno "riscrive" gli iscritti delle lezioni passate (solo statistiche, non presenze). |
| Velocità | 92 | Tutte le chiamate misurate restano sotto 0,2 s da settembre a settembre; il database cresce di ~5 MB al mese. Riserva: misurato sul mio computer, non su Supabase. |
| Esperienza d'uso | 80 | Le regole dicono di no quando devono, con messaggi chiari. Mancano: dare un recupero a mano dalla scheda, "scarica tutti i miei dati" per il cliente, un avviso quando il cedolino ha ancora lezioni da confermare. |
| Sicurezza e GDPR | 85 | 0 falle su ~180 prove. Minimizzazione: l'insegnante, via API (non dall'app), può leggere codice fiscale e indirizzo dei clienti. Cancellazione dati ora completa. |
| Pagamenti | 88 | Doppio clic, webhook in ritardo/doppi/tripli, Stripe giù, idempotenza: tutto tiene. Corretto il rimborso in parallelo. Riserva: Stripe vero non ancora collegato (variabili su Vercel). |
| **Complessivo** | **86** | |

## Come è fatto il test

Il motore è `stagione.py` (1.950 righe), che fa girare il mondo giorno per giorno con l'orologio spostato in avanti (database, sito e finto Stripe condividono la stessa ora). Ogni giorno: lavori notturni del programma, notifiche del mattino, segreteria (bonifici, certificati, conferme, promemoria, sostituzioni), arrivi di clienti nuovi a picchi (settembre, gennaio), rinnovi, disdette, recuperi, prenotazioni, appelli degli insegnanti con assenze e errori, cron dei messaggi la sera. Ogni cliente ha un carattere che decide come si comporta; ogni azione passa dalle stesse API, RPC e pagine che usa l'app vera, mai dal database direttamente (il database si tocca solo per leggere e controllare).

In parallelo il test tiene un **modello di verità indipendente**: un registro di ogni euro mosso (ledger) e delle ore fatte da ogni insegnante, calcolati fuori dal programma. Alla fine di ogni mese confronta: contabilità (incassato, rimborsi), ore e cedolini, 46 invarianti sul database, notifiche, app contro database su 25 famiglie, cruscotto e appello. Poi misura la velocità di 12 chiamate e 7 pagine sempre con lo stesso set.

### Matrice di copertura

| Area | Cosa è stato fatto | Volume |
|---|---|---|
| Anagrafica e accessi | registrazioni (anche doppie), attivazione app, primo accesso sbagliato, figli aggiunti dall'app, moduli firmati, persone nuove segnalate in appello | 271 famiglie, 351 app attivate, 656 moduli |
| Abbonamenti | carta, ricorrente, bonifico, segreteria, rate; mese solare; partenze a metà mese con importo della segreteria; rinnovi (manuali, automatici, da due segretarie insieme); cambi di tipo, giorno e corso; sospensioni; annullamenti; abbandoni e ritorni | 454 iscritti, 1.526 rinnovi, 340 partenze a metà mese, 66 sospensioni |
| Lezioni e presenze | appelli con assenze, correzioni, aggiunte, "tutti presenti" premuto due volte, appelli dimenticati e confermati dalla segreteria, certificati scaduti che bloccano | 4.018 appelli, 13.379 presenze, 1.385 assenze, 311 presenze negate |
| Prenotazioni | open e pacchetti, lezioni piene e coda, disdette in tempo e tardive, ritiri, recuperi automatici e da telefono, regole (limite mensile, certificato, sovrapposizioni) | 4.195 prenotazioni, 553 in coda, 1.446 disdette, 690 recuperi |
| Pagamenti | cassa con doppio clic, casse abbandonate, webhook ripetuti/in ritardo/tripli, rate online e in segreteria, dovuti, rimborsi sulla carta (anche due insieme), note di credito, contestazioni, ricevute | 704 acquisti con carta, 1.300 incassi in segreteria, 148 rinnovi automatici, 48 piani a rate, 43 webhook ripetuti, 12 rimborsi + 21 note di credito |
| Palinsesto | cambio ora, cambio giorno con conflitto di sala, orari nuovi e sospesi, chiusure (feste, Natale, Pasqua, estate), malattia, maternità, sostituzioni spontanee e conflitti risolti | 37 cambi di giorno, 57 sostituzioni, 8 chiusure |
| Eventi e sale | open day, saggi, stage a pagamento, iscrizioni e rinunce; affitti dal sito e dalla segreteria, anche sopra una lezione o su una chiusura | 52 affitti, 23 rifiutati perché la sala era occupata |
| Comunicazioni | email e push per ogni fatto (certificati, scadenze, annullamenti, rinnovi), cron quotidiano, telefoni che tolgono l'app | 9.828 push consegnate a un finto servizio push, 4.341 email (segnate spedite: Resend non c'è in locale) |
| Sicurezza | letture di dati altrui, RPC su persone di altri, API con ID altrui, pagine dello staff da cliente e da anonimo, codice di attivazione sbagliato, token scaduto e con firma falsa, insegnante su lezioni di colleghe e su funzioni della direzione, segreteria su funzioni della direzione, link con token inesistente | ~60 prove × 3 (novembre, marzo, giugno): 0 falle |
| GDPR | richiesta di cancellazione dall'app, promemoria dei 30 giorni, anonimizzazione dalla direzione, tracce del nome in 10 posti, app del cancellato, nessun messaggio al cancellato | 1 cancellazione completa per stagione |
| Caos | webhook "pagato" dopo "scaduto", Stripe giù in acquisto e in rimborso, tre refresh insieme, pagina "grazie" aperta due volte, database irraggiungibile per qualche secondo | ripetuto a dicembre e aprile |
| Gare | ultimo posto conteso, stesso recupero da due, tre disdette insieme, webhook triplo, due segretarie su Rinnova, due rimborsi insieme | ripetuto a novembre, gennaio, giugno |
| Fine e nuova stagione | fotografia del 30 giugno; 1° settembre: palinsesto nuovo, 206 rinnovi, 33 cambi di corso, 80 non tornano, 10 figli nuovi; contaminazione fra stagioni | 3 settimane di settembre 2027 |
| BREAK RMHOUSE | 20 prenotazioni, disdette doppie, modifica dati, evento e rinuncia, rimborso, modifica della segreteria, riepilogo | 18/18 passi puliti |

## I difetti trovati (e corretti)

| Codice | Gravità | Cosa succedeva | Come l'ho trovato | Correzione |
|---|---|---|---|---|
| BUG-RACE-04 | P1 | Due segretarie premono "Rinnova" nello stesso istante: nascono **due rinnovi** dello stesso abbonamento (due incassi da chiedere, due scadenze). | Gara del 25 gennaio: 2 rinnovi. | `rinnova_iscrizione` blocca la riga prima di controllare; vincolo unico "un solo rinnovo per abbonamento". |
| BUG-RACE-05 | P1 | Due rimborsi sulla carta nello stesso momento (es. 10 € e 15 €): Stripe li fa entrambi, ma negli incassi il secondo **sovrascrive** il primo (risulta 15 € invece di 25 €). La contabilità indipendente lo vedeva come "rimborsato sulla carta più di quanto l'app sa". | Gara "due rimborsi insieme" + contabilità mensile. | `segna_rimborso_online` ora somma l'importo appena rimborsato invece di scrivere un totale calcolato prima. Il webhook di Stripe con il totale non può mai abbassarlo. |
| BUG-SOSP-01 | P2 | Sospensione con date fuori dall'abbonamento (es. sull'abbonamento di febbraio con date di gennaio): la scadenza si allungava di **tutti** i giorni. E se il rinnovo era già fatto, la scadenza finiva sopra il rinnovo: due abbonamenti attivi sullo stesso corso negli stessi giorni (l'invariante lo segnalava ogni mese). | Invariante "sospensioni fuori periodo" + "abbonamento doppio". | Contano solo i giorni dentro l'abbonamento (tutti fuori → errore chiaro nell'app); la scadenza non supera mai l'inizio del rinnovo, i giorni che restano arrivano alla segreteria come promemoria (sconto sul rinnovo o recuperi). |
| BUG-COMP-01 | P2 | Lezione confermata **dopo** che il cedolino del mese era già stato pagato (succede: la segreteria conferma gli appelli dimenticati entro 4 giorni, il cedolino si paga il 2): la lezione non finiva in nessun cedolino. L'insegnante la perdeva. | Invariante "somma righe = totale" + confronto ore. | `calcola_compensi` mette queste lezioni nel primo cedolino ricalcolato come "arretrato di gg/mm", una volta sola. |
| BUG-SALA-03 | P2 | Affitto sala fatto dalla segreteria: il prezzo del listino non veniva applicato, restava 0 € (una conversione sbagliata, l'errore veniva nascosto). | Affitti dalla segreteria: prezzo sempre 0. | Preso `prezzo_cent` dal listino. |
| BUG-GDPR-01 | P3 | Dopo "cancella i miei dati" il nome restava nel registro azioni (16 righe), nei promemoria, nei messaggi già inviati, nelle notifiche allo staff, nelle iscrizioni agli eventi, negli affitti e nelle descrizioni degli incassi. | Cancellazione del 12 aprile, tracce contate in 10 posti. | `anonimizza_persona` ripulisce tutto; restano solo le ricevute (conservazione fiscale) e i moduli firmati (prova del consenso). |
| BUG-MSG-01 | P4 | Due abbonamenti comprati lo stesso giorno (due corsi) = due email identiche "ci serve il certificato". | Invariante "nessun messaggio doppio". | Una email al giorno per persona. |

Tutti e sette sono coperti da `regressione_114.py` (13 prove): prima della 114 riproducevano il difetto, dopo passano. Le prove girano anche sul database di fine stagione.

### Falsi allarmi (il programma aveva ragione)

Vale la pena dirlo, perché nella prima esecuzione sembravano 27 bug: ore degli insegnanti diverse dal modello (il modello contava la lezione nel mese della conferma, l'app giustamente in quello della lezione); affitti "accettati sopra una lezione" (la lezione era annullata per la chiusura di Natale, la sala era libera; e nel primo caso il test sbagliava il fuso orario); "token scaduto accettato" (il test lo misurava sull'orologio simulato, il server sull'ora vera); rate "pagate due volte" e rimborsi "fantasma" (dati del database di partenza, non della stagione); "sala con due lezioni alla stessa ora" dopo un cambio di giorno (il programma lo segnala alla segreteria invece di bloccarlo: scelta voluta, il test non rimetteva il giorno di prima); "segreteria esegue approva_compensi" (oggi la segreteria può: è una scelta, vedi sotto).

## Velocità mese per mese

Ogni 1° del mese, stesse 12 chiamate al database e 7 pagine, tre volte, preso il valore di mezzo. Tempi in secondi; la riga "righe" dice quanto era cresciuto l'archivio.

| | 26-09 | 26-10 | 26-11 | 26-12 | 27-01 | 27-02 | 27-03 | 27-04 | 27-05 | 27-06 | 27-07 | 27-09 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Riepilogo segreteria (cruscotto) | 0,02 | 0,04 | 0,05 | 0,05 | 0,04 | 0,05 | 0,05 | 0,06 | 0,05 | 0,07 | 0,06 | 0,06 |
| App cliente: riepilogo | – | 0,01 | 0,01 | 0,01 | 0,01 | 0,01 | 0,01 | 0,01 | 0,01 | 0,01 | 0,01 | 0,01 |
| App cliente: lezioni prenotabili | – | 0,02 | 0,01 | 0,01 | 0,01 | 0,01 | 0,01 | 0,01 | 0,01 | 0,01 | 0,01 | 0,01 |
| Elenco persone | 0,01 | 0,03 | 0,02 | 0,03 | 0,03 | 0,03 | 0,02 | 0,03 | 0,03 | 0,03 | 0,04 | 0,03 |
| Ricerca persona | 0,01 | 0,02 | 0,02 | 0,02 | 0,02 | 0,02 | 0,02 | 0,02 | 0,02 | 0,02 | 0,03 | 0,02 |
| Calendario settimana | 0,01 | 0,04 | 0,04 | 0,04 | 0,05 | 0,05 | 0,07 | 0,09 | 0,08 | 0,07 | 0,07 | 0,07 |
| Appello | 0,01 | 0,02 | 0,01 | 0,01 | 0,01 | 0,01 | 0,01 | 0,01 | 0,01 | 0,01 | 0,01 | 0,01 |
| Scheda persona | 0,00 | 0,01 | 0,01 | 0,01 | 0,01 | 0,01 | 0,01 | 0,01 | 0,01 | 0,01 | 0,01 | 0,01 |
| Statistiche intera stagione | 0,01 | 0,03 | 0,04 | 0,05 | 0,05 | 0,07 | 0,12 | 0,08 | 0,10 | 0,10 | 0,15 | 0,13 |
| Andamento mensile | 0,08 | 0,12 | 0,04 | 0,03 | 0,03 | 0,05 | 0,05 | 0,06 | 0,07 | 0,08 | 0,08 | 0,08 |
| Scadenze | 0,01 | 0,01 | 0,01 | 0,01 | 0,01 | 0,01 | 0,01 | 0,01 | 0,01 | 0,01 | 0,01 | 0,01 |
| Pagina Riepilogo | 0,13 | 0,13 | 0,15 | 0,12 | 0,15 | 0,13 | 0,11 | 0,14 | 0,11 | 0,14 | 0,11 | 0,15 |
| Pagina Persone | 0,09 | 0,07 | 0,08 | 0,08 | 0,10 | 0,09 | 0,10 | 0,07 | 0,10 | 0,08 | 0,08 | 0,09 |
| Pagina Calendario | 0,09 | 0,10 | 0,14 | 0,11 | 0,14 | 0,13 | 0,16 | 0,13 | 0,17 | 0,15 | 0,14 | 0,17 |
| Pagina Statistiche | 0,08 | 0,08 | 0,10 | 0,10 | 0,12 | 0,12 | 0,16 | 0,17 | 0,19 | 0,19 | 0,20 | 0,23 |
| Pagina Appello | 0,09 | 0,06 | 0,08 | 0,07 | 0,06 | 0,08 | 0,07 | 0,08 | 0,09 | 0,07 | 0,06 | 0,14 |
| Pagina app cliente (Lezioni) | – | 0,05 | 0,05 | 0,05 | 0,05 | 0,05 | 0,05 | 0,05 | 0,06 | 0,04 | 0,05 | 0,04 |
| Pagina app cliente (Orario) | – | 0,08 | 0,06 | 0,06 | 0,06 | 0,06 | 0,06 | 0,05 | 0,05 | 0,07 | 0,04 | 0,06 |
| righe: presenze | 10 | 547 | 1.918 | 3.392 | 4.516 | 5.824 | 7.456 | 9.303 | 10.948 | 12.551 | 14.149 | 14.934 |
| righe: prenotazioni | 0 | 148 | 566 | 1.065 | 1.468 | 1.939 | 2.492 | 3.089 | 3.623 | 4.228 | 4.797 | 5.085 |
| righe: registro azioni | 3.158 | 8.216 | 13.648 | 18.555 | 22.439 | 27.748 | 32.882 | 38.417 | 43.401 | 48.129 | 52.874 | 56.975 |
| righe: messaggi | 53 | 865 | 2.842 | 4.168 | 5.488 | 6.825 | 8.251 | 9.719 | 11.000 | 12.350 | 13.590 | 14.204 |
| database (MB) | 21,1 | 29,1 | 36,5 | 41,9 | 46,3 | 53,1 | 58,3 | 64,5 | 68,9 | 73,9 | 78,5 | 82,8 |

Lettura: **nessuna chiamata rallenta col passare dei mesi**. Le più pesanti restano le statistiche sull'intera stagione (cruscotto da settembre a oggi) e il calendario della settimana, che crescono con i dati ma stanno sotto 0,2 s. Il database passa da 21 a 79 MB in una stagione (83 a fine settembre 2027) (≈5 MB al mese, metà è registro azioni); con il piano gratuito di Supabase (500 MB) ci stanno 5-6 stagioni, ma il limite vero del piano gratuito non è lo spazio: è che il database si addormenta dopo una settimana senza uso e ha poche connessioni. Con 500 iscritti attivi serve il piano Pro.

I tempi sono del mio computer di prova (sito e database sulla stessa macchina): su Vercel + Supabase ogni chiamata ha in più 20-50 ms di viaggio, ma il rapporto fra i mesi resta.

## Sicurezza e GDPR

Le ~60 prove per ruolo ripetute tre volte (novembre, marzo, giugno) non hanno trovato falle: un cliente non legge né tocca righe di altri in 14 tabelle, non usa le RPC sull'allievo di un altro, non apre la cassa per altri, non scarica esportazioni, non apre le pagine dello staff; l'anonimo non entra; il codice di attivazione sbagliato è rifiutato; il token scaduto e quello con la firma manomessa sono rifiutati; l'insegnante non segna presenze né si attribuisce lezioni di colleghe, non legge incassi, compensi altrui, lead, eventi Stripe, non crea abbonamenti, non alza il proprio compenso; la segreteria non anonimizza; un link con token inesistente non carica certificati né calendari.

Due osservazioni, non falle:

- **Minimizzazione (P3).** L'insegnante dall'app vede solo nome e telefono, ma la regola del database gli permette di leggere l'intera tabella `account` (codice fiscale, indirizzo). Un insegnante con conoscenze tecniche potrebbe leggerli. Si sistema con una vista "account per lo staff di sala" senza quelle colonne; non l'ho fatto in questo aggiornamento perché tocca molte pagine e va provato con calma.
- **Portabilità (art. 20).** Il cliente scarica i moduli firmati, ma non c'è un "scarica tutti i miei dati" (iscrizioni, presenze, pagamenti): oggi lo chiede alla segreteria, che ha le esportazioni.

La cancellazione dati ora è completa (vedi BUG-GDPR-01): dopo, dell'intera stagione della persona restano solo le ricevute e i moduli firmati, e l'app non le mostra più nulla; nessun messaggio parte più verso di lei.

## Da decidere (regole, non bug)

1. **Chi approva e paga i compensi.** Oggi la segreteria può calcolare, approvare e segnare pagati i cedolini degli insegnanti (è "gestione", come la direzione). Se deve essere solo la direzione, è una riga da cambiare.
2. **Sospensioni e mese solare.** Oggi una sospensione allunga la scadenza di altrettanti giorni (ora: solo quelli dentro l'abbonamento, e mai sopra il rinnovo). Con il mese solare questo significa che un abbonamento di ottobre sospeso 10 giorni finisce il 10 novembre, e il rinnovo parte "a metà mese" con l'importo della segreteria. Alternativa più coerente con il mese solare: la sospensione non sposta la scadenza ma genera uno sconto sul rinnovo (giorni sospesi / giorni del mese × prezzo) o dei recuperi. Dite voi.
3. **Recuperi a cavallo delle stagioni.** I recuperi scadono con l'abbonamento: chi ha un annuale comprato in ottobre ha recuperi validi fino a ottobre dopo, e a settembre può prenotarli sulle lezioni nuove (26 recuperi "vecchi" vivi al 21 settembre). Se a fine stagione vanno azzerati, serve una regola.

## Osservazioni minori (P3-P4), non corrette

- Chi cambia giorno "riscrive" gli iscritti delle lezioni passate: gli iscritti fissi di una lezione si ricavano dai giorni **attuali** dell'abbonamento, quindi dopo un cambio di giorno le statistiche di riempimento delle lezioni vecchie cambiano un po' (le presenze no). A settembre, spostando 13 annuali sui nuovi orari, il riempimento della stagione vecchia è passato da 32,8 a 32,7% (è uno dei 3 controlli non superati dell'ultima esecuzione). Per sistemarlo davvero i giorni dell'abbonamento dovrebbero avere una validità nel tempo.
- Non c'è un modo nell'app per dare un recupero "straordinario" a mano (il test lo faceva via database); la segreteria oggi lo risolve aggiungendo la persona in appello.
- Due cambi dello stesso orario nello stesso giorno (cambio e ritorno indietro): il secondo avviso ai clienti non parte sempre (4 su 5).
- Chi chiede due abbonamenti con bonifico per due corsi diversi, confermati lo stesso giorno, riceve due notifiche identiche "Abbonamento attivato ✓ · Bonifico arrivato, grazie!": sono giuste entrambe, ma il testo non dice per quale corso (gli altri 2 controlli non superati dell'ultima esecuzione sono questo).
- Il cedolino si può segnare pagato anche se ci sono lezioni finite da confermare (la pagina lo scrive, ma non chiede conferma).
- Il cambio di giorno di un orario che finisce sopra un'altra lezione nella stessa sala viene **segnalato** alla segreteria, non bloccato (scelta della 106): nel test è successo due volte e la segreteria ha rimesso il giorno di prima.

## Cosa ho verificato oltre alla stagione

- `regressione_114.py`: 13 prove mirate sui 7 difetti, sul database di fine stagione.
- Scenari precedenti rifatti da capo con la 114: f1-f10 (310 su 310), grande simulazione di sei mesi (183 controlli, 0 falliti).
- Interfaccia da computer e telefono (390 px): sospensione fuori periodo (messaggio), cedolino con la riga "arretrato", pagina Spazi; nessun errore JavaScript, nessuno scorrimento laterale.
- Query 114 eseguita due volte di seguito. Build ok.

## Cosa resta da fare prima di accendere tutto

1. Decidere i tre punti sopra.
2. Stripe: creare il webhook sull'account della scuola e mettere le variabili su Vercel (Impostazioni → Pagamenti mostra tre "!"); finché i pagamenti online sono spenti non cambia nulla.
3. Supabase: piano Pro prima di settembre.
4. Se volete, la vista "account per lo staff di sala" (minimizzazione) e un "scarica i miei dati" nell'app: li farei in un aggiornamento a parte.
