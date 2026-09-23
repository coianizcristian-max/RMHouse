import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import Bacheca from './Bacheca';

export const dynamic = 'force-dynamic';

export default async function PaginaBacheca() {
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const { data } = await supabase.from('bacheca').select('*')
    .eq('palestra_id', staff.palestra_id).order('created_at', { ascending: false }).limit(100);
  return <Bacheca palestraId={staff.palestra_id} righe={data || []} />;
}
