import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import Eventi from './Eventi';

export const dynamic = 'force-dynamic';

export default async function PaginaEventi() {
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const [{ data: eventi }, { data: sedi }, { data: iscritti }] = await Promise.all([
    supabase.from('eventi').select('*').eq('palestra_id', staff.palestra_id).order('inizio', { ascending: false }),
    supabase.from('sedi').select('id, nome').eq('palestra_id', staff.palestra_id).order('ordine'),
    supabase.from('iscrizioni_evento').select('evento_id, persone, stato').eq('palestra_id', staff.palestra_id),
  ]);
  return <Eventi palestraId={staff.palestra_id} eventi={eventi || []} sedi={sedi || []} iscritti={iscritti || []} />;
}
