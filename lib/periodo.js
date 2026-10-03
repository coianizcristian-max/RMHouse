// Periodi già pronti per statistiche e attività: oggi, ieri, ultima settimana, questo mese, ultimo mese,
// mese scorso, ultimi 3 mesi, stagione (da settembre), stagione scorsa, ultimo anno. Oppure dal/al a mano.
import { oggiISO } from './formato';

const ISO = (d) => d.toISOString().slice(0, 10);
const giorno = (iso, n = 0) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return ISO(d); };

export function periodiPronti(conOggi = true) {
  const oggi = oggiISO();
  const [y, m] = oggi.split('-').map(Number);
  const inizioMese = `${oggi.slice(0, 8)}01`;
  const meseScorso = ISO(new Date(Date.UTC(y, m - 2, 1)));
  const fineMeseScorso = ISO(new Date(Date.UTC(y, m - 1, 0)));
  const annoStagione = m >= 9 ? y : y - 1;
  const lista = [
    ['oggi', 'Oggi', oggi, oggi],
    ['ieri', 'Ieri', giorno(oggi, -1), giorno(oggi, -1)],
    ['settimana', 'Ultima settimana', giorno(oggi, -6), oggi],
    ['mese', 'Questo mese', inizioMese, oggi],
    ['30', 'Ultimo mese', giorno(oggi, -29), oggi],
    ['mese-scorso', 'Mese scorso', meseScorso, fineMeseScorso],
    ['3mesi', 'Ultimi 3 mesi', giorno(oggi, -90), oggi],
    ['stagione', 'Stagione', `${annoStagione}-09-01`, oggi],
    ['stagione-scorsa', 'Stagione scorsa', `${annoStagione - 1}-09-01`, `${annoStagione}-08-31`],
    ['anno', 'Ultimo anno', giorno(oggi, -364), oggi],
  ];
  return conOggi ? lista : lista.filter(([k]) => k !== 'oggi' && k !== 'ieri');
}

// legge ?p=… oppure ?dal=…&al=… ; predefinito: la chiave indicata
export function leggiPeriodo(sp = {}, predefinito = 'mese') {
  const valida = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  const pronti = periodiPronti(true);
  if (valida(sp.dal)) {
    const al = valida(sp.al) ? sp.al : sp.dal;
    const [dal, a] = sp.dal <= al ? [sp.dal, al] : [al, sp.dal];
    const uguale = pronti.find(([, , d1, d2]) => d1 === dal && d2 === a);
    return { chiave: uguale?.[0] || 'libero', dal, al: a, etichetta: uguale?.[1] || (dal === a ? dal.split('-').reverse().join('/') : `${dal.split('-').reverse().join('/')} – ${a.split('-').reverse().join('/')}`) };
  }
  const p = pronti.find(([k]) => k === sp.p) || pronti.find(([k]) => k === predefinito);
  return { chiave: p[0], dal: p[2], al: p[3], etichetta: p[1] };
}

export const qsPeriodo = (per) => (per.chiave === 'libero' ? `dal=${per.dal}&al=${per.al}` : `p=${per.chiave}`);
