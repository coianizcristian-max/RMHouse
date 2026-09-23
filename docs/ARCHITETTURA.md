# Architettura di RMHouse

Documento di riferimento: spiega **perché** il sistema è fatto così. Aggiornarlo quando cambia una decisione.

## Obiettivo
Sostituire l'APP Palestre attuale e automatizzare il lavoro della segreteria lungo tutto il percorso del cliente:

```
NUOVO LEAD → DATI → SCELTA PROVA → (PAGAMENTO) → PRENOTAZIONE → PRESENZA → ABBONAMENTO → ISCRIZIONE AUTOMATICA AL CORSO
```

Il sistema nasce **multi-palestra**: RM House è il primo cliente, ma ogni riga ha `palestra_id`
e ogni regola (fasce d'età, livelli, prezzi, messaggi, colori) sta nel database, non nel codice.
Così potrà diventare un prodotto vendibile ad altre strutture.

## Principi
1. **Account ≠ allievo.** L'account è chi paga e riceve messaggi e fatture (es. il genitore); l'allievo è chi frequenta.
   Un account può avere più allievi (due figlie). Un adulto è account e allievo insieme (`is_titolare = true`).
2. **Il lead è un allievo con uno stato**, non un'entità separata:
   `nuovo → prova_prenotata → prova_effettuata → iscritto`, oppure `perso` con un motivo.
3. **Ogni passaggio lascia una traccia** in `lead_eventi`: le statistiche di conversione si leggono da lì.
4. **Iscrizione al corso, non alle singole lezioni.** Un'iscrizione a orari fissi (`iscrizioni_orari`) basta perché l'allievo
   compaia nell'appello di tutte le lezioni del periodo. Nessuna prenotazione lezione per lezione.
5. **Le lezioni si generano da sole** dagli orari ricorrenti (finestra mobile di 90 giorni), saltando le chiusure.
6. **La logica critica sta nel database** (funzioni e trigger), non nel frontend: vale per qualunque interfaccia
   (sito, app, segreteria) e non si può aggirare.
7. **Fuso orario**: gli orari sono salvati come `timestamptz` calcolati con `palestre.fuso_orario` (Europe/Rome),
   ed è per evitare lo sfasamento di due ore visto in ArtLink.

## Modello dati

| Area | Tabelle |
|---|---|
| Palestra e staff | `palestre`, `staff` (ruolo: admin, segreteria, insegnante) |
| Catalogo | `categorie`, `discipline`, `fasce_eta`, `livelli`, `sale`, `corsi`, `orari`, `chiusure`, `recuperi_ammessi` |
| Calendario | `lezioni` (generate), vista `v_lezioni` |
| Persone | `account`, `allievi`, `certificati` |
| Abbonamenti | `tipi_abbonamento` (+ `tipi_abbonamento_corsi`), `iscrizioni`, `iscrizioni_orari`, `prenotazioni`, `sospensioni` |
| Funnel | `prove`, `presenze`, `lead_eventi`, `feedback_prove`, `liste_attesa` |
| Soldi | `pagamenti`, `documenti_fiscali`, `quote_iscrizione`, `spese`, `fornitori` |
| Spazi | `tariffe_spazi`, `pacchetti_evento`, `prenotazioni_spazi` |
| Messaggi | `messaggi_template`, `messaggi_coda` |

**Categoria** (danza, acrobatica, benessere) raggruppa le **discipline** (contemporanea, classica, pole…).
**Corso** = disciplina + fascia d'età + livello (+ prezzo della prova, info per la prova, capienza, max prove per lezione).
**Orario** = slot settimanale del corso (giorno, ora, durata, sala, insegnante).
**Lezione** = singola data generata dall'orario.

### Filtro dei corsi per il nuovo lead
Percorso chiesto dalla titolare: **età → categoria → livello → orari**.
1. Adulto oppure bambino/ragazzo (con data di nascita → età → fascia).
   Fasce reali: **Kids 5-11, Ragazzi 12-16, Adulti dai 17**.
2. Categoria: danza, acrobatica, benessere. Compaiono solo quelle che hanno corsi per quella fascia.
3. Livello: solo i livelli esistenti in quella categoria (un corso con livello vuoto vale per tutti).
4. Orari: solo le lezioni di quei corsi, con posti prova liberi, entro `giorni_prenotabili` e oltre `preavviso_ore`.
   Se restano più discipline (contemporanea, classica…), sopra l'elenco compare un filtro rapido.

Così, invece di 60 orari, la persona ne vede una manciata e non può iscriversi al corso sbagliato.

L'età viene ricontrollata dal database al momento della prenotazione (`eta_non_compatibile`).

### Scadenza abbonamenti
`fine_periodo(inizio, mesi, fine_mese)`: con il mese solare, iscritto il 10/09 → mensile scade il 30/09, trimestrale il 30/11.
Con `scadenza_fine_mese = false` si conta dalla data (10/09 → 09/10). Il prezzo del primo mese parziale (pro-rata o pieno)
è una decisione ancora aperta.

## Automatismi

| Quando | Cosa succede | Dove |
|---|---|---|
| Prova prenotata (gratuita) | Conferma subito + promemoria il giorno prima alle 18 | trigger `prove_messaggi` |
| Prova a pagamento pagata | Come sopra, dopo `conferma_pagamento()` | webhook Stripe (fase 2) |
| Presenza "Sì" su una prova | Lead → prova fatta, follow-up 2 ore dopo la lezione (abbonamento + recensione Google) | trigger `presenze_prova` |
| X giorni dopo la prova, non iscritto | Sondaggio "cosa non ti ha convinto" | `lavori_giornalieri()` |
| Risposta al sondaggio | Lead → perso, motivo salvato | `registra_feedback()` |
| Nuova iscrizione | Scadenza calcolata, lead → iscritto, sondaggio annullato, richiesta del certificato se manca | trigger `iscrizioni_*` |
| Certificato approvato dalla segreteria | La scadenza finisce sull'allievo e riattiva avvisi e accesso | trigger `certificati_valido` |
| Assenza di un iscritto | Credito di recupero, se l'abbonamento lo prevede | trigger `presenze_credito` |
| Prova o prenotazione annullata | Avviso al primo della lista d'attesa | trigger `posto_libero` |
| Ogni notte | Lezioni a 90 giorni, abbonamenti scaduti, crediti scaduti, scadenza abbonamento/certificato, compleanni | `lavori_giornalieri()` |
| Ogni 5 minuti | Invio email in coda via Resend (3 tentativi) | `/api/cron/invia-messaggi` |
| A richiesta | Promo solo agli iscritti di certi corsi con consenso marketing | `invia_promo()` |

I messaggi non vengono mai duplicati: ogni riga di `messaggi_coda` ha una `chiave` unica (es. `promemoria_prova:<id prova>`).

## Ruoli e sicurezza (RLS)

| Chi | Può |
|---|---|
| Visitatore | Leggere il catalogo pubblico. Prenotare solo tramite le API del sito (service role) |
| Cliente | Leggere solo i propri dati (account, allievi, iscrizioni, prove, pagamenti, documenti) |
| Insegnante | Leggere la palestra, registrare presenze |
| Segreteria / Admin | Tutto nella propria palestra |

La chiave `SUPABASE_SERVICE_ROLE_KEY` esiste solo su Vercel e nelle API lato server.

## Roadmap

**Fase 1: gestionale completo (questa consegna)**
Schema multi-tenant, sicurezza, generazione lezioni, percorso prova con filtri, appello, lead, statistiche,
messaggi email automatici, recuperi, liste d'attesa, certificati caricati dal cliente, quota annuale, sospensioni,
e tutte le schermate di gestione: palinsesto, corsi e orari, persone e iscrizioni, abbonamenti e regole.
Manca solo l'incasso: si registra a mano finché non arriva la fase 2.

**Fase 2 (rimandata su richiesta): pagamenti prova**
Stripe Checkout per le prove a pagamento, webhook → `conferma_pagamento()`, ricevuta.
Finché `PAGAMENTI_ONLINE=false` la prova a pagamento si conferma e si incassa in sede
(la segreteria la vede in "Lead" come *da incassare*).

**Fase 3: autonomia del cliente**
Area cliente: acquisto dell'abbonamento con scelta degli orari, rinnovi, prenotazione dei recuperi e iscrizione
alla lista d'attesa fatte in autonomia. Oggi tutto questo lo fa la segreteria dalle sue schermate.

**Fase 4: fiscale**
Fattura elettronica automatica per ogni pagamento tramite intermediario SDI (regime forfettario: natura N2.2,
bollo 2 € sopra 77,47 €, fattura al genitore per i minori), note di credito, export per il commercialista.

**Fase 5: migrazione e prodotto**
Import CSV dall'APP Palestre, periodo in parallelo, disdetta. Onboarding di altre palestre, tema per palestra,
abbonamento SaaS, WhatsApp (API Business, a pagamento per messaggio).

## Regole decise (migrazione 004)
- **Abbonamenti**: si lavora per corsi, quindi la norma è a **orari fissi** e si frequenta lo stesso corso tutto l'anno.
  Il pacchetto a ingressi resta possibile ma **non è acquistabile online**: lo registra solo la segreteria.
  Il prezzo è già calcolato al netto delle festività, quindi una lezione annullata non scala nulla e non genera crediti.
- **Recuperi**: configurabili in `recuperi_ammessi`, per corso oppure per tipo di abbonamento; il proprio corso è
  sempre ammesso. Un'assenza registrata in appello crea un credito (`crediti_recupero`) valido
  `giorni_validita_recupero` giorni, con tetto `recuperi_max` (0 = niente recuperi). Il recupero si prenota con
  `prenota_recupero()`, che controlla credito, corso ammesso, capienza e certificato.
- **Liste d'attesa** per prove, singole lezioni e iscrizione a un corso pieno (`liste_attesa`). Quando una prova o
  una prenotazione viene annullata, il primo della coda riceve in automatico l'email "si è liberato un posto".
- **Certificato medico**: il cliente carica da solo la foto da un link personale (`/certificato?t=…`, campo
  `allievi.token`); il file finisce in un archivio privato e la segreteria lo apre, legge la scadenza e approva
  in `/gestione/certificati`. Da lì partono avviso a 30 giorni, promemoria a 7 e messaggio di blocco alla scadenza.
  Da scaduto l'allievo risulta **bloccato** in appello (riga rossa, conferma richiesta all'insegnante) e non può
  prenotare recuperi: deve passare in segreteria.
