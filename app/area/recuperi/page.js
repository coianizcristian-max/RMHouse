import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import Recuperi from './Recuperi';

export const dynamic = 'force-dynamic';

export default async function PaginaRecuperi() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/area/accedi');

  const { data } = await supabase.rpc('area_riepilogo');
  if (!data?.collegato) redirect('/area');

  // per ogni credito, le lezioni su cui si può usare
  const crediti = await Promise.all((data.crediti || []).map(async (c) => {
    const { data: lezioni } = await supabase.rpc('lezioni_per_recupero', { p_credito: c.id });
    return { ...c, lezioni: lezioni || [] };
  }));

  return <Recuperi crediti={crediti} piuAllievi={(data.allievi || []).length > 1} />;
}
