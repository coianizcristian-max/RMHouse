import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import Costi from './Costi';

export const dynamic = 'force-dynamic';

export default async function PaginaCosti() {
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const p = staff.palestra_id;

  const [spese, fornitori, sale, corsi, insegnanti] = await Promise.all([
    supabase.from('spese').select('*').eq('palestra_id', p).order('data', { ascending: false }).limit(200),
    supabase.from('fornitori').select('*').eq('palestra_id', p).order('nome'),
    supabase.from('sale').select('id, nome, capienza, costo_ora_cent').eq('palestra_id', p).order('nome'),
    supabase.from('corsi').select('id, nome').eq('palestra_id', p).eq('attivo', true).order('nome'),
    supabase.from('staff').select('id, nome, cognome, ruolo, compenso_ora_cent').eq('palestra_id', p)
      .eq('ruolo', 'insegnante').order('nome'),
  ]);

  return (
    <Costi
      palestraId={p}
      spese={spese.data || []} fornitori={fornitori.data || []} sale={sale.data || []}
      corsi={corsi.data || []} insegnanti={insegnanti.data || []}
    />
  );
}
