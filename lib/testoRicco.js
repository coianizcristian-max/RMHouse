// Testo con un po' di formattazione, scritto con segni semplici (come su WhatsApp/Markdown):
//   **grassetto**   _corsivo_   ## Titoletto   - elenco puntato   1. elenco numerato   [testo](https://link)
//   riga vuota = nuovo paragrafo; un "a capo" resta a capo; gli indirizzi https://… diventano link.
// Si trasforma in elementi React (niente HTML scritto a mano: nessun rischio di codice nascosto nel testo).
// Va bene sia sul server sia nel browser.
import { Fragment, createElement as h } from 'react';

const LINK_OK = /^(https?:\/\/|mailto:|tel:)/i;
// grassetto | link [testo](url) | indirizzo | corsivo (con lo spazio o l'inizio prima, per non toccare nomi_con_trattini)
const INLINE = /\*\*([^*\n]+?)\*\*|\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:|tel:)[^\s)]+)\)|(https?:\/\/[^\s<]+)|(^|[\s(«"'])_([^_\n]+?)_(?=$|[\s.,;:!?)»"'])/g;

function inline(testo, chiave) {
  const out = [];
  const re = new RegExp(INLINE.source, 'g');      // una per chiamata: il grassetto si legge di nuovo dentro (ricorsione)
  let ultimo = 0; let n = 0; let m;
  while ((m = re.exec(testo))) {
    let inizio = m.index;
    if (m[6] !== undefined) inizio += m[5].length;           // il carattere prima del corsivo resta testo
    if (inizio > ultimo) out.push(testo.slice(ultimo, inizio));
    const k = `${chiave}-${n++}`;
    if (m[1] !== undefined) out.push(h('strong', { key: k }, inline(m[1], k)));
    else if (m[2] !== undefined) {
      out.push(LINK_OK.test(m[3]) ? h('a', { key: k, href: m[3], target: '_blank', rel: 'noopener noreferrer' }, m[2]) : m[0]);
    } else if (m[4] !== undefined) {
      // la punteggiatura finale non fa parte dell'indirizzo
      const url = m[4].replace(/[.,;:!?)»"']+$/, '');
      out.push(h('a', { key: k, href: url, target: '_blank', rel: 'noopener noreferrer' }, url));
      if (url.length < m[4].length) out.push(m[4].slice(url.length));
    } else out.push(h('em', { key: k }, inline(m[6], k)));
    ultimo = re.lastIndex;
  }
  if (ultimo < testo.length) out.push(testo.slice(ultimo));
  return out;
}

// il testo diviso in blocchi: paragrafi, titoletti, elenchi
export function blocchi(testo) {
  const righe = String(testo ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let corrente = null;
  const chiudi = () => { if (corrente) out.push(corrente); corrente = null; };
  for (const riga of righe) {
    const t = riga.trimEnd();
    let m;
    if (!t.trim()) { chiudi(); continue; }
    if ((m = t.match(/^\s*#{1,3}\s+(.+)$/))) { chiudi(); out.push({ tipo: 'titolo', righe: [m[1]] }); continue; }
    if ((m = t.match(/^\s*[-•*]\s+(.+)$/))) {
      if (corrente?.tipo !== 'puntato') { chiudi(); corrente = { tipo: 'puntato', righe: [] }; }
      corrente.righe.push(m[1]); continue;
    }
    if ((m = t.match(/^\s*\d{1,2}[.)]\s+(.+)$/))) {
      if (corrente?.tipo !== 'numerato') { chiudi(); corrente = { tipo: 'numerato', righe: [] }; }
      corrente.righe.push(m[1]); continue;
    }
    if (corrente?.tipo !== 'paragrafo') { chiudi(); corrente = { tipo: 'paragrafo', righe: [] }; }
    corrente.righe.push(t.trim());
  }
  chiudi();
  return out;
}

export function TestoRicco({ testo, className = 'testo-ricco' }) {
  const bb = blocchi(testo);
  if (!bb.length) return null;
  return h('div', { className }, bb.map((b, i) => {
    const k = `b${i}`;
    if (b.tipo === 'titolo') return h('h3', { key: k }, inline(b.righe[0], k));
    if (b.tipo === 'puntato' || b.tipo === 'numerato') {
      return h(b.tipo === 'puntato' ? 'ul' : 'ol', { key: k }, b.righe.map((r, j) => h('li', { key: `${k}-${j}` }, inline(r, `${k}-${j}`))));
    }
    return h('p', { key: k }, b.righe.map((r, j) => h(Fragment, { key: `${k}-${j}` }, j > 0 ? h('br') : null, inline(r, `${k}-${j}`))));
  }));
}

// lo stesso testo senza i segni (per le anteprime e le descrizioni dei link condivisi)
export function testoSemplice(testo) {
  return String(testo ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/^\s*#{1,3}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\*\*([^*\n]+?)\*\*/g, '$1')
    .replace(/\[([^\]\n]+)\]\(([^\s)]+)\)/g, '$1 ($2)')
    .replace(/(^|[\s(«"'])_([^_\n]+?)_(?=$|[\s.,;:!?)»"'])/gm, '$1$2')
    .trim();
}
