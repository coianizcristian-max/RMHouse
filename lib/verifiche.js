// Export per le verifiche: i file del pacchetto, cosa contengono e il messaggio da dare a Claude.
// Usato dalla pagina /gestione/verifiche e per scrivere LEGGIMI.txt dentro lo ZIP.

export const FILE_VERIFICHE = [
  { k: 'riepilogo_mensile', titolo: 'Riepilogo per mese', cosa: 'Incassato per metodo (contanti, POS, bonifico, Satispay, online), ricevute, annullati, spese e accrediti in banca, mese per mese.',
    colonne: [['ancora_da_incassare_creati_nel_mese', 'importi messi "da incassare" in quel mese e ancora non pagati'],
              ['versamenti_e_accrediti_in_banca', 'entrate sul conto caricate nella sezione Banca (0 se la banca non è caricata in RMHouse)']] },
  { k: 'clienti', titolo: 'Clienti', cosa: 'Tutte le persone com\'erano il giorno dello scarico: codice fiscale, chi paga, stato, certificato, quota, tesseramento, consenso privacy. Senza email, telefoni e indirizzi.',
    colonne: [['cliente_id', 'collega gli altri file'], ['cf_scritto_bene', 'sì / manca / non valido / partita IVA (controlla solo la forma, non il carattere finale)'],
              ['paga_lui', 'sì se paga da sé; no se paga un altro (genitore): vedi chi_paga e cf_chi_paga'],
              ['stato', 'iscritto, fedele (iscritto da mesi), rientro, in_scadenza, in_esaurimento (ingressi quasi finiti), no_rinnovo, inattivo, prova, lead, perso'],
              ['abbonamento_attivo', 'sì se oggi ha un abbonamento valido'],
              ['senza_giorni_assegnati', 'sì = ha un abbonamento a orari fissi ma nessun giorno scelto'],
              ['certificato_ultimo_caricato', 'stato dell\'ultimo file di certificato caricato (valido, da_verificare, rifiutato)'],
              ['tesseramento_stagione', 'tesseramento all\'ente per la stagione in corso']] },
  { k: 'abbonamenti', titolo: 'Abbonamenti', cosa: 'Ogni abbonamento che tocca il periodo (anche lo storico di APP Palestre): date, giorni, prezzo di listino, sconto, valore, pagato, da pagare, chi l\'ha creato.',
    colonne: [['valore', 'quanto vale: somma delle rate, o importo del pagamento collegato, o listino meno sconto'],
              ['da_pagare', 'valore meno pagato; vuoto se non c\'è un pagamento collegato'],
              ['pagamento', 'pagato / in_attesa / annullato / a rate / nessun pagamento collegato'],
              ['incassi_del_cliente_intorno', 'somma degli incassi dello stesso cliente da 45 giorni prima dell\'inizio alla fine dell\'abbonamento (aiuta quando non c\'è un pagamento collegato)'],
              ['creato_da', 'chi l\'ha inserito ("automatico" = rinnovo o import)'],
              ['origine', 'RMHouse, APP Palestre (importato) o APP Palestre (storico: solo per sapere che c\'era)']] },
  { k: 'pagamenti', titolo: 'Pagamenti', cosa: 'Ogni incasso creato o pagato nel periodo, più tutti quelli ancora da incassare: metodo, stato, ricevute collegate, chi l\'ha registrato, quante volte è stato modificato a mano.',
    colonne: [['stato', 'pagato, in_attesa (da incassare), annullato, rimborsato, fallito'],
              ['ricevute', 'numeri delle ricevute collegate (sezionale numero/anno), con annullate e note di credito'],
              ['modifiche_a_mano', 'quante modifiche fatte da una persona dello staff dopo la registrazione (dettagli in modifiche.csv)']] },
  { k: 'ricevute', titolo: 'Ricevute e documenti', cosa: 'Ricevute, fatture e note di credito con data nel periodo: numero, sezionale, intestatario, codice fiscale, importo, annullate e perché, pagamento collegato.',
    colonne: [['sezionale', 'la numerazione (es. RNF ricevute, NC note di credito): i numeri vanno controllati per sezionale e anno'],
              ['stato_pagamento', 'stato del pagamento collegato; "nessun pagamento" = ricevuta senza incasso'],
              ['riferita_a', 'per le note di credito: la ricevuta che rimborsano']] },
  { k: 'rate', titolo: 'Rate', cosa: 'Rate con scadenza nel periodo e quelle scadute prima e non ancora pagate.', colonne: [] },
  { k: 'quote', titolo: 'Quote annuali', cosa: 'Quote associative pagate (valgono un anno dalla data di pagamento).', colonne: [] },
  { k: 'tesseramenti', titolo: 'Tesseramenti', cosa: 'Tesseramento all\'ente di promozione sportiva per le stagioni del periodo.', colonne: [] },
  { k: 'presenze', titolo: 'Presenze', mensile: true, cosa: 'Per ogni lezione fino a oggi: chi era atteso o presente, presenza segnata, se aveva un abbonamento valido quel giorno e se il certificato era valido.',
    colonne: [['tipo', 'orario fisso, recupero, ingresso, prova, aggiunto all\'appello (presente ma non atteso)'],
              ['presenza', 'presente / assente / assente (avvisato) / assenza avvisata / non segnata'],
              ['abbonamento_valido_quel_giorno', 'sì / sì (storico APP) / prova / no']] },
  { k: 'lezioni', titolo: 'Lezioni', mensile: true, cosa: 'Ogni lezione fino a oggi: insegnante (e chi sostituiva), appello fatto o no, da chi e quante ore dopo, attesi, presenti, assenti, non segnati.',
    colonne: [['ore_dopo_la_fine', 'ore passate tra la fine della lezione e l\'appello'],
              ['presenti_non_attesi', 'presenti che non erano iscritti né prenotati']] },
  { k: 'ingressi', titolo: 'Ingressi alla reception', mensile: true, cosa: 'Ogni ingresso registrato alla reception, con esito e avvisi (es. abbonamento scaduto, certificato).', colonne: [] },
  { k: 'prove', titolo: 'Lezioni di prova', cosa: 'Prove create o fatte nel periodo: stato, pagamento, quante prove ha fatto la persona e se si è iscritta dopo.', colonne: [] },
  { k: 'workshop', titolo: 'Workshop', cosa: 'Un rigo per iscritto ai workshop del periodo: opzione, prezzo, pagamento, presenze, compenso dell\'insegnante.', colonne: [] },
  { k: 'compensi', titolo: 'Compensi insegnanti', cosa: 'Cedolini dei mesi del periodo: lezioni, ore, totale, stato (bozza, approvato, pagato), segnalazioni degli insegnanti.', colonne: [] },
  { k: 'spese', titolo: 'Spese', cosa: 'Spese con data nel periodo: categoria, fornitore, importo, pagata o no.', colonne: [] },
  { k: 'banca', titolo: 'Banca', cosa: 'Movimenti del conto caricati nella sezione Banca di RMHouse e a cosa sono stati abbinati (vuoto se la banca non è caricata: allega l\'estratto conto).', colonne: [] },
  { k: 'modifiche', titolo: 'Modifiche e cancellazioni', mensile: true, cosa: 'Chi ha cambiato o cancellato cosa: pagamenti, ricevute, abbonamenti, rate, quote, presenze, prove, spese, compensi, prezzi del listino.',
    colonne: [['cosa', 'la tabella: pagamenti, ricevute, iscrizioni (= abbonamenti), rate, quote_iscrizione, presenze…'],
              ['cambiamenti', 'JSON: per ogni campo [valore prima, valore dopo]; importi in centesimi']] },
  { k: 'da_sistemare', titolo: 'Da sistemare', cosa: 'Segnalazioni ancora aperte nella pagina "Da sistemare".', colonne: [] },
  { k: 'listino', titolo: 'Listino', cosa: 'Tipi di abbonamento con prezzo di oggi.', colonne: [] },
  { k: 'staff', titolo: 'Staff', cosa: 'Le persone dello staff (per riconoscere chi ha fatto cosa).', colonne: [] },
];

