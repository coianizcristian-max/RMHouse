// "Dichiarazione e ricevuta per partecipazione attività sportiva dilettantistica" (per il 730 dei ragazzi), come il
// modello Word della scuola. Qui solo i testi: il PDF lo fa lib/pdfDichiarazione.js. `d` = una riga di dichiarazioni_730
// (query 158), `imp` = palestre.dichiarazione, `pal` = nome/fatturazione/ente della scuola.
import { euro } from '@/lib/formato';
import { importoInLettere } from '@/lib/numeriInLettere';
import { parteCognome, parteNome, normalizzaCF } from '@/lib/codiceFiscale';

// nome e cognome nell'ordine giusto secondo il codice fiscale (molte schede importate li hanno al contrario)
function nomeGiusto(d) {
  const cf = normalizzaCF(d.codice_fiscale);
  if (cf.length === 16 && d.nome && d.cognome
      && !(parteCognome(d.cognome) === cf.slice(0, 3) && parteNome(d.nome) === cf.slice(3, 6))
      && parteCognome(d.nome) === cf.slice(0, 3) && parteNome(d.cognome) === cf.slice(3, 6)) return { nome: d.cognome, cognome: d.nome };
  return { nome: d.nome || '', cognome: d.cognome || '' };
}
const semplice = (t) => String(t || '').toLowerCase().replace(/[^a-zà-ü]+/g, ' ').trim().split(' ').sort().join(' ');

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const giorno = (iso) => { const [a, m, g] = String(iso).slice(0, 10).split('-').map(Number); return { a, m, g }; };
const data = (iso) => { const { a, m, g } = giorno(iso); return `${String(g).padStart(2, '0')}/${String(m).padStart(2, '0')}/${a}`; };

// "16 luglio - 22 luglio 2023", "20 novembre 2026 - 31 gennaio 2027", "11 ottobre 2026"
export function periodo(dal, al) {
  if (!dal) return '';
  const x = giorno(dal), y = giorno(al || dal);
  if (x.a === y.a && x.m === y.m && x.g === y.g) return `${x.g} ${MESI[x.m - 1]} ${x.a}`;
  return x.a === y.a ? `${x.g} ${MESI[x.m - 1]} - ${y.g} ${MESI[y.m - 1]} ${y.a}` : `${x.g} ${MESI[x.m - 1]} ${x.a} - ${y.g} ${MESI[y.m - 1]} ${y.a}`;
}

const MEZZI = { contanti: 'contanti', pos: 'carta (POS)', carta: 'carta di credito', bonifico: 'bonifico bancario', satispay: 'Satispay',
  online: 'pagamento online con carta', stripe: 'pagamento online con carta', assegno: 'assegno', altro: 'altro mezzo' };
export function mezzi(metodi = []) {
  const t = [...new Set((metodi || []).filter(Boolean).map((m) => MEZZI[m] || m))];
  if (!t.length) return '';
  return t.length === 1 ? t[0] : `${t.slice(0, -1).join(', ')} e ${t[t.length - 1]}`;
}
// per la detrazione nel 730 il pagamento deve essere tracciabile (non in contanti)
export const conContanti = (d) => (d.metodi || []).includes('contanti');

export function intestazionePredefinita(pal = {}) {
  const fz = pal.fatturazione || {};
  const nome = fz.denominazione || pal.nome || '';
  const sede = [fz.indirizzo, [fz.cap, fz.comune].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const ente = pal.ente?.nome ? `regolarmente affiliata ${pal.ente.nome} e ` : '';
  return `${nome}${sede ? ` con sede in ${sede}` : ''}${fz.piva ? `, P.iva ${fz.piva}` : ''}. Società ${ente}iscritta al CONI / Sport e Salute`;
}

// le righe del documento, nell'ordine del modello
export function testiDichiarazione(d, imp = {}, pal = {}, oggi = new Date().toISOString().slice(0, 10)) {
  const g = nomeGiusto(d);
  const nome = `${g.nome} ${g.cognome}`.trim().toUpperCase();
  // chi paga è il ragazzo stesso (scheda senza genitore): si lascia lo spazio per scriverlo a mano
  const eta = d.data_nascita ? (Number(String(oggi).slice(0, 4)) - Number(String(d.data_nascita).slice(0, 4))) : null;
  const paganteRagazzo = eta !== null && eta <= 18 && semplice(d.pagante) === semplice(`${d.nome} ${d.cognome}`);
  const pagante = paganteRagazzo ? '______________________________' : d.pagante;
  const paganteCf = paganteRagazzo ? '____________________' : d.pagante_cf || '____________________';
  const attivita = d.attivita ? (String(d.attivita).includes(',') ? `i corsi di ${d.attivita}` : `il corso di ${d.attivita}`) : 'attività sportiva dilettantistica';
  // "presso": la sede del corso, se è fuori dalla sede principale; altrimenti il testo delle impostazioni
  const presso = (imp.presso && (!d.presso || d.principale !== false)) ? imp.presso : d.presso || imp.presso || '';
  const residenza = [d.comune, d.indirizzo].filter(Boolean).join(' ');
  return {
    titolo: ['Dichiarazione e ricevuta', 'per partecipazione attività sportiva dilettantistica'],
    intestazione: (imp.intestazione || '').trim() || intestazionePredefinita(pal),
    centro: [
      'dichiara che',
      nome,
      `Codice Fiscale ${d.codice_fiscale || '____________________'}`,
      `Residente a ${residenza || '______________________________'}`,
      `ha frequentato ${attivita}`,
      presso ? `presso ${presso}` : null,
      '',
      `Totale versato nel periodo ${periodo(d.dal, d.al)}`,
      `è di ${euro(d.importo_cent)} (${importoInLettere(d.importo_cent)})`,
      `versato da ${pagante || '______________________________'}, Codice Fiscale ${paganteCf}`,
      d.metodi?.length ? `a mezzo ${mezzi(d.metodi)}.` : null,
      d.ricevuta ? `(ricevuta n. ${d.ricevuta.numero}/${d.ricevuta.anno} del ${data(d.ricevuta.data)})` : null,
    ].filter((x) => x !== null),
    data: `Data ${data(oggi)}`,
    firma: imp.firma || 'Legale Rappresentante',
  };
}

export const nomeFileDichiarazione = (righe, anno) => {
  if (righe.length === 1) {
    const d = righe[0];
    return `dichiarazione-730-${`${d.cognome || ''}-${d.nome || ''}`.toLowerCase().replace(/[^a-z0-9]+/g, '-')}${d.ricevuta ? `-ric-${d.ricevuta.numero}` : anno ? `-${anno}` : ''}.pdf`;
  }
  return `dichiarazioni-730${anno ? `-${anno}` : ''}-${righe.length}.pdf`;
};
