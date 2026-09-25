import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import Campagne from './Campagne';

export const dynamic = 'force-dynamic';

export default async function PaginaCampagne() {
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const p = staff.palestra_id;
  const [{ data: campagne }, { data: corsi }, { data: etichette }, { data: sondaggi }] = await Promise.all([
    supabase.from('v_campagne').select('*').eq('palestra_id', p).order('created_at', { ascending: false }).limit(30),
    supabase.from('corsi').select('id, nome, colore').eq('palestra_id', p).eq('attivo', true).order('nome'),
    supabase.from('etichette').select('id, nome, colore').eq('palestra_id', p).order('nome'),
    supabase.from('sondaggi').select('id, titolo').eq('palestra_id', p).eq('attivo', true).order('created_at', { ascending: false }),
  ]);
  return <Campagne palestraId={p} campagne={campagne || []} corsi={corsi || []} etichette={etichette || []} sondaggi={sondaggi || []} />;
}