const dataIt = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

// Il messaggio da incollare nella chat con Claude
export function messaggioClaude({ dal, al, oggi, scuola = 'Ritmo Metropolitano', banca = true, precedente = false }) {
  const allegati = [
    banca && 'l\'estratto conto della banca dello stesso periodo',
    precedente && 'il file Excel della verifica precedente',
  ].filter(Boolean);
  return `Ciao Claude, ti allego il pacchetto «Export per le verifiche» di RMHouse, il gestionale della scuola ${scuola}.
Periodo: dal ${dataIt(dal)} al ${dataIt(al)} (scaricato il ${dataIt(oggi)}).
${allegati.length ? `Ti allego anche: ${allegati.join(' e ')}.` : 'Non ti allego l\'estratto conto della banca: i controlli sulla banca falli solo con banca.csv, se non è vuoto.'}

Fai una verifica incrociata completa, come un revisore attento, per trovare errori, dimenticanze e soldi mancanti nel lavoro della segreteria.
Prima leggi LEGGIMI.txt: spiega ogni file e ogni colonna. I CSV sono separati da punto e virgola, gli importi sono in euro con la virgola, le date sono AAAA-MM-GG. I file si collegano con cliente_id, abbonamento_id, pagamento_id e lezione_id.

Controlla almeno questi punti:

SOLDI
1. Abbonamenti non pagati o pagati in parte (abbonamenti.csv: da_pagare) e pagamenti ancora "in_attesa" (pagamenti.csv) da più di 15 giorni.
2. Abbonamenti con "nessun pagamento collegato": cerca in pagamenti.csv un incasso dello stesso cliente (o di chi paga per lui) vicino alle date dell'abbonamento; se non c'è, probabilmente non è mai stato incassato.
3. Rate scadute e non pagate (rate.csv).
4. Ricevute: incassi pagati senza ricevuta, ricevute senza incasso o con importo diverso, numeri mancanti o doppi per sezionale e anno, ricevute annullate e note di credito (chi le ha fatte e perché).
5. Modifiche sospette (modifiche.csv): pagamenti o ricevute cancellati, annullati o cambiati dopo (importo, metodo, stato, data), soprattutto in contanti o fatti giorni dopo; chi le ha fatte.
6. Contanti: contanti incassati per settimana e per mese (pagamenti.csv, riepilogo_mensile.csv) confrontati con i versamenti di contanti sull'estratto conto (o in banca.csv). Dimmi in quali periodi i contanti incassati non risultano versati e per quanto.
7. Bonifici, POS e Satispay: se c'è l'estratto conto, abbina importo, data (fino a 5 giorni lavorativi di differenza) e nome; elenca gli incassi registrati in RMHouse che non trovi in banca e gli accrediti in banca che non trovi in RMHouse.
8. Prezzi e sconti: abbonamenti venduti a un prezzo diverso dal listino (listino.csv) o con sconti, divisi per chi li ha registrati; quote annuali mancanti o scadute per chi ha un abbonamento (quote.csv, clienti.csv).
9. Workshop: iscritti non pagati; compensi degli insegnanti calcolati e pagati (workshop.csv).

FREQUENZA
10. Chi frequenta senza pagare: presenti a lezione senza un abbonamento valido quel giorno (presenze.csv), persone "aggiunte all'appello" più volte, prove ripetute dalla stessa persona, ingressi alla reception con avvisi (ingressi.csv).
11. Certificato medico scaduto o mancante nei giorni in cui la persona era presente (presenze.csv).
12. Lezioni passate senza appello o con l'appello fatto molto dopo (lezioni.csv), divise per insegnante.
13. Iscritti con abbonamento attivo ma senza giorni assegnati, o che non vengono da più di 3 settimane (clienti.csv).
14. Prove: prove a pagamento non pagate; chi ha provato e non si è iscritto (da richiamare).

ANAGRAFICA E DOCUMENTI
15. Clienti attivi senza codice fiscale, con codice fiscale scritto male o non coerente con data di nascita e sesso; possibili doppioni (stesso codice fiscale, o stesso nome e data di nascita).
16. Minori senza un genitore che paga, o con il genitore senza codice fiscale (serve per ricevute e detrazioni).
17. Tesseramento della stagione mancante per chi frequenta; consenso privacy mancante.

STAFF E COSTI
18. Compensi: lezioni svolte per insegnante e mese (lezioni.csv) confrontate con i cedolini (compensi.csv); mesi passati ancora in bozza o non pagati; segnalazioni degli insegnanti.
19. Spese non pagate o senza fornitore (spese.csv); segnalazioni "Da sistemare" aperte da più di 30 giorni (da_sistemare.csv).

COME RISPONDERE (in italiano semplice: lo leggerà anche la segreteria)
- In alto un riepilogo con semaforo (rosso = soldi mancanti o rischi legali, giallo = da correggere, verde = in ordine) e il totale in euro di quello che risulta da incassare o da chiarire.
- Poi l'elenco per priorità. Per ogni cosa: chi (nome e cognome), cosa non torna, importo, data, chi l'ha registrata se si sa, e dove si sistema in RMHouse (es. Persone → scheda del cliente → Pagamenti; Conti → Incassi; Calendari → Appello; Da sistemare).
- Tieni separati gli errori sicuri da quelli "da verificare". Non inventare nulla: se un file manca, è vuoto o un controllo non si può fare, dimmelo e dimmi cosa serve.
- Alla fine preparami un file Excel con una riga per ogni cosa da sistemare (priorità, categoria, cliente, cosa non torna, importo, data, dove si sistema, stato = "da fare"), da girare alla segreteria. Lo terrò per la prossima verifica.${precedente ? '\n- Confronta con il file della verifica precedente: dimmi cosa è stato sistemato e cosa no.' : ''}`;
}

