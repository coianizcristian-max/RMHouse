import 'server-only';
import { cache } from 'react';
import { supabaseAdmin } from './supabase/admin';
import { SLUG } from './palestra';

// Da che mese parte la stagione sportiva (Impostazioni → Regole → Quota e stagione). Predefinito: settembre.
export const meseStagione = cache(async () => {
  const { data } = await supabaseAdmin().from('palestre').select('mese_inizio_stagione').eq('slug', SLUG).maybeSingle();
  return data?.mese_inizio_stagione || 9;
});

// Che periodo si vede di base nel fatturato del Riepilogo, nei Conti e nelle Statistiche
// (Impostazioni → Regole → Quota e stagione): 'stagione' (predefinito) o 'anno' (anno solare).
// Se la colonna non c'è ancora (query 149 non eseguita) vale la stagione.
export const periodoPredefinito = cache(async () => {
  const { data, error } = await supabaseAdmin().from('palestre').select('periodo_conti').eq('slug', SLUG).maybeSingle();
  return !error && data?.periodo_conti === 'anno' ? 'anno' : 'stagione';
});
