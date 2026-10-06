import 'server-only';
import { supabaseServer } from './supabase/server';

// Per le API (niente redirect): chi chiama è dello staff di questa scuola? null se no
export async function staffApi() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: staff } = await supabase.from('staff')
    .select('id, ruolo, palestra_id, palestre!inner(slug)')
    .eq('user_id', user.id).eq('attivo', true)
    .eq('palestre.slug', process.env.NEXT_PUBLIC_PALESTRA_SLUG || 'rmhouse').maybeSingle();
  return staff ? { supabase, user, staff } : null;
}
