import { notFound, redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import SchedaStaff from '../SchedaStaff';

export const dynamic = 'force-dynamic';

// /gestione/staff/nuovo oppure /gestione/staff/<id>
export default async function PaginaSchedaStaff({ params }) {
  const { id } = await params;
  const { supabase, staff, user } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  if (id === 'nuovo') return <SchedaStaff palestraId={staff.palestra_id} />;

  const [{ data: persona }, { data: orari }, { count: tuttiOrari }, { count: lezioni }, { data: elencoCorsi }] = await Promise.all([
    supabase.from('staff').select('*').eq('id', id).eq('palestra_id', staff.palestra_id).maybeSingle(),
    supabase.from('orari').select('corsi ( nome )').eq('insegnante_id', id).eq('attivo', true),
    supabase.from('orari').select('id', { count: 'exact', head: true }).eq('insegnante_id', id),
    supabase.from('lezioni').select('id', { count: 'exact', head: true }).eq('insegnante_id', id),
    supabase.from('corsi').select('id, nome').eq('palestra_id', staff.palestra_id).eq('attivo', true).order('nome'),
  ]);
  if (!persona) notFound();
  const corsi = [...new Set((orari || []).map((o) => o.corsi?.nome).filter(Boolean))].sort();
  return <SchedaStaff palestraId={staff.palestra_id} persona={persona} corsi={corsi} elencoCorsi={elencoCorsi || []}
                      usata={(tuttiOrari || 0) + (lezioni || 0) > 0} sonoIo={!!persona.user_id && persona.user_id === user.id} />;
}