- **Cambio corso, sospensioni e sconti**: li gestisce la segreteria. `sospensioni` sposta in avanti la scadenza dei
  giorni sospesi ed esclude l'allievo dall'appello in quel periodo; `iscrizioni.sconto_cent` tiene lo sconto applicato.
- **Quota d'iscrizione annuale** separata dall'abbonamento: `quote_iscrizione` per stagione
  (che parte dal mese in `palestre.mese_inizio_stagione`); chi non l'ha pagata è segnalato in appello.

## Le schermate della segreteria
- `/gestione` — agenda del giorno e appello, con chi è in prova evidenziato.
- `/gestione/corsi` — corsi per categoria con iscritti, prove in arrivo e certificati da sistemare.
  Dentro il corso: **orari settimanali** modificabili (le lezioni si rigenerano da sole), elenco iscritti con
  contatti e scadenze, export CSV, lista d'attesa.
- `/gestione/persone` — ricerca per nome, email o telefono. La scheda contiene anagrafica di allievo e titolare,
  link personale per il certificato, **iscrizioni** (creazione con scelta degli orari, sospensione, annullamento),
  **recuperi** (crediti maturati e prenotazione nelle lezioni ammesse), certificati e prove.
- `/gestione/lead` — chi ha fatto la prova e non si è ancora iscritto, con anagrafica già registrata.
- `/gestione/certificati` — documenti caricati dai clienti, da approvare con la data di scadenza.
- `/gestione/attese` — chi aspetta un posto; l'avviso parte da solo quando si libera.
- `/gestione/palinsesto` — categorie, discipline, livelli, fasce d'età, sale, insegnanti, chiusure.
- `/gestione/abbonamenti` — tipi di abbonamento, regole dei recuperi, quota annuale e impostazioni delle prove.
- `/gestione/statistiche` — funnel per corso e motivi di chi non si è iscritto.
- `/gestione/messaggi` — i testi di tutti i messaggi automatici, con l'elenco dei segnaposto, l'anteprima
  compilata con dati di esempio, l'invio di prova a se stessi e la coda dei messaggi in partenza.
