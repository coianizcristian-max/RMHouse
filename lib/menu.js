// Struttura dell'area di gestione: quattro aree, ognuna con le sue voci.
// Su desktop l'area sta nella colonna a sinistra e le voci nel sottomenù;
// su telefono l'area sta nella barra in basso e le voci diventano chip scorrevoli.

export const AREE = [
  {
    k: 'oggi',
    titolo: 'Oggi',
    icona: 'oggi',
    href: '/gestione',
    voci: [
      { href: '/gestione', testo: 'Riepilogo', esatto: true },
      { href: '/gestione/oggi', testo: 'Agenda del giorno' },
      { href: '/gestione/ingresso', testo: 'Ingressi' },
      { href: '/gestione/lead', testo: 'Lead', soloGestione: true, funzione: 'lead' },
      { href: '/gestione/attese', testo: "Liste d'attesa", soloGestione: true, funzione: 'attese' },
      { href: '/gestione/indice', testo: 'Tutte le funzioni' },
    ],
  },
  {
    k: 'calendari',
    titolo: 'Calendari',
    icona: 'calendario',
    href: '/gestione/calendario',
    voci: [
      { href: '/gestione/calendario', testo: 'Palinsesto' },
      { href: '/gestione/agenda', testo: 'Agenda settimanale' },
      { href: '/gestione/giornata', testo: 'Giornata per sale' },
      { href: '/gestione/giornata/staff', testo: 'Giornata per insegnanti' },
      { href: '/gestione/spazi', testo: 'Sale e affitti', soloGestione: true, funzione: 'spazi' },
      { href: '/gestione/spazi/listino', testo: 'Listino affitti', soloGestione: true, funzione: 'spazi' },
      { href: '/gestione/eventi', testo: 'Eventi', soloGestione: true, funzione: 'eventi' },
    ],
  },
  {
    k: 'struttura',
    titolo: 'Struttura',
    icona: 'struttura',
    href: '/gestione/corsi',
    soloGestione: true,
    voci: [
      { href: '/gestione/corsi', testo: 'Corsi' },
      { href: '/gestione/staff', testo: 'Staff' },
      { href: '/gestione/sale', testo: 'Sale' },
      { href: '/gestione/palinsesto', testo: 'Categorie, livelli e chiusure' },
      { href: '/gestione/bacheca', testo: 'Bacheca', funzione: 'bacheca' },
      { href: '/gestione/sede', testo: 'Sede e contatti' },
    ],
  },
  {
    k: 'persone',
    titolo: 'Persone',
    icona: 'persone',
    href: '/gestione/persone',
    soloGestione: true,
    voci: [
      { href: '/gestione/persone', testo: 'Anagrafiche e recuperi' },
      { href: '/gestione/persone/nuova', testo: 'Registra una persona' },
      { href: '/gestione/scadenze', testo: 'Scadenze' },
      { href: '/gestione/rinnovi', testo: 'Rinnovi in blocco' },
      { href: '/gestione/certificati', testo: 'Certificati' },
      { href: '/gestione/moduli', testo: 'Moduli e firme' },
      { href: '/gestione/tesseramento', testo: 'Tesseramento' },
      { href: '/gestione/crm', testo: 'Contatti e prove', esatto: true, funzione: 'lead' },
      { href: '/gestione/crm/ricontattare', testo: 'Da ricontattare' },
      { href: '/gestione/crm/campagne', testo: 'Campagne', funzione: 'promo' },
      { href: '/gestione/crm/sondaggi', testo: 'Sondaggi', funzione: 'promo' },
      { href: '/gestione/importa', testo: 'Importa da CSV' },
    ],
  },
  {
    k: 'gestione',
    titolo: 'Conti',
    icona: 'conti',
    href: '/gestione/conti',
    soloGestione: true,
    voci: [
      { href: '/gestione/conti', testo: 'Riepilogo dei conti' },
      { href: '/gestione/incassi', testo: 'Incassi' },
      { href: '/gestione/rate', testo: 'Rate', funzione: 'rate' },
      { href: '/gestione/ricevute', testo: 'Ricevute e note di credito' },
      { href: '/gestione/fatture', testo: 'Fatture dei fornitori' },
      { href: '/gestione/banca', testo: 'Banca e cassa' },
      { href: '/gestione/costi', testo: 'Costi e fornitori' },
      { href: '/gestione/compensi', testo: 'Compensi insegnanti' },
      { href: '/gestione/rendiconto', testo: 'Rendiconto staff' },
      { href: '/gestione/commercialista', testo: 'Per il commercialista' },
      { href: '/gestione/statistiche', testo: 'Statistiche e margini' },
    ],
  },
  {
    k: 'impostazioni',
    titolo: 'Impostazioni',
    icona: 'impostazioni',
    href: '/gestione/impostazioni',
    soloGestione: true,
    voci: [
      { href: '/gestione/impostazioni', testo: 'Regole e prenotazioni', esatto: true },
      { href: '/gestione/impostazioni/funzioni', testo: 'Funzioni attive' },
      { href: '/gestione/impostazioni/aspetto', testo: 'Area clienti' },
      { href: '/gestione/impostazioni/notifiche', testo: 'Email e notifiche' },
      { href: '/gestione/impostazioni/pagamenti', testo: 'Pagamenti online' },
      { href: '/gestione/impostazioni/integrazioni', testo: 'Integrazioni' },
      { href: '/gestione/impostazioni/ruoli', testo: 'Ruoli e accessi' },
      { href: '/gestione/impostazioni/registro', testo: 'Registro delle azioni' },
      { href: '/gestione/abbonamenti', testo: 'Abbonamenti, recuperi e sconti' },
      { href: '/gestione/messaggi', testo: 'Messaggi automatici' },
    ],
  },
];

