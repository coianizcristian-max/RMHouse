import 'server-only';
import { supabaseAdmin } from './supabase/admin';

export const SLUG = process.env.NEXT_PUBLIC_PALESTRA_SLUG || 'rmhouse';

export async function palestraPubblica() {
  const { data, error } = await supabaseAdmin()
    .from('palestre')
    .select('id, slug, nome, giorni_prenotabili, preavviso_ore, fuso_orario')
    .eq('slug', SLUG)
    .single();
  if (error) throw new Error('Palestra non trovata: controlla NEXT_PUBLIC_PALESTRA_SLUG');
  return data;
}
