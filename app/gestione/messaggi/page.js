import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import Messaggi from './Messaggi';

export const dynamic = 'force-dynamic';

export default async function PaginaMessaggi() {
  const { supabase, staff, user } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');

  const { data: template } = await supabase
    .from('messaggi_template')
    .select('*')
    .eq('palestra_id', staff.palestra_id)
    .order('evento').order('giorni');

  const { data: coda } = await supabase
    .from('messaggi_coda')
    .select('id, evento, destinatario, oggetto, programmato_per, stato')
    .eq('palestra_id', staff.palestra_id)
    .in('stato', ['in_coda', 'errore'])
    .order('programmato_per')
    .limit(20);

  return <Messaggi palestraId={staff.palestra_id} template={template || []} coda={coda || []} emailStaff={user.email} />;
}
