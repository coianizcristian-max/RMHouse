// Periodi già pronti per statistiche e attività: oggi, ieri, ultima settimana, questo mese, ultimo mese,
// mese scorso, ultimi 3 mesi, stagione e stagione scorsa (dal mese scelto in Impostazioni), anno solare,
// anno solare scorso, ultimi 12 mesi. Oppure dal/al a mano.
import { oggiISO } from './formato';

const ISO = (d) => d.toISOString().slice(0, 10);
const giorno = (iso, n = 0) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return ISO(d); };

const MESI_NOMI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

// mese: da che mese parte la stagione sportiva (Impostazioni → Regole). La stagione dura 12 mesi da lì.
export function periodiPronti(conOggi = true, mese = 9) {
  const oggi = oggiISO();
  const [y, m] = oggi.split('-').map(Number);
  const inizioMese = `${oggi.slice(0, 8)}01`;
  const meseScorso = ISO(new Date(Date.UTC(y, m - 2, 1)));
  const fineMeseScorso = ISO(new Date(Date.UTC(y, m - 1, 0)));
  const annoStagione = m >= mese ? y : y - 1;
  const mm = String(mese).padStart(2, '0');
  const inizioStagione = `${annoStagione}-${mm}-01`;
  const sigla = (a) => `${a}/${String(a + 1).slice(2)}`;
  const lista = [
    ['oggi', 'Oggi', oggi, oggi],
    ['ieri', 'Ieri', giorno(oggi, -1), giorno(oggi, -1)],
    ['settimana', 'Ultima settimana', giorno(oggi, -6), oggi],
    ['mese', 'Questo mese', inizioMese, oggi],
    ['30', 'Ultimo mese', giorno(oggi, -29), oggi],
    ['mese-scorso', 'Mese scorso', meseScorso, fineMeseScorso],
    ['3mesi', 'Ultimi 3 mesi', giorno(oggi, -90), oggi],
    ['stagione', `Stagione ${sigla(annoStagione)}`, inizioStagione, oggi],
    ['stagione-scorsa', `Stagione ${sigla(annoStagione - 1)}`, `${annoStagione - 1}-${mm}-01`, giorno(inizioStagione, -1)],
    ['anno', `Anno solare ${y}`, `${y}-01-01`, oggi],
    ['anno-scorso', `Anno solare ${y - 1}`, `${y - 1}-01-01`, `${y - 1}-12-31`],
    ['12mesi', 'Ultimi 12 mesi', giorno(oggi, -364), oggi],
  ];
  return conOggi ? lista : lista.filter(([k]) => k !== 'oggi' && k !== 'ieri');
}
export const nomeMeseStagione = (mese = 9) => MESI_NOMI[(mese || 9) - 1];

// legge ?p=… oppure ?dal=…&al=… ; predefinito: la chiave indicata
export function leggiPeriodo(sp = {}, predefinito = 'mese', mese = 9) {
  const valida = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  const pronti = periodiPronti(true, mese);
  if (valida(sp.dal)) {
    const al = valida(sp.al) ? sp.al : sp.dal;
    const [dal, a] = sp.dal <= al ? [sp.dal, al] : [al, sp.dal];
    const uguale = pronti.find(([, , d1, d2]) => d1 === dal && d2 === a);
    return { mese, chiave: uguale?.[0] || 'libero', dal, al: a, etichetta: uguale?.[1] || (dal === a ? dal.split('-').reverse().join('/') : `${dal.split('-').reverse().join('/')} – ${a.split('-').reverse().join('/')}`) };
  }
  const p = pronti.find(([k]) => k === sp.p) || pronti.find(([k]) => k === predefinito);
  return { mese, chiave: p[0], dal: p[2], al: p[3], etichetta: p[1] };
}

export const qsPeriodo = (per) => (per.chiave === 'libero' ? `dal=${per.dal}&al=${per.al}` : `p=${per.chiave}`);
