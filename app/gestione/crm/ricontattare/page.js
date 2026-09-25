import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import Ricontattare from './Ricontattare';

export const dynamic = 'force-dynamic';

export default async function PaginaRicontattare({ searchParams }) {
  const { lista = 'no_rinnovo' } = await searchParams;
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const [{ data: righe }, { data: pal }] = await Promise.all([
    supabase.rpc('da_ricontattare', { p_palestra: staff.palestra_id }),
    supabase.from('palestre').select('id, nome, crm_testi').eq('id', staff.palestra_id).maybeSingle(),
  ]);
  return <Ricontattare righe={righe || []} lista={lista} palestra={pal || {}} />;
}
