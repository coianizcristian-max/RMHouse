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
      { href: '/gestione/lead', testo: 'Lead', soloGestione: true },
      { href: '/gestione/attese', testo: "Liste d'attesa", soloGestione: true },
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
      { href: '/gestione/spazi', testo: 'Sale e affitti', soloGestione: true },
      { href: '/gestione/spazi/listino', testo: 'Listino affitti', soloGestione: true },
      { href: '/gestione/eventi', testo: 'Eventi', soloGestione: true },
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
      { href: '/gestione/bacheca', testo: 'Bacheca' },
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
      { href: '/gestione/certificati', testo: 'Certificati' },
      { href: '/gestione/importa', testo: 'Importa da CSV' },
    ],
  },
  {
    k: 'gestione',
    titolo: 'Conti',
    icona: 'conti',
    href: '/gestione/statistiche',
    soloGestione: true,
    voci: [
      { href: '/gestione/statistiche', testo: 'Statistiche e margini' },
      { href: '/gestione/costi', testo: 'Costi e fornitori' },
      { href: '/gestione/abbonamenti', testo: 'Abbonamenti, recuperi e sconti' },
      { href: '/gestione/messaggi', testo: 'Messaggi automatici' },
    ],
  },
];

// A quale area appartiene una pagina
export function areaDi(path) {
  if (path === '/gestione' || path.startsWith('/gestione/oggi') || path.startsWith('/gestione/appello')
      || path.startsWith('/gestione/lead') || path.startsWith('/gestione/attese')
      || path.startsWith('/gestione/indice') || path.startsWith('/gestione/impostazioni')) return 'oggi';
  if (path.startsWith('/gestione/calendario') || path.startsWith('/gestione/agenda')
      || path.startsWith('/gestione/spazi') || path.startsWith('/gestione/eventi')) return 'calendari';
  if (path.startsWith('/gestione/corsi') || path.startsWith('/gestione/palinsesto')
      || path.startsWith('/gestione/bacheca') || path.startsWith('/gestione/staff')
      || path.startsWith('/gestione/sale') || path.startsWith('/gestione/sede')) return 'struttura';
  if (path.startsWith('/gestione/persone') || path.startsWith('/gestione/certificati')
      || path.startsWith('/gestione/importa')) return 'persone';
  return 'gestione';
}
