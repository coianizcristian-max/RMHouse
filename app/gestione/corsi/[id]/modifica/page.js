import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import CorsoForm from '../../CorsoForm';

export const dynamic = 'force-dynamic';

export default async function ModificaCorso({ params }) {
  const { id } = await params;
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const p = staff.palestra_id;

  const [{ data: corso }, discipline, fasce, livelli, sedi, scuola] = await Promise.all([
    supabase.from('corsi').select('*').eq('id', id).maybeSingle(),
    supabase.from('discipline').select('id, nome, colore').eq('palestra_id', p).order('ordine'),
    supabase.from('fasce_eta').select('id, nome').eq('palestra_id', p).order('ordine'),
    supabase.from('livelli').select('id, nome').eq('palestra_id', p).order('ordine'),
    supabase.from('sedi').select('id, nome').eq('palestra_id', p).order('ordine'),
    supabase.from('palestre').select('tema').eq('id', p).maybeSingle(),
  ]);
  if (!corso) notFound();

  return (
    <>
      <p><Link href={`/gestione/corsi/${id}`}>‹ Torna al corso</Link></p>
      <h1>Modifica corso</h1>
      <CorsoForm palestraId={p} corso={corso} discipline={discipline.data || []} fasce={fasce.data || []} livelli={livelli.data || []} sedi={sedi.data || []}
        tavolozza={scuola.data?.tema?.tavolozza || []} />
    </>
  );
}
