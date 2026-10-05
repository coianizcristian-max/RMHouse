import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { utenteCorrente } from '@/lib/utente';
import Moduli from './Moduli';

export const dynamic = 'force-dynamic';

// I moduli da firmare per sé e per i figli
export default async function PaginaModuli() {
  const supabase = await supabaseServer();
  const user = await utenteCorrente();
  if (!user) redirect('/area/accedi');
  const { data: allievi } = await supabase.from('allievi').select('id, nome, cognome, data_nascita, is_titolare, account!inner ( user_id, nome, cognome )')
    .eq('account.user_id', user.id).order('created_at');
  const elenco = await Promise.all((allievi || []).map(async (a) => {
    const { data: m } = await supabase.rpc('moduli_da_firmare', { p_allievo: a.id });
    const { data: testi } = await supabase.from('moduli').select('id, titolo, testo, scelte, secondo_genitore, con_dati').in('id', (m || []).map((x) => x.modulo_id));
    return { allievo: a, moduli: (m || []).map((x) => ({ ...x, ...(testi || []).find((t) => t.id === x.modulo_id) })) };
  }));
  return <Moduli elenco={elenco} />;
}
