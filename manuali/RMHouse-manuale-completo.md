# RMHouse — manuale completo

Tutto quello che il sistema sa fare: **ogni pagina, ogni funzione, cosa fa, cosa comporta e dove
si trova**. Aggiornato al 25 settembre 2026 (migrazioni 001-039, aggiornamenti fino al 039).

Legenda dei ruoli: **pubblico** = chiunque, anche senza account · **cliente** = chi frequenta,
dentro `/area` · **insegnante** = staff con ruolo insegnante · **segreteria** = ruolo segreteria
o admin · **admin** = solo amministrazione · **sistema** = gira da solo (cron, trigger, webhook).

Sopra i tre ruoli di base si possono creare **profili su misura** che nascondono pagine
(Impostazioni → Ruoli e accessi). Ogni funzione del menù si può anche **spegnere** per tutti
(Impostazioni → Funzioni attive).

---

# PARTE 1 — LE PAGINE

## 1.1 Sito pubblico

| Pagina | Dove | Cosa fa | Cosa implica |
|---|---|---|---|
| Home | `/` | Presenta la scuola, porta alla prova, all'affitto sale e all'area cliente | È la prima pagina che vede un estraneo |
| Prenota una prova | `/prova` | Percorso a passi: chi frequenta → età → categoria → livello → orario → dati → conferma | Crea account e allievo, registra il lead, prenota la prova. Se la prova è a pagamento: con Stripe acceso si paga subito online, altrimenti in sede |
| Prova pagata | `/prova/pagata` | Conferma dopo il pagamento online | Se il pagamento è annullato si torna a `/prova` con un avviso e la prova non è confermata |
| Pagina di un corso | `/corsi/<slug>` | Foto, descrizione, orari, insegnanti e pulsante per la prova | È il link da usare nelle campagne Instagram: si copia dalla scheda del corso |
| Affitto sale e feste | `/spazi` | Sala, giorno e ora oppure pacchetto festa, disponibilità e preventivo | La richiesta arriva in segreteria "da confermare", non blocca ancora la sala |
| Abbonamento | `/abbonamento` | Con Stripe acceso: il cliente (dopo l'accesso) sceglie per chi, abbonamento, corso, giorni e paga | Pagato → l'iscrizione nasce da sola. Con Stripe spento mostra "passa in segreteria" |
| Abbonamento acquistato | `/abbonamento/grazie` | Conferma dopo il pagamento | — |
| Pagamento ricevuto | `/pagato` | Ritorno da un link di pagamento mandato dalla segreteria | — |
| Carica il certificato | `/certificato?t=` | Foto o PDF del certificato **con la data di scadenza** dal link personale | Entra "da verificare" con la data già compilata per la segreteria |
| Sondaggio post-prova | `/feedback?t=` | Chiede perché non si è iscritto dopo la prova | Alimenta il blocco dei motivi nelle statistiche |
| Sondaggio | `/sondaggio?t=` | Sondaggio con link personale (stelle, voto 0-10, scelta, testo) | Una sola risposta per invito |
| Niente più promozioni | `/disiscriviti?t=` | Conferma a un tocco per non ricevere più promozioni | Toglie il consenso marketing; i messaggi di servizio continuano |
| Pass d'ingresso | `/ingresso?t=` | Dove porta il QR del pass | Se lo apre lo staff registra l'ingresso, se lo apre il cliente dice "mostralo alla reception" |
| Privacy | `/privacy` | Informativa | Serve per il consenso raccolto in fase di prova |
| Accesso staff | `/login` | Entrata di insegnanti e segreteria | — |

## 1.2 Area del cliente (`/area`)

Il colore principale, il messaggio di benvenuto e l'avviso in evidenza si decidono in
Impostazioni → Area clienti.

| Pagina | Dove | Cosa fa | Cosa implica |
|---|---|---|---|
| Accesso | `/area/accedi` | Si entra con la sola email: arriva un link, niente password | L'email deve essere quella registrata in segreteria |
| Le mie lezioni | `/area` | Prossime lezioni (sue e dei figli), moduli da firmare, certificato da caricare (con scadenza), abbonamenti, prove, attese, avvisi, materiali, notifiche; una volta sola la domanda "Vuoi ricevere novità e promozioni?" | È il cuore dell'area |
| Recuperi | `/area/recuperi` | Per ogni credito le lezioni dove usarlo, con i posti liberi | Se disdice, il credito torna e parte l'avviso alla lista d'attesa |
| Eventi | `/area/eventi` | Locandina, posti, iscrizione e disdetta | Se l'evento è a pagamento compare "da incassare" in segreteria |
| Moduli | `/area/moduli` | Regolamento, privacy e autorizzazioni da leggere e firmare col dito | Per i minori firma il genitore con il suo codice fiscale |
| Pagamenti | `/area/pagamenti` | Rate da pagare (con "Paga online" se attivo), rinnovi automatici ("Carta o disdetta"), ultimi pagamenti, "Acquista o rinnova" | Le parti online compaiono solo con Stripe acceso |
| Pass | `/area/pass` | Un QR per persona, anche per i figli | La reception lo inquadra con la fotocamera del telefono |

## 1.3 Gestionale — area **Oggi**

| Pagina | Dove | Cosa fa | Cosa implica |
|---|---|---|---|
| Riepilogo | `/gestione` | 6 numeri cliccabili (iscritti attivi, venduto nel mese, rinnovi a 14 giorni, nuovi, occupazione, oggi), **Da sistemare** in ordine di urgenza (anche rate scadute), lezioni di oggi, scadenze dei 7 giorni, andamento 12 mesi, stato della clientela, compleanni | Se "Da sistemare" è vuoto la giornata è a posto |
| Agenda del giorno | `/gestione/oggi` | Le lezioni una sotto l'altra | Per l'insegnante che guarda il suo turno |
| Ingressi | `/gestione/ingresso` | Esito del pass inquadrato (verde, arancione, rosso con il motivo), ricerca per nome, elenco degli ingressi di oggi | **Segna la presenza da sola** se c'è una sua lezione vicina |
| Appello | `/gestione/appello/<id>` | Presenze, aggiunte, messaggio ai prenotati, CSV, mappa dei posti | Segnare presente o assente **genera o consuma i crediti di recupero**, chiude la prova e **scala un ingresso** nei pacchetti a ingressi |
| Lead | `/gestione/lead` | Elenco con diario dei contatti, esiti, promemoria | Il motivo del "non convertito" finisce nelle statistiche |
| Liste d'attesa | `/gestione/attese` | Chi aspetta, con posizione e posti liberi; avviso a mano o automatico | Quando si libera un posto parte l'avviso al primo della coda |
| Tutte le funzioni | `/gestione/indice` | Indice di tutto con link | Per quando non ci si ricorda dove sta una cosa |

## 1.4 Gestionale — area **Calendari**

| Pagina | Dove | Cosa fa | Cosa implica |
|---|---|---|---|
| Palinsesto | `/gestione/calendario` | Settimana a schede con colori, insegnanti, iscritti, posti, prove, note, "+" | Vista di lavoro principale |
| Agenda settimanale | `/gestione/agenda` | La settimana come griglia oraria | Per chi ragiona a fasce orarie |
| Giornata per sale | `/gestione/giornata` | Una colonna per sala, lezioni col colore del corso, affitti a righe, linea rossa dell'ora attuale | Tocca una lezione per l'appello; filtro per sede |
| Giornata per insegnanti | `/gestione/giornata/staff` | Una colonna per insegnante con lezioni e ore del giorno | — |
| Sale e affitti | `/gestione/spazi` | Richieste da confermare, agenda, prenotazione al banco, spostamenti | Confermare **ricontrolla la disponibilità**; al banco nasce già confermata, senza email |
| Listino affitti | `/gestione/spazi/listino` | Tariffe orarie e pacchetti festa | Genera il preventivo automatico |
| Eventi | `/gestione/eventi` | Open day, saggi, stage, campus; fino a tre in evidenza | Il "prenotabile" compare nell'area cliente |

## 1.5 Gestionale — area **Struttura**

| Pagina | Dove | Cosa fa | Cosa implica |
|---|---|---|---|
| Corsi | `/gestione/corsi` | Elenco per categoria | — |
| Scheda corso | `/gestione/corsi/<id>` | Testa colorata, 6 riquadri (iscritti/capienza, senza giorni, certificati, prove, attese, lezioni a settimana), iscritti con filtri e **assegna giorni** al volo, orari, insegnanti del corso, lista d'attesa, materiali | **Aggiungere un orario genera le lezioni dei tre mesi successivi**; "Senza giorni" trova gli importati da sistemare |
| Modifica corso | `/gestione/corsi/<id>/modifica` | Dati, colore con tavolozza e gradazioni, pubblicazione | I colori non si ricalcolano più da soli |
| Staff | `/gestione/staff` | Foto, specialità, ruolo, colore, tariffa oraria, archivio, calendario | La tariffa oraria serve a compensi, rendiconto e margini |
| Sale | `/gestione/sale` | Foto, capienza, attrezzatura, posti numerati | La capienza limita le iscrizioni |
| Categorie, livelli e chiusure | `/gestione/palinsesto` | Categorie, discipline, livelli, fasce d'età, chiusure | **Una chiusura annulla le lezioni di quei giorni** |
| Bacheca | `/gestione/bacheca` | Avvisi con immagine e periodo, invio per email e notifica | Spariscono da soli a fine periodo |
| Sede e contatti | `/gestione/sede` | Dati della scuola, dati fiscali, dicitura della ricevuta, mittente email, indirizzo del sito, sedi | I dati fiscali finiscono su ricevute e attestati |

## 1.6 Gestionale — area **Persone**

| Pagina | Dove | Cosa fa | Cosa implica |
|---|---|---|---|
| Anagrafiche e recuperi | `/gestione/persone` | Pillole con i conteggi per stato, tabella con spunte; barra nera: Etichetta, Copia email, Scrivi, Esporta (CSV di tutti i filtrati) | Gli stati si calcolano da soli (vedi 3.4) |
| Scheda persona | `/gestione/persone/<id>` | Testa con età, stato e campanelli; 6 riquadri (abbonamento, certificato, quota, cliente dal, speso in tutto, ultima presenza); iscrizioni con **assegna giorni**, sconto proposto, recuperi, storico APP Palestre; dati, etichette, certificati, prove, **moduli** (con "Fai firmare"), **privacy** (scarica i dati, cancella i dati) | Sospendere un'iscrizione proroga la scadenza |
| Firma in reception | `/gestione/persone/<id>/firma?m=` | Il modulo a tutto schermo da firmare sul tablet | La firma conserva il testo firmato |
| Registra una persona | `/gestione/persone/nuova` | Chi paga e chi frequenta, certificato, consensi | Se l'email esiste l'allievo entra in quella famiglia |
| Scadenze | `/gestione/scadenze` | Abbonamenti (-30/+30 giorni), ingressi quasi finiti, certificati, quote, **rate**; filtri, selezione, "gestita" con nota, WhatsApp | Una scadenza gestita sparisce finché non cambia |
| Rinnovi in blocco | `/gestione/rinnovi` | Chi scade, rinnovo di più persone insieme | Il nuovo periodo parte dal giorno dopo, stessi orari |
| Certificati | `/gestione/certificati` | Documenti da approvare, con la scadenza scritta dal cliente già compilata | Approvare sblocca l'allievo e fa partire gli avvisi di scadenza |
| Moduli e firme | `/gestione/moduli` | Firmati/totale per modulo, chi manca (WhatsApp o "Fai firmare qui"), testi dei moduli | Cambiare il testo crea una nuova versione da rifirmare |
| Stampa di un modulo firmato | `/gestione/firme/<id>` | Il modulo com'era, con firma, firmatario, data e luogo | Da stampare o salvare in PDF |
| Tesseramento | `/gestione/tesseramento` | Ente e affiliazione, per stagione chi frequenta e la sua tessera, dati mancanti, esporta per l'ente, segna mandati/tesserati, numeri | Se la quota comprende la tessera, chi paga la quota finisce da solo fra i "da mandare" |
| Contatti e prove | `/gestione/crm` | 5 colonne: nuovi, prova prenotata, prova fatta, iscritti, non convertiti; si trascinano | Mandare fra i non convertiti chiede il motivo |
| Da ricontattare | `/gestione/crm/ricontattare` | Non hanno rinnovato, non vengono più, ex clienti recenti, prove non iscritte, da richiamare oggi; messaggio WhatsApp modificabile per lista; "segna" | Dopo il contatto la persona esce dalla lista |
| Campagne | `/gestione/crm/campagne` | Email a un pubblico per stato, corsi, etichette; conteggio in tempo reale; copia numeri per WhatsApp; esito | Solo a chi accetta promozioni, con link per disiscriversi; "servizio" arriva a tutti |
| Sondaggi | `/gestione/crm/sondaggi` | Domande a stelle, 0-10, scelta, testo; anonimo o no | Si mandano con una campagna mettendo `{sondaggio}` nel testo |
| Risultati sondaggio | `/gestione/crm/sondaggi/<id>` | Medie, barre, NPS, risposte scritte, percentuale di risposte | — |
| Importa | `/gestione/importa` | Da CSV generico o **Da APP Palestre** (lista clienti + lista abbonamenti) | Le righe con errori vengono saltate e mostrate |

## 1.7 Gestionale — area **Conti**

| Pagina | Dove | Cosa fa | Cosa implica |
|---|---|---|---|
| Riepilogo dei conti | `/gestione/conti` | Incassato oggi/mese/anno, da incassare, senza ricevuta, fatture da registrare, cosa mettere in regola, mese per metodo, ultimi incassi, rate dei 14 giorni | Prima pagina dei soldi |
| Incassi | `/gestione/incassi` | Totali per metodo, registrazione (anche senza persona), "segna incassato", **link di pagamento** (con Stripe acceso) | Metodi: contanti, POS, bonifico, online, assegno, altro |
| Rate | `/gestione/rate` | Piani di rate, incasso rata per rata con ricevuta subito, link di pagamento | Le scadute vanno in pagina iniziale e nelle Scadenze |
| Ricevute e note di credito | `/gestione/ricevute` | Emissione singola o in blocco, **rimborso** (nota di credito anche parziale), annullo, stampa | Numerazioni separate (RNF, NC), da 1 ogni anno, senza buchi |
| Fatture dei fornitori | `/gestione/fatture` | Import XML dello SDI, registrazione come spesa, quadratura | Fattura → spesa → movimento bancario |
| Banca e cassa | `/gestione/banca` | Movimenti da CSV, abbinamento a incassi e uscite, riconciliazione automatica, flusso di cassa | L'impronta evita di importare due volte la stessa riga |
| Costi e fornitori | `/gestione/costi` | Spese fisse e variabili, fornitori | Base dei margini |
| Compensi insegnanti | `/gestione/compensi` | Cedolino per insegnante e mese dalle lezioni fatte; approva, paga | I cedolini pagati non si ricalcolano |
| Rendiconto staff | `/gestione/rendiconto` | Su un periodo libero: lezioni, ore, presenze, clienti diversi, compenso stimato | Serve la tariffa oraria nella scheda staff |
| Per il commercialista | `/gestione/commercialista` | Periodo, riepilogo (anche commissioni online), per aliquota, **ZIP** con 5 CSV + LEGGIMI, aliquote IVA, numerazioni, **attestati per la detrazione sportiva 5-18 anni** | CSV con punto e virgola e virgola decimale, apribili in Excel |
| Attestati detrazione | `/gestione/commercialista/attestati?anno=` | Un attestato per pagina, da stampare o salvare in PDF | Include lo storico di APP Palestre; il testo va confermato dal commercialista |
| Statistiche e margini | `/gestione/statistiche` | Iscritti, abbandono, riempimento, conversione, ricavi, costi, margini, andamento, motivi | I margini valgono con compensi e costi inseriti |

## 1.8 Gestionale — area **Impostazioni** (icona ingranaggio)

| Pagina | Dove | Cosa fa | Cosa implica |
|---|---|---|---|
| Regole e prenotazioni | `/gestione/impostazioni` | Quota annuale e stagione, prove dal sito (giorni, preavviso), link recensioni, soglie dello stato clienti, **sconti da proporre** (secondo/terzo corso, secondo/terzo della famiglia) | Lo sconto viene proposto nella scheda, non applicato da solo |
| Funzioni attive | `/gestione/impostazioni/funzioni` | Interruttori: lead, attese, affitto sale, eventi, bacheca, rate, campagne e sondaggi | Spente spariscono dal menù, i dati restano |
| Area clienti | `/gestione/impostazioni/aspetto` | Benvenuto, avviso in evidenza, colore, con anteprima del telefono | Il colore vale per tutta l'area |
| Email e notifiche | `/gestione/impostazioni/notifiche` | **Riepilogo del lunedì** (attivo, destinatari), email inviate/in coda/non partite, clienti con email e notifiche, staff con email e accesso | — |
| Pagamenti online | `/gestione/impostazioni/pagamenti` | Stato di Stripe, cosa si paga online, incassato e commissioni del mese, rinnovi automatici, pagati da sistemare, ultimi messaggi di Stripe, **guida per accenderlo** | Spento finché mancano le chiavi |
| Integrazioni | `/gestione/impostazioni/integrazioni` | Segno verde/arancione per database, email, dominio del mittente, cron, notifiche, indirizzo del sito, recensioni, dati fiscali, Stripe | Le chiavi non si vedono mai |
| Ruoli e accessi | `/gestione/impostazioni/ruoli` | Profili su misura (pagine da nascondere) e chi ha quale profilo | Solo admin; ruolo e profilo li cambia solo l'admin |
| Registro delle azioni | `/gestione/impostazioni/registro` | Chi ha fatto cosa, quando, e i campi "prima → dopo" | Non si modifica né si cancella |
| Abbonamenti, recuperi e sconti | `/gestione/abbonamenti` | 83 tipi con codice, prezzo banco e online, durata, famiglia, corsi coperti, aliquota, acquistabile online, rinnovo automatico; voci a listino; dove si recupera | Le regole dei recuperi decidono su quali corsi si recupera |
| Messaggi automatici | `/gestione/messaggi` | Testi delle email automatiche, segnaposto, anteprima, prova, coda | Cambiare un testo vale per i messaggi futuri |

Le vecchie pagine `/gestione/promo` e `/gestione/impostazioni` (vecchia versione) portano
rispettivamente a Campagne e a Regole e prenotazioni.

---

# PARTE 2 — LE FUNZIONI DEL DATABASE

Tutte in `supabase/migrations/`. Quelle **security definer** girano con i permessi del sistema
ma **controllano sempre chi le chiama**. Quelle riservate al **sistema** (webhook Stripe,
cron) accettano solo la chiave di servizio (`e_sistema()`).

## 2.1 Iscrizioni, prove e lezioni

| Funzione | Chi | Cosa fa | Cosa implica |
|---|---|---|---|
| `prenota_prova(jsonb)` | pubblico | Crea account e allievo, verifica età e posti, prenota, genera il pagamento se serve | Rifiuta con motivi precisi (`eta_non_compatibile`, `posti_prova_esauriti`, …) |
| `crea_iscrizione(...)` | segreteria, sistema | Iscrizione + orari + quota in un colpo | L'allievo compare in tutte le lezioni di quegli orari |
| `crea_persona(jsonb)` | segreteria | Titolare e allievo insieme | Riusa il titolare se l'email c'è già |
| `aggiungi_partecipante` / `rimuovi_partecipante` | segreteria | Mette o toglie qualcuno da una lezione | Senza `forza` pretende abbonamento, certificato e posto |
| `candidati_lezione(lezione, cerca)` | segreteria | Chi si può aggiungere | Con abbonamento e certificato |
| `modifica_lezione(...)` | segreteria | Posti, blocco, insegnante, sala, annullamento | Con `da_oggi` vale per tutte le future dello stesso orario |
| `duplica_orario(...)` | segreteria | Copia un orario | Le lezioni si generano da sole |
| `genera_lezioni(palestra, dal, al, orario)` | sistema | Lezioni dagli orari ricorrenti | Salta chiusure e orari non prenotabili; 90 giorni avanti |
| `posti_liberi(lezione)` | ovunque | Posti residui | — |
| `messaggio_lezione(...)` | segreteria | Email ai prenotati | — |
| `rinnova_iscrizione` / `rinnova_blocco` / `da_rinnovare` | segreteria | Rinnovi singoli o in blocco | Dal giorno dopo la scadenza, stessi orari |
| `unisci_staff(tenere, togliere)` | admin | Unisce due schede staff | Sposta orari, lezioni, compensi |

## 2.2 Recuperi, attese, certificati, moduli

| Funzione | Chi | Cosa fa | Cosa implica |
|---|---|---|---|
| `corsi_recupero` / `lezioni_per_recupero` / `prenota_recupero` / `annulla_recupero` | cliente, segreteria | Tutto il giro dei recuperi | Disdire restituisce il credito e avvisa l'attesa |
| `aggiungi_in_attesa` / `avvisa_attesa` / `avvisa_attesa_corso` / `chiudi_attesa` / `conta_attese` | segreteria, sistema | Coda con posizione, avvisi a mano o automatici | L'avviso automatico vale anche per i posti del corso |
| `certificato_valido(allievo, data)` | ovunque | Se il certificato copre la data | Blocca l'ingresso in sala |
| `registra_certificato(token, file, nome, scadenza)` | pubblico (lato server) | Caricamento dal link o dall'area, **con la scadenza scritta dal cliente** | Entra "da verificare" con la data compilata |
| `quota_pagata(allievo, data)` | sistema | Quota valida per la stagione **oppure** per 12 mesi dal pagamento | Campanello "quota" e avviso all'ingresso |
| `moduli_da_firmare(allievo)` | cliente, staff | Moduli dovuti con la versione firmata | Secondo età (tutti, minori, maggiorenni) |
| `firma_modulo(jsonb)` | cliente, staff | Salva la firma col testo congelato | Rifiuta firme con codice dentro |
| `situazione_moduli` / `chi_manca_modulo` | segreteria | Firmati e mancanti fra gli iscritti attivi | — |

## 2.3 Stato clienti, scadenze, CRM

| Funzione | Chi | Cosa fa | Cosa implica |
|---|---|---|---|
| `cruscotto(palestra)` | segreteria | Tutti i numeri della home in una chiamata (~90 ms) | — |
| `conteggi_persone(palestra)` | segreteria | Quante persone per ogni stato e campanello | Le pillole di Persone |
| `soglia(soglie, nome)` | sistema | Legge una soglia con il suo valore di base | — |
| `segna_contatto(...)` | segreteria | Diario del contatto e prossimo richiamo | "Non interessato" → lead perso |
| `cambia_stato_lead(...)` / `conta_lead` | segreteria | Fasi del contatto | Usata anche dal trascinamento a colonne |
| `registra_feedback(...)` | pubblico | Sondaggio post-prova | Motivi nelle statistiche |
| `da_ricontattare(palestra)` | segreteria | Le 5 liste da ricontattare | Esclude chi è già stato sentito |
| `pubblico_campagna` / `conta_pubblico` | segreteria | Chi riceve una campagna (una riga per famiglia) | Conta email, consensi, telefoni |
| `invia_campagna(campagna)` | segreteria | Accoda le email con `{nome}` e `{sondaggio}` | Solo chi ha il consenso, salvo "servizio" |
| `risultati_sondaggio(sondaggio)` | segreteria | Medie, distribuzioni, NPS, testi | — |
| `imposta_consenso_marketing(sì/no)` | cliente | Risposta alla domanda in area | Una volta sola |
| `disiscrivi(token)` | pubblico (lato server) | Toglie il consenso alle promozioni | — |

## 2.4 Soldi

| Funzione | Chi | Cosa fa | Cosa implica |
|---|---|---|---|
| `registra_incasso(jsonb)` | segreteria | Incasso libero, anche senza persona, legato all'allievo | Con causale quota scrive anche la quota dell'allievo |
| `segna_pagato` / `annulla_pagamento` | segreteria | Chiude o annulla un sospeso | L'annullato resta scritto |
| `incassi_periodo` / `esporta_incassi` | segreteria | Totali e righe del periodo | — |
| `crea_piano_rate(jsonb)` / `incassa_rata(rata, metodo)` | segreteria | Rate e incasso | L'ultima rata arrotonda |
| `emetti_ricevuta` / `emetti_ricevute_blocco` / `ricevute_mancanti` / `annulla_ricevuta` | segreteria, sistema | Ricevute con numerazione per tipo | Aliquota presa dall'abbonamento o predefinita; imponibile e IVA calcolati |
| `emetti_nota_credito(ricevuta, importo, motivo)` | segreteria | Rimborso totale o parziale | Non oltre quanto resta della ricevuta |
| `prossimo_numero(numerazione, anno)` / `aliquota_di_pagamento` | sistema | Numero senza buchi, aliquota giusta | — |
| `riepilogo_ricevute` / `riepilogo_fiscale` | segreteria | Totali al netto dei rimborsi, per aliquota, commissioni | — |
| `registro_documenti` / `corrispettivi_giornalieri` / `registro_acquisti` | segreteria | I file per il commercialista | — |
| `versamenti_ragazzi(palestra, anno, storico)` | segreteria | Versato per ragazzo 5-18 anni | Attestati per il 730 |
| `calcola_compensi` / `aggiorna_compenso` / `approva_compensi` / `paga_compenso` / `dettaglio_compenso` | segreteria | Cedolini degli insegnanti | I pagati non si ricalcolano |
| `rendiconto_staff(palestra, dal, al)` | segreteria | Lezioni, ore, presenze, compenso stimato | — |
| `abbina_movimento` / `riconcilia_automatica` / `proposte_movimento` / `stacca_abbinamento` / `ignora_movimento` / `differenze_banca` / `flusso_cassa` | segreteria | Banca e cassa | — |
| `registra_fattura_spesa` / `ignora_fattura` / `proposte_uscita` / `quadratura_fatture` | segreteria | Fatture passive → spese | — |
| `costo_mensile(importo, periodicita)` | sistema | Spese a valore mensile | — |

## 2.5 Pagamenti online (Stripe)

| Funzione | Chi | Cosa fa | Cosa implica |
|---|---|---|---|
| `prepara_acquisto(jsonb)` | cliente | Controlla abbonamento, corso, giorni; calcola prezzo online + quota; crea pagamento in attesa | Parte dal giorno dopo la fine dell'abbonamento in corso |
| `completa_acquisto(...)` | sistema | Pagamento confermato → iscrizione con i giorni, quota, eventuale rinnovo automatico | Se l'iscrizione non si può creare resta "da sistemare" in Impostazioni → Pagamenti online |
| `rinnova_ricorrente(...)` | sistema | Rinnovo mensile pagato → nuova iscrizione | Non registra due volte lo stesso addebito |
| `paga_rata_online` / `conferma_pagamento_online` / `conferma_pagamento` | sistema | Rata, prova o link pagati | — |
| `scadi_pagamento_online` / `annulla_prove_non_pagate` | sistema | Pagamento non fatto → posto liberato | Prove non pagate annullate dopo un'ora |
| `segna_rimborso_online` / `stato_ricorrente` | sistema | Rimborsi e rinnovi annullati o non pagati | — |
| `e_sistema()` | sistema | Vero solo con la chiave di servizio | Protegge tutte le funzioni qui sopra |

## 2.6 Affitto sale ed eventi

| Funzione | Chi | Cosa fa | Cosa implica |
|---|---|---|---|
| `prezzo_spazio` / `prezzo_evento` | pubblico | Preventivi dal listino | — |
| `sala_libera` / `occupazioni_sala` / `verifica_spazio` / `agenda_sale` | sistema, segreteria | Disponibilità e agenda | Considera lezioni e affitti |
| `richiedi_spazio(jsonb)` | pubblico | Richiesta dal sito | Email al cliente e avviso interno |
| `crea_prenotazione_spazio` / `sposta_prenotazione_spazio` | segreteria | Prenotazione al banco e spostamenti | Nasce confermata, senza email |
| `conferma_spazio(...)` | segreteria | Conferma o rifiuta | Ricontrolla la disponibilità |
| `iscrivi_evento` / `annulla_iscrizione_evento` / `eventi_area` | cliente, segreteria | Eventi | — |

## 2.7 Area cliente, ingresso, tesseramento

| Funzione | Chi | Cosa fa | Cosa implica |
|---|---|---|---|
| `collega_account()` / `miei_account()` | cliente | Aggancia l'utente e dice quali famiglie sono sue | Perno di tutti i controlli sui dati |
| `area_riepilogo()` / `materiali_area()` | cliente | Tutto per la home dell'area | — |
| `registra_ingresso(allievo o token)` | staff | Controlla abbonamento, ingressi, certificato, quota, moduli; segna la presenza; scrive l'ingresso | Blocca: niente abbonamento, ingressi finiti, certificato mancante o scaduto |
| `situazione_tesseramento(palestra, stagione)` | segreteria | Chi frequenta, tessera, dati mancanti | — |
| `aggiorna_tesseramenti(...)` | segreteria | Stato e numeri in blocco | Numeri in sequenza se richiesto |

## 2.8 Notifiche, messaggi, riepilogo

| Funzione | Chi | Cosa fa | Cosa implica |
|---|---|---|---|
| `accoda_messaggio` / `accoda_a_indirizzo` / `render_testo` | sistema | Coda delle email e segnaposto | La chiave evita doppioni |
| `registra_push` / `cancella_push` / `accoda_push` / `push_a_tutti` / `push_fallita` / `push_riuscita` | cliente, sistema | Notifiche sul telefono dei clienti | Tre errori e il telefono si spegne |
| `invia_bacheca(id, push)` | segreteria | Avviso per email e notifica | — |
| `accoda_riepilogo_settimanale()` | sistema (lunedì) | Email con i numeri della settimana | Solo se attivo, ai destinatari scelti |
| `stato_notifiche(palestra)` | segreteria | Inviate, in coda, errori, clienti raggiungibili | — |
| `lavori_giornalieri()` | sistema (notte) | Lezioni, scadenze, compleanni, sondaggi | Motore dei messaggi automatici |

## 2.9 Palinsesto, colori, postazioni, calendario

`colore_corso` · `gradazioni` / `gradazione` / `mix_colore` / `luminosita` · `ricolora_corsi`
(ormai non serve: i colori sono quelli di APP Palestre, bloccati) · `crea_postazioni` /
`postazioni_lezione` / `assegna_postazione` / `libera_postazione` (posti numerati) ·
`lezioni_calendario(token)` (calendario dell'insegnante da abbonare) · `giornata(palestra, data)` ·
`oggi(palestra)`.

## 2.10 Statistiche

`cruscotto(palestra, dal, al)` (KPI del periodo) · `economia_corsi` · `statistiche_insegnanti` /
`statistiche_sale` / `statistiche_spazi` · `andamento_mensile` · `distribuzione_iscritti` ·
`statistiche_funnel`.

## 2.11 Import da APP Palestre

| Funzione | Cosa fa | Cosa implica |
|---|---|---|
| `importa_app_palestre_clienti(righe)` | Persone e famiglie dal file lista-clienti | Riconosce chi c'è già (codice esterno, codice fiscale, email) |
| `importa_app_palestre_storico(righe)` | Abbonamenti del file lista-abbonamenti nello storico | Quelli in corso diventano iscrizioni **senza giorni** da assegnare |
| `importa_app_palestre_chiudi()` | Rifinisce dopo l'import | — |

## 2.12 Privacy e registro

| Funzione | Chi | Cosa fa | Cosa implica |
|---|---|---|---|
| `anonimizza_persona(allievo)` | admin | Cancella dati personali, certificati (anche i file), etichette, diario, attese | Ricevute e incassi restano per legge |
| `trg_registro()` | sistema | Scrive il registro delle azioni | Su soldi e documenti sempre; su anagrafiche e struttura solo modifiche e cancellazioni |

## 2.13 Utilità

`eta_al` · `fine_periodo` · `stagione_di` · `slug_di` · `unaccent_semplice` · `is_staff` /
`is_gestione` / `ha_ruolo` (permessi usati da tutte le regole di accesso) · `e_sistema`.

---

# PARTE 3 — LE COSE CHE SUCCEDONO DA SOLE

## 3.1 Trigger (scattano al salvataggio)

| Trigger | Su | Cosa fa |
|---|---|---|
| `orari_lezioni` | orari | Crea o rifà le lezioni quando aggiungi o cambi un orario |
| `chiusure_annulla` | chiusure | Annulla le lezioni dei giorni di chiusura |
| `iscrizioni_before` / `iscrizioni_after` | iscrizioni | Scadenza (mesi, fine mese o giorni), orari |
| `iscrizioni_certificato` | iscrizioni | Chiede il certificato a chi non ce l'ha |
| `iscrizioni_attesa` | iscrizioni | Posto liberato nel corso → avviso alla coda |
| `presenze_credito` | presenze | Assenza con diritto → credito di recupero |
| `presenze_prova` | presenze | Chiude la prova e fa partire il follow-up |
| `presenze_ingressi` | presenze | **Scala un ingresso** nei pacchetti a ingressi (e lo restituisce se la presenza si toglie) |
| `prove_messaggi` | prove | Conferma e promemoria della prova |
| `prenotazioni_posto_libero` / `prove_posto_libero` | prenotazioni, prove | Disdetta → avviso alla coda |
| `sospensioni_proroga` | sospensioni | Sposta la scadenza |
| `certificati_valido` | certificati | Approvato → scadenza sull'allievo |
| `moduli_versione` | moduli | Testo cambiato → nuova versione |
| `quota_tessera` | quote_iscrizione | Se la quota comprende la tessera → "da mandare all'ente" |
| `una_predefinita` | aliquote_iva, numerazioni | Una sola predefinita |
| `staff_ruolo` | staff | Ruolo e profilo li cambia solo l'admin |
| `registro` | 11 tabelle | Registro delle azioni |
| `spazi_messaggi` | prenotazioni_spazi | Email dell'affitto (non per quelli al banco) |
| `abbinamenti_spesa` | abbinamenti | Tiene legate spesa e movimento |
| `eventi_evidenza` | eventi | Massimo tre in evidenza |
| `corsi_slug` / `corsi_colore` / `discipline_colore` / `categorie_colore` / `sale_sede` / `corsi_sede` | varie | Indirizzi, colori, sede predefinita |

## 3.2 Il cron (pg_cron su Supabase)

| Lavoro | Quando | Cosa fa |
|---|---|---|
| `rmhouse-invio-messaggi` | ogni 5 minuti | Chiama `/api/cron/invia-messaggi`: email in coda (Resend) e notifiche push, tre tentativi |
| `rmhouse-giornaliero` | ogni notte alle 3 | `lavori_giornalieri()`: lezioni dei 90 giorni, scadenze, compleanni, sondaggi |
| `rmhouse-riepilogo-lunedi` | lunedì alle 5 UTC (7 d'estate, 6 d'inverno) | `accoda_riepilogo_settimanale()` |
| `rmhouse-prove-non-pagate` | ogni 15 minuti | `annulla_prove_non_pagate()`: prove online non pagate dopo un'ora |

## 3.3 Il webhook di Stripe (`/api/stripe/webhook`)

Controlla la firma, ignora gli eventi già ricevuti, rilegge i dati da Stripe con la versione
dell'API fissata (2024-06-20) e poi:

| Evento | Cosa succede |
|---|---|
| `checkout.session.completed` / `async_payment_succeeded` | Acquisto → iscrizione; rata → pagata; prova o link → pagamento confermato. Poi commissione e ricevuta automatica |
| `checkout.session.expired` / `async_payment_failed` | Prova e acquisto annullati, posto libero |
| `invoice.paid` | Rinnovo automatico del mese (il primo mese è già registrato dal checkout) |
| `invoice.payment_failed` | Rinnovo segnato "in ritardo" |
| `customer.subscription.deleted` | Rinnovo annullato |
| `charge.refunded` | Incasso segnato come rimborsato |

## 3.4 Lo stato dei clienti (calcolato, non si scrive a mano)

Stati: **in scadenza**, **in esaurimento** (ingressi), **non ha rinnovato**, **inattivo**,
**rientrato**, **iscritto**, **iscritto da mesi**, **in prova**, **lead**, **perso**.
Campanelli: certificato scaduto, quota mancante, senza giorni, compleanno, senza email.
Le soglie si cambiano in Impostazioni → Regole e prenotazioni.

## 3.5 I messaggi automatici

Testi modificabili in Impostazioni → Messaggi automatici: `prova_confermata`,
`promemoria_prova`, `follow_up_prova`, `sondaggio_perso`, `certificato_richiesto`,
`scadenza_certificato` (30 giorni, 7 giorni, giorno stesso), `scadenza_abbonamento`,
`compleanno`, `posto_libero`, `spazio_richiesta_ricevuta`, `spazio_confermato`,
`spazio_annullato`, `spazio_avviso_interno`.
In più partono: le **campagne** (evento `campagna`) e il **riepilogo del lunedì**
(`riepilogo_settimanale`).

---

# PARTE 4 — LE VISTE (letture già pronte)

`v_occupazione` · `v_lezioni` · `v_partecipanti_lezione` · `v_appello` · `v_prenotati` ·
`v_facce_lezione` · `v_persone` · `v_lead` · `v_iscritti_corso` · `v_riepilogo_corsi` ·
`v_crediti` · `v_incassi` · `v_agenda_sale` · `v_corsi_pubblici` · `v_periodi` ·
**`v_stato_clienti`** (pesante, ~90 ms: usarla sempre con il filtro `palestra_id`) ·
**`v_scadenze`** · `v_rate` · `v_campagne`.

---

# PARTE 5 — CONFIGURAZIONE (Vercel → Environment Variables)

| Variabile | A cosa serve | Obbligatoria |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Database e accessi | Sì |
| `NEXT_PUBLIC_PALESTRA_SLUG` | Quale scuola mostra il sito (predefinita `rmhouse`) | No |
| `RESEND_API_KEY` | Invio delle email | Sì, per le email |
| `CRON_SECRET` | Protegge le chiamate del cron | Sì |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Notifiche sul telefono | Per le notifiche |
| `STRIPE_SECRET_KEY` | Pagamenti online (`sk_test_…` per le prove, `sk_live_…` per incassare) | Per Stripe |
| `STRIPE_WEBHOOK_SECRET` | Firma del webhook (`whsec_…`) | Per Stripe |
| `PAGAMENTI_ONLINE` | Interruttore generale di Stripe (`true`) | Per Stripe |
| `NEXT_PUBLIC_SITO_URL` | Indirizzo pubblico per i ritorni da Stripe, se si usa un dominio proprio | No |

Su Stripe, quando lo si accende: webhook su `https://rm-house.vercel.app/api/stripe/webhook`
con gli 8 eventi della tabella 3.3, e portale clienti attivo (Impostazioni → Fatturazione).
Tutto è spiegato in Impostazioni → Pagamenti online.

Regole di consegna del codice: ogni aggiornamento è `aggiornamento n XXX.zip` con i file nei
percorsi giusti, l'SQL in `.sql` e `ISTRUZIONI.txt` (che **non** va copiato nel progetto).
`*.csv` è nel `.gitignore` perché il repository è pubblico.

---

# PARTE 6 — COSA MANCA E DECISIONI APERTE

- **Stripe**: tutto pronto, da accendere con le chiavi (primo giro con le chiavi di prova).
- **Notifiche sul telefono per lo staff**: oggi le ricevono solo i clienti.
- **Consenso alle promozioni** degli importati: non arrivato da APP Palestre; si raccoglie
  nell'area clienti con la domanda una tantum.
- **Decisioni da prendere**: primo mese pieno o proporzionale (dopo il 20 metà mese?);
  sconti per più corsi (proposti, da confermare); chi affittava la Sala Aerea mar/mer/gio sera
  e fino a quando; dominio per le email (oggi `onboarding@resend.dev`); link alle recensioni
  Google; aliquota predefinita da confermare col commercialista (oggi "Esente IVA N4");
  testi dei moduli e dell'attestato da far rivedere; ente sportivo e formato del suo elenco.
- **Da sistemare nei dati**: orari provvisori senza insegnante; iscrizioni importate
  "senza giorni" (Corsi → corso → filtro "Senza giorni"); i 120 clienti finti della demo
  si tolgono con `v_via_clienti := true` nella 028.
- **Da non fare**: non rieseguire la 027 (sovrascrive i colori).

---

# PARTE 7 — LE MIGRAZIONI, UNA RIGA PER UNA

| # | Nome | Cosa ha portato |
|---|---|---|
| 001 | schema | Tabelle di base: palestre, account, allievi, corsi, orari, lezioni, iscrizioni, pagamenti, prove, presenze, messaggi |
| 002 | logica | Permessi, prenotazione prova, generazione lezioni, messaggi della prova |
| 003 | cron | I due lavori automatici (invio messaggi, lavori della notte) |
| 004 | regole | Quota annuale, stagione, recuperi, regole di prenotazione |
| 005 | categorie | Categorie, discipline, livelli, fasce, certificati |
| 006 | gestione | Iscrizione in un colpo, recuperi dalla segreteria, attese |
| 007 | costi e statistiche | Spese, fornitori, compensi orari, margini |
| 008 | spazi | Affitto sale e feste, listino, preventivi |
| 009 | sedi e bacheca | Più sedi, bacheca |
| 010 | calendario | Palinsesto, prove sul calendario |
| 011 | prenotati | Elenchi dei prenotati, provenienza |
| 012 | palinsesto | Modifiche di lezione e orario, chiusure |
| 013 | anagrafiche | Foto, dati, famiglie |
| 014 | area cliente | Accesso con email, riepilogo, certificato dall'area |
| 015 | colori | Colori e gradazioni |
| 016 | registrazioni | Incassi al banco, causali |
| 017 | postazioni e calendario | Posti numerati, calendario dell'insegnante, eventi |
| 018 | lead | Diario dei contatti, promemoria |
| 019 | push e materiali | Notifiche sul telefono, materiali delle lezioni |
| 020 | pulizia | Sistemazioni |
| 021 | spazi in segreteria | Prenotazione al banco, agenda delle sale |
| 022 | attese | Coda vera con posizione e avvisi |
| 023 | rinnovi e promo | Rinnovi in blocco, promozioni, esportazione contabile |
| 024 | banca e compensi | Movimenti, riconciliazione, cedolini, flusso di cassa |
| 025 | ricevute | Ricevute non fiscali |
| 026 | fatture | Fatture elettroniche passive come spese |
| 027 | nuova struttura | Staff, sale, 62 corsi veri, insegnanti per corso |
| 028 | pulizia demo | Via i dati finti, impostazioni reali |
| 029 | palinsesto vero | 73 orari, affitti fissi, orari non prenotabili |
| 030 | colori | I colori di APP Palestre, bloccati |
| 031 | abbonamenti e import | 83 abbonamenti, voci a listino, import da APP Palestre |
| 032 | stato, scadenze, cruscotto | Stato clienti, scadenze gestite, etichette, nuova home |
| 033 | schede e staff | Quota a 12 mesi, unione staff |
| 034 | area fiscale | Aliquote, numerazioni, note di credito, rate, commercialista, detrazioni, rendiconto |
| 035 | impostazioni | Certificato con scadenza dal cliente, funzioni, area clienti, riepilogo del lunedì |
| 036 | ruoli, registro, privacy | Profili su misura, registro delle azioni, anonimizzazione |
| 037 | CRM | Da ricontattare, campagne, sondaggi, consenso dall'area |
| 038 | moduli, tessere, ingresso | Firme col dito, tesseramento, pass con QR, ingressi che scalano |
| 039 | pagamenti online | Stripe pronto e spento: prove, abbonamenti, rate, link, rinnovo automatico, commissioni |
