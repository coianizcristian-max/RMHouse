// Gruppi dentro un corso (orari.gruppo, query 137): es. Pole Dance Liv.1 → "Serale Eloise", "Pausa pranzo Liuda".
// Un corso "ha i gruppi" quando i suoi orari hanno almeno due gruppi diversi; gli orari senza nome finiscono in "Altri orari".
export const SENZA_GRUPPO = 'Altri orari';
const GG = ['', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const hm = (t) => String(t || '').slice(0, 5);
export const nomeGruppo = (o) => (o?.gruppo && String(o.gruppo).trim()) || '';

// [{ nome, orari }] se il corso ha almeno due gruppi, altrimenti []
export function gruppiDi(orari = []) {
  const nomi = [...new Set(orari.map(nomeGruppo))];
  if (nomi.filter(Boolean).length === 0 || nomi.length < 2) return [];
  return nomi
    .map((n) => ({ nome: n || SENZA_GRUPPO, chiave: n, orari: orari.filter((o) => nomeGruppo(o) === n)
      .sort((a, b) => a.giorno_settimana - b.giorno_settimana || hm(a.ora_inizio).localeCompare(hm(b.ora_inizio))) }))
    .sort((a, b) => (a.chiave ? 0 : 1) - (b.chiave ? 0 : 1) || a.nome.localeCompare(b.nome, 'it', { numeric: true }));
}

// "Lun 18:30" (+ " · Serale Eloise" se richiesto e c'è)
export const giornoOra = (o, conGruppo = false) => `${GG[o.giorno_settimana]} ${hm(o.ora_inizio)}${conGruppo && nomeGruppo(o) ? ` · ${nomeGruppo(o)}` : ''}`;

// il gruppo di un insieme di orari (es. quelli di un'iscrizione): il nome se sono tutti dello stesso, "gruppi misti" se no
export function gruppoDiOrari(orari = []) {
  const n = [...new Set(orari.map(nomeGruppo))];
  if (!n.length || (n.length === 1 && !n[0])) return '';
  return n.length === 1 ? n[0] : 'gruppi misti';
}
