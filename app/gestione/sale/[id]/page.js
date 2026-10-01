import { notFound, redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import SchedaSala from '../SchedaSala';

export const dynamic = 'force-dynamic';

// /gestione/sale/nuova oppure /gestione/sale/<id>
export default async function PaginaSala({ params }) {
  const { id } = await params;
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const { data: sedi } = await supabase.from('sedi').select('id, nome').eq('palestra_id', staff.palestra_id).order('ordine');
  if (id === 'nuova') return <SchedaSala palestraId={staff.palestra_id} sedi={sedi || []} />;

  const [{ data: sala }, { count: orari }, { count: posti }] = await Promise.all([
    supabase.from('sale').select('*').eq('id', id).eq('palestra_id', staff.palestra_id).maybeSingle(),
    supabase.from('orari').select('id', { count: 'exact', head: true }).eq('sala_id', id).eq('attivo', true),
    supabase.from('postazioni').select('id', { count: 'exact', head: true }).eq('sala_id', id).eq('attiva', true),
  ]);
  if (!sala) notFound();
  return <SchedaSala palestraId={staff.palestra_id} sala={sala} sedi={sedi || []} orari={orari || 0} posti={posti || 0} />;
}
