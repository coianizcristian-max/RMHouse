// Workshop: aiuti condivisi da gestionale, Sportello, app e pagina pubblica (query 147)
import { euro } from './formato';

const TZ = 'Europe/Rome';

export const STATI_WORKSHOP = {
  bozza: { testo: 'Bozza', nota: 'lo vede solo lo staff', classe: 'tag-neutro' },
  pubblicato: { testo: 'Iscrizioni aperte', nota: 'nell\'app e sul link pubblico', classe: 'tag-ok' },
  chiuso: { testo: 'Iscrizioni chiuse', nota: 'si vede ma non ci si iscrive (la segreteria sì)', classe: 'tag-attenzione' },
  annullato: { testo: 'Annullato', nota: 'non si fa più', classe: 'tag-rosso' },
};

// giorno e ora come li legge un cliente: "sabato 15 novembre, 15:00–17:00"
export const giornoOra = (inizio, fine) => {
  const d = new Date(inizio);
  const g = d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });
  const o = (x) => new Date(x).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
  return `${g}, ${o(inizio)}${fine ? `–${o(fine)}` : ''}`;
};
export const giornoCorto = (iso) => new Date(iso).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ });

// "sab 15 nov" oppure "sab 15 – dom 16 nov"
export const periodo = (inizio, fine) => {
  if (!inizio) return '';
  const a = new Date(inizio), b = new Date(fine || inizio);
  const giorno = (x) => x.toLocaleDateString('sv-SE', { timeZone: TZ });
  if (giorno(a) === giorno(b)) return giornoCorto(inizio);
  return `${giornoCorto(inizio)} – ${giornoCorto(fine)}`;
};

const dataIt = (iso) => { const [y, m, d] = iso.split('-'); return `${Number(d)}/${Number(m)}${y !== String(new Date().getFullYear()) ? `/${y.slice(2)}` : ''}`; };

// gli scaglioni in ordine ("fino al" crescente, "poi" in fondo), come li ordina il database
export const scaglioni = (prezzi = []) => [...(prezzi || [])]
  .filter((x) => x && x.allievi != null && x.allievi !== '')
  .sort((a, b) => (a.fino_al ? (b.fino_al ? a.fino_al.localeCompare(b.fino_al) : -1) : (b.fino_al ? 1 : 0)));

// "fino al 15/11 40 €, poi 50 €" (per allievi o per esterni)
export const testoScaglioni = (prezzi, esterno = false) => scaglioni(prezzi)
  .map((s, i, tutti) => {
    const p = esterno && s.esterni != null && s.esterni !== '' ? s.esterni : s.allievi;
    return s.fino_al ? `fino al ${dataIt(s.fino_al)} ${euro(p)}` : `${i && tutti[i - 1].fino_al ? 'poi' : ''} ${euro(p)}`.trim();
  }).join(' · ');

// lo scaglione dopo quello che vale oggi (per dire "dal 16/11 costa 50 €")
export const prossimoScaglione = (opzione) => {
  const tutti = scaglioni(opzione?.prezzi);
  const n = opzione?.scaglione?.n;
  if (!n || opzione?.scaglione?.scaduto || n >= tutti.length) return null;
  const att = tutti[n - 1]; const pros = tutti[n];
  if (!att?.fino_al) return null;
  const dal = new Date(`${att.fino_al}T12:00:00Z`); dal.setUTCDate(dal.getUTCDate() + 1);
  return { dal: dal.toISOString().slice(0, 10), allievi: pros.allievi, esterni: pros.esterni ?? pros.allievi };
};
export const dataBreveIt = dataIt;

// prezzo di un'opzione per una persona (allieva o esterna)
export const prezzoOpzione = (o, esterno) => (esterno ? o?.prezzo_esterni : o?.prezzo_allievi) ?? o?.prezzo_allievi ?? 0;

// prezzo più basso da mostrare in un elenco ("da 40 €")
export const prezzoDa = (w, esterno = false) => {
  const p = (w?.opzioni || []).map((o) => prezzoOpzione(o, esterno)).filter((x) => x != null);
  return p.length ? Math.min(...p) : null;
};

export const postiLiberi = (w) => {
  const l = (w?.opzioni || []).map((o) => o.liberi).filter((x) => x != null);
  return l.length === (w?.opzioni || []).length && l.length ? Math.max(...l) : null;   // null = senza limite
};

// i conti di un workshop dalle sue iscrizioni (non annullate): incassato (solo workshop, senza quote), quote, da incassare,
// compenso dell'insegnante e quanto resta alla scuola
export function contiWorkshop(w, iscrizioni = []) {
  let incassato = 0, quote = 0, daIncassare = 0, nDaPagare = 0, gratis = 0;
  for (const i of iscrizioni) {
    const st = i.pagamenti?.stato || i.pagamento?.stato;
    if (st === 'pagato') { incassato += i.prezzo_cent || 0; quote += i.quota_cent || 0; }
    else if (st === 'in_attesa') { daIncassare += (i.prezzo_cent || 0) + (i.quota_cent || 0); nDaPagare += 1; }
    else if (!st && !(i.prezzo_cent || 0)) gratis += 1;
  }
  const compenso = w?.compenso_tipo === 'fisso' ? (w.compenso_cent || 0)
    : w?.compenso_tipo === 'percentuale' ? Math.round(incassato * Number(w.compenso_percentuale || 0) / 100) : 0;
  return { incassato, quote, daIncassare, nDaPagare, gratis, compenso, resta: incassato - compenso };
}

// posti di ogni momento: occupati dalle iscrizioni le cui opzioni lo comprendono
export function postiMomenti(momenti = [], opzioni = [], iscrizioni = []) {
  const perOpz = {};
  for (const i of iscrizioni) perOpz[i.opzione_id] = (perOpz[i.opzione_id] || 0) + 1;
  return momenti.map((m) => {
    const occupati = opzioni.filter((o) => (o.momenti || []).includes(m.id)).reduce((t, o) => t + (perOpz[o.id] || 0), 0);
    return { ...m, occupati, liberi: m.posti == null ? null : Math.max(m.posti - occupati, 0) };
  });
}
