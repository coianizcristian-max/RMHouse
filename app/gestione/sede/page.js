import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import Sede from './Sede';

export const dynamic = 'force-dynamic';

export default async function PaginaSede() {
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const [{ data: sedi }, { data: palestra }, { data: timbro }] = await Promise.all([
    supabase.from('sedi').select('*').eq('palestra_id', staff.palestra_id).order('ordine'),
    supabase.from('palestre').select('*').eq('id', staff.palestra_id).maybeSingle(),
    supabase.from('palestra_file').select('chiave').eq('palestra_id', staff.palestra_id).eq('chiave', 'timbro_firma').maybeSingle(),
  ]);
  return <Sede palestraId={staff.palestra_id} sedi={sedi || []} palestra={palestra || {}} haTimbro={!!timbro} />;
}
