import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { utenteCorrente } from '@/lib/utente';
import Recuperi from './Recuperi';

export const dynamic = 'force-dynamic';

// "Prenota": tutto quello che il cliente può prenotare da solo
//  - con un pacchetto a ingressi o un abbonamento ad accesso libero
//  - con i recuperi delle lezioni che ha cancellato
export default async function PaginaPrenota() {
  const supabase = await supabaseServer();
  const user = await utenteCorrente();
  if (!user) redirect('/area/accedi');

  const [{ data }, { data: regole }] = await Promise.all([supabase.rpc('area_riepilogo'), supabase.rpc('disdette_area')]);
  if (!data?.collegato) redirect('/area');

  const disdetteDi = (id) => (regole?.disdette || []).filter((d) => d.allievo_id === id).map((d) => d.lezione_id);
  const crediti = await Promise.all((data.crediti || []).map(async (c) => {
    const { data: lezioni } = await supabase.rpc('lezioni_per_recupero', { p_credito: c.id });
    return { ...c, lezioni: (lezioni || []).filter((l) => !disdetteDi(c.allievo_id).includes(l.lezione_id)) };
  }));
  const pacchetti = await Promise.all((data.allievi || []).map(async (a) => {
    const [{ data: abb }, { data: lezioni }] = await Promise.all([
      supabase.rpc('abbonamenti_prenotabili', { p_allievo: a.id }),
      supabase.rpc('lezioni_prenotabili', { p_allievo: a.id }),
    ]);
    return { allievo_id: a.id, allievo: a.nome, abbonamenti: abb || [], lezioni: lezioni || [] };
  }));

  return <Recuperi crediti={crediti} pacchetti={pacchetti.filter((x) => x.abbonamenti.length > 0)}
                   allievi={(data.allievi || []).map((a) => ({ id: a.id, nome: a.nome }))}
                   piuAllievi={(data.allievi || []).length > 1}
                   massimo={regole?.recuperi_max_mese ?? null} fineAbbonamento={regole?.scadenza_recupero === 'abbonamento'}
                   usati={regole?.recuperi_mese || {}} ore={regole?.ore_disdetta ?? 4} />;
}
