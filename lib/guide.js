// Le funzioni che stanno DENTRO una pagina (un pulsante, una sezione della scheda): per ognuna i passi per arrivarci.
// Si usano in "Tutte le funzioni" (si aprono toccando la voce) e come promemoria in cima alla pagina di arrivo (?guida=…).
export const GUIDE = {
  'import-app-palestre': {
    titolo: 'Importa da APP Palestre', href: '/gestione/importa',
    passi: ['In APP Palestre scarica i CSV: lista clienti, lista abbonamenti, prenotazioni e pagamenti clienti.',
      'Apri Persone → Importa ed esporta e trascina i quattro file nei riquadri (serve almeno la lista clienti).',
      'Controlla i numeri dell\'anteprima e premi "Importa": non chiudere la pagina finché non ha finito.',
      'Alla fine apri "Da sistemare": in cima abbina gli abbonamenti e gli orari che in RMHouse hanno un altro nome (corsi e abbonamenti di RMHouse non vengono toccati), poi sistema le voci e segnale come fatte.',
      'Si può rifare quando serve: niente viene doppiato e le voci già fatte restano fatte.'],
  },
  'azioni-lezione': {
    titolo: 'Azioni rapide sulla lezione', href: '/gestione/calendario',
    passi: ['Apri Calendari → Palinsesto.', 'Tocca la scheda della lezione: si apre il suo foglio.',
      'Lì trovi appello, sostituzione dell\'insegnante, posti solo per quella volta, blocco delle prenotazioni, colore e "Annulla la lezione".',
      'Spunta "anche le prossime lezioni di questo orario" per applicare la modifica da oggi in avanti.'],
  },
  'piu-lezioni': {
    titolo: 'Più lezioni insieme', href: '/gestione/calendario',
    passi: ['Apri Calendari → Palinsesto.', 'Clicca il cerchietto in fondo a ogni scheda che vuoi cambiare (diventa blu con la spunta).',
      'Compare il pannello "Azioni": scegli insegnante, sala, posti, prenotazioni dall\'app, nota o annulla.',
      'Premi "Applica a N lezioni". "Deseleziona tutti" toglie la selezione.'],
  },
  'pagina-pubblica-corso': {
    titolo: 'Pagina pubblica del corso', href: '/gestione/corsi',
    passi: ['Apri Struttura → Corsi e clicca il corso.', 'In alto, accanto a "Modifica", premi "Pagina pubblica".',
      'Si apre la pagina con foto, descrizione e orari: copia l\'indirizzo dalla barra del browser e usalo nelle campagne o sui social.'],
  },
  'gruppo-whatsapp': {
    titolo: 'Gruppo WhatsApp del corso', href: '/gestione/corsi',
    passi: ['Apri Struttura → Corsi e clicca il corso.', 'Sopra l\'elenco degli iscritti tocca la pastiglia "Per il gruppo WhatsApp".',
      'Premi "Copia i N numeri di chi ha detto sì".', 'In WhatsApp apri il gruppo → Aggiungi partecipanti e incolla i numeri. Chi non ha dato il consenso non c\'è.'],
  },
  'regole-compenso': {
    titolo: 'Regole di compenso e rimborso auto', href: '/gestione/staff',
    passi: ['Apri Struttura → Staff e clicca la foto o il nome dell\'insegnante.', 'Scendi fino al riquadro "Regole di compenso".',
      'Premi "+ Aggiungi una regola" e scegli il tipo: a ora, a lezione, a fasce, a persona, lezione privata, forfait, fisso mensile o "Rimborso auto (a giornata)".',
      'Compila importo e "vale per" (tutte le lezioni, solo i corsi, solo le private, un corso, una disciplina; per il rimborso anche la sede e il massimo al mese), poi "Salva la regola".',
      'In Conti → Compensi insegnanti ricalcola il mese: la regola entra nel cedolino.'],
  },
  recuperi: {
    titolo: 'Recuperi', href: '/gestione/persone',
    passi: ['Apri Persone e cerca la persona (bastano le iniziali o un pezzo del nome).', 'Nella scheda scendi al riquadro "Recuperi".',
      'Vedi i crediti maturati con la scadenza; da lì prenoti il recupero in una lezione.'],
  },
  'prossime-lezioni': {
    titolo: 'Prossime lezioni della persona', href: '/gestione/persone',
    passi: ['Apri Persone e cerca la persona.', 'Nella scheda trovi il riquadro "Prossime lezioni · 30 giorni": lezioni fisse, prenotate, recuperi e prove.',
      '"disdici" toglie la persona da quella lezione (con recupero se previsto), "appello" apre la lezione.',
      '"Aggiungi a una lezione" → scegli la lezione → "Metti qui": usa un recupero se c\'è, altrimenti è un ingresso in più.'],
  },
  iscrizioni: {
    titolo: 'Iscrizioni e abbonamenti', href: '/gestione/persone',
    passi: ['Apri Persone e cerca la persona.', 'Premi "Nuova iscrizione": scegli corso, abbonamento, giorni e data di inizio. Se parte a metà mese ti propone l\'importo delle lezioni che restano; l\'annuale ti propone quanto scalare.',
      'Sulle iscrizioni già fatte: "Cambia giorni", "Modifica" (sconto, date), "Sospendi", "Annulla".'],
  },
  'incassi-persona': {
    titolo: 'Incassi della persona', href: '/gestione/persone',
    passi: ['Apri Persone e cerca la persona.', 'Nel riquadro "Pagamenti" premi "Incassa": importo, metodo e, se serve, la data (es. un bonifico di ieri).',
      'Su un incasso già registrato: "correggi" per data e metodo, "annulla" se è sbagliato o doppio (annulla anche la ricevuta), "emetti ricevuta" o "fattura".'],
  },
  'invia-ricevuta': {
    titolo: 'Mandare la ricevuta al cliente', href: '/gestione/ricevute',
    passi: ['Apri la ricevuta: dalla scheda della persona (riquadro Pagamenti → "ricevuta n/anno") oppure da qui, Conti → Ricevute e fatture → "stampa".',
      'In alto: "Invia su WhatsApp" (apre WhatsApp col messaggio e il link), "Invia via email", "copia il link", "Stampa o salva in PDF".',
      'Il cliente apre la ricevuta dal link senza entrare nell\'app, e la ritrova nella sua area → Pagamenti.'],
  },
  'note-credito': {
    titolo: 'Note di credito (rimborsi)', href: '/gestione/ricevute',
    passi: ['Apri Conti → Ricevute e fatture.', 'Sulla ricevuta da rimborsare premi "rimborso" (sulle fatture "nota di credito").',
      'Scrivi quanto rimborsare (anche una parte) e il motivo: la nota si numera da sola e si stampa come la ricevuta.'],
  },
  'fatture-iva': {
    titolo: 'Fatture con IVA', href: '/gestione/ricevute',
    passi: ['Per le attività commerciali (affitto sale, feste, eventi per esterni).', 'Sull\'incasso (scheda della persona → Pagamenti, oppure Conti → Ricevute e fatture → "Incassi senza documento") premi "fattura".',
      'Compila i dati del cliente (P.IVA o codice fiscale, codice destinatario o PEC) ed emetti.',
      'Scarica il file XML ("XML") e caricalo sul portale delle fatture elettroniche; il PDF è la copia di cortesia.'],
  },
  esportazione: {
    titolo: 'Esportazione contabile', href: '/gestione/incassi',
    passi: ['Apri Conti → Incassi.', 'Scegli il periodo in alto.', 'In fondo alla pagina premi "Scarica il CSV": è il file da girare al commercialista.'],
  },
  'categorie-ordine': {
    titolo: 'Categorie, discipline, livelli, fasce d\'età, chiusure', href: '/gestione/palinsesto',
    passi: ['Apri Struttura → Categorie, livelli e chiusure.', 'Scegli in alto cosa sistemare: Categorie, Discipline, Livelli, Fasce d\'età, Sale, Insegnanti, Chiusure.',
      'Negli elenchi lunghi "Cerca…" filtra mentre scrivi; la tendina accanto mostra l\'ordine per nome o quello che vede il cliente sul sito (campo Ordine, si cambia da "Modifica").'],
  },
};
