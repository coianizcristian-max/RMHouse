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
