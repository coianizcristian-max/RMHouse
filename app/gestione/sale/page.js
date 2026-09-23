import { redirect } from 'next/navigation';
import { staffCorrente } from '@/lib/staff';
import Sale from './Sale';

export const dynamic = 'force-dynamic';

export default async function PaginaSale() {
  const { supabase, staff } = await staffCorrente();
  if (staff.ruolo === 'insegnante') redirect('/gestione');
  const [{ data: sale }, { data: sedi }, { data: orari }] = await Promise.all([
    supabase.from('sale').select('*').eq('palestra_id', staff.palestra_id).order('nome'),
    supabase.from('sedi').select('id, nome').eq('palestra_id', staff.palestra_id).order('ordine'),
    supabase.from('orari').select('sala_id').eq('palestra_id', staff.palestra_id).eq('attivo', true),
  ]);
  return <Sale palestraId={staff.palestra_id} sale={sale || []} sedi={sedi || []} orari={orari || []} />;
}
