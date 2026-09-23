import 'server-only';
import { redirect } from 'next/navigation';
import { supabaseServer } from './supabase/server';

// Utente collegato + scheda staff nella palestra di questo sito
export async function staffCorrente() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: staff } = await supabase
    .from('staff')
    .select('id, ruolo, nome, palestra_id, palestre!inner(slug, nome)')
    .eq('user_id', user.id)
    .eq('attivo', true)
    .eq('palestre.slug', process.env.NEXT_PUBLIC_PALESTRA_SLUG || 'rmhouse')
    .maybeSingle();
  return { supabase, user, staff };
}
