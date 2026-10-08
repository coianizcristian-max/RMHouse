// La scheda di un tipo di abbonamento: gli stessi campi nella pagina Abbonamenti e nella finestra che si apre dal Palinsesto.
import { euro } from '@/lib/formato';

export const MODALITA = [
  { v: 'orari_fissi', l: 'Giorni e orari fissi' },
  { v: 'ingressi', l: 'Pacchetto a ingressi' },
  { v: 'libero', l: 'Accesso libero' },
];

// un abbonamento può stare in più famiglie (query 146)
export const famiglieDi = (t) => (Array.isArray(t.famiglie) && t.famiglie.length ? t.famiglie : (t.famiglia ? [t.famiglia] : []));

// Durata come la calcola il database: il mese solare vince sui "28 giorni"
export const solare = (t) => t.scadenza_fine_mese && !(t.durata_giorni && t.durata_giorni < 28);
export const durata = (t) => {
  if (t.durata_giorni && !solare(t)) return `${t.durata_giorni} ${t.durata_giorni === 1 ? 'giorno' : 'giorni'}`;
  const m = t.durata_mesi || 1;
  if (solare(t)) return m === 1 ? 'mese solare' : `${m} mesi solari`;
  return `${m} ${m === 1 ? 'mese' : 'mesi'} dal giorno d'inizio`;
};

// nel menù si vede sempre la percentuale: "Esente IVA · 0% N4"
export const opzioniAliquota = (aliquote = []) => aliquote.map((a) => {
  const perc = `${Number(a.percentuale || 0)}%${a.natura ? ` ${a.natura}` : ''}`;
  const nome = a.nome.includes('%') ? a.nome : `${a.nome} · ${perc}`;
  return { v: a.id, l: a.predefinita ? `${nome} (predefinita)` : nome };
});

// riassunto di una riga: modalità, volte, durata, prezzo
export const infoTipo = (t) => [
  MODALITA.find((m) => m.v === t.modalita)?.l
    + (t.lezioni_settimanali ? ` ${t.lezioni_settimanali}×sett.` : '')
    + (t.num_ingressi ? ` da ${t.num_ingressi}` : ''),
  durata(t),
  euro(t.prezzo_cent) + (t.prezzo_web_cent != null && t.prezzo_web_cent !== t.prezzo_cent ? ` · online ${euro(t.prezzo_web_cent)}` : ''),
].filter(Boolean).join(' · ');

