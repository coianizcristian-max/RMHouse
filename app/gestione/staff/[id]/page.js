import { notFound, redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import SchedaStaff from '../SchedaStaff';

export const dynamic = 'force-dynamic';

// /gestione/staff/nuovo oppure /gestione/staff/<id>
export default async function PaginaSchedaStaff({ params }) {
  const { id } = await params;
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  if (id === 'nuovo') return <SchedaStaff palestraId={staff.palestra_id} />;

  const [{ data: persona }, { data: orari }] = await Promise.all([
    supabase.from('staff').select('*').eq('id', id).eq('palestra_id', staff.palestra_id).maybeSingle(),
    supabase.from('orari').select('corsi ( nome )').eq('insegnante_id', id).eq('attivo', true),
  ]);
  if (!persona) notFound();
  const corsi = [...new Set((orari || []).map((o) => o.corsi?.nome).filter(Boolean))].sort();
  return <SchedaStaff palestraId={staff.palestra_id} persona={persona} corsi={corsi} />;
}