- `/gestione/importa` — importazione CSV con abbinamento delle colonne, anteprima ed elenco delle righe saltate.
- `/gestione/calendario` — la settimana intera come griglia giorni × ore. Ogni lezione è un blocco colorato in base
  a quanto è piena (pieno = quasi al completo, chiaro = a metà, grigio = vuota), con iscritti su capienza e
  prove in arrivo. Si filtra per sala, insegnante o "solo le mie"; toccando un blocco si apre la scheda con i numeri
  e i pulsanti per l'appello e per il corso.
- `/gestione/costi` — spese con periodicità, fornitori, compenso orario degli insegnanti e costo orario delle sale.
- `/gestione/spazi` — affitto delle sale ed eventi: richieste da confermare, agenda del giorno con una colonna per
  sala (lezioni, affitti, feste e opzioni distinti per colore), prenotazioni in arrivo con acconti e incassi,
  blocco manuale di una sala per usi interni. Il listino orario e i pacchetti festa stanno in `/gestione/spazi/listino`.

## Le statistiche
Gli indicatori sono quelli che la letteratura di settore indica come decisivi per palestre e scuole di danza:
**tasso di abbandono** (sotto il 5% mensile è considerato sano), **riempimento delle lezioni**, **tasso di presenza**,
**conversione prova → iscrizione**, **ricavo medio per persona**, **incidenza dell'affitto sui ricavi**
(sano sotto il 15-20%) e **incidenza dei compensi** (il costo del personale pesa tipicamente il 30-40% dei costi).
A questi si aggiunge il **margine per corso**, che è il dato che dice quali corsi tenere e quali chiudere:
ricavi del corso meno ore di lezione per compenso dell'insegnante, meno costo orario della sala, meno spese dedicate.

