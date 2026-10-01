import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import Recuperi from './Recuperi';

export const dynamic = 'force-dynamic';

export default async function PaginaRecuperi() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/area/accedi');

  const [{ data }, { data: regole }] = await Promise.all([supabase.rpc('area_riepilogo'), supabase.rpc('disdette_area')]);
  if (!data?.collegato) redirect('/area');

  // per ogni credito, le lezioni su cui si può usare
  const crediti = await Promise.all((data.crediti || []).map(async (c) => {
    const { data: lezioni } = await supabase.rpc('lezioni_per_recupero', { p_credito: c.id });
    // fuori le lezioni che la persona stessa ha disdetto
    const disdette = (regole?.disdette || []).filter((d) => d.allievo_id === c.allievo_id).map((d) => d.lezione_id);
    return { ...c, lezioni: (lezioni || []).filter((l) => !disdette.includes(l.lezione_id)) };
  }));

  return <Recuperi crediti={crediti} piuAllievi={(data.allievi || []).length > 1}
                   massimo={regole?.recuperi_max_mese ?? null} fineAbbonamento={regole?.scadenza_recupero === 'abbonamento'} usati={regole?.recuperi_mese || {}} />;
}
