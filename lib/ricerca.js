// Ricerca delle persone come la fa la segreteria al banco:
// - pezzi di nome e cognome in qualunque ordine ("ros ma" trova Marco Rossi, "marco r" pure);
// - lettere attaccate: l'inizio del cognome seguito dall'inizio del nome, o il contrario
//   ("cc" → Coianiz Cristian, "ccri" → Coianiz Cristian, "coiac" → Coianiz Cristian, "mr" → Marco Rossi e Rossi Marta);
// - un pezzo qualsiasi di nome, cognome, chi paga, email, telefono o codice fiscale ("cci" trova anche Alecci).
// Si applica a una query PostgREST su una vista con le colonne ricerca, nome e cognome (v_persone, v_stato_clienti).
const pulisci = (s) => String(s || '').trim().toLowerCase().replace(/[%_,()*]/g, ' ').replace(/\s+/g, ' ').trim();
const senzaAccenti = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const parti = (s) => senzaAccenti(pulisci(s)).split(/[\s'-]+/).filter(Boolean);
const lettere = (w) => /^[a-z]+$/.test(w);

// Le lettere attaccate divise in due: [inizio di uno, inizio dell'altro] in tutti i punti possibili ("ccri" → c|cri, cc|ri, ccr|i)
export function divisioni(testo) {
  const t = pulisci(testo);
  if (t.includes(' ') || t.length < 2 || t.length > 20 || !lettere(t)) return [];
  const d = [];
  for (let i = 1; i < t.length; i++) d.push([t.slice(0, i), t.slice(i)]);
  return d;
}
const filtriDivisioni = (t) => divisioni(t).flatMap(([a, b]) => [
  `and(cognome.ilike.${a}%,nome.ilike.${b}%)`, `and(nome.ilike.${a}%,cognome.ilike.${b}%)`,
]);

export function applicaRicerca(query, testo) {
  const t = pulisci(testo);
  if (!t) return query;
  const parole = t.split(' ');
  // una parola sola: un pezzo di qualcosa, oppure inizio del cognome + inizio del nome attaccati
  if (parole.length === 1) {
    const div = filtriDivisioni(t);
    return div.length ? query.or([`ricerca.ilike.%${t}%`, ...div].join(',')) : query.ilike('ricerca', `%${t}%`);
  }
  // più parole: ognuna deve comparire da qualche parte (nome, cognome, chi paga, email, telefono…)
  let r = query;
  for (const p of parole) r = r.ilike('ricerca', `%${p}%`);
  return r;
}

// ------------------------------------------------------------------------------------------------
// Ricerca "al banco" con i più probabili in cima: prima chi corrisponde alle lettere attaccate
// (inizio cognome + inizio nome, es. "cc" o "ccri" → Coianiz Cristian), poi chi ha nome o cognome che comincia così,
// poi tutti gli altri che contengono le lettere (es. Alecci). Senza questo, con poche lettere i più probabili
// finivano sotto quelli in ordine alfabetico.
// `base` è una funzione che restituisce ogni volta una query nuova (select + filtri) sulla vista.

// 0 = lettere attaccate (inizio cognome + inizio nome), 1 = ogni parola è l'inizio del nome o del cognome, 2 = il resto
export function livelloRicerca(p, testo) {
  const t = senzaAccenti(pulisci(testo));
  const n = parti(p.nome || ''), c = parti(p.cognome || '');
  const nn = n.join(' '), cc = c.join(' ');
  const inizia = (campo, pezzi, x) => campo.startsWith(x) || pezzi.some((y) => y.startsWith(x));
  if (divisioni(t).some(([a, b]) => (inizia(cc, c, a) && inizia(nn, n, b)) || (inizia(nn, n, a) && inizia(cc, c, b)))) return 0;
  const tutte = [...n, ...c];
  if (t.split(' ').every((w) => tutte.some((x) => x.startsWith(w)))) return 1;
  return 2;
}

export function filtroPrioritari(testo) {
  const t = pulisci(testo);
  const parole = t.split(' ').filter(Boolean);
  if (!parole.length || !parole.every((w) => /^[a-zà-öø-ÿ'-]+$/i.test(w))) return null;
  const inizio = (w) => `or(nome.ilike.${w}%,cognome.ilike.${w}%)`;
  const pezzi = parole.length === 1 ? [`nome.ilike.${t}%`, `cognome.ilike.${t}%`, ...filtriDivisioni(t)]
    : [`and(${parole.map(inizio).join(',')})`];
  return pezzi.join(',');
}

export async function cercaPersone(base, testo, limite = 8) {
  const pr = filtroPrioritari(testo);
  const [tutti, primi] = await Promise.all([
    applicaRicerca(base(), testo).order('cognome').order('nome').limit(limite),
    pr ? base().or(pr).order('cognome').order('nome').limit(limite) : Promise.resolve({ data: [] }),
  ]);
  const visti = new Set();
  const uniti = [...(primi.data || []), ...(tutti.data || [])].filter((p) => (visti.has(p.id) ? false : visti.add(p.id)));
  const lv = new Map(uniti.map((p) => [p.id, livelloRicerca(p, testo)]));
  uniti.sort((x, y) => lv.get(x.id) - lv.get(y.id)
    || `${x.cognome} ${x.nome}`.localeCompare(`${y.cognome} ${y.nome}`, 'it', { sensitivity: 'base' }));
  return { data: uniti.slice(0, limite), count: tutti.count ?? null, error: tutti.error || primi.error || null };
}
