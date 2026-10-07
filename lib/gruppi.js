// Gruppi dentro un corso (orari.gruppo, query 137): es. Pole Dance Liv.1 → "Serale Eloise", "Pausa pranzo Liuda".
// Un corso "ha i gruppi" quando i suoi orari hanno almeno due gruppi diversi; gli orari senza nome finiscono in "Altri orari".
// Il nome si confronta senza maiuscole e spazi doppi: "serale eloise " e "Serale Eloise" sono lo stesso gruppo.
// Ogni gruppo ha un colore di sistema (lo stesso nelle Orari dei corsi, nella scheda corso, allo Sportello e nell'app).
export const SENZA_GRUPPO = 'Altri orari';
const GG = ['', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const hm = (t) => String(t || '').slice(0, 5);
const pulito = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');
export const chiaveGruppo = (s) => pulito(s).toLowerCase();
export const nomeGruppo = (o) => pulito(o?.gruppo);

// colori ben distinti fra loro, leggibili con il testo bianco, nessun rosso (il rosso è dei conflitti)
export const COLORI_GRUPPI = ['#2563eb', '#16a34a', '#9333ea', '#db2777', '#c2410c', '#0891b2', '#a16207', '#4f46e5', '#0f766e', '#be185d'];
export const COLORE_SENZA = '#6b7280';

// il nome "ufficiale" di ogni gruppo (la grafia più usata) e il suo colore: { chiave → { nome, colore } }
// i colori vanno in ordine alfabetico dei gruppi del corso, così due gruppi dello stesso corso non hanno mai lo stesso colore
export function mappaGruppi(orari = []) {
  const conta = {};
  for (const o of orari) {
    const n = nomeGruppo(o); if (!n) continue;
    const k = n.toLowerCase();
    ((conta[k] ||= {})[n] = (conta[k][n] || 0) + 1);
  }
  const chiavi = Object.keys(conta).sort((a, b) => a.localeCompare(b, 'it', { numeric: true }));
  return Object.fromEntries(chiavi.map((k, i) => [k, {
    nome: Object.entries(conta[k]).sort((a, b) => b[1] - a[1])[0][0],
    colore: COLORI_GRUPPI[i % COLORI_GRUPPI.length],
  }]));
}

// colore del gruppo di un orario (o di un nome) dentro gli orari del suo corso; null se senza gruppo
export function coloreGruppo(oOnome, orariDelCorso = []) {
  const k = chiaveGruppo(typeof oOnome === 'string' ? oOnome : oOnome?.gruppo);
  if (!k) return null;
  return mappaGruppi(orariDelCorso)[k]?.colore || COLORI_GRUPPI[0];
}

// [{ nome, chiave, colore, orari }] se il corso ha almeno due gruppi (o un gruppo e orari senza nome), altrimenti []
// chiave = nome ufficiale del gruppo ('' per "Altri orari")
export function gruppiDi(orari = []) {
  const mappa = mappaGruppi(orari);
  const chiavi = [...new Set(orari.map((o) => chiaveGruppo(o.gruppo)))];
  if (chiavi.filter(Boolean).length === 0 || chiavi.length < 2) return [];
  return chiavi
    .map((k) => ({ nome: k ? mappa[k].nome : SENZA_GRUPPO, chiave: k ? mappa[k].nome : '', colore: k ? mappa[k].colore : COLORE_SENZA,
      orari: orari.filter((o) => chiaveGruppo(o.gruppo) === k)
        .sort((a, b) => a.giorno_settimana - b.giorno_settimana || hm(a.ora_inizio).localeCompare(hm(b.ora_inizio))) }))
    .sort((a, b) => (a.chiave ? 0 : 1) - (b.chiave ? 0 : 1) || a.nome.localeCompare(b.nome, 'it', { numeric: true }));
}

// i nomi dei gruppi già usati in un corso (grafia ufficiale, in ordine), con il loro colore
export const gruppiUsati = (orari = []) => Object.values(mappaGruppi(orari)).sort((a, b) => a.nome.localeCompare(b.nome, 'it', { numeric: true }));

// il nome da salvare: se esiste già un gruppo uguale (senza maiuscole/spazi), si usa la sua grafia
export function nomeDaSalvare(testo, orariDelCorso = []) {
  const n = pulito(testo);
  if (!n) return null;
  return mappaGruppi(orariDelCorso)[n.toLowerCase()]?.nome || n;
}

// "Lun 18:30" (+ " · Serale Eloise" se richiesto e c'è)
export const giornoOra = (o, conGruppo = false) => `${GG[o.giorno_settimana]} ${hm(o.ora_inizio)}${conGruppo && nomeGruppo(o) ? ` · ${nomeGruppo(o)}` : ''}`;

// il gruppo di un insieme di orari (es. quelli di un'iscrizione): il nome se sono tutti dello stesso, "gruppi misti" se no
export function gruppoDiOrari(orari = []) {
  const k = [...new Set(orari.map((o) => chiaveGruppo(o.gruppo)))];
  if (!k.length || (k.length === 1 && !k[0])) return '';
  return k.length === 1 ? nomeGruppo(orari.find((o) => chiaveGruppo(o.gruppo) === k[0])) : 'gruppi misti';
}

// come gruppoDiOrari, con il colore preso da tutti gli orari del corso: { nome, colore } oppure null
export function gruppoColorato(orariScelti = [], orariDelCorso = []) {
  const nome = gruppoDiOrari(orariScelti);
  if (!nome) return null;
  const m = mappaGruppi(orariDelCorso.length ? orariDelCorso : orariScelti);
  const x = m[chiaveGruppo(nome)];
  return x ? { nome: x.nome, colore: x.colore } : { nome, colore: COLORE_SENZA };
}
