// Ricerca delle persone come la fa la segreteria al banco: pezzi di nome e cognome in qualunque ordine
// ("ros ma" trova Marco Rossi, "marco r" pure), e le sole iniziali ("mr" trova Marco Rossi e Rossi Marta).
// Si applica a una query PostgREST su una vista con le colonne ricerca, nome e cognome (v_persone, v_stato_clienti).
const pulisci = (s) => String(s || '').trim().toLowerCase().replace(/[%_,()]/g, ' ').replace(/\s+/g, ' ').trim();

export function applicaRicerca(query, testo) {
  const t = pulisci(testo);
  if (!t) return query;
  const parole = t.split(' ');
  // due o tre lettere senza spazi: può essere un'iniziale per nome e una per cognome (o un pezzo di parola)
  if (parole.length === 1 && t.length >= 2 && t.length <= 3 && /^[a-z]+$/.test(t)) {
    const a = t[0], b = t.slice(1);
    return query.or(`ricerca.ilike.%${t}%,and(nome.ilike.${a}%,cognome.ilike.${b}%),and(nome.ilike.${b}%,cognome.ilike.${a}%)`);
  }
  // più parole: ognuna deve comparire da qualche parte (nome, cognome, chi paga, email, telefono…)
  let r = query;
  for (const p of parole) r = r.ilike('ricerca', `%${p}%`);
  return r;
}

// ------------------------------------------------------------------------------------------------
// Ricerca "al banco" con i più probabili in cima: prima chi ha quelle iniziali (es. "cc" → Cristian Coianiz),
// poi chi ha nome o cognome che comincia così, poi tutti gli altri che contengono le lettere (es. Alecci).
// Senza questo, con poche lettere i risultati per iniziali finivano sotto quelli in ordine alfabetico.
// `base` è una funzione che restituisce ogni volta una query nuova (select + filtri) sulla vista.
const solo = (w) => /^[a-zà-öø-ÿ'-]+$/i.test(w);
const parti = (s) => pulisci(s).normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[\s'-]+/).filter(Boolean);
const senzaAccenti = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

export function inizialiDi(testo) {
  const t = pulisci(testo);
  return !t.includes(' ') && t.length >= 2 && t.length <= 3 && /^[a-z]+$/.test(t) ? { a: t[0], b: t.slice(1) } : null;
}

// 0 = iniziali, 1 = ogni parola è l'inizio del nome o del cognome, 2 = il resto
export function livelloRicerca(p, testo) {
  const t = senzaAccenti(pulisci(testo));
  const n = parti(p.nome || ''), c = parti(p.cognome || '');
  const ini = inizialiDi(t);
  if (ini && ((n.some((x) => x.startsWith(ini.a)) && c.some((x) => x.startsWith(ini.b)))
           || (n.some((x) => x.startsWith(ini.b)) && c.some((x) => x.startsWith(ini.a))))) return 0;
  const tutte = [...n, ...c];
  if (t.split(' ').every((w) => tutte.some((x) => x.startsWith(w)))) return 1;
  return 2;
}

export function filtroPrioritari(testo) {
  const t = pulisci(testo);
  const parole = t.split(' ').filter(Boolean);
  if (!parole.length || !parole.every(solo)) return null;
  const inizio = (w) => `or(nome.ilike.${w}%,cognome.ilike.${w}%)`;
  const ini = inizialiDi(t);
  const pezzi = parole.length === 1 ? [`nome.ilike.${t}%`, `cognome.ilike.${t}%`] : [`and(${parole.map(inizio).join(',')})`];
  if (ini) pezzi.push(`and(nome.ilike.${ini.a}%,cognome.ilike.${ini.b}%)`, `and(nome.ilike.${ini.b}%,cognome.ilike.${ini.a}%)`);
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
