import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { supabaseServer } from './supabase/server';

// Utente collegato + scheda staff nella palestra di questo sito.
// "cache": layout e pagina della stessa richiesta la calcolano una volta sola.
export const staffCorrente = cache(async () => {
  const supabase = await supabaseServer();
  // getClaims verifica il token senza chiamare il server quando il progetto usa le chiavi asimmetriche
  let user = null;
  if (typeof supabase.auth.getClaims === 'function') {
    const { data } = await supabase.auth.getClaims();
    if (data?.claims?.sub) user = { id: data.claims.sub, email: data.claims.email };
  }
  if (!user) {
    const { data } = await supabase.auth.getUser();
    user = data?.user || null;
  }
  if (!user) redirect('/login');
  const { data: staff } = await supabase
    .from('staff')
    .select('id, ruolo, ruolo_id, nome, palestra_id, palestre!inner(slug, nome)')
    .eq('user_id', user.id)
    .eq('attivo', true)
    .eq('palestre.slug', process.env.NEXT_PUBLIC_PALESTRA_SLUG || 'rmhouse')
    .maybeSingle();
  return { supabase, user, staff };
});
