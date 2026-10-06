import 'server-only';
import { cache } from 'react';
import { supabaseAdmin } from './supabase/admin';
import { SLUG } from './palestra';

// Da che mese parte la stagione sportiva (Impostazioni → Regole → Quota e stagione). Predefinito: settembre.
export const meseStagione = cache(async () => {
  const { data } = await supabaseAdmin().from('palestre').select('mese_inizio_stagione').eq('slug', SLUG).maybeSingle();
  return data?.mese_inizio_stagione || 9;
});