Il cruscotto mostra i numeri chiave del periodo, la sezione "Da sistemare" (certificati scaduti, abbonamenti in
scadenza, corsi sotto il 50% di riempimento), l'andamento a 12 mesi di iscritti, nuovi, uscite, riempimento e
vendite, la distribuzione per fascia d'età, categoria e canale di arrivo, e le tabelle per corso, insegnante e sala.
Tutti i calcoli stanno nel database (`cruscotto`, `economia_corsi`, `andamento_mensile`, `statistiche_insegnanti`,
`statistiche_sale`, `distribuzione_iscritti`), quindi valgono per qualunque interfaccia.

## Affitto spazi ed eventi
Il sito pubblico ha `/spazi`: si sceglie "sala a ore" o un pacchetto festa, poi giorno e orario; il sistema
**controlla in tempo reale che la sala sia libera** (guardando lezioni e altre prenotazioni) e **calcola il prezzo**
dal listino, scegliendo la tariffa più specifica che copre quella fascia. La richiesta arriva con stato `richiesta`:
non blocca ancora la sala, ma fa partire l'email di riepilogo al cliente e l'avviso alla segreteria.

Dalla gestione si conferma, si tiene in opzione o si rifiuta con un motivo: ogni passaggio manda il messaggio
giusto al cliente. La conferma ricontrolla la disponibilità, così due richieste sulla stessa fascia non possono
essere confermate entrambe. I pacchetti festa calcolano gli invitati extra e l'acconto.

Le tabelle sono `tariffe_spazi`, `pacchetti_evento` e `prenotazioni_spazi`; la vista `v_agenda_sale` unisce lezioni
e prenotazioni, ed è quella che alimenta l'agenda delle sale. `statistiche_spazi` porta ore affittate, ricavi e
incassi dentro il cruscotto.

## Mobile
L'interfaccia è pensata prima per il telefono: navigazione fissa in basso con icone (in alto da 720 px in su),
elenchi compatti, tocchi da almeno 44 px, moduli a una colonna che diventano due sullo schermo grande.
Il `manifest` e le icone rendono l'app installabile sulla schermata Home, a schermo intero.

Tutte le scritture passano dalle regole RLS: l'insegnante legge e registra presenze, la segreteria e l'admin
modificano. Le operazioni composte (iscrizione + orari + quota) sono una sola funzione del database, così
non restano dati a metà.

## Dati dimostrativi
`supabase/demo.sql` popola il database con un palinsesto e clienti credibili per le presentazioni;
`supabase/demo_rimuovi.sql` cancella tutto ciò che ha creato (i clienti demo sono marcati con `note = 'DEMO'`).
I messaggi generati dai dati finti vengono annullati subito, così non parte nessuna email verso indirizzi inesistenti.

## Decisioni ancora aperte
- Primo mese parziale: prezzo pieno o proporzionale?
- Importo della quota annuale e sconti per iscrizione a più corsi.
- Documento fiscale da emettere e intermediario SDI (da concordare con il commercialista).
- Rosso esatto del marchio (variabile `--rosso` in `app/globals.css`).
- Testo definitivo dell'informativa privacy (dati di minori e certificati medici).