// LEGGIMI.txt dentro lo ZIP: cosa c'è, come è fatto e il messaggio da dare a Claude
export function testoLeggimi({ dal, al, oggi, chi, scuola, righe, messaggio }) {
  const r = [];
  r.push(`EXPORT PER LE VERIFICHE — ${scuola || 'RMHouse'}`);
  r.push(`Periodo: dal ${dataIt(dal)} al ${dataIt(al)} · scaricato il ${dataIt(oggi)}${chi ? ` da ${chi}` : ''}`);
  r.push('');
  r.push('A COSA SERVE');
  r.push('Una o due volte l\'anno (consigliato: fine gennaio e fine luglio) si dà questo pacchetto a Claude, che incrocia');
  r.push('clienti, abbonamenti, pagamenti, ricevute, presenze e modifiche e trova quello che non torna.');
  r.push('Le istruzioni passo passo sono in RMHouse: Conti → Export per le verifiche.');
  r.push('');
  r.push('FORMATO');
  r.push('- CSV separati da punto e virgola (;), con le intestazioni nella prima riga, codifica UTF-8.');
  r.push('- Importi in euro con la virgola (es. 58,00). Date AAAA-MM-GG, orari HH:MM (ora italiana).');
  r.push('- I file si collegano con: cliente_id, chi_paga_id, abbonamento_id, pagamento_id, lezione_id, ricevuta_id.');
  r.push('- Dati personali: nomi, date di nascita e codici fiscali. NON ci sono email, telefoni e indirizzi.');
  r.push('');
  r.push('I FILE');
  for (const f of FILE_VERIFICHE) {
    r.push('');
    r.push(`${f.k}.csv — ${f.titolo} (${righe?.[f.k] ?? 0} righe)`);
    r.push(`  ${f.cosa}`);
    for (const [c, s] of f.colonne) r.push(`  · ${c}: ${s}`);
  }
  r.push('');
  r.push('IL MESSAGGIO DA DARE A CLAUDE (allegando questo ZIP e, se c\'è, l\'estratto conto dello stesso periodo)');
  r.push('-----------------------------------------------------------------------------------------------');
  r.push(messaggio);
  r.push('-----------------------------------------------------------------------------------------------');
  r.push('');
  r.push('Riservatezza: dai questo file solo a Claude o a chi fa le verifiche per la scuola; non mandarlo per email;');
  r.push('cancellalo dal computer quando la verifica è finita.');
  return r.join('\r\n');
}
