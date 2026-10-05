// Supabase restituisce al massimo 1000 righe per richiesta (impostazione "Max rows" dell'API):
// oltre, l'elenco arriva tagliato senza errori. Per le tabelle che possono superarle si legge a pagine.
// `costruisci` deve restituire ogni volta una query nuova e ORDINATA (l'ordine rende stabili le pagine).
export async function tutte(costruisci, passo = 1000) {
  let righe = [];
  for (let da = 0; ; da += passo) {
    const { data, error } = await costruisci().range(da, da + passo - 1);
    if (error) return { data: righe.length ? righe : null, error };
    righe = righe.concat(data || []);
    if (!data || data.length < passo) return { data: righe, error: null };
  }
}
