import 'server-only';
import { cache } from 'react';
import { supabaseServer } from './supabase/server';

// L'utente collegato, letto una volta sola per richiesta.
// getClaims controlla il token sul server stesso (con le chiavi asimmetriche di Supabase
// non fa nessuna chiamata di rete); se non si può, chiede a Supabase come prima.
export const utenteCorrente = cache(async () => {
  const supabase = await supabaseServer();
  if (typeof supabase.auth.getClaims === 'function') {
    const { data } = await supabase.auth.getClaims();
    if (data?.claims?.sub) return { id: data.claims.sub, email: data.claims.email };
  }
  const { data } = await supabase.auth.getUser();
  return data?.user || null;
});