// Voci spente dalle Impostazioni → Funzioni attive
export const FUNZIONI = [
  ['lead', 'Lead', 'Richieste di prova e contatti da seguire, con diario e promemoria.'],
  ['attese', "Liste d'attesa", 'Chi aspetta un posto in un corso o in una lezione, con avviso automatico.'],
  ['spazi', 'Affitto sale', 'Richieste di affitto dal sito, listino, preventivi e agenda delle sale.'],
  ['eventi', 'Eventi', 'Saggi, stage e feste con iscrizione dall\'area clienti.'],
  ['bacheca', 'Bacheca', 'Avvisi e notizie per lo staff e per i clienti.'],
  ['rate', 'Rate', 'Pagamenti divisi in più scadenze.'],
  ['promo', 'Campagne e sondaggi', 'Email a un pubblico scelto e sondaggi con risultati.'],
];

// A quale area appartiene una pagina
export function areaDi(path) {
  if (path === '/gestione' || path.startsWith('/gestione/oggi') || path.startsWith('/gestione/appello')
      || path.startsWith('/gestione/lead') || path.startsWith('/gestione/attese')
      || path.startsWith('/gestione/indice') || path.startsWith('/gestione/ingresso')) return 'oggi';
  if (path.startsWith('/gestione/impostazioni') || path.startsWith('/gestione/abbonamenti')
      || path.startsWith('/gestione/messaggi')) return 'impostazioni';
  if (path.startsWith('/gestione/calendario') || path.startsWith('/gestione/agenda') || path.startsWith('/gestione/giornata')
      || path.startsWith('/gestione/spazi') || path.startsWith('/gestione/eventi')) return 'calendari';
  if (path.startsWith('/gestione/corsi') || path.startsWith('/gestione/palinsesto')
      || path.startsWith('/gestione/bacheca') || path.startsWith('/gestione/staff')
      || path.startsWith('/gestione/sale') || path.startsWith('/gestione/sede')) return 'struttura';
  if (path.startsWith('/gestione/persone') || path.startsWith('/gestione/certificati') || path.startsWith('/gestione/scadenze')
      || path.startsWith('/gestione/importa') || path.startsWith('/gestione/rinnovi') || path.startsWith('/gestione/crm')
      || path.startsWith('/gestione/moduli') || path.startsWith('/gestione/firme') || path.startsWith('/gestione/tesseramento')) return 'persone';
  return 'gestione';
}
