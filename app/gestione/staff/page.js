import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import Staff from './Staff';

export const dynamic = 'force-dynamic';

export default async function PaginaStaff({ searchParams }) {
  const { archiviati, salvato } = await searchParams;
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');

  const [{ data: persone }, { data: corsi }, { data: categorie }, { data: discipline }, { data: competenze }] = await Promise.all([
    supabase.from('staff').select('*').eq('palestra_id', staff.palestra_id)
      .eq('archiviato', archiviati === '1').order('nome'),
    supabase.from('orari').select('insegnante_id, corsi ( nome )').eq('palestra_id', staff.palestra_id).eq('attivo', true),
    supabase.from('categorie').select('id, nome, ordine').eq('palestra_id', staff.palestra_id).eq('attiva', true).order('ordine').order('nome'),
    supabase.from('discipline').select('id, nome, categoria_id').eq('palestra_id', staff.palestra_id).eq('attiva', true).order('ordine').order('nome'),
    supabase.from('staff_competenze').select('staff_id, disciplina_id, categoria_id').eq('palestra_id', staff.palestra_id),
  ]);

  return (
    <Staff persone={persone || []} orari={corsi || []} archiviati={archiviati === '1'} salvato={salvato || null}
           categorie={categorie || []} discipline={discipline || []} competenze={competenze || []} />
  );
}