// gruppi: [{id,nome}], aliquote: righe aliquote_iva, famiglie: [testo], corsi: [{id,nome,disciplina}] (solo attivi),
// scadenzaRecupero: palestre.scadenza_recupero, gruppoPredefinito: gruppo per un abbonamento nuovo
export function campiTipoAbbonamento({ gruppi = [], aliquote = [], famiglie = [], corsi = [], scadenzaRecupero, gruppoPredefinito = '' }) {
  return [
    // modulo compatto a sezioni: tutto in una schermata
    { k: 'nome', etichetta: 'Nome', tipo: 'testo', obbligatorio: true, gruppo: 'Abbonamento', larghezza: 3 },
    { k: 'codice', etichetta: 'Codice', tipo: 'testo', gruppo: 'Abbonamento', aiuto: 'es. P 24 lez' },
    { k: 'gruppo_id', etichetta: 'Gruppo di listino', tipo: 'select', opzioni: gruppi.map((g) => ({ v: g.id, l: g.nome })), vuotoTesto: '— nessuno —',
      predefinito: gruppoPredefinito, gruppo: 'Abbonamento' },
    { k: 'modalita', etichetta: 'Tipo', tipo: 'select', opzioni: MODALITA, obbligatorio: true, predefinito: 'orari_fissi', gruppo: 'Abbonamento' },
    { k: 'famiglie', etichetta: 'Famiglie', tipo: 'etichette', gruppo: 'Abbonamento', larghezza: 6, aiuto: 'una o più: raggruppano i simili',
      opzioni: famiglie, nuovaTesto: '+ Nuova famiglia…' },
    { k: 'descrizione', etichetta: 'Descrizione per il cliente', tipo: 'testolungo', righe: 1, gruppo: 'Abbonamento', larghezza: 5, aiuto: 'nel negozio dell\'app' },
    { k: 'aliquota_id', etichetta: 'IVA', tipo: 'select', opzioni: opzioniAliquota(aliquote), vuotoTesto: '— predefinita —', gruppo: 'Abbonamento' },

    { k: 'prezzo_cent', etichetta: 'Prezzo segreteria (€)', tipo: 'euro', obbligatorio: true, gruppo: 'Prezzo e durata' },
    { k: 'prezzo_web_cent', etichetta: 'Prezzo online (€)', tipo: 'euro', gruppo: 'Prezzo e durata', aiuto: 'vuoto = uguale' },
    { k: 'durata_mesi', etichetta: 'Durata (mesi)', tipo: 'numero', obbligatorio: true, predefinito: '1', gruppo: 'Prezzo e durata' },
    { k: 'durata_giorni', etichetta: 'Oppure giorni', tipo: 'numero', gruppo: 'Prezzo e durata', aiuto: '1 = singola, 28 = 4 sett.' },
    { k: 'scadenza_fine_mese', etichetta: 'Scade a fine mese solare', tipo: 'check', gruppo: 'Prezzo e durata', larghezza: 2,
      aiuto: 'chi paga il 10 scade a fine mese (trimestrale: fine del 3° mese)' },

    { k: 'lezioni_settimanali', etichetta: 'Lezioni a settimana', tipo: 'numero', gruppo: 'Lezioni e recuperi', se: (b) => b.modalita !== 'ingressi' && b.modalita !== 'libero' },
    { k: 'num_ingressi', etichetta: 'Ingressi del pacchetto', tipo: 'numero', gruppo: 'Lezioni e recuperi', se: (b) => b.modalita === 'ingressi' },
    { k: 'recuperi_max', etichetta: 'Recuperi massimi', tipo: 'numero', gruppo: 'Lezioni e recuperi', aiuto: 'vuoto = illimitati, 0 = nessuno', larghezza: 2 },
    // con i recuperi validi fino a fine abbonamento i giorni non servono
    ...(scadenzaRecupero === 'abbonamento' ? [] : [
      { k: 'giorni_validita_recupero', etichetta: 'Validità recupero (giorni)', tipo: 'numero', predefinito: '30', gruppo: 'Lezioni e recuperi', aiuto: 'dalla lezione persa', larghezza: 2 },
    ]),

    { k: 'acquistabile_online', etichetta: 'Si compra dall\'app', tipo: 'check', gruppo: 'Vendita' },
    { k: 'rinnovo_automatico', etichetta: 'Rinnovo automatico mensile online', tipo: 'check', predefinito: false, gruppo: 'Vendita' },
    { k: 'attivo', etichetta: 'Attivo', tipo: 'check', gruppo: 'Vendita' },
    { k: 'archiviato', etichetta: 'Archiviato (resta nello storico)', tipo: 'check', predefinito: false, gruppo: 'Vendita' },

    // in fondo: i corsi che l'abbonamento fa frequentare (gli stessi di "Corsi coperti"), con il filtro per disciplina
    { k: 'corsi_compresi', etichetta: 'Corsi compresi', tipo: 'molti', gruppo: 'Corsi compresi', larghezza: 6,
      aiuto: 'nessuno = tutti i corsi; servono a proporre l\'abbonamento giusto e a cosa si prenota dall\'app',
      nessunoTesto: 'Nessuno scelto: vale per tutti i corsi', etichettaGruppi: 'Discipline',
      opzioni: corsi.map((c) => ({ v: c.id, l: c.nome, g: c.disciplina })),
      collegati: { tabella: 'tipi_abbonamento_corsi', mia: 'tipo_abbonamento_id', altra: 'corso_id' } },
  ];
}
