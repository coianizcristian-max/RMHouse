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
  // la scheda staff cambia di rado: la si tiene in memoria per un minuto, così ogni pagina risparmia
  // un viaggio al database prima ancora di cominciare (su Vercel: 80-150 ms a pagina)
  const inMemoria = schedeStaff.get(user.id);
  if (inMemoria && inMemoria.fino > Date.now()) return { supabase, user, staff: inMemoria.staff };
  const { data: staff } = await supabase
    .from('staff')
    .select('id, ruolo, ruolo_id, nome, palestra_id, palestre!inner(slug, nome)')
    .eq('user_id', user.id)
    .eq('attivo', true)
    .eq('palestre.slug', process.env.NEXT_PUBLIC_PALESTRA_SLUG || 'rmhouse')
    .maybeSingle();
  // chi non è (ancora) staff non viene ricordato: appena viene abilitato entra subito
  if (staff) schedeStaff.set(user.id, { staff, fino: Date.now() + 60_000 });
  return { supabase, user, staff };
});

const schedeStaff = new Map();   // user.id → { staff, fino }
// da chiamare quando si cambia ruolo o si disattiva qualcuno: la pagina successiva rilegge subito
export function dimenticaStaff(userId) { if (userId) schedeStaff.delete(userId); else schedeStaff.clear(); }
