import Link from 'next/link';
import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import CorsoForm from '../CorsoForm';

export const dynamic = 'force-dynamic';

export default async function NuovoCorso() {
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const p = staff.palestra_id;
  const [discipline, fasce, livelli] = await Promise.all([
    supabase.from('discipline').select('id, nome').eq('palestra_id', p).order('ordine'),
    supabase.from('fasce_eta').select('id, nome').eq('palestra_id', p).order('ordine'),
    supabase.from('livelli').select('id, nome').eq('palestra_id', p).order('ordine'),
  ]);

  return (
    <>
      <p><Link href="/gestione/corsi">‹ Tutti i corsi</Link></p>
      <h1>Nuovo corso</h1>
      <CorsoForm palestraId={p} discipline={discipline.data || []} fasce={fasce.data || []} livelli={livelli.data || []} />
    </>
  );
}
