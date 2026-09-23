import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import Staff from './Staff';

export const dynamic = 'force-dynamic';

export default async function PaginaStaff({ searchParams }) {
  const { archiviati } = await searchParams;
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');

  const [{ data: persone }, { data: corsi }] = await Promise.all([
    supabase.from('staff').select('*').eq('palestra_id', staff.palestra_id)
      .eq('archiviato', archiviati === '1').order('nome'),
    supabase.from('orari').select('insegnante_id, corsi ( nome )').eq('palestra_id', staff.palestra_id).eq('attivo', true),
  ]);

  return (
    <Staff palestraId={staff.palestra_id} persone={persone || []} orari={corsi || []}
           archiviati={archiviati === '1'} />
  );
}
