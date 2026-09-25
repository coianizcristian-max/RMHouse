import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import Moduli from './Moduli';

export const dynamic = 'force-dynamic';

// I moduli da firmare per sé e per i figli
export default async function PaginaModuli() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/area/accedi');
  const { data: allievi } = await supabase.from('allievi').select('id, nome, cognome, data_nascita, account!inner ( user_id )')
    .eq('account.user_id', user.id).order('created_at');
  const elenco = [];
  for (const a of allievi || []) {
    const { data: m } = await supabase.rpc('moduli_da_firmare', { p_allievo: a.id });
    const { data: testi } = await supabase.from('moduli').select('id, titolo, testo').in('id', (m || []).map((x) => x.modulo_id));
    elenco.push({ allievo: a, moduli: (m || []).map((x) => ({ ...x, ...(testi || []).find((t) => t.id === x.modulo_id) })) });
  }
  return <Moduli elenco={elenco} />;
}
