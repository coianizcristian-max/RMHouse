// Maschile o femminile: le parole che parlano di una persona si accordano con lei.
// Il genere si prende dal campo "sesso" (F/M); se manca, dal codice fiscale
// (giorno di nascita + 40 per le donne). Se non si sa, si scrivono le due forme.

const OMOCODIA = { L: '0', M: '1', N: '2', P: '3', Q: '4', R: '5', S: '6', T: '7', U: '8', V: '9' };

export function genere(p) {
  const s = String(p?.sesso || '').trim().toUpperCase();
  if (s === 'F' || s === 'M') return s;
  const cf = String(p?.codice_fiscale || p?.cf || '').trim().toUpperCase();
  if (cf.length === 16) {
    const gg = Number(cf.slice(9, 11).replace(/[LMNPQRSTUV]/g, (c) => OMOCODIA[c]));
    if (Number.isFinite(gg) && gg >= 1 && gg <= 71) return gg > 40 ? 'F' : 'M';
  }
  return null;
}

// gx(g, 'iscritto', 'iscritta')            → "iscritto" | "iscritta" | "iscritto/a"
// gx(g, 'figlio', 'figlia', 'figlio o figlia') → con la forma "non so" scelta a mano
export function gx(g, maschile, femminile, nonSo) {
  if (g === 'F') return femminile;
  if (g === 'M') return maschile;
  return nonSo ?? `${maschile}/${femminile.slice(-1)}`;
}

// Scorciatoia per la sola desinenza: `iscritt${o(g)}` → iscritto | iscritta | iscritto/a
export const o = (g) => (g === 'F' ? 'a' : g === 'M' ? 'o' : 'o/a');
