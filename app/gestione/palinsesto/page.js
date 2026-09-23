import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import Palinsesto from './Palinsesto';

export const dynamic = 'force-dynamic';

export default async function PaginaPalinsesto() {
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const p = staff.palestra_id;

  const [categorie, discipline, livelli, fasce, sale, insegnanti, chiusure] = await Promise.all([
    supabase.from('categorie').select('*').eq('palestra_id', p).order('ordine'),
    supabase.from('discipline').select('*').eq('palestra_id', p).order('ordine'),
    supabase.from('livelli').select('*').eq('palestra_id', p).order('ordine'),
    supabase.from('fasce_eta').select('*').eq('palestra_id', p).order('ordine'),
    supabase.from('sale').select('*').eq('palestra_id', p).order('nome'),
    supabase.from('staff').select('*').eq('palestra_id', p).order('nome'),
    supabase.from('chiusure').select('*').eq('palestra_id', p).order('dal', { ascending: false }),
  ]);

  return (
    <Palinsesto
      palestraId={p}
      dati={{
        categorie: categorie.data || [], discipline: discipline.data || [], livelli: livelli.data || [],
        fasce: fasce.data || [], sale: sale.data || [], insegnanti: insegnanti.data || [], chiusure: chiusure.data || [],
      }}
    />
  );
}
